/**
 * SLM Business Service Layer - Model Configuration
 *
 * @author Partha Chandramohan
 * @description Parameterized language model configuration for testing different LLMs/SLMs
 */

class ModelConfig {
  constructor() {
    this.providers = {
      ollama: {
        name: "Ollama",
        endpoint: "http://localhost:11434",
        models: {
          "phi3:mini": {
            name: "Phi-3 Mini",
            size: "2.2 GB",
            context_length: 4096,
            recommended_temperature: 0.1,
            recommended_max_tokens: 500,
            priority: 2,
            strengths: ["Fast inference", "Code generation", "SQL queries"],
            use_case: "Default for SQL generation",
          },
          "starcoder2:3b": {
            name: "StarCoder2 3B",
            size: "1.7 GB",
            context_length: 16384,
            recommended_temperature: 0.1,
            recommended_max_tokens: 600,
            priority: 3,
            strengths: [
              "Code generation",
              "SQL optimization",
              "Programming languages",
              "Fast inference"
            ],
            use_case: "Advanced SQL generation and code optimization",
          },
          "codegemma:2b": {
            name: "CodeGemma 2B",
            size: "1.6 GB",
            context_length: 8192,
            recommended_temperature: 0.1,
            recommended_max_tokens: 500,
            priority: 1,
            strengths: [
              "Lightweight",
              "Fast code generation",
              "SQL queries",
              "Efficient inference"
            ],
            use_case: "Fast SQL generation with minimal resource usage",
          },
          "qwen3:4b": {
            name: "Qwen 3 4B",
            size: "2.5 GB",
            context_length: 32768,
            recommended_temperature: 0.1,
            recommended_max_tokens: 800,
            priority: 4,
            strengths: [
              "Large context",
              "Mathematical reasoning",
              "Structured output",
              "Business intelligence",
            ],
            use_case: "Large context business analysis with mathematical computations",
          },
        },
      },
      openai: {
        name: "OpenAI",
        endpoint: "https://api.openai.com/v1",
        api_key_required: true,
        models: {
          "gpt-3.5-turbo": {
            name: "GPT-3.5 Turbo",
            context_length: 4096,
            recommended_temperature: 0.1,
            recommended_max_tokens: 500,
            strengths: ["Fast", "Cost effective", "Good SQL generation"],
            use_case: "Production SQL generation",
          },
          "gpt-4": {
            name: "GPT-4",
            context_length: 8192,
            recommended_temperature: 0.1,
            recommended_max_tokens: 800,
            strengths: [
              "Best reasoning",
              "Complex analysis",
              "Accurate queries",
            ],
            use_case: "Complex business intelligence queries",
          },
          "gpt-4-turbo": {
            name: "GPT-4 Turbo",
            context_length: 128000,
            recommended_temperature: 0.1,
            recommended_max_tokens: 1000,
            strengths: [
              "Large context",
              "Complex schemas",
              "Multi-table analysis",
            ],
            use_case: "Large-scale database analysis",
          },
        },
      },
      anthropic: {
        name: "Anthropic",
        endpoint: "https://api.anthropic.com/v1",
        api_key_required: true,
        models: {
          "claude-3-haiku": {
            name: "Claude 3 Haiku",
            context_length: 200000,
            recommended_temperature: 0.1,
            recommended_max_tokens: 500,
            strengths: ["Fast", "Accurate", "Good instruction following"],
            use_case: "Production SQL generation",
          },
          "claude-3-sonnet": {
            name: "Claude 3 Sonnet",
            context_length: 200000,
            recommended_temperature: 0.1,
            recommended_max_tokens: 800,
            strengths: [
              "Balanced performance",
              "Complex reasoning",
              "Business logic",
            ],
            use_case: "Complex business analysis",
          },
        },
      },
    };

    this.defaultConfig = {
      provider: "ollama",
      model: "phi3:mini",
      temperature: 0.1,
      max_tokens: 500,
      timeout: 30000,
      retry_attempts: 2,
    };

    this.currentConfig = { ...this.defaultConfig };
  }

  /**
   * Get all available providers
   */
  getProviders() {
    return Object.keys(this.providers).map((key) => ({
      id: key,
      name: this.providers[key].name,
      endpoint: this.providers[key].endpoint,
      requires_api_key: this.providers[key].api_key_required || false,
    }));
  }

  /**
   * Get models for a specific provider
   */
  getModelsForProvider(providerId) {
    const provider = this.providers[providerId];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    return Object.keys(provider.models).map((key) => ({
      id: key,
      name: provider.models[key].name,
      context_length: provider.models[key].context_length,
      strengths: provider.models[key].strengths,
      use_case: provider.models[key].use_case,
      recommended_temperature: provider.models[key].recommended_temperature,
      recommended_max_tokens: provider.models[key].recommended_max_tokens,
    }));
  }

  /**
   * Get model details
   */
  getModelDetails(providerId, modelId) {
    const provider = this.providers[providerId];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const model = provider.models[modelId];
    if (!model) {
      throw new Error(`Unknown model: ${modelId} for provider: ${providerId}`);
    }

    return {
      provider: {
        id: providerId,
        name: provider.name,
        endpoint: provider.endpoint,
        requires_api_key: provider.api_key_required || false,
      },
      model: {
        id: modelId,
        ...model,
      },
    };
  }

  /**
   * Set current model configuration
   */
  setModelConfig(providerId, modelId, options = {}) {
    const details = this.getModelDetails(providerId, modelId);

    this.currentConfig = {
      provider: providerId,
      model: modelId,
      temperature: options.temperature || details.model.recommended_temperature,
      max_tokens: options.max_tokens || details.model.recommended_max_tokens,
      timeout: options.timeout || 30000,
      retry_attempts: options.retry_attempts || 2,
      endpoint: details.provider.endpoint,
      requires_api_key: details.provider.requires_api_key,
    };

    console.log(
      `[ModelConfig] Set model: ${details.provider.name} - ${details.model.name}`,
    );
    return this.currentConfig;
  }

  /**
   * Get current model configuration
   */
  getCurrentConfig() {
    return { ...this.currentConfig };
  }

  /**
   * Get model recommendations for different use cases
   */
  getRecommendations() {
    return {
      fast_sql_generation: {
        provider: "ollama",
        model: "phi3:mini",
        description: "Fast SQL generation for simple queries",
      },
      complex_analysis: {
        provider: "ollama",
        model: "qwen3:4b",
        description: "Complex business intelligence queries with large context",
      },
      large_context_analysis: {
        provider: "ollama",
        model: "qwen3:4b",
        description:
          "Large context business analysis with mathematical computations",
      },
      advanced_code_generation: {
        provider: "ollama",
        model: "starcoder2:3b",
        description: "Advanced SQL generation and code optimization",
      },
      lightweight_fast_inference: {
        provider: "ollama",
        model: "codegemma:2b",
        description: "Fast SQL generation with minimal resource usage",
      },
      production_ready: {
        provider: "openai",
        model: "gpt-3.5-turbo",
        description: "Production-ready SQL generation (requires API key)",
      },
      enterprise_analysis: {
        provider: "anthropic",
        model: "claude-3-sonnet",
        description: "Enterprise-grade business analysis (requires API key)",
      },
    };
  }

  /**
   * Apply recommendation by use case
   */
  applyRecommendation(useCase, options = {}) {
    const recommendations = this.getRecommendations();
    const recommendation = recommendations[useCase];

    if (!recommendation) {
      throw new Error(
        `Unknown use case: ${useCase}. Available: ${Object.keys(recommendations).join(", ")}`,
      );
    }

    return this.setModelConfig(
      recommendation.provider,
      recommendation.model,
      options,
    );
  }

  /**
   * Reset to default configuration
   */
  resetToDefault() {
    this.currentConfig = { ...this.defaultConfig };
    console.log("[ModelConfig] Reset to default configuration");
    return this.currentConfig;
  }

  /**
   * Get configuration for prompt display
   */
  getDisplayConfig() {
    const details = this.getModelDetails(
      this.currentConfig.provider,
      this.currentConfig.model,
    );
    return {
      provider_name: details.provider.name,
      model_name: details.model.name,
      temperature: this.currentConfig.temperature,
      max_tokens: this.currentConfig.max_tokens,
      use_case: details.model.use_case,
      strengths: details.model.strengths,
    };
  }

  /**
   * Validate if provider/model is available
   */
  async validateAvailability(providerId, modelId) {
    const provider = this.providers[providerId];
    if (!provider) {
      return { available: false, error: `Unknown provider: ${providerId}` };
    }

    const model = provider.models[modelId];
    if (!model) {
      return { available: false, error: `Unknown model: ${modelId}` };
    }

    // For Ollama, we can check if the model is installed
    if (providerId === "ollama") {
      try {
        const response = await fetch(`${provider.endpoint}/api/tags`);
        const data = await response.json();
        const installedModels = data.models || [];
        const isInstalled = installedModels.some((m) => m.name === modelId);

        if (!isInstalled) {
          return {
            available: false,
            error: `Model ${modelId} not installed. Run: ollama pull ${modelId}`,
            suggestion: `ollama pull ${modelId}`,
          };
        }
      } catch (error) {
        return {
          available: false,
          error: `Cannot connect to Ollama at ${provider.endpoint}`,
          suggestion: "Make sure Ollama is running",
        };
      }
    }

    // For API-based providers, check if API key is configured
    if (provider.api_key_required) {
      const apiKeyEnvVar = `${providerId.toUpperCase()}_API_KEY`;
      if (!process.env[apiKeyEnvVar]) {
        return {
          available: false,
          error: `API key required for ${provider.name}`,
          suggestion: `Set environment variable: ${apiKeyEnvVar}`,
        };
      }
    }

    return { available: true };
  }

  /**
   * Get models ordered by priority for a provider
   * @param {string} providerId - Provider ID (default: 'ollama')
   * @returns {Array} - Array of {modelId, config} ordered by priority
   */
  getModelsByPriority(providerId = "ollama") {
    const provider = this.providers[providerId];
    if (!provider || !provider.models) {
      return [];
    }

    const modelEntries = Object.entries(provider.models);
    
    // Sort by priority field (lower number = higher priority)
    const sorted = modelEntries
      .filter(([_, config]) => config.priority !== undefined)
      .sort((a, b) => (a[1].priority || 99) - (b[1].priority || 99))
      .map(([modelId, config]) => ({ modelId, config }));

    return sorted;
  }

  /**
   * Get available models filtered by what's actually installed
   * @param {Object} ollamaClient - Ollama client instance
   * @returns {Promise<Array>} - Array of available model IDs
   */
  async getAvailableModels(ollamaClient) {
    try {
      console.log("[ModelConfig] Fetching available models from Ollama...");
      const availableModels = await ollamaClient.listAvailableModels();
      console.log("[ModelConfig] Ollama returned:", availableModels);
      
      if (!availableModels || !availableModels.models) {
        console.warn("[ModelConfig] Invalid response from Ollama, no models array found");
        return this.getModelsByPriority("ollama").map(({ modelId }) => modelId);
      }
      
      const installedModelNames = availableModels.models.map((m) => m.name);
      console.log("[ModelConfig] Installed models:", installedModelNames.join(", "));

      const priorityModels = this.getModelsByPriority("ollama");
      console.log("[ModelConfig] Priority models:", priorityModels.map(({ modelId }) => modelId).join(", "));
      
      const available = priorityModels
        .filter(({ modelId }) => installedModelNames.includes(modelId))
        .map(({ modelId }) => modelId);

      console.log(
        `[ModelConfig] Available models (${available.length}): ${available.join(", ")}`,
      );

      return available;
    } catch (error) {
      console.error("[ModelConfig] Failed to get available models:", error);
      console.error("[ModelConfig] Error stack:", error.stack);
      // Return all configured models as fallback
      const fallbackModels = this.getModelsByPriority("ollama").map(({ modelId }) => modelId);
      console.log("[ModelConfig] Using fallback models:", fallbackModels.join(", "));
      return fallbackModels;
    }
  }

  /**
   * Temporarily switch to a different model (doesn't persist)
   * @param {string} modelId - Model identifier
   * @param {string} providerId - Provider identifier
   */
  setTemporaryModel(modelId, providerId = "ollama") {
    const provider = this.providers[providerId];
    if (!provider || !provider.models[modelId]) {
      console.warn(`[ModelConfig] Invalid model: ${providerId}/${modelId}`);
      return false;
    }

    const modelConfig = provider.models[modelId];
    this.currentConfig = {
      provider: providerId,
      model: modelId,
      temperature: modelConfig.recommended_temperature,
      max_tokens: modelConfig.recommended_max_tokens,
    };

    console.log(`[ModelConfig] Temporarily switched to ${providerId}/${modelId}`);
    return true;
  }
}

module.exports = new ModelConfig();
