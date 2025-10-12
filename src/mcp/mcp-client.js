/**
 * SLM Business Service Layer - MCP Client
 *
 * @author Partha Chandramohan
 * @description Model Context Protocol client implementation with JSON-RPC 2.0 support
 */

const axios = require("axios");
const EventEmitter = require("events");
const MCPMessageHandler = require("./message-handler");
const mcpConfig = require("./config/mcp-config");

class MCPClient extends EventEmitter {
  constructor(serverConfig = {}) {
    super();

    this.serverConfig = {
      name: "unknown",
      endpoint: "",
      transport: "http",
      timeout: 30000,
      requiresAuth: false,
      authType: "bearer",
      ...serverConfig,
    };

    this.messageHandler = new MCPMessageHandler();
    this.isInitialized = false;
    this.isConnected = false;
    this.serverCapabilities = {};
    this.authToken = null;
    this.requestCounter = 0;

    // Connection state
    this.lastError = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;

    // Performance tracking
    this.stats = {
      requestsSent: 0,
      responsesReceived: 0,
      errorsReceived: 0,
      averageLatency: 0,
      totalLatency: 0,
    };

    console.log(
      `[MCP-Client] Created client for ${this.serverConfig.name} (${this.serverConfig.endpoint})`,
    );
  }

  /**
   * Initialize connection and perform handshake
   */
  async initialize(clientInfo = null) {
    console.log(
      `[MCP-Client] Initializing connection to ${this.serverConfig.name}...`,
    );

    try {
      this.isConnected = await this.connect();
      if (!this.isConnected) {
        throw new Error("Failed to establish connection");
      }

      // Perform MCP initialization handshake
      const initRequest =
        this.messageHandler.createInitializeRequest(clientInfo);
      const initResponse = await this.sendRequest(initRequest);

      if (initResponse.error) {
        throw new Error(`Initialization failed: ${initResponse.error.message}`);
      }

      this.serverCapabilities = initResponse.result.capabilities || {};
      this.isInitialized = true;

      console.log(
        `[MCP-Client] Successfully initialized with ${this.serverConfig.name}`,
      );
      console.log(
        `[MCP-Client] Server capabilities:`,
        Object.keys(this.serverCapabilities),
      );

      this.emit("initialized", {
        serverInfo: initResponse.result.serverInfo,
        capabilities: this.serverCapabilities,
      });

      return true;
    } catch (error) {
      this.lastError = error;
      this.isInitialized = false;
      this.isConnected = false;

      console.error(
        `[MCP-Client] Initialization failed for ${this.serverConfig.name}:`,
        error.message,
      );
      this.emit("error", error);

      throw error;
    }
  }

  /**
   * Establish connection to server
   */
  async connect() {
    this.connectionAttempts++;

    try {
      if (this.serverConfig.transport === "http") {
        // Test HTTP connection with a simple request
        const testResponse = await this.makeHttpRequest("POST", "/", {
          jsonrpc: "2.0",
          method: "ping",
          id: "connection-test",
        });

        // Accept any response that doesn't throw an error
        console.log(
          `[MCP-Client] HTTP connection established to ${this.serverConfig.endpoint}`,
        );
        return true;
      } else if (this.serverConfig.transport === "internal") {
        // Internal transport (for context/database servers)
        console.log(
          `[MCP-Client] Internal transport ready for ${this.serverConfig.name}`,
        );
        return true;
      } else {
        throw new Error(
          `Unsupported transport: ${this.serverConfig.transport}`,
        );
      }
    } catch (error) {
      console.warn(
        `[MCP-Client] Connection attempt ${this.connectionAttempts} failed:`,
        error.message,
      );

      if (this.connectionAttempts < this.maxConnectionAttempts) {
        console.log(`[MCP-Client] Retrying connection in 2 seconds...`);
        await this.sleep(2000);
        return await this.connect();
      }

      throw new Error(
        `Failed to connect after ${this.maxConnectionAttempts} attempts: ${error.message}`,
      );
    }
  }

  /**
   * Send request to server
   */
  async sendRequest(request, timeout = null) {
    if (!this.isConnected) {
      throw new Error("Client not connected");
    }

    const requestTimeout = timeout || this.serverConfig.timeout;
    const startTime = Date.now();

    try {
      // Register pending request for timeout tracking
      if (request.id) {
        this.messageHandler.registerPendingRequest(request.id, requestTimeout);
      }

      this.stats.requestsSent++;

      let response;

      if (this.serverConfig.transport === "http") {
        response = await this.makeHttpRequest(
          "POST",
          "/",
          request,
          requestTimeout,
        );
      } else if (this.serverConfig.transport === "internal") {
        response = await this.handleInternalRequest(request);
      } else {
        throw new Error(
          `Unsupported transport: ${this.serverConfig.transport}`,
        );
      }

      // Process response
      const processedResponse =
        await this.messageHandler.handleIncomingMessage(response);

      // Update statistics
      const latency = Date.now() - startTime;
      this.updateStats(latency, !processedResponse.error);

      if (processedResponse.error) {
        this.emit("error", new Error(processedResponse.error.message));
      }

      return processedResponse;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateStats(latency, false);

      console.error(
        `[MCP-Client] Request failed for ${this.serverConfig.name}:`,
        error.message,
      );
      this.emit("error", error);

      throw error;
    }
  }

  /**
   * Make HTTP request
   */
  async makeHttpRequest(method, path, data, timeout = null) {
    const url = this.serverConfig.endpoint + path;
    const requestTimeout = timeout || this.serverConfig.timeout;

    const config = {
      method: method,
      url: url,
      data: data,
      timeout: requestTimeout,
      headers: {
        "Content-Type": "application/json",
      },
    };

    // Add authentication if required
    if (this.serverConfig.requiresAuth && this.authToken) {
      if (this.serverConfig.authType === "bearer") {
        config.headers["Authorization"] = `Bearer ${this.authToken}`;
      }
    }

    const response = await axios(config);
    return response.data;
  }

  /**
   * Handle internal requests (for context/database servers)
   */
  async handleInternalRequest(request) {
    // This will be implemented by specific internal servers
    console.log(`[MCP-Client] Internal request: ${request.method}`);

    // For now, return a basic response
    return this.messageHandler.createResponse(request.id, {
      message: "Internal request processed",
    });
  }

  /**
   * Send notification (no response expected)
   */
  async sendNotification(method, params = {}) {
    const notification = this.messageHandler.createNotification(method, params);

    try {
      if (this.serverConfig.transport === "http") {
        await this.makeHttpRequest("POST", "/", notification);
      } else if (this.serverConfig.transport === "internal") {
        await this.handleInternalRequest(notification);
      }

      console.log(`[MCP-Client] Notification sent: ${method}`);
    } catch (error) {
      console.error(`[MCP-Client] Notification failed:`, error.message);
      this.emit("error", error);
    }
  }

  /**
   * List available tools
   */
  async listTools() {
    if (!this.isInitialized) {
      throw new Error("Client not initialized");
    }

    const request = this.messageHandler.createListToolsRequest();
    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`List tools failed: ${response.error.message}`);
    }

    return response.result.tools || [];
  }

  /**
   * Call a specific tool
   */
  async callTool(toolName, arguments_ = {}) {
    if (!this.isInitialized) {
      throw new Error("Client not initialized");
    }

    const request = this.messageHandler.createCallToolRequest(
      toolName,
      arguments_,
    );
    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    return response.result;
  }

  /**
   * Generate inference (custom method)
   */
  async generateInference(prompt, model = null, options = {}) {
    if (!this.isInitialized) {
      throw new Error("Client not initialized");
    }

    const request = this.messageHandler.createInferenceRequest(
      prompt,
      model,
      options,
    );
    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`Inference failed: ${response.error.message}`);
    }

    return response.result;
  }

  /**
   * List available models (custom method)
   */
  async listModels() {
    if (!this.isInitialized) {
      throw new Error("Client not initialized");
    }

    const request = this.messageHandler.createListModelsRequest();
    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`List models failed: ${response.error.message}`);
    }

    return response.result.models || [];
  }

  /**
   * Check server health (custom method)
   */
  async checkHealth() {
    const request = this.messageHandler.createHealthCheckRequest();
    const response = await this.sendRequest(request);

    if (response.error) {
      return {
        healthy: false,
        error: response.error.message,
      };
    }

    return response.result;
  }

  /**
   * Set authentication token
   */
  setAuthToken(token) {
    this.authToken = token;
    console.log(
      `[MCP-Client] Authentication token set for ${this.serverConfig.name}`,
    );
  }

  /**
   * Update performance statistics
   */
  updateStats(latency, success) {
    this.stats.totalLatency += latency;

    if (success) {
      this.stats.responsesReceived++;
    } else {
      this.stats.errorsReceived++;
    }

    const totalRequests =
      this.stats.responsesReceived + this.stats.errorsReceived;
    if (totalRequests > 0) {
      this.stats.averageLatency = this.stats.totalLatency / totalRequests;
    }
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      ...this.stats,
      isConnected: this.isConnected,
      isInitialized: this.isInitialized,
      serverName: this.serverConfig.name,
      lastError: this.lastError?.message || null,
      pendingRequests: this.messageHandler.getPendingRequestStats(),
    };
  }

  /**
   * Disconnect from server
   */
  async disconnect() {
    console.log(`[MCP-Client] Disconnecting from ${this.serverConfig.name}...`);

    this.isConnected = false;
    this.isInitialized = false;
    this.messageHandler.cleanup();

    this.emit("disconnected");
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = MCPClient;
