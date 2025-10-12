/**
 * SLM Business Service Layer - MCP Message Handler
 *
 * @author Partha Chandramohan
 * @description JSON-RPC 2.0 message processing for Model Context Protocol
 */

const mcpConfig = require("./config/mcp-config");
const { v4: uuidv4 } = require("uuid");

class MCPMessageHandler {
  constructor() {
    this.pendingRequests = new Map();
    this.requestCounter = 0;
    this.defaultTimeout = mcpConfig.maxRequestTimeout;
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `${Date.now()}-${++this.requestCounter}`;
  }

  /**
   * Create MCP request message
   */
  createRequest(method, params = {}, id = null) {
    const requestId = id || this.generateRequestId();

    const request = mcpConfig.createMCPRequest(method, params, requestId);

    console.log(`[MCP-Request] ${method} (ID: ${requestId})`);

    return request;
  }

  /**
   * Create MCP response message
   */
  createResponse(id, result = null, error = null) {
    const response = mcpConfig.createMCPResponse(id, result, error);

    if (error) {
      console.log(
        `[MCP-Response] Error ${error.code}: ${error.message} (ID: ${id})`,
      );
    } else {
      console.log(`[MCP-Response] Success (ID: ${id})`);
    }

    return response;
  }

  /**
   * Create MCP notification (no response expected)
   */
  createNotification(method, params = {}) {
    const notification = {
      jsonrpc: "2.0",
      method: method,
      params: params,
    };

    console.log(`[MCP-Notification] ${method}`);

    return notification;
  }

  /**
   * Create standardized error response
   */
  createErrorResponse(id, code, message, data = null) {
    const error = {
      code: code,
      message: message,
      data: data,
    };

    return this.createResponse(id, null, error);
  }

  /**
   * Validate incoming MCP message
   */
  validateMessage(message) {
    const errors = [];

    if (!mcpConfig.isValidMCPMessage(message)) {
      errors.push("Invalid MCP message format");
    }

    // Check specific message structure
    if (message.method) {
      // This is a request or notification
      if (typeof message.method !== "string") {
        errors.push("Method must be a string");
      }

      if (message.params && typeof message.params !== "object") {
        errors.push("Params must be an object");
      }
    } else if (message.result !== undefined || message.error !== undefined) {
      // This is a response
      if (message.id === undefined) {
        errors.push("Response must have an id");
      }

      if (message.result !== undefined && message.error !== undefined) {
        errors.push("Response cannot have both result and error");
      }

      if (message.error && !this.isValidError(message.error)) {
        errors.push("Invalid error format");
      }
    } else {
      errors.push("Message must be request, response, or notification");
    }

    return {
      valid: errors.length === 0,
      errors: errors,
    };
  }

  /**
   * Check if error object is valid
   */
  isValidError(error) {
    if (!error || typeof error !== "object") {
      return false;
    }

    if (typeof error.code !== "number" || typeof error.message !== "string") {
      return false;
    }

    return true;
  }

  /**
   * Register pending request for timeout handling
   */
  registerPendingRequest(id, timeout = null) {
    const timeoutMs = timeout || this.defaultTimeout;

    const timeoutHandle = setTimeout(() => {
      this.pendingRequests.delete(id);
      console.warn(
        `[MCP-Timeout] Request ${id} timed out after ${timeoutMs}ms`,
      );
    }, timeoutMs);

    this.pendingRequests.set(id, {
      timestamp: Date.now(),
      timeout: timeoutHandle,
    });
  }

  /**
   * Complete pending request
   */
  completePendingRequest(id) {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);

      const duration = Date.now() - pending.timestamp;
      console.log(`[MCP-Complete] Request ${id} completed in ${duration}ms`);

      return duration;
    }
    return null;
  }

  /**
   * Process initialization handshake
   */
  createInitializeRequest(clientInfo = null) {
    const params = {
      protocolVersion: mcpConfig.protocolVersion,
      clientInfo: clientInfo || mcpConfig.getClientInfo(),
      capabilities: {
        tools: true,
        resources: true,
        prompts: false, // Not implementing prompts initially
        experimental: {},
      },
    };

    return this.createRequest(mcpConfig.messageTypes.initialize, params);
  }

  /**
   * Create initialization response
   */
  createInitializeResponse(id, serverCapabilities = {}) {
    const result = {
      protocolVersion: mcpConfig.protocolVersion,
      serverInfo: {
        name: mcpConfig.clientName,
        version: mcpConfig.clientVersion,
      },
      capabilities: {
        tools: {
          listChanged: true,
        },
        resources: {
          subscribe: false,
          listChanged: true,
        },
        ...serverCapabilities,
      },
    };

    return this.createResponse(id, result);
  }

  /**
   * Create tools list request
   */
  createListToolsRequest() {
    return this.createRequest(mcpConfig.messageTypes.listTools);
  }

  /**
   * Create tool call request
   */
  createCallToolRequest(toolName, arguments_ = {}) {
    const params = {
      name: toolName,
      arguments: arguments_,
    };

    return this.createRequest(mcpConfig.messageTypes.callTool, params);
  }

  /**
   * Create inference generation request (custom)
   */
  createInferenceRequest(prompt, model = null, options = {}) {
    const params = {
      prompt: prompt,
      model: model,
      options: {
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 500,
        ...options,
      },
    };

    return this.createRequest(mcpConfig.messageTypes.generateInference, params);
  }

  /**
   * Create model list request (custom)
   */
  createListModelsRequest() {
    return this.createRequest(mcpConfig.messageTypes.listModels);
  }

  /**
   * Create health check request (custom)
   */
  createHealthCheckRequest() {
    return this.createRequest(mcpConfig.messageTypes.getHealth);
  }

  /**
   * Create context search request (custom)
   */
  createContextSearchRequest(query, limit = 10, threshold = 0.7) {
    const params = {
      query: query,
      limit: limit,
      threshold: threshold,
    };

    return this.createRequest(mcpConfig.messageTypes.searchContext, params);
  }

  /**
   * Create database query request (custom)
   */
  createDatabaseQueryRequest(sql, params = []) {
    const requestParams = {
      query: sql,
      parameters: params,
    };

    return this.createRequest(
      mcpConfig.messageTypes.queryDatabase,
      requestParams,
    );
  }

  /**
   * Parse and handle incoming message
   */
  async handleIncomingMessage(rawMessage) {
    let message;

    try {
      // Parse JSON if it's a string
      if (typeof rawMessage === "string") {
        message = JSON.parse(rawMessage);
      } else {
        message = rawMessage;
      }
    } catch (error) {
      console.error("[MCP-Parse] Failed to parse message:", error.message);
      return this.createErrorResponse(
        null,
        mcpConfig.errorCodes.PARSE_ERROR,
        "Parse error",
      );
    }

    // Validate message structure
    const validation = this.validateMessage(message);
    if (!validation.valid) {
      console.error("[MCP-Validation] Invalid message:", validation.errors);
      return this.createErrorResponse(
        message.id || null,
        mcpConfig.errorCodes.INVALID_REQUEST,
        "Invalid request",
        validation.errors,
      );
    }

    // Handle response/error (complete pending request)
    if (
      message.id &&
      (message.result !== undefined || message.error !== undefined)
    ) {
      this.completePendingRequest(message.id);
      return message; // Pass through response
    }

    // Handle request/notification
    if (message.method) {
      console.log(
        `[MCP-Incoming] ${message.method} (ID: ${message.id || "notification"})`,
      );
      return message; // Pass to router for handling
    }

    return this.createErrorResponse(
      message.id || null,
      mcpConfig.errorCodes.INVALID_REQUEST,
      "Unknown message type",
    );
  }

  /**
   * Get pending request statistics
   */
  getPendingRequestStats() {
    const now = Date.now();
    const requests = Array.from(this.pendingRequests.entries()).map(
      ([id, data]) => ({
        id: id,
        age: now - data.timestamp,
      }),
    );

    return {
      count: requests.length,
      requests: requests,
      oldestAge:
        requests.length > 0 ? Math.max(...requests.map((r) => r.age)) : 0,
    };
  }

  /**
   * Cleanup expired requests
   */
  cleanup() {
    const expired = [];
    for (const [id, data] of this.pendingRequests.entries()) {
      if (Date.now() - data.timestamp > this.defaultTimeout) {
        clearTimeout(data.timeout);
        this.pendingRequests.delete(id);
        expired.push(id);
      }
    }

    if (expired.length > 0) {
      console.log(
        `[MCP-Cleanup] Cleaned up ${expired.length} expired requests`,
      );
    }

    return expired;
  }
}

module.exports = MCPMessageHandler;
