/**
 * SLM Business Service Layer - MCP Router
 *
 * @author Partha Chandramohan
 * @description Central routing and load balancing for Model Context Protocol requests
 */

const EventEmitter = require("events");
const MCPServerRegistry = require("./server-registry");
const MCPMessageHandler = require("./message-handler");
const mcpConfig = require("./config/mcp-config");

class MCPRouter extends EventEmitter {
  constructor() {
    super();

    this.registry = new MCPServerRegistry();
    this.messageHandler = new MCPMessageHandler();
    this.isInitialized = false;

    // Request routing cache
    this.routingCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes

    // Performance tracking
    this.routerStats = {
      requestsRouted: 0,
      requestsFailed: 0,
      averageRoutingTime: 0,
      totalRoutingTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    console.log("[MCP-Router] Router initialized");

    // Set up registry event handlers
    this.setupRegistryEventHandlers();
  }

  /**
   * Initialize MCP router
   */
  async initialize() {
    console.log("[MCP-Router] Starting router initialization...");

    try {
      // Initialize all configured servers
      const results = await this.registry.initializeAllServers();

      const successful = results.filter((r) => r.success);
      console.log(
        `[MCP-Router] Initialized ${successful.length}/${results.length} servers`,
      );

      this.isInitialized = true;
      this.emit("initialized", { results });

      return results;
    } catch (error) {
      console.error("[MCP-Router] Initialization failed:", error.message);
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Route request to appropriate server
   */
  async routeRequest(capability, method, params = {}, options = {}) {
    const startTime = Date.now();

    try {
      if (!this.isInitialized) {
        throw new Error("Router not initialized");
      }

      console.log(`[MCP-Router] Routing ${capability}/${method} request`);

      // Get best server for capability
      const server = this.getBestServerForCapability(capability, options);
      if (!server) {
        throw new Error(`No available servers for capability: ${capability}`);
      }

      console.log(`[MCP-Router] Selected server: ${server.name}`);

      // Create and send request
      const request = this.messageHandler.createRequest(method, params);
      const response = await server.client.sendRequest(
        request,
        options.timeout,
      );

      // Update statistics
      const routingTime = Date.now() - startTime;
      this.updateRouterStats(routingTime, true);

      console.log(
        `[MCP-Router] Request completed successfully in ${routingTime}ms`,
      );

      return {
        success: true,
        result: response.result,
        server: server.name,
        routingTime: routingTime,
      };
    } catch (error) {
      const routingTime = Date.now() - startTime;
      this.updateRouterStats(routingTime, false);

      console.error(`[MCP-Router] Request failed:`, error.message);
      this.emit("routingError", { capability, method, error });

      return {
        success: false,
        error: error.message,
        routingTime: routingTime,
      };
    }
  }

  /**
   * Generate inference using LLM providers
   */
  async generateInference(prompt, model = null, options = {}) {
    console.log(
      `[MCP-Router] Generating inference with model: ${model || "default"}`,
    );

    const result = await this.routeRequest(
      "inference",
      mcpConfig.messageTypes.generateInference,
      { prompt, model, options },
      options,
    );

    if (!result.success) {
      throw new Error(`Inference generation failed: ${result.error}`);
    }

    return result.result;
  }

  /**
   * List available models from all providers
   */
  async listModels(providerFilter = null) {
    console.log("[MCP-Router] Listing available models");

    const servers = providerFilter
      ? [this.registry.getServer(providerFilter)]
      : this.registry.getServersByCapability("models");

    const allModels = [];

    for (const server of servers) {
      if (!server || !server.client) continue;

      try {
        const result = await this.routeRequest(
          "models",
          mcpConfig.messageTypes.listModels,
          {},
          { timeout: 10000 },
        );

        if (result.success && result.result.models) {
          allModels.push({
            provider: server.name,
            models: result.result.models,
          });
        }
      } catch (error) {
        console.warn(
          `[MCP-Router] Failed to get models from ${server.name}:`,
          error.message,
        );
      }
    }

    return allModels;
  }

  /**
   * Search context from context providers
   */
  async searchContext(query, options = {}) {
    console.log(`[MCP-Router] Searching context: "${query}"`);

    const result = await this.routeRequest(
      "context",
      mcpConfig.messageTypes.searchContext,
      { query, ...options },
      options,
    );

    if (!result.success) {
      throw new Error(`Context search failed: ${result.error}`);
    }

    return result.result;
  }

  /**
   * Query database through database providers
   */
  async queryDatabase(sql, params = [], options = {}) {
    console.log(`[MCP-Router] Executing database query`);

    const result = await this.routeRequest(
      "query",
      mcpConfig.messageTypes.queryDatabase,
      { query: sql, parameters: params },
      options,
    );

    if (!result.success) {
      throw new Error(`Database query failed: ${result.error}`);
    }

    return result.result;
  }

  /**
   * Check health of all servers
   */
  async checkAllHealth() {
    console.log("[MCP-Router] Checking health of all servers");

    const servers = this.registry.getAllServers();
    const healthResults = {};

    for (const serverName of servers) {
      try {
        const server = this.registry.getServer(serverName);
        if (server) {
          const health = await server.checkHealth();
          healthResults[serverName] = health;
        }
      } catch (error) {
        healthResults[serverName] = {
          healthy: false,
          error: error.message,
        };
      }
    }

    return healthResults;
  }

  /**
   * Get best server for capability using load balancing and caching
   */
  getBestServerForCapability(capability, options = {}) {
    // Check cache first
    const cacheKey = `${capability}-${options.preferredProvider || "any"}`;
    const cached = this.routingCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      this.routerStats.cacheHits++;
      return cached.server;
    }

    this.routerStats.cacheMisses++;

    // Get server from registry
    let server;

    if (options.preferredProvider) {
      // Try preferred provider first
      const preferredServer = this.registry.getServer(
        options.preferredProvider,
      );
      const health = this.registry.serverHealth.get(options.preferredProvider);

      if (preferredServer && health && health.healthy) {
        server = {
          name: options.preferredProvider,
          client: preferredServer,
          health: health,
        };
      }
    }

    if (!server) {
      // Use load balancing to select best server
      server = this.registry.getBestServer(capability);
    }

    // Cache the result
    if (server) {
      this.routingCache.set(cacheKey, {
        server: server,
        timestamp: Date.now(),
      });
    }

    return server;
  }

  /**
   * Register a new server
   */
  async registerServer(serverName, config = null) {
    console.log(`[MCP-Router] Registering server: ${serverName}`);
    return await this.registry.registerServer(serverName, config);
  }

  /**
   * Unregister a server
   */
  async unregisterServer(serverName) {
    console.log(`[MCP-Router] Unregistering server: ${serverName}`);
    await this.registry.unregisterServer(serverName);

    // Clear routing cache
    this.clearRoutingCache();
  }

  /**
   * Enable/disable a server
   */
  setServerEnabled(serverName, enabled) {
    const result = mcpConfig.setServerEnabled(serverName, enabled);
    if (result) {
      this.clearRoutingCache();
      console.log(
        `[MCP-Router] Server ${serverName} ${enabled ? "enabled" : "disabled"}`,
      );
    }
    return result;
  }

  /**
   * Clear routing cache
   */
  clearRoutingCache() {
    this.routingCache.clear();
    console.log("[MCP-Router] Routing cache cleared");
  }

  /**
   * Update router performance statistics
   */
  updateRouterStats(routingTime, success) {
    this.routerStats.totalRoutingTime += routingTime;

    if (success) {
      this.routerStats.requestsRouted++;
    } else {
      this.routerStats.requestsFailed++;
    }

    const totalRequests =
      this.routerStats.requestsRouted + this.routerStats.requestsFailed;
    if (totalRequests > 0) {
      this.routerStats.averageRoutingTime =
        this.routerStats.totalRoutingTime / totalRequests;
    }
  }

  /**
   * Get comprehensive router statistics
   */
  getRouterStats() {
    const registryStats = this.registry.getRegistryStats();

    return {
      router: {
        ...this.routerStats,
        isInitialized: this.isInitialized,
        cacheSize: this.routingCache.size,
      },
      registry: registryStats,
      configuration: {
        loadBalancingStrategy: mcpConfig.loadBalancing.strategy,
        healthCheckEnabled: mcpConfig.loadBalancing.healthCheckEnabled,
        failoverEnabled: mcpConfig.loadBalancing.failoverEnabled,
      },
    };
  }

  /**
   * Setup event handlers for registry events
   */
  setupRegistryEventHandlers() {
    this.registry.on("serverInitialized", ({ serverName, info }) => {
      console.log(`[MCP-Router] Server ${serverName} initialized successfully`);
      this.clearRoutingCache();
      this.emit("serverInitialized", { serverName, info });
    });

    this.registry.on("serverError", ({ serverName, error }) => {
      console.warn(`[MCP-Router] Server ${serverName} error: ${error.message}`);
      this.clearRoutingCache();
      this.emit("serverError", { serverName, error });
    });

    this.registry.on("serverDisconnected", ({ serverName }) => {
      console.log(`[MCP-Router] Server ${serverName} disconnected`);
      this.clearRoutingCache();
      this.emit("serverDisconnected", { serverName });
    });

    this.registry.on("healthChanged", ({ serverName, health }) => {
      console.log(
        `[MCP-Router] Server ${serverName} health: ${health.healthy ? "healthy" : "unhealthy"}`,
      );
      this.clearRoutingCache();
      this.emit("healthChanged", { serverName, health });
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log("[MCP-Router] Starting graceful shutdown...");

    this.isInitialized = false;
    this.clearRoutingCache();

    await this.registry.shutdown();

    console.log("[MCP-Router] Shutdown complete");
    this.emit("shutdown");
  }

  /**
   * Get server instance directly (for advanced use cases)
   */
  getServer(serverName) {
    return this.registry.getServer(serverName);
  }

  /**
   * Get all healthy servers
   */
  getHealthyServers() {
    return this.registry.getHealthyServers();
  }

  /**
   * Test connectivity to all servers
   */
  async testConnectivity() {
    console.log("[MCP-Router] Testing connectivity to all servers...");

    const servers = this.registry.getAllServers();
    const results = {};

    for (const serverName of servers) {
      const startTime = Date.now();
      try {
        const server = this.registry.getServer(serverName);
        if (server) {
          const health = await server.checkHealth();
          results[serverName] = {
            success: true,
            healthy: health.healthy,
            latency: Date.now() - startTime,
            details: health,
          };
        } else {
          results[serverName] = {
            success: false,
            error: "Server not found",
          };
        }
      } catch (error) {
        results[serverName] = {
          success: false,
          error: error.message,
          latency: Date.now() - startTime,
        };
      }
    }

    return results;
  }
}

module.exports = MCPRouter;
