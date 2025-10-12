/**
 * SLM Business Service Layer - MCP Server Registry
 *
 * @author Partha Chandramohan
 * @description Registry for managing MCP server instances and health monitoring
 */

const EventEmitter = require("events");
const MCPClient = require("./mcp-client");
const OllamaMCPServer = require("./servers/ollama-mcp-server");
const ContextMCPServer = require("./servers/context-mcp-server");
const DatabaseMCPServer = require("./servers/database-mcp-server");
const mcpConfig = require("./config/mcp-config");

class MCPServerRegistry extends EventEmitter {
  constructor() {
    super();

    this.servers = new Map(); // serverName -> MCPClient instance
    this.serverHealth = new Map(); // serverName -> health status
    this.serverStats = new Map(); // serverName -> performance stats
    this.healthCheckIntervals = new Map(); // serverName -> interval handle

    this.circuitBreakers = new Map(); // serverName -> circuit breaker state
    this.loadBalancerState = {
      currentIndex: 0, // For round-robin
      lastHealthCheck: 0,
    };

    console.log("[MCP-Registry] Server registry initialized");
  }

  /**
   * Register a new MCP server
   */
  async registerServer(serverName, serverConfig = null) {
    console.log(`[MCP-Registry] Registering server: ${serverName}`);

    try {
      // Get configuration
      const config = serverConfig || mcpConfig.getServerConfig(serverName);
      if (!config) {
        throw new Error(`No configuration found for server: ${serverName}`);
      }

      // Create appropriate MCP client instance based on server type
      let client;
      if (serverName === "ollama") {
        client = new OllamaMCPServer(config);
      } else if (serverName === "context") {
        client = new ContextMCPServer(config);
      } else if (serverName === "database") {
        client = new DatabaseMCPServer(config);
      } else {
        client = new MCPClient(config);
      }

      // Set up event listeners
      client.on("initialized", (info) => {
        console.log(
          `[MCP-Registry] Server ${serverName} initialized:`,
          info.serverInfo?.name,
        );
        this.updateServerHealth(serverName, true, null);
        this.emit("serverInitialized", { serverName, info });
      });

      client.on("error", (error) => {
        console.error(
          `[MCP-Registry] Server ${serverName} error:`,
          error.message,
        );
        this.updateServerHealth(serverName, false, error);
        this.handleServerError(serverName, error);
        this.emit("serverError", { serverName, error });
      });

      client.on("disconnected", () => {
        console.log(`[MCP-Registry] Server ${serverName} disconnected`);
        this.updateServerHealth(serverName, false, new Error("Disconnected"));
        this.emit("serverDisconnected", { serverName });
      });

      // Store client
      this.servers.set(serverName, client);

      // Initialize circuit breaker
      this.circuitBreakers.set(serverName, {
        failures: 0,
        lastFailure: 0,
        state: "closed", // closed, open, half-open
        threshold: mcpConfig.loadBalancing.circuitBreakerThreshold,
      });

      // Initialize health monitoring
      this.startHealthMonitoring(serverName, config);

      // Attempt to initialize the server
      if (config.enabled) {
        try {
          await client.initialize();
          console.log(
            `[MCP-Registry] Server ${serverName} successfully registered and initialized`,
          );
        } catch (error) {
          console.warn(
            `[MCP-Registry] Server ${serverName} registered but initialization failed:`,
            error.message,
          );
          this.updateServerHealth(serverName, false, error);
        }
      } else {
        console.log(
          `[MCP-Registry] Server ${serverName} registered but disabled`,
        );
        this.updateServerHealth(serverName, false, new Error("Disabled"));
      }

      return client;
    } catch (error) {
      console.error(
        `[MCP-Registry] Failed to register server ${serverName}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Unregister a server
   */
  async unregisterServer(serverName) {
    console.log(`[MCP-Registry] Unregistering server: ${serverName}`);

    const client = this.servers.get(serverName);
    if (client) {
      await client.disconnect();
      this.servers.delete(serverName);
    }

    this.stopHealthMonitoring(serverName);
    this.serverHealth.delete(serverName);
    this.serverStats.delete(serverName);
    this.circuitBreakers.delete(serverName);

    this.emit("serverUnregistered", { serverName });
  }

  /**
   * Get server client instance
   */
  getServer(serverName) {
    return this.servers.get(serverName);
  }

  /**
   * Get all registered servers
   */
  getAllServers() {
    return Array.from(this.servers.keys());
  }

  /**
   * Get healthy servers
   */
  getHealthyServers() {
    return Array.from(this.servers.keys()).filter((name) => {
      const health = this.serverHealth.get(name);
      return health && health.healthy;
    });
  }

  /**
   * Get servers by capability
   */
  getServersByCapability(capability) {
    const capableServers = mcpConfig.getServersForCapability(capability);
    console.log(
      `[MCP-Registry] getServersByCapability received from config:`,
      capableServers,
    );
    console.log(
      `[MCP-Registry] this.servers Map keys:`,
      Array.from(this.servers.keys()),
    );

    const filtered = capableServers.filter((server) => {
      const hasServer = this.servers.has(server.name);
      console.log(
        `[MCP-Registry] Checking server "${server.name}": exists=${hasServer}`,
      );
      return hasServer;
    });

    console.log(`[MCP-Registry] After filtering: ${filtered.length} servers`);

    return filtered
      .map((server) => ({
        name: server.name,
        client: this.servers.get(server.name),
        health: this.serverHealth.get(server.name),
        priority: server.priority,
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get best server for capability using load balancing
   */
  getBestServer(capability) {
    const capableServers = this.getServersByCapability(capability);
    console.log(
      `[MCP-Registry] getBestServer(${capability}) - Found ${capableServers.length} capable servers:`,
      capableServers.map((s) => s.name),
    );

    const availableServers = capableServers.filter((server) => {
      const health = server.health;
      const circuitBreaker = this.circuitBreakers.get(server.name);

      console.log(`[MCP-Registry] Filtering ${server.name}:`, {
        hasHealth: !!health,
        isHealthy: health?.healthy,
        hasCircuitBreaker: !!circuitBreaker,
        circuitBreakerState: circuitBreaker?.state,
      });

      return (
        health &&
        health.healthy &&
        circuitBreaker &&
        circuitBreaker.state !== "open"
      );
    });

    console.log(
      `[MCP-Registry] getBestServer(${capability}) - ${availableServers.length} servers passed filtering`,
    );

    if (availableServers.length === 0) {
      return null;
    }

    const strategy = mcpConfig.loadBalancing.strategy;

    switch (strategy) {
      case "priority":
        return availableServers[0]; // Already sorted by priority

      case "round_robin":
        const index =
          this.loadBalancerState.currentIndex % availableServers.length;
        this.loadBalancerState.currentIndex++;
        return availableServers[index];

      case "least_latency":
        return availableServers.reduce((best, current) => {
          const bestStats = this.serverStats.get(best.name);
          const currentStats = this.serverStats.get(current.name);

          if (!bestStats) return current;
          if (!currentStats) return best;

          return currentStats.averageLatency < bestStats.averageLatency
            ? current
            : best;
        });

      default:
        return availableServers[0];
    }
  }

  /**
   * Start health monitoring for a server
   */
  startHealthMonitoring(serverName, config) {
    if (!mcpConfig.loadBalancing.healthCheckEnabled) {
      return;
    }

    const interval = config.healthCheckInterval || 30000;

    const healthCheck = async () => {
      try {
        const client = this.servers.get(serverName);
        if (!client) return;

        const health = await client.checkHealth();
        this.updateServerHealth(
          serverName,
          health.healthy,
          health.error ? new Error(health.error) : null,
        );
        this.updateServerStats(serverName, client.getStats());

        // Reset circuit breaker on successful health check
        const circuitBreaker = this.circuitBreakers.get(serverName);
        if (circuitBreaker && health.healthy) {
          circuitBreaker.failures = 0;
          if (circuitBreaker.state === "half-open") {
            circuitBreaker.state = "closed";
            console.log(
              `[MCP-Registry] Circuit breaker closed for ${serverName}`,
            );
          }
        }
      } catch (error) {
        console.warn(
          `[MCP-Registry] Health check failed for ${serverName}:`,
          error.message,
        );
        this.updateServerHealth(serverName, false, error);
        this.handleServerError(serverName, error);
      }
    };

    // Initial health check
    setTimeout(healthCheck, 1000);

    // Set up periodic health checks
    const intervalHandle = setInterval(healthCheck, interval);
    this.healthCheckIntervals.set(serverName, intervalHandle);

    console.log(
      `[MCP-Registry] Health monitoring started for ${serverName} (interval: ${interval}ms)`,
    );
  }

  /**
   * Stop health monitoring for a server
   */
  stopHealthMonitoring(serverName) {
    const intervalHandle = this.healthCheckIntervals.get(serverName);
    if (intervalHandle) {
      clearInterval(intervalHandle);
      this.healthCheckIntervals.delete(serverName);
      console.log(`[MCP-Registry] Health monitoring stopped for ${serverName}`);
    }
  }

  /**
   * Update server health status
   */
  updateServerHealth(serverName, healthy, error = null) {
    const health = {
      healthy: healthy,
      lastCheck: Date.now(),
      error: error ? error.message : null,
    };

    this.serverHealth.set(serverName, health);

    // Emit health change event
    this.emit("healthChanged", { serverName, health });
  }

  /**
   * Update server performance statistics
   */
  updateServerStats(serverName, stats) {
    this.serverStats.set(serverName, {
      ...stats,
      lastUpdate: Date.now(),
    });
  }

  /**
   * Handle server error and update circuit breaker
   */
  handleServerError(serverName, error) {
    if (!mcpConfig.loadBalancing.failoverEnabled) {
      return;
    }

    const circuitBreaker = this.circuitBreakers.get(serverName);
    if (!circuitBreaker) return;

    circuitBreaker.failures++;
    circuitBreaker.lastFailure = Date.now();

    if (circuitBreaker.failures >= circuitBreaker.threshold) {
      circuitBreaker.state = "open";
      console.warn(
        `[MCP-Registry] Circuit breaker opened for ${serverName} (${circuitBreaker.failures} failures)`,
      );

      // Schedule half-open attempt
      setTimeout(() => {
        if (circuitBreaker.state === "open") {
          circuitBreaker.state = "half-open";
          console.log(
            `[MCP-Registry] Circuit breaker half-open for ${serverName}`,
          );
        }
      }, mcpConfig.loadBalancing.circuitBreakerTimeout);
    }
  }

  /**
   * Get registry statistics
   */
  getRegistryStats() {
    const servers = Array.from(this.servers.keys());
    const healthyServers = this.getHealthyServers();

    const stats = {
      totalServers: servers.length,
      healthyServers: healthyServers.length,
      unhealthyServers: servers.length - healthyServers.length,
      servers: {},
    };

    for (const serverName of servers) {
      const health = this.serverHealth.get(serverName);
      const serverStats = this.serverStats.get(serverName);
      const circuitBreaker = this.circuitBreakers.get(serverName);

      stats.servers[serverName] = {
        health: health,
        stats: serverStats,
        circuitBreaker: {
          state: circuitBreaker?.state || "unknown",
          failures: circuitBreaker?.failures || 0,
        },
      };
    }

    return stats;
  }

  /**
   * Initialize all configured servers
   */
  async initializeAllServers() {
    console.log("[MCP-Registry] Initializing all configured servers...");

    const enabledServers = mcpConfig.getEnabledServers();
    const results = [];

    for (const server of enabledServers) {
      try {
        await this.registerServer(server.key);
        results.push({ name: server.key, success: true });
      } catch (error) {
        console.error(
          `[MCP-Registry] Failed to initialize ${server.key}:`,
          error.message,
        );
        results.push({
          name: server.key,
          success: false,
          error: error.message,
        });
      }
    }

    console.log(
      `[MCP-Registry] Initialization complete: ${results.filter((r) => r.success).length}/${results.length} servers successful`,
    );
    return results;
  }

  /**
   * Shutdown all servers
   */
  async shutdown() {
    console.log("[MCP-Registry] Shutting down all servers...");

    const servers = Array.from(this.servers.keys());
    for (const serverName of servers) {
      await this.unregisterServer(serverName);
    }

    console.log("[MCP-Registry] All servers shut down");
  }
}

module.exports = MCPServerRegistry;
