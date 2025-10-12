/**
 * SLM Business Service Layer - Action Executor
 *
 * @author Partha Chandramohan
 * @description Action execution engine for processing business logic derived from SLM responses
 */
const apiFunctions = require("./api-functions");
const dbFunctions = require("./db-functions");
const permissions = require("./permissions");

class ActionExecutor {
  constructor() {
    this.executionTimeout = 30000; // 30 seconds
    this.maxConcurrentActions = 5;
    this.activeExecutions = new Map();
  }

  async executeActions(actions, context = {}) {
    try {
      // Validate and prepare actions
      const validatedActions = await this.validateActions(actions, context);

      // Check permissions
      await this.checkPermissions(validatedActions, context);

      // Order actions by priority and dependencies
      const orderedActions = this.orderActions(validatedActions);

      // Execute actions
      const results = await this.performExecution(orderedActions, context);

      return {
        success: true,
        executedActions: results.length,
        results: results,
        executionTime: results.reduce(
          (sum, r) => sum + (r.executionTime || 0),
          0,
        ),
        metadata: {
          context: context,
          totalActions: actions.length,
          successfulActions: results.filter((r) => r.success).length,
          failedActions: results.filter((r) => !r.success).length,
        },
      };
    } catch (error) {
      console.error("Action execution failed:", error);
      throw new Error(`Execution failed: ${error.message}`);
    }
  }

  async validateActions(actions, context) {
    if (!Array.isArray(actions)) {
      throw new Error("Actions must be provided as an array");
    }

    if (actions.length === 0) {
      throw new Error("No actions provided for execution");
    }

    if (actions.length > this.maxConcurrentActions) {
      throw new Error(
        `Too many actions. Maximum ${this.maxConcurrentActions} allowed`,
      );
    }

    return actions.map((action, index) => {
      const validated = this.validateSingleAction(action, index);
      return {
        ...validated,
        executionId: this.generateExecutionId(),
        index: index,
        validated: true,
      };
    });
  }

  validateSingleAction(action, index) {
    if (!action || typeof action !== "object") {
      throw new Error(`Action ${index} must be an object`);
    }

    if (!action.type || typeof action.type !== "string") {
      throw new Error(`Action ${index} must have a valid type`);
    }

    if (!action.operation || typeof action.operation !== "string") {
      throw new Error(`Action ${index} must have a valid operation`);
    }

    const allowedTypes = ["database", "api", "business", "workflow"];
    if (!allowedTypes.includes(action.type)) {
      throw new Error(`Action ${index} type '${action.type}' is not allowed`);
    }

    return {
      type: action.type,
      operation: action.operation,
      parameters: action.parameters || {},
      metadata: action.metadata || {},
      dependencies: action.dependencies || [],
      priority: action.priority || "normal",
      timeout: action.timeout || this.executionTimeout,
      retryable: action.retryable || false,
      maxRetries: action.maxRetries || 0,
    };
  }

  async checkPermissions(actions, context) {
    for (const action of actions) {
      const hasPermission = await permissions.checkActionPermission(
        action.type,
        action.operation,
        action.parameters,
        context,
      );

      if (!hasPermission.allowed) {
        throw new Error(
          `Permission denied for ${action.type}.${action.operation}: ${hasPermission.reason}`,
        );
      }
    }
  }

  orderActions(actions) {
    // Create dependency graph
    const graph = new Map();
    const inDegree = new Map();

    // Initialize graph
    actions.forEach((action) => {
      graph.set(action.executionId, []);
      inDegree.set(action.executionId, 0);
    });

    // Build dependency edges
    actions.forEach((action) => {
      if (action.dependencies && action.dependencies.length > 0) {
        action.dependencies.forEach((depIndex) => {
          if (depIndex < actions.length) {
            const depAction = actions[depIndex];
            graph.get(depAction.executionId).push(action.executionId);
            inDegree.set(
              action.executionId,
              inDegree.get(action.executionId) + 1,
            );
          }
        });
      }
    });

    // Topological sort
    const ordered = [];
    const queue = [];

    // Find actions with no dependencies
    for (const [actionId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(actionId);
      }
    }

    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentAction = actions.find((a) => a.executionId === currentId);
      ordered.push(currentAction);

      // Process dependent actions
      for (const dependentId of graph.get(currentId)) {
        inDegree.set(dependentId, inDegree.get(dependentId) - 1);
        if (inDegree.get(dependentId) === 0) {
          queue.push(dependentId);
        }
      }
    }

    // Check for circular dependencies
    if (ordered.length !== actions.length) {
      throw new Error("Circular dependency detected in actions");
    }

    // Sort by priority within dependency levels
    return ordered.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  async performExecution(actions, context) {
    const results = [];

    for (const action of actions) {
      try {
        const result = await this.executeSingleAction(action, context, results);
        results.push(result);

        // Stop execution if a high-priority action fails
        if (!result.success && action.priority === "high") {
          console.error("High-priority action failed, stopping execution");
          break;
        }
      } catch (error) {
        const failureResult = {
          success: false,
          action: action,
          error: error.message,
          executionTime: 0,
          timestamp: new Date().toISOString(),
        };
        results.push(failureResult);

        // Stop on critical failures
        if (action.priority === "high") {
          break;
        }
      }
    }

    return results;
  }

  async executeSingleAction(action, context, previousResults) {
    const startTime = Date.now();
    const executionContext = {
      ...context,
      executionId: action.executionId,
      previousResults: previousResults,
    };

    this.activeExecutions.set(action.executionId, {
      action,
      startTime,
      status: "running",
    });

    try {
      let result;

      switch (action.type) {
        case "database":
          result = await this.executeDatabaseAction(action, executionContext);
          break;
        case "api":
          result = await this.executeAPIAction(action, executionContext);
          break;
        case "business":
          result = await this.executeBusinessAction(action, executionContext);
          break;
        case "workflow":
          result = await this.executeWorkflowAction(action, executionContext);
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      const executionTime = Date.now() - startTime;

      this.activeExecutions.delete(action.executionId);

      return {
        success: true,
        action: action,
        result: result,
        executionTime: executionTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.activeExecutions.delete(action.executionId);

      if (action.retryable && action.maxRetries > 0) {
        return await this.retryAction(action, context, error, previousResults);
      }

      throw error;
    }
  }

  async executeDatabaseAction(action, context) {
    const { operation, parameters } = action;

    // Extract table from parameters or operation
    const table = parameters.table || this.extractTableFromOperation(operation);
    if (!table) {
      throw new Error("Database action must specify a table");
    }

    return await dbFunctions.executeQuery(
      operation,
      table,
      parameters,
      context,
    );
  }

  async executeAPIAction(action, context) {
    const { operation, parameters } = action;

    // Extract service from parameters or operation
    const service =
      parameters.service || this.extractServiceFromOperation(operation);
    if (!service) {
      throw new Error("API action must specify a service");
    }

    return await apiFunctions.executeAPICall(
      service,
      operation,
      parameters,
      context,
    );
  }

  async executeBusinessAction(action, context) {
    const { operation, parameters } = action;

    switch (operation) {
      case "validate":
        return await this.performValidation(parameters, context);
      case "calculate":
        return await this.performCalculation(parameters, context);
      case "process":
        return await this.performBusinessProcess(parameters, context);
      case "notify":
        return await this.performNotification(parameters, context);
      default:
        throw new Error(`Unknown business operation: ${operation}`);
    }
  }

  async executeWorkflowAction(action, context) {
    const { operation, parameters } = action;

    switch (operation) {
      case "start":
        return await this.startWorkflow(parameters, context);
      case "continue":
        return await this.continueWorkflow(parameters, context);
      case "pause":
        return await this.pauseWorkflow(parameters, context);
      case "complete":
        return await this.completeWorkflow(parameters, context);
      case "abort":
        return await this.abortWorkflow(parameters, context);
      default:
        throw new Error(`Unknown workflow operation: ${operation}`);
    }
  }

  async retryAction(action, context, lastError, previousResults) {
    const maxRetries = action.maxRetries || 1;
    const retryDelay = action.retryDelay || 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.sleep(retryDelay * attempt);
        return await this.executeSingleAction(action, context, previousResults);
      } catch (error) {
        if (attempt === maxRetries) {
          throw new Error(
            `Action failed after ${maxRetries} retries: ${error.message}`,
          );
        }
      }
    }
  }

  extractTableFromOperation(operation) {
    // Try to extract table name from operation string
    const tablePatterns = [
      /from[\s_](\w+)/i,
      /into[\s_](\w+)/i,
      /update[\s_](\w+)/i,
      /table[\s_](\w+)/i,
    ];

    for (const pattern of tablePatterns) {
      const match = operation.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  extractServiceFromOperation(operation) {
    // Try to extract service name from operation string
    const servicePatterns = [/(\w+)_service/i, /(\w+)_api/i, /call[\s_](\w+)/i];

    for (const pattern of servicePatterns) {
      const match = operation.match(pattern);
      if (match) {
        return match[1] + "-service";
      }
    }

    return null;
  }

  // Business operation implementations
  async performValidation(parameters, context) {
    // Implement business validation logic
    return { valid: true, message: "Validation passed" };
  }

  async performCalculation(parameters, context) {
    // Implement business calculation logic
    return { result: 0, formula: "placeholder" };
  }

  async performBusinessProcess(parameters, context) {
    // Implement generic business process logic
    return { processed: true, message: "Process completed" };
  }

  async performNotification(parameters, context) {
    // Implement notification logic
    return { sent: true, message: "Notification sent" };
  }

  // Workflow operation implementations
  async startWorkflow(parameters, context) {
    return { workflowId: this.generateWorkflowId(), status: "started" };
  }

  async continueWorkflow(parameters, context) {
    return { status: "continued" };
  }

  async pauseWorkflow(parameters, context) {
    return { status: "paused" };
  }

  async completeWorkflow(parameters, context) {
    return { status: "completed" };
  }

  async abortWorkflow(parameters, context) {
    return { status: "aborted" };
  }

  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateWorkflowId() {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getActiveExecutions() {
    return Array.from(this.activeExecutions.entries()).map(
      ([id, execution]) => ({
        id,
        action: execution.action,
        duration: Date.now() - execution.startTime,
        status: execution.status,
      }),
    );
  }

  async cancelExecution(executionId) {
    if (this.activeExecutions.has(executionId)) {
      this.activeExecutions.delete(executionId);
      return { cancelled: true, executionId };
    }
    return { cancelled: false, reason: "Execution not found" };
  }
}

module.exports = new ActionExecutor();
