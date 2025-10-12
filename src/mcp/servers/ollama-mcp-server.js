/**
 * SLM Business Service Layer - Ollama MCP Server
 *
 * @author Partha Chandramohan
 * @description MCP server implementation for Ollama local LLM provider
 */

const MCPClient = require("../mcp-client");
const ollamaClient = require("../../slm/ollama-client");
const modelConfig = require("../../config/model-config");
const mcpConfig = require("../config/mcp-config");

class OllamaMCPServer extends MCPClient {
  constructor(serverConfig) {
    super(serverConfig);

    this.serverType = "ollama";
    this.availableModels = [];
    this.lastModelCheck = 0;
    this.modelCheckInterval = 60000; // 1 minute

    console.log("[Ollama-MCP] Ollama MCP server instance created");
  }

  /**
   * Handle internal MCP requests for Ollama
   */
  async handleInternalRequest(request) {
    const { method, params, id } = request;

    console.log(`[Ollama-MCP] Handling request: ${method}`);

    try {
      let result;

      switch (method) {
        case mcpConfig.messageTypes.initialize:
          result = await this.handleInitialize(params);
          break;

        case mcpConfig.messageTypes.generateInference:
          result = await this.handleGenerateInference(params);
          break;

        case mcpConfig.messageTypes.listModels:
          result = await this.handleListModels(params);
          break;

        case mcpConfig.messageTypes.getHealth:
          result = await this.handleHealthCheck(params);
          break;

        case mcpConfig.messageTypes.listTools:
          result = await this.handleListTools(params);
          break;

        case mcpConfig.messageTypes.callTool:
          result = await this.handleCallTool(params);
          break;

        default:
          throw new Error(`Method not supported: ${method}`);
      }

      return this.messageHandler.createResponse(id, result);
    } catch (error) {
      console.error(
        `[Ollama-MCP] Request failed for ${method}:`,
        error.message,
      );
      return this.messageHandler.createErrorResponse(
        id,
        mcpConfig.errorCodes.INTERNAL_ERROR,
        error.message,
      );
    }
  }

  /**
   * Handle MCP initialization
   */
  async handleInitialize(params) {
    console.log("[Ollama-MCP] Initializing Ollama MCP server...");

    // Check Ollama availability
    const health = await ollamaClient.checkHealth();
    if (!health.healthy) {
      throw new Error("Ollama service is not available");
    }

    // Load available models
    await this.refreshModels();

    const serverInfo = {
      name: "Ollama MCP Server",
      version: "1.0.0",
      provider: "ollama",
      endpoint: this.serverConfig.endpoint,
    };

    const capabilities = {
      inference: {
        supports_streaming: true,
        supports_tools: false,
        max_tokens: 8192,
        temperature_range: [0.0, 2.0],
      },
      models: {
        list_supported: true,
        dynamic_loading: true,
        model_info: true,
      },
      health: {
        check_supported: true,
        detailed_status: true,
      },
      tools: [
        {
          name: "generate_text",
          description: "Generate text using Ollama LLM",
          input_schema: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              model: { type: "string" },
              temperature: { type: "number" },
              max_tokens: { type: "number" },
            },
            required: ["prompt"],
          },
        },
        {
          name: "list_models",
          description: "List available Ollama models",
          input_schema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };

    return {
      protocolVersion: mcpConfig.protocolVersion,
      serverInfo: serverInfo,
      capabilities: capabilities,
    };
  }

  /**
   * Handle inference generation
   */
  async handleGenerateInference(params) {
    console.log("[Ollama-MCP] Received params:", { 
      hasParams: !!params, 
      paramKeys: params ? Object.keys(params) : [],
      paramsType: typeof params
    });
    
    const { prompt, model, options = {} } = params;

    if (!prompt) {
      console.error("[Ollama-MCP] No prompt in params. Full params:", params);
      throw new Error("Prompt is required for inference generation");
    }

    console.log(
      `[Ollama-MCP] Generating inference with model: ${model || "default"}`,
    );

    try {
      // Use the existing Ollama client
      const response = await ollamaClient.generateResponse(
        prompt,
        model,
        options,
      );

      return {
        success: true,
        response: response.response,
        model: response.model,
        metadata: {
          created_at: response.created_at,
          done: response.done,
          provider: "ollama",
          endpoint: this.serverConfig.endpoint,
        },
      };
    } catch (error) {
      console.error("[Ollama-MCP] Inference generation failed:", error.message);
      throw new Error(`Ollama inference failed: ${error.message}`);
    }
  }

  /**
   * Handle model listing
   */
  async handleListModels(params) {
    console.log("[Ollama-MCP] Listing available models...");

    try {
      // Refresh models if cache is stale
      if (Date.now() - this.lastModelCheck > this.modelCheckInterval) {
        await this.refreshModels();
      }

      // Get model configurations
      const configuredModels = modelConfig.getModelsForProvider("ollama");

      // Combine with available models
      const modelsWithConfig = this.availableModels.map((model) => {
        const config = configuredModels.find((c) => c.id === model.name);
        return {
          id: model.name,
          name: config?.name || model.name,
          provider: "ollama",
          available: true,
          size: model.size,
          modified_at: model.modified_at,
          digest: model.digest,
          details: model.details,
          configuration: config
            ? {
                context_length: config.context_length,
                strengths: config.strengths,
                use_case: config.use_case,
                recommended_temperature: config.recommended_temperature,
                recommended_max_tokens: config.recommended_max_tokens,
              }
            : null,
        };
      });

      return {
        models: modelsWithConfig,
        provider: "ollama",
        total_count: modelsWithConfig.length,
        last_updated: new Date(this.lastModelCheck).toISOString(),
      };
    } catch (error) {
      console.error("[Ollama-MCP] Model listing failed:", error.message);
      throw new Error(`Failed to list Ollama models: ${error.message}`);
    }
  }

  /**
   * Handle health check
   */
  async handleHealthCheck(params) {
    console.log("[Ollama-MCP] Performing health check...");

    try {
      const health = await ollamaClient.checkHealth();

      // Get additional stats
      const modelCount = this.availableModels.length;
      const stats = this.getStats();

      return {
        healthy: health.healthy,
        status: health.healthy ? "operational" : "degraded",
        provider: "ollama",
        endpoint: this.serverConfig.endpoint,
        models_available: modelCount,
        last_model_check: new Date(this.lastModelCheck).toISOString(),
        performance: {
          requests_sent: stats.requestsSent,
          responses_received: stats.responsesReceived,
          errors_received: stats.errorsReceived,
          average_latency: stats.averageLatency,
        },
        details: health.error ? { error: health.error } : null,
      };
    } catch (error) {
      console.error("[Ollama-MCP] Health check failed:", error.message);
      return {
        healthy: false,
        status: "unavailable",
        provider: "ollama",
        error: error.message,
      };
    }
  }

  /**
   * Handle tools listing
   */
  async handleListTools(params) {
    return {
      tools: [
        {
          name: "generate_text",
          description: "Generate text using Ollama LLM models",
          input_schema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The text prompt for generation",
              },
              model: {
                type: "string",
                description: "Specific model to use (optional)",
                enum: this.availableModels.map((m) => m.name),
              },
              temperature: {
                type: "number",
                description: "Sampling temperature (0.0 to 2.0)",
                minimum: 0.0,
                maximum: 2.0,
              },
              max_tokens: {
                type: "number",
                description: "Maximum tokens to generate",
                minimum: 1,
                maximum: 8192,
              },
            },
            required: ["prompt"],
          },
        },
        {
          name: "get_model_info",
          description: "Get detailed information about a specific model",
          input_schema: {
            type: "object",
            properties: {
              model: {
                type: "string",
                description: "Model name to get information for",
                enum: this.availableModels.map((m) => m.name),
              },
            },
            required: ["model"],
          },
        },
      ],
    };
  }

  /**
   * Handle tool execution
   */
  async handleCallTool(params) {
    const { name, arguments: args } = params;

    console.log(`[Ollama-MCP] Executing tool: ${name}`);

    switch (name) {
      case "generate_text":
        return await this.toolGenerateText(args);

      case "get_model_info":
        return await this.toolGetModelInfo(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Tool: Generate text
   */
  async toolGenerateText(args) {
    const { prompt, model, temperature, max_tokens } = args;

    const options = {};
    if (temperature !== undefined) options.temperature = temperature;
    if (max_tokens !== undefined) options.max_tokens = max_tokens;

    const result = await this.handleGenerateInference({
      prompt,
      model,
      options,
    });

    return {
      content: [
        {
          type: "text",
          text: result.response,
        },
      ],
      isError: false,
    };
  }

  /**
   * Tool: Get model information
   */
  async toolGetModelInfo(args) {
    const { model } = args;

    const modelInfo = this.availableModels.find((m) => m.name === model);
    if (!modelInfo) {
      throw new Error(`Model not found: ${model}`);
    }

    const config = modelConfig
      .getModelsForProvider("ollama")
      .find((c) => c.id === model);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              name: model,
              size: modelInfo.size,
              modified_at: modelInfo.modified_at,
              digest: modelInfo.digest,
              configuration: config,
              provider: "ollama",
            },
            null,
            2,
          ),
        },
      ],
      isError: false,
    };
  }

  /**
   * Refresh available models from Ollama
   */
  async refreshModels() {
    try {
      console.log("[Ollama-MCP] Refreshing model list...");

      const response = await ollamaClient.listAvailableModels();
      this.availableModels = response.models || [];
      this.lastModelCheck = Date.now();

      console.log(
        `[Ollama-MCP] Found ${this.availableModels.length} available models`,
      );
    } catch (error) {
      console.error("[Ollama-MCP] Failed to refresh models:", error.message);
      // Keep existing models if refresh fails
    }
  }

  /**
   * Override connect method for HTTP transport
   */
  async connect() {
    try {
      // For Ollama, we test connection using the existing client
      const health = await ollamaClient.checkHealth();

      if (health.healthy) {
        console.log("[Ollama-MCP] Connected to Ollama service");
        return true;
      } else {
        throw new Error("Ollama service reported unhealthy status");
      }
    } catch (error) {
      console.error("[Ollama-MCP] Connection failed:", error.message);
      throw error;
    }
  }

  /**
   * Override makeHttpRequest to use Ollama client's axios instance
   */
  async makeHttpRequest(method, path, data, timeout = null) {
    // For MCP requests to Ollama, we route through our internal handler
    // since we're implementing the server-side of the protocol
    if (data && data.jsonrpc === "2.0") {
      return await this.handleInternalRequest(data);
    }

    // For direct Ollama API calls, use the original client
    throw new Error("Direct HTTP requests not supported in Ollama MCP server");
  }
}

module.exports = OllamaMCPServer;
