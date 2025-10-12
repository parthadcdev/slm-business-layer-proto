/**
 * SLM Business Service Layer - Business Context MCP Server
 *
 * @author Partha Chandramohan
 * @description MCP server implementation for business context and BRD retrieval
 */

const MCPClient = require("../mcp-client");
const brdContext = require("../../config/brd-context-config");
const mcpConfig = require("../config/mcp-config");

class ContextMCPServer extends MCPClient {
  constructor(serverConfig) {
    super(serverConfig);

    this.serverType = "context";
    this.brdContext = null;
    this.contextCache = new Map();
    this.lastContextLoad = 0;
    this.contextLoadInterval = 300000; // 5 minutes

    console.log("[Context-MCP] Context MCP server instance created");
  }

  /**
   * Handle internal MCP requests for business context
   */
  async handleInternalRequest(request) {
    const { method, params, id } = request;

    console.log(`[Context-MCP] Handling request: ${method}`);

    try {
      let result;

      switch (method) {
        case "initialize":
          result = await this.handleInitialize(params);
          break;

        case "health/check":
          result = await this.handleHealthCheck(params);
          break;

        case "context/search":
          result = await this.handleSearchContext(params);
          break;

        case "context/brd":
          result = await this.handleGetBRD(params);
          break;

        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      return {
        jsonrpc: "2.0",
        id: id,
        result: result,
      };
    } catch (error) {
      console.error(`[Context-MCP] Request failed:`, error.message);
      return {
        jsonrpc: "2.0",
        id: id,
        error: {
          code: -32603,
          message: error.message,
        },
      };
    }
  }

  /**
   * Handle MCP initialization
   */
  async handleInitialize(params) {
    console.log("[Context-MCP] Initializing Context MCP server...");

    try {
      // Load BRD context
      await this.loadBRDContext();

      const serverInfo = {
        name: "Business Context MCP Server",
        version: "1.0.0",
        provider: "internal",
        endpoint: this.serverConfig.endpoint,
      };

      const reqCount = this.brdContext ? Object.keys(this.brdContext.businessRequirements || {}).length : 0;
      const intentCount = this.brdContext ? Object.keys(this.brdContext.queryIntents || {}).length : 0;
      
      const capabilities = {
        retrieval: {
          supports_semantic_search: true,
          supports_filtering: true,
          supports_ranking: true,
        },
        context: {
          business_requirements: reqCount,
          query_intents: intentCount,
          business_processes: this.brdContext ? Object.keys(this.brdContext.businessProcesses || {}).length : 0,
        },
        health: {
          check_supported: true,
          detailed_status: true,
        },
      };

      console.log(
        `[Context-MCP] Loaded ${reqCount} business requirements, ${intentCount} query intents`,
      );

      return {
        protocolVersion: mcpConfig.protocolVersion,
        serverInfo: serverInfo,
        capabilities: capabilities,
      };
    } catch (error) {
      console.error("[Context-MCP] Initialization failed:", error.message);
      throw error;
    }
  }

  /**
   * Load BRD context from configuration
   */
  async loadBRDContext() {
    try {
      // Load BRD from the actual config structure
      this.brdContext = {
        businessRequirements: brdContext.businessRequirements || {},
        functionalRequirements: brdContext.functionalRequirements || {},
        businessProcesses: brdContext.businessProcesses || {},
        queryIntents: brdContext.queryIntents || {},
      };

      this.lastContextLoad = Date.now();

      // Count requirements, processes, and intents
      const reqCount = Object.keys(this.brdContext.businessRequirements).length;
      const funcReqCount = Object.keys(this.brdContext.functionalRequirements).length;
      const processCount = Object.keys(this.brdContext.businessProcesses).length;
      const intentCount = Object.keys(this.brdContext.queryIntents).length;

      console.log("[Context-MCP] BRD context loaded:", {
        businessRequirements: reqCount,
        functionalRequirements: funcReqCount,
        businessProcesses: processCount,
        queryIntents: intentCount,
      });

      return this.brdContext;
    } catch (error) {
      console.error("[Context-MCP] Failed to load BRD context:", error.message);
      console.error("[Context-MCP] Error stack:", error.stack);
      this.brdContext = {
        businessRequirements: {},
        functionalRequirements: {},
        businessProcesses: {},
        queryIntents: {},
      };
      return this.brdContext;
    }
  }

  /**
   * Handle health check
   */
  async handleHealthCheck(params) {
    const reqCount = this.brdContext ? Object.keys(this.brdContext.businessRequirements || {}).length : 0;
    const isHealthy = this.brdContext !== null && reqCount > 0;

    return {
      healthy: isHealthy,
      status: isHealthy ? "operational" : "degraded",
      brd_loaded: !!this.brdContext,
      business_requirements_count: reqCount,
      functional_requirements_count: this.brdContext ? Object.keys(this.brdContext.functionalRequirements || {}).length : 0,
      business_processes_count: this.brdContext ? Object.keys(this.brdContext.businessProcesses || {}).length : 0,
      query_intents_count: this.brdContext ? Object.keys(this.brdContext.queryIntents || {}).length : 0,
      last_update: new Date(this.lastContextLoad).toISOString(),
    };
  }

  /**
   * Handle context search
   */
  async handleSearchContext(params) {
    const { query, filters = {}, limit = 10 } = params;

    if (!this.brdContext) {
      await this.loadBRDContext();
    }

    // Search intents
    const matchingIntents = this.brdContext.intents.filter((intent) => {
      const intentStr = JSON.stringify(intent).toLowerCase();
      return intentStr.includes(query.toLowerCase());
    });

    // Search SQL hints
    const matchingHints = this.brdContext.sqlHints.filter((hint) => {
      const hintStr = JSON.stringify(hint).toLowerCase();
      return hintStr.includes(query.toLowerCase());
    });

    return {
      success: true,
      results: {
        intents: matchingIntents.slice(0, limit),
        sql_hints: matchingHints.slice(0, limit),
        total_found: matchingIntents.length + matchingHints.length,
      },
    };
  }

  /**
   * Handle get BRD
   */
  async handleGetBRD(params) {
    if (!this.brdContext) {
      await this.loadBRDContext();
    }

    return {
      success: true,
      brd_context: this.brdContext,
    };
  }

  /**
   * Refresh BRD context if needed
   */
  async refreshContextIfNeeded() {
    const now = Date.now();
    if (now - this.lastContextLoad > this.contextLoadInterval) {
      console.log("[Context-MCP] Refreshing BRD context...");
      await this.loadBRDContext();
    }
  }
}

module.exports = ContextMCPServer;

