/**
 * SLM Business Service Layer - Ollama Client
 *
 * @author Partha Chandramohan
 * @description Ollama API client for SLM inference, model management, and connection pooling
 */
const axios = require("axios");
const { urlBuilder } = require("../../config/service-urls");

class OllamaClient {
  constructor() {
    this.baseURL = urlBuilder.getBaseUrl("ollama");
    this.timeout = 30000; // 30 seconds default
    this.retryAttempts = 1; // Single attempt for faster evaluation
    this.modelTimeouts = {
      "phi3:mini": 30000,      // 30 seconds - increased for validation tasks
      "starcoder2:3b": 35000,  // 35 seconds - code generation model
      "codegemma:2b": 25000,   // 25 seconds - lightweight code model
      "qwen3:4b": 45000,       // 45 seconds - large context model
    };
  }

  async generateResponse(prompt, model = "phi3:mini", options = {}) {
    // First check if any models are available
    try {
      const models = await this.listAvailableModels();
      if (!models.models || models.models.length === 0) {
        throw new Error(
          "No models available in Ollama. Please install a model first using: ollama pull <model-name>",
        );
      }

      // Use first available model if requested model is not available
      const availableModelNames = models.models.map((m) => m.name);
      if (!availableModelNames.includes(model)) {
        console.log(
          `Model ${model} not available. Available models: ${availableModelNames.join(", ")}`,
        );
        console.log(`Using first available model: ${availableModelNames[0]}`);
        model = availableModelNames[0];
      }
    } catch (error) {
      throw new Error(`Ollama service unavailable: ${error.message}`);
    }

    const requestData = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.3, // Slightly higher for better responses
        top_p: options.top_p || 0.9,
        top_k: options.top_k || 40,
        repeat_penalty: options.repeat_penalty || 1.1,
        num_predict: Math.max(options.max_tokens || 100, 50), // Ensure minimum response length
        // Remove restrictive stop tokens that might cause empty responses
        ...options,
      },
    };

    // Use custom timeout from options, model-specific timeout, or default
    const modelTimeout = options.timeout || this.modelTimeouts[model] || this.timeout;
    console.log(`[OllamaClient] Using timeout of ${modelTimeout}ms for model: ${model}`);

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await axios.post(
          urlBuilder.build("ollama", "generate"),
          requestData,
          {
            timeout: modelTimeout,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        const responseText = response.data.response || '';

        // Log empty responses for debugging
        if (!responseText.trim()) {
          console.warn(`[OllamaClient] Empty response from model ${model}. Raw response:`, {
            response: response.data.response,
            done: response.data.done,
            model: response.data.model
          });
        }

        return {
          success: true,
          response: responseText,
          model: response.data.model,
          created_at: response.data.created_at,
          done: response.data.done,
        };
      } catch (error) {
        const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');
        const errorType = isTimeout ? 'TIMEOUT' : 'ERROR';

        console.error(
          `[OllamaClient] ${errorType} - Model: ${model}, Attempt: ${attempt}, Timeout: ${modelTimeout}ms`,
          error.message,
        );

        if (attempt === this.retryAttempts) {
          if (isTimeout) {
            throw new Error(
              `Model ${model} timed out after ${modelTimeout}ms. Try using a faster model like phi3:mini.`,
            );
          } else {
            throw new Error(
              `Failed to get response from Ollama after ${this.retryAttempts} attempts: ${error.message}`,
            );
          }
        }

        // Wait before retry (shorter for timeouts)
        await this.sleep(isTimeout ? 500 : 1000 * attempt);
      }
    }
  }

  async listModels() {
    try {
      const response = await axios.get(urlBuilder.build("ollama", "tags"));
      return response.data.models || [];
    } catch (error) {
      console.error("Failed to list models:", error.message);
      throw new Error("Failed to retrieve available models");
    }
  }

  async pullModel(modelName) {
    try {
      const response = await axios.post(
        urlBuilder.build("ollama", "pull"),
        { name: modelName },
        { timeout: 300000 }, // 5 minutes for model pulling
      );
      return response.data;
    } catch (error) {
      console.error("Failed to pull model:", error.message);
      throw new Error(`Failed to pull model: ${modelName}`);
    }
  }

  async checkHealth() {
    try {
      const response = await axios.get(urlBuilder.build("ollama", "tags"), {
        timeout: 5000,
      });
      return {
        healthy: true,
        models: response.data.models?.length || 0,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  async listAvailableModels() {
    try {
      const response = await axios.get(urlBuilder.build("ollama", "tags"), {
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      console.error("Failed to list available models:", error.message);
      return { models: [] };
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new OllamaClient();
