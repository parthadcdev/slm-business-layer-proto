// SLM interaction and response processing
const ollamaClient = require("./ollama-client");
const modelManager = require("./model-manager");
const retrievalService = require("./retrieval-service");
const guardrails = require("./guardrails");

class InferenceService {
  constructor() {
    this.maxRetries = 3;
    this.timeoutMs = 30000;
  }

  async processBusinessRequest(prompt, context = {}) {
    try {
      // Apply input guardrails
      const validatedPrompt = await guardrails.validateInput(prompt);

      // Get the best model for this task
      const model = modelManager.getBestModelForTask(
        context.taskType || "general",
      );
      const modelConfig = modelManager.getModelConfig(model);

      // Generate response with retry logic
      const response = await this.generateWithRetry(
        validatedPrompt,
        model,
        modelConfig,
      );

      // Apply output guardrails
      const validatedResponse = await guardrails.validateOutput(
        response.response,
      );

      // Parse and structure the response
      const structuredResponse = await this.parseResponse(validatedResponse);

      return {
        success: true,
        model: response.model,
        response: structuredResponse,
        metadata: {
          created_at: response.created_at,
          context: context,
          guardrails_passed: true,
        },
      };
    } catch (error) {
      console.error("Error processing business request:", error);
      throw new Error(`Inference failed: ${error.message}`);
    }
  }

  async generateWithRetry(prompt, model, config) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await ollamaClient.generateResponse(prompt, model, {
          temperature: config.temperature,
          top_p: config.top_p || 0.9,
          top_k: config.top_k || 40,
          repeat_penalty: config.repeat_penalty || 1.1,
        });

        if (response.success) {
          return response;
        }

        throw new Error("Generation failed");
      } catch (error) {
        lastError = error;
        console.error(`Inference attempt ${attempt} failed:`, error.message);

        if (attempt < this.maxRetries) {
          await this.sleep(1000 * attempt);
        }
      }
    }

    throw lastError;
  }

  async parseResponse(responseText) {
    try {
      // Try to parse as JSON first
      if (
        responseText.trim().startsWith("{") ||
        responseText.trim().startsWith("[")
      ) {
        try {
          return JSON.parse(responseText);
        } catch (jsonError) {
          // Fall back to structured parsing
        }
      }

      // Extract structured information from text response
      return this.extractStructuredInfo(responseText);
    } catch (error) {
      console.error("Error parsing response:", error);
      return {
        type: "text",
        content: responseText,
        parsed: false,
      };
    }
  }

  extractStructuredInfo(text) {
    const structure = {
      type: "business_response",
      analysis: "",
      actions: [],
      requirements: [],
      risks: [],
      recommendations: [],
      raw_response: text,
    };

    // Extract sections using regex patterns
    const sections = {
      analysis: /(?:analysis|understanding):\s*(.*?)(?=\n\n|\n[A-Z]|$)/is,
      actions: /(?:actions|recommendations|steps):\s*(.*?)(?=\n\n|\n[A-Z]|$)/is,
      requirements: /(?:requirements|parameters):\s*(.*?)(?=\n\n|\n[A-Z]|$)/is,
      risks: /(?:risks|concerns|warnings):\s*(.*?)(?=\n\n|\n[A-Z]|$)/is,
    };

    for (const [key, pattern] of Object.entries(sections)) {
      const match = text.match(pattern);
      if (match) {
        if (key === "actions" || key === "requirements" || key === "risks") {
          structure[key] = this.parseListItems(match[1]);
        } else {
          structure[key] = match[1].trim();
        }
      }
    }

    return structure;
  }

  parseListItems(text) {
    return text
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^[-*•]\s*/, ""))
      .filter((line) => line.length > 0);
  }

  async validateBusinessLogic(response, context) {
    try {
      // Check if the response contains valid business actions
      if (!response.actions || response.actions.length === 0) {
        return {
          valid: false,
          reason: "No actionable items identified",
        };
      }

      // Validate against available operations
      const validActions = await this.validateActions(
        response.actions,
        context,
      );

      // Check for security concerns
      const securityCheck = await guardrails.checkBusinessSecurity(response);

      return {
        valid: validActions.valid && securityCheck.valid,
        validActions: validActions.valid,
        securityPassed: securityCheck.valid,
        details: {
          actionValidation: validActions,
          securityValidation: securityCheck,
        },
      };
    } catch (error) {
      console.error("Error validating business logic:", error);
      return {
        valid: false,
        reason: "Validation error",
        error: error.message,
      };
    }
  }

  async validateActions(actions, context) {
    // This would integrate with the inference layer to validate actions
    // For now, return a basic validation
    return {
      valid: true,
      validatedActions: actions,
      invalidActions: [],
    };
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new InferenceService();
