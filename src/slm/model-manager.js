// Model loading and switching utilities
const ollamaClient = require("./ollama-client");

class ModelManager {
  constructor() {
    this.currentModel = null;
    this.availableModels = [];
    this.modelConfigs = {
      "phi3:mini": {
        temperature: 0.6,
        contextWindow: 4096,
        maxTokens: 1024,
        specialty: "business",
      },
      "llama3.2:3b": {
        temperature: 0.7,
        contextWindow: 8192,
        maxTokens: 2048,
        specialty: "general",
      },
      "mistral:7b": {
        temperature: 0.8,
        contextWindow: 32768,
        maxTokens: 4096,
        specialty: "reasoning",
      },
      "codellama:7b": {
        temperature: 0.3,
        contextWindow: 16384,
        maxTokens: 2048,
        specialty: "code",
      },
    };
  }

  async initialize() {
    try {
      await this.refreshAvailableModels();
      await this.setDefaultModel();
      console.log(
        `Model manager initialized with ${this.availableModels.length} models`,
      );
    } catch (error) {
      console.error("Failed to initialize model manager:", error);
      throw error;
    }
  }

  async refreshAvailableModels() {
    try {
      const models = await ollamaClient.listModels();
      this.availableModels = models.map((model) => model.name);
      console.log("Available models:", this.availableModels);
    } catch (error) {
      console.error("Failed to refresh available models:", error);
      this.availableModels = [];
    }
  }

  async setDefaultModel() {
    // Build preferred models list dynamically based on what's installed
    const preferredModels = this.buildPreferredModelsList();

    for (const model of preferredModels) {
      if (this.availableModels.includes(model)) {
        this.currentModel = model;
        console.log(`Set default model to: ${model}`);
        return;
      }
    }

    if (this.availableModels.length > 0) {
      this.currentModel = this.availableModels[0];
      console.log(`Set default model to first available: ${this.currentModel}`);
    } else {
      console.warn("No models available");
    }
  }

  buildPreferredModelsList() {
    // Define preference order based on model characteristics
    const modelPreferenceOrder = [
      // Fast, business-focused models
      { pattern: /^phi3:/, priority: 1, category: "business" },
      { pattern: /^codegemma:/, priority: 2, category: "code" },
      { pattern: /^starcoder2:/, priority: 3, category: "code" },
      // General purpose models
      { pattern: /^llama3/, priority: 4, category: "general" },
      { pattern: /^qwen/, priority: 5, category: "reasoning" },
      // Larger models
      { pattern: /^mistral:/, priority: 6, category: "reasoning" },
      { pattern: /^codellama:/, priority: 7, category: "code" },
      // Other models (lower priority)
      { pattern: /.*/, priority: 10, category: "other" },
    ];

    // Create a map of available models with their priorities
    const modelPriorities = this.availableModels.map((modelName) => {
      const match = modelPreferenceOrder.find((pref) =>
        pref.pattern.test(modelName)
      );
      return {
        name: modelName,
        priority: match ? match.priority : 100,
        category: match ? match.category : "other",
      };
    });

    // Sort by priority and return just the names
    const sortedModels = modelPriorities
      .sort((a, b) => a.priority - b.priority)
      .map((m) => m.name);

    console.log(
      `Built preferred models list from ${this.availableModels.length} installed models:`,
      sortedModels.slice(0, 5)
    );

    return sortedModels;
  }

  async switchModel(modelName) {
    if (!this.availableModels.includes(modelName)) {
      throw new Error(`Model ${modelName} is not available`);
    }

    this.currentModel = modelName;
    console.log(`Switched to model: ${modelName}`);
  }

  getModelConfig(modelName = null) {
    const model = modelName || this.currentModel;
    return (
      this.modelConfigs[model] || {
        temperature: 0.7,
        contextWindow: 4096,
        maxTokens: 1024,
        specialty: "general",
      }
    );
  }

  async ensureModelAvailable(modelName) {
    if (!this.availableModels.includes(modelName)) {
      console.log(
        `Model ${modelName} not available locally, attempting to pull...`,
      );
      await ollamaClient.pullModel(modelName);
      await this.refreshAvailableModels();

      if (!this.availableModels.includes(modelName)) {
        throw new Error(`Failed to pull model: ${modelName}`);
      }
    }
  }

  getBestModelForTask(taskType) {
    // Define task type preferences based on model categories
    const taskCategoryMap = {
      business: ["business", "general", "code", "reasoning"],
      code: ["code", "business", "general", "reasoning"],
      reasoning: ["reasoning", "general", "business", "code"],
      general: ["general", "business", "reasoning", "code"],
      default: ["business", "general", "code", "reasoning"],
    };

    const preferredCategories = taskCategoryMap[taskType] || taskCategoryMap.default;

    // Get all models sorted by priority
    const preferredModels = this.buildPreferredModelsList();

    // Map models to their categories
    const modelCategories = preferredModels.map((modelName) => {
      const modelPreferenceOrder = [
        { pattern: /^phi3:/, category: "business" },
        { pattern: /^codegemma:/, category: "code" },
        { pattern: /^starcoder2:/, category: "code" },
        { pattern: /^llama3/, category: "general" },
        { pattern: /^qwen/, category: "reasoning" },
        { pattern: /^mistral:/, category: "reasoning" },
        { pattern: /^codellama:/, category: "code" },
      ];

      const match = modelPreferenceOrder.find((pref) =>
        pref.pattern.test(modelName)
      );
      return {
        name: modelName,
        category: match ? match.category : "general",
      };
    });

    // Find the best model for this task type
    for (const category of preferredCategories) {
      const model = modelCategories.find((m) => m.category === category);
      if (model) {
        return model.name;
      }
    }

    // Fallback to current model
    return this.currentModel || preferredModels[0];
  }

  getPreferredModels() {
    return this.buildPreferredModelsList();
  }

  getStatus() {
    return {
      currentModel: this.currentModel,
      availableModels: this.availableModels,
      preferredModels: this.buildPreferredModelsList(),
      modelCount: this.availableModels.length,
      currentConfig: this.getModelConfig(),
    };
  }
}

module.exports = new ModelManager();
