// Model loading and switching utilities
const ollamaClient = require('./ollama-client');

class ModelManager {
  constructor() {
    this.currentModel = null;
    this.availableModels = [];
    this.modelConfigs = {
      'phi3:mini': {
        temperature: 0.6,
        contextWindow: 4096,
        maxTokens: 1024,
        specialty: 'business'
      },
      'llama3.2:3b': {
        temperature: 0.7,
        contextWindow: 8192,
        maxTokens: 2048,
        specialty: 'general'
      },
      'mistral:7b': {
        temperature: 0.8,
        contextWindow: 32768,
        maxTokens: 4096,
        specialty: 'reasoning'
      },
      'codellama:7b': {
        temperature: 0.3,
        contextWindow: 16384,
        maxTokens: 2048,
        specialty: 'code'
      }
    };
  }

  async initialize() {
    try {
      await this.refreshAvailableModels();
      await this.setDefaultModel();
      console.log(`Model manager initialized with ${this.availableModels.length} models`);
    } catch (error) {
      console.error('Failed to initialize model manager:', error);
      throw error;
    }
  }

  async refreshAvailableModels() {
    try {
      const models = await ollamaClient.listModels();
      this.availableModels = models.map(model => model.name);
      console.log('Available models:', this.availableModels);
    } catch (error) {
      console.error('Failed to refresh available models:', error);
      this.availableModels = [];
    }
  }

  async setDefaultModel() {
    const preferredModels = ['phi3:mini', 'llama3.2:3b', 'mistral:7b', 'codellama:7b'];

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
      console.warn('No models available');
    }
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
    return this.modelConfigs[model] || {
      temperature: 0.7,
      contextWindow: 4096,
      maxTokens: 1024,
      specialty: 'general'
    };
  }

  async ensureModelAvailable(modelName) {
    if (!this.availableModels.includes(modelName)) {
      console.log(`Model ${modelName} not available locally, attempting to pull...`);
      await ollamaClient.pullModel(modelName);
      await this.refreshAvailableModels();

      if (!this.availableModels.includes(modelName)) {
        throw new Error(`Failed to pull model: ${modelName}`);
      }
    }
  }

  getBestModelForTask(taskType) {
    const taskModelMap = {
      'business': 'phi3:mini',
      'code': 'codellama:7b',
      'reasoning': 'mistral:7b',
      'general': 'llama3.2:3b',
      'default': this.currentModel
    };

    const preferredModel = taskModelMap[taskType] || taskModelMap.default;

    if (this.availableModels.includes(preferredModel)) {
      return preferredModel;
    }

    return this.currentModel;
  }

  getStatus() {
    return {
      currentModel: this.currentModel,
      availableModels: this.availableModels,
      modelCount: this.availableModels.length,
      currentConfig: this.getModelConfig()
    };
  }
}

module.exports = new ModelManager();