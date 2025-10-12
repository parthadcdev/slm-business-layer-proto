/**
 * SLM Business Service Layer - Model Fallback Manager
 *
 * @author Partha Chandramohan
 * @description Manages model priority and fallback strategy for SQL generation
 */

const fs = require("fs");
const path = require("path");

class ModelFallbackManager {
  constructor() {
    this.modelsConfig = this.loadModelsConfig();
    this.validationThreshold = 0.65; // Lowered to 0.65 to accept functional SQL
    this.attemptsPerModel = 2;
    this.performanceTracking = new Map(); // Track model performance
  }

  loadModelsConfig() {
    try {
      const configPath = path.join(__dirname, "../../config/models-config.json");
      const configData = fs.readFileSync(configPath, "utf8");
      return JSON.parse(configData);
    } catch (error) {
      console.error("[ModelFallback] Failed to load models config:", error);
      return null;
    }
  }

  /**
   * Get models ordered by priority (fastest first)
   * @param {string} provider - Provider name (default: 'ollama')
   * @returns {Array} - Array of model IDs ordered by priority
   */
  getModelPriorityList(provider = "ollama") {
    if (!this.modelsConfig || !this.modelsConfig.providers[provider]) {
      console.warn(`[ModelFallback] No config found for provider: ${provider}`);
      return [];
    }

    const models = this.modelsConfig.providers[provider].models;
    const modelEntries = Object.entries(models);

    // Sort by priority (lower number = higher priority)
    const sortedModels = modelEntries
      .filter(([_, config]) => config.priority !== undefined)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([modelId, _]) => modelId);

    console.log(
      `[ModelFallback] Model priority order: ${sortedModels.join(" → ")}`,
    );

    return sortedModels;
  }

  /**
   * Filter models to only those available in Ollama
   * @param {Array} modelList - List of model IDs
   * @param {Object} ollamaClient - Ollama client to check availability
   * @returns {Array} - Filtered list of available models
   */
  async getAvailableModels(modelList, ollamaClient) {
    try {
      const availableModels = await ollamaClient.listAvailableModels();
      const availableModelNames = availableModels.models.map((m) => m.name);

      const filtered = modelList.filter((modelId) =>
        availableModelNames.includes(modelId),
      );

      console.log(
        `[ModelFallback] Available models: ${filtered.length}/${modelList.length} (${filtered.join(", ")})`,
      );

      return filtered;
    } catch (error) {
      console.warn(
        "[ModelFallback] Failed to check available models:",
        error.message,
      );
      return modelList; // Return full list if check fails
    }
  }

  /**
   * Check if we should try the next model based on validation result
   * @param {Object} validationResult - Validation result with score
   * @returns {boolean} - True if should try next model
   */
  shouldTryNextModel(validationResult) {
    return (
      !validationResult.isValid ||
      validationResult.score < this.validationThreshold
    );
  }

  /**
   * Record model performance for analytics
   * @param {string} modelId - Model identifier
   * @param {number} score - Validation score
   * @param {boolean} success - Whether validation passed
   * @param {number} duration - Time taken in ms
   */
  recordModelPerformance(modelId, score, success, duration) {
    if (!this.performanceTracking.has(modelId)) {
      this.performanceTracking.set(modelId, {
        attempts: 0,
        successes: 0,
        totalScore: 0,
        totalDuration: 0,
        lastUsed: null,
      });
    }

    const stats = this.performanceTracking.get(modelId);
    stats.attempts++;
    if (success) stats.successes++;
    stats.totalScore += score;
    stats.totalDuration += duration;
    stats.lastUsed = new Date().toISOString();

    console.log(
      `[ModelFallback] ${modelId} performance: ${stats.successes}/${stats.attempts} success (${((stats.successes / stats.attempts) * 100).toFixed(1)}%), avg score: ${(stats.totalScore / stats.attempts).toFixed(2)}`,
    );
  }

  /**
   * Get performance statistics for all models
   * @returns {Object} - Performance stats by model
   */
  getPerformanceStats() {
    const stats = {};
    for (const [modelId, data] of this.performanceTracking.entries()) {
      stats[modelId] = {
        ...data,
        successRate: data.attempts > 0 ? data.successes / data.attempts : 0,
        avgScore: data.attempts > 0 ? data.totalScore / data.attempts : 0,
        avgDuration: data.attempts > 0 ? data.totalDuration / data.attempts : 0,
      };
    }
    return stats;
  }

  /**
   * Get model configuration by ID
   * @param {string} modelId - Model identifier
   * @param {string} provider - Provider name
   * @returns {Object} - Model configuration
   */
  getModelConfig(modelId, provider = "ollama") {
    if (!this.modelsConfig || !this.modelsConfig.providers[provider]) {
      return null;
    }

    return this.modelsConfig.providers[provider].models[modelId] || null;
  }

  /**
   * Get validation threshold
   * @returns {number} - Threshold score (0.75)
   */
  getValidationThreshold() {
    return this.validationThreshold;
  }

  /**
   * Get attempts per model
   * @returns {number} - Number of attempts (2)
   */
  getAttemptsPerModel() {
    return this.attemptsPerModel;
  }
}

module.exports = new ModelFallbackManager();

