/**
 * SLM Business Service Layer - Ollama Client
 *
 * @author Partha Chandramohan
 * @description Ollama API client for SLM inference, model management, and connection pooling
 */
const axios = require('axios');
const { urlBuilder } = require('../../config/service-urls');

class OllamaClient {
  constructor() {
    this.baseURL = urlBuilder.getBaseUrl('ollama');
    this.timeout = 30000; // 30 seconds
    this.retryAttempts = 3;
  }

  async generateResponse(prompt, model = 'phi3:mini', options = {}) {
    // First check if any models are available
    try {
      const models = await this.listAvailableModels();
      if (!models.models || models.models.length === 0) {
        throw new Error('No models available in Ollama. Please install a model first using: ollama pull <model-name>');
      }

      // Use first available model if requested model is not available
      const availableModelNames = models.models.map(m => m.name);
      if (!availableModelNames.includes(model)) {
        console.log(`Model ${model} not available. Available models: ${availableModelNames.join(', ')}`);
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
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        top_k: options.top_k || 40,
        repeat_penalty: options.repeat_penalty || 1.1,
        ...options
      }
    };

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await axios.post(
          urlBuilder.build('ollama', 'generate'),
          requestData,
          {
            timeout: this.timeout,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        return {
          success: true,
          response: response.data.response,
          model: response.data.model,
          created_at: response.data.created_at,
          done: response.data.done
        };
      } catch (error) {
        console.error(`Ollama request attempt ${attempt} failed:`, error.message);

        if (attempt === this.retryAttempts) {
          throw new Error(`Failed to get response from Ollama after ${this.retryAttempts} attempts: ${error.message}`);
        }

        // Wait before retry
        await this.sleep(1000 * attempt);
      }
    }
  }

  async listModels() {
    try {
      const response = await axios.get(urlBuilder.build('ollama', 'tags'));
      return response.data.models || [];
    } catch (error) {
      console.error('Failed to list models:', error.message);
      throw new Error('Failed to retrieve available models');
    }
  }

  async pullModel(modelName) {
    try {
      const response = await axios.post(
        urlBuilder.build('ollama', 'pull'),
        { name: modelName },
        { timeout: 300000 } // 5 minutes for model pulling
      );
      return response.data;
    } catch (error) {
      console.error('Failed to pull model:', error.message);
      throw new Error(`Failed to pull model: ${modelName}`);
    }
  }

  async checkHealth() {
    try {
      const response = await axios.get(urlBuilder.build('ollama', 'tags'), {
        timeout: 5000
      });
      return {
        healthy: true,
        models: response.data.models?.length || 0
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  async listAvailableModels() {
    try {
      const response = await axios.get(urlBuilder.build('ollama', 'tags'), {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('Failed to list available models:', error.message);
      return { models: [] };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new OllamaClient();