/**
 * SLM Business Service Layer - Model Context Protocol Configuration
 *
 * @author Partha Chandramohan
 * @description MCP configuration for server endpoints, capabilities, and protocol settings
 */

class MCPConfig {
  constructor() {
    this.protocolVersion = "2024-11-05";
    this.clientName = "SLM-Business-Layer";
    this.clientVersion = "1.0.0";
    this.maxRequestTimeout = 300000; // 5 minutes
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second base delay

    // MCP Server configurations
    this.servers = {
      ollama: {
        name: "Ollama Local LLM Server",
        endpoint: "http://localhost:11434",
        transport: "http",
        capabilities: {
          inference: true,
          streaming: true,
          models: true,
          health: true,
        },
        priority: 1,
        enabled: true,
        timeout: 120000, // 2 minutes
        healthCheckInterval: 30000, // 30 seconds
      },
      openai: {
        name: "OpenAI API Server",
        endpoint: "https://api.openai.com/v1",
        transport: "http",
        capabilities: {
          inference: true,
          streaming: true,
          models: true,
          health: false,
        },
        priority: 2,
        enabled: false, // Disabled by default (requires API key)
        timeout: 60000,
        healthCheckInterval: 60000,
        requiresAuth: true,
        authType: "bearer",
      },
      anthropic: {
        name: "Anthropic Claude API Server",
        endpoint: "https://api.anthropic.com/v1",
        transport: "http",
        capabilities: {
          inference: true,
          streaming: true,
          models: true,
          health: false,
        },
        priority: 3,
        enabled: false, // Disabled by default (requires API key)
        timeout: 60000,
        healthCheckInterval: 60000,
        requiresAuth: true,
        authType: "bearer",
      },
      context: {
        name: "Business Context Server",
        endpoint: "internal://context",
        transport: "internal",
        capabilities: {
          retrieval: true,
          embedding: true,
          search: true,
          health: true,
        },
        priority: 0, // Highest priority for context
        enabled: true,
        timeout: 30000,
        healthCheckInterval: 15000,
      },
      database: {
        name: "Database Context Server",
        endpoint: "internal://database",
        transport: "internal",
        capabilities: {
          query: true,
          schema: true,
          data: true,
          health: true,
        },
        priority: 0, // Highest priority for data
        enabled: true,
        timeout: 15000,
        healthCheckInterval: 10000,
      },
    };

    // Load balancing configuration
    this.loadBalancing = {
      strategy: "priority", // 'round_robin', 'priority', 'least_latency'
      healthCheckEnabled: true,
      failoverEnabled: true,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
    };

    // Request routing rules
    this.routing = {
      inference: ["ollama", "openai", "anthropic"],
      context: ["context", "database"],
      health: ["ollama", "context", "database"],
      models: ["ollama", "openai", "anthropic"],
    };

    // MCP message types and capabilities
    this.messageTypes = {
      // Core protocol messages
      initialize: "initialize",
      initialized: "initialized",
      listTools: "tools/list",
      callTool: "tools/call",
      listResources: "resources/list",
      readResource: "resources/read",

      // Custom business-specific messages
      generateInference: "inference/generate",
      listModels: "models/list",
      getHealth: "health/check",
      searchContext: "context/search",
      queryDatabase: "database/query",
    };

    // Error codes following MCP specification
    this.errorCodes = {
      PARSE_ERROR: -32700,
      INVALID_REQUEST: -32600,
      METHOD_NOT_FOUND: -32601,
      INVALID_PARAMS: -32602,
      INTERNAL_ERROR: -32603,

      // Custom error codes (application-specific range: -32000 to -32099)
      SERVER_UNAVAILABLE: -32001,
      AUTHENTICATION_FAILED: -32002,
      RATE_LIMIT_EXCEEDED: -32003,
      MODEL_UNAVAILABLE: -32004,
      CONTEXT_RETRIEVAL_FAILED: -32005,
    };
  }

  /**
   * Get configuration for a specific server
   */
  getServerConfig(serverName) {
    return this.servers[serverName] || null;
  }

  /**
   * Get enabled servers sorted by priority
   */
  getEnabledServers() {
    return Object.entries(this.servers)
      .filter(([_, config]) => config.enabled)
      .sort(([_, a], [__, b]) => a.priority - b.priority)
      .map(([key, config]) => ({ key, name: config.name, ...config }));
  }

  /**
   * Get servers capable of handling a specific operation
   */
  getServersForCapability(capability) {
    const capableServers = this.routing[capability] || [];
    console.log(`[MCP-Config] getServersForCapability(${capability}):`, {
      routingExists: !!this.routing[capability],
      capableServers: capableServers,
      serverConfigs: capableServers.map((name) => ({
        name,
        exists: !!this.servers[name],
        enabled: this.servers[name]?.enabled,
      })),
    });

    const filtered = capableServers.filter(
      (serverName) => this.servers[serverName]?.enabled,
    );
    console.log(
      `[MCP-Config] After filtering: ${filtered.length} servers:`,
      filtered,
    );

    return filtered
      .map((serverName) => ({ 
        ...this.servers[serverName],
        id: serverName,  // Server ID for registry lookup
        name: serverName,  // Override with server ID (used by registry)
        displayName: this.servers[serverName].name,  // Keep display name separate
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Enable/disable a server
   */
  setServerEnabled(serverName, enabled) {
    if (this.servers[serverName]) {
      this.servers[serverName].enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Update server endpoint
   */
  updateServerEndpoint(serverName, endpoint) {
    if (this.servers[serverName]) {
      this.servers[serverName].endpoint = endpoint;
      return true;
    }
    return false;
  }

  /**
   * Get protocol-compliant client info
   */
  getClientInfo() {
    return {
      name: this.clientName,
      version: this.clientVersion,
      protocolVersion: this.protocolVersion,
    };
  }

  /**
   * Validate MCP message format
   */
  isValidMCPMessage(message) {
    if (!message || typeof message !== "object") {
      return false;
    }

    // Check for required JSON-RPC 2.0 fields
    if (message.jsonrpc !== "2.0") {
      return false;
    }

    // Must have either 'id' (request/response) or be a notification
    if (message.id === undefined && message.method === undefined) {
      return false;
    }

    return true;
  }

  /**
   * Create standard MCP request
   */
  createMCPRequest(method, params = {}, id = null) {
    const request = {
      jsonrpc: "2.0",
      method: method,
      params: params,
    };

    if (id !== null) {
      request.id = id;
    }

    return request;
  }

  /**
   * Create standard MCP response
   */
  createMCPResponse(id, result = null, error = null) {
    const response = {
      jsonrpc: "2.0",
      id: id,
    };

    if (error) {
      response.error = {
        code: error.code || this.errorCodes.INTERNAL_ERROR,
        message: error.message || "Internal error",
        data: error.data || null,
      };
    } else {
      response.result = result;
    }

    return response;
  }
}

module.exports = new MCPConfig();
