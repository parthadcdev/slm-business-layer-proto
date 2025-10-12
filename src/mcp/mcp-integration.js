/**
 * SLM Business Service Layer - MCP Integration Layer
 *
 * @author Partha Chandramohan
 * @description Integration layer for connecting MCP router with existing business logic
 */

const MCPRouter = require("./mcp-router");
const mcpConfig = require("./config/mcp-config");
const contextProvider = require("./context-provider");

class MCPIntegration {
  constructor() {
    this.router = new MCPRouter();
    this.isInitialized = false;
    this.migrationMode = true; // Enable parallel processing during migration

    // Legacy client fallback
    this.legacyOllamaClient = null;

    console.log("[MCP-Integration] Integration layer created");
  }

  /**
   * Initialize MCP integration
   */
  async initialize() {
    console.log("[MCP-Integration] Initializing MCP integration...");

    try {
      // Initialize MCP router
      await this.router.initialize();

      // Set up router event handlers
      this.setupRouterEventHandlers();

      this.isInitialized = true;

      console.log("[MCP-Integration] MCP integration initialized successfully");
      return true;
    } catch (error) {
      console.error("[MCP-Integration] Initialization failed:", error.message);
      throw error;
    }
  }

  /**
   * Generate inference using MCP providers with enhanced context
   */
  async generateInference(prompt, model = null, options = {}) {
    if (!this.isInitialized) {
      return await this.fallbackToLegacy(
        "generateResponse",
        prompt,
        model,
        options,
      );
    }

    try {
      console.log(
        `[MCP-Integration] Generating inference via MCP (model: ${model || "default"})`,
      );

      // Get enhanced context for the query
      const context = contextProvider.getMCPContext(options.query || prompt, {
        userRole: options.userRole || 'employee'
      });

      // Enhance options with context
      const enhancedOptions = {
        ...options,
        context: context,
        enhanced_schema: true,
        brd_context: true
      };

      console.log('[MCP-Integration] Enhanced context generated with',
        context.database_schema.tables.length, 'tables and',
        context.business_context.intents.length, 'business intents');

      // Use MCP router for inference with enhanced context
      const result = await this.router.generateInference(
        prompt,
        model,
        enhancedOptions,
      );

      console.log('[MCP-Integration] Inference result received:', { 
        hasResult: !!result,
        hasResponse: !!result?.response,
        resultKeys: result ? Object.keys(result) : []
      });

      if (!result || !result.response) {
        console.warn('[MCP-Integration] Invalid result structure:', result);
        throw new Error('Invalid MCP response structure');
      }

      return {
        success: true,
        response: result.response,
        model: result.metadata?.model || result.model || model,
        created_at: result.metadata?.created_at || result.created_at,
        done: result.metadata?.done || result.done || true,
        provider: result.metadata?.provider || result.provider || "mcp",
        mcp_metadata: {
          server_used: result.metadata?.server_used,
          routing_time: result.metadata?.routing_time,
          context_enhanced: true,
          context_tables: context.database_schema.tables.length,
          business_intents: context.business_context.intents.length,
          sql_hints: context.sql_hints.length,
        },
      };
    } catch (error) {
      console.warn(
        "[MCP-Integration] MCP inference failed, attempting fallback:",
        error.message,
      );

      if (this.migrationMode) {
        return await this.fallbackToLegacy(
          "generateResponse",
          prompt,
          model,
          options,
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * List available models from all MCP providers
   */
  async listAvailableModels(providerFilter = null) {
    if (!this.isInitialized) {
      return await this.fallbackToLegacy("listAvailableModels");
    }

    try {
      console.log("[MCP-Integration] Listing models via MCP");

      const models = await this.router.listModels(providerFilter);

      // Transform to legacy format
      return {
        models: models.flatMap((provider) =>
          provider.models.map((model) => ({
            name: model.id,
            size: model.size,
            modified_at: model.modified_at,
            digest: model.digest,
            provider: provider.provider,
            configuration: model.configuration,
          })),
        ),
      };
    } catch (error) {
      console.warn(
        "[MCP-Integration] MCP model listing failed, attempting fallback:",
        error.message,
      );

      if (this.migrationMode) {
        return await this.fallbackToLegacy("listAvailableModels");
      } else {
        throw error;
      }
    }
  }

  /**
   * Check health of all providers
   */
  async checkHealth() {
    if (!this.isInitialized) {
      return await this.fallbackToLegacy("checkHealth");
    }

    try {
      console.log("[MCP-Integration] Checking health via MCP");

      const healthResults = await this.router.checkAllHealth();

      // Check if any provider is healthy
      const hasHealthyProvider = Object.values(healthResults).some(
        (h) => h.healthy,
      );

      return {
        healthy: hasHealthyProvider,
        providers: healthResults,
        mcp_enabled: true,
      };
    } catch (error) {
      console.warn(
        "[MCP-Integration] MCP health check failed, attempting fallback:",
        error.message,
      );

      if (this.migrationMode) {
        const legacyHealth = await this.fallbackToLegacy("checkHealth");
        return {
          ...legacyHealth,
          mcp_enabled: false,
          mcp_error: error.message,
        };
      } else {
        return {
          healthy: false,
          error: error.message,
          mcp_enabled: false,
        };
      }
    }
  }

  /**
   * Process business request with enhanced MCP capabilities
   */
  async processBusinessRequest(request, user, options = {}) {
    console.log(`[MCP-Integration] Processing business request: "${request}"`);

    try {
      // For now, delegate to the MCP inference capability
      // In the future, this could orchestrate multiple MCP calls
      const inferenceOptions = {
        ...options,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 500,
      };

      return await this.generateInference(
        request,
        options.model,
        inferenceOptions,
      );
    } catch (error) {
      console.error(
        "[MCP-Integration] Business request processing failed:",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get comprehensive MCP statistics
   */
  getStats() {
    if (!this.isInitialized) {
      return {
        mcp_enabled: false,
        initialization_status: "not_initialized",
      };
    }

    try {
      const routerStats = this.router.getRouterStats();

      return {
        mcp_enabled: true,
        initialization_status: "initialized",
        migration_mode: this.migrationMode,
        router_stats: routerStats,
        healthy_servers: this.router.getHealthyServers(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        mcp_enabled: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Test MCP connectivity
   */
  async testConnectivity() {
    if (!this.isInitialized) {
      throw new Error("MCP integration not initialized");
    }

    console.log("[MCP-Integration] Testing MCP connectivity...");

    const results = await this.router.testConnectivity();

    return {
      success: Object.values(results).some((r) => r.success),
      results: results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Enable/disable migration mode
   */
  setMigrationMode(enabled) {
    this.migrationMode = enabled;
    console.log(
      `[MCP-Integration] Migration mode ${enabled ? "enabled" : "disabled"}`,
    );
  }

  /**
   * Set legacy Ollama client for fallback
   */
  setLegacyClient(ollamaClient) {
    this.legacyOllamaClient = ollamaClient;
    console.log("[MCP-Integration] Legacy client set for fallback");
  }

  /**
   * Fallback to legacy client
   */
  async fallbackToLegacy(method, ...args) {
    if (!this.legacyOllamaClient) {
      // Dynamically require legacy client
      this.legacyOllamaClient = require("../slm/ollama-client");
    }

    console.log(`[MCP-Integration] Using legacy client for: ${method}`);

    try {
      const result = await this.legacyOllamaClient[method](...args);

      // Add metadata to indicate fallback was used
      if (typeof result === "object" && result !== null) {
        result.mcp_fallback = true;
        result.fallback_reason = "MCP unavailable";
      }

      return result;
    } catch (error) {
      console.error(
        `[MCP-Integration] Legacy fallback failed for ${method}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Setup router event handlers
   */
  setupRouterEventHandlers() {
    this.router.on("initialized", (data) => {
      console.log(
        "[MCP-Integration] Router initialized with servers:",
        data.results.map((r) => r.name),
      );
    });

    this.router.on("serverInitialized", ({ serverName, info }) => {
      console.log(`[MCP-Integration] Server ${serverName} came online`);
    });

    this.router.on("serverError", ({ serverName, error }) => {
      console.warn(
        `[MCP-Integration] Server ${serverName} error: ${error.message}`,
      );
    });

    this.router.on("serverDisconnected", ({ serverName }) => {
      console.warn(`[MCP-Integration] Server ${serverName} disconnected`);
    });

    this.router.on("healthChanged", ({ serverName, health }) => {
      console.log(
        `[MCP-Integration] Server ${serverName} health changed: ${health.healthy ? "healthy" : "unhealthy"}`,
      );
    });

    this.router.on("routingError", ({ capability, method, error }) => {
      console.error(
        `[MCP-Integration] Routing error for ${capability}/${method}: ${error.message}`,
      );
    });
  }

  /**
   * Get specific server for advanced operations
   */
  getServer(serverName) {
    if (!this.isInitialized) {
      return null;
    }

    return this.router.getServer(serverName);
  }

  /**
   * Enable/disable specific server
   */
  setServerEnabled(serverName, enabled) {
    return this.router.setServerEnabled(serverName, enabled);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log("[MCP-Integration] Starting graceful shutdown...");

    if (this.isInitialized) {
      await this.router.shutdown();
    }

    this.isInitialized = false;
    console.log("[MCP-Integration] Shutdown complete");
  }

  /**
   * Check if MCP is ready for use
   */
  isReady() {
    if (!this.isInitialized) {
      return false;
    }

    const healthyServers = this.router.getHealthyServers();
    return healthyServers.length > 0;
  }

  /**
   * Get router instance for direct access
   */
  getRouter() {
    return this.router;
  }
}

module.exports = MCPIntegration;
