/**
 * SLM Business Service Layer - Adaptive Model Selector
 *
 * @author Partha Chandramohan
 * @description Intelligent model selection based on intent complexity, user preferences, and performance history
 */

const ModelConfig = require('../config/model-config');

class AdaptiveModelSelector {
  constructor() {
    this.modelConfig = ModelConfig;
    this.performanceHistory = new Map();
    this.userPreferences = new Map();

    // Model characteristics and specializations
    this.modelCapabilities = {
      'phi3:mini': {
        strengths: ['speed', 'simple_queries', 'intent_classification'],
        weaknesses: ['complex_reasoning', 'large_context'],
        optimal_for: ['quick_responses', 'simple_intents', 'validation'],
        complexity_score: 3,
        speed_score: 10,
        accuracy_score: 7,
        resource_usage: 'low'
      },
      'starcoder2:3b': {
        strengths: ['code_generation', 'sql_optimization', 'technical_queries'],
        weaknesses: ['business_logic', 'natural_language'],
        optimal_for: ['sql_generation', 'code_analysis', 'technical_validation'],
        complexity_score: 7,
        speed_score: 8,
        accuracy_score: 9,
        resource_usage: 'medium'
      },
      'codegemma:2b': {
        strengths: ['lightweight', 'fast_inference', 'code_understanding'],
        weaknesses: ['complex_analysis', 'large_datasets'],
        optimal_for: ['quick_sql', 'simple_code_tasks', 'rapid_prototyping'],
        complexity_score: 4,
        speed_score: 9,
        accuracy_score: 6,
        resource_usage: 'low'
      },
      'qwen3:4b': {
        strengths: ['large_context', 'reasoning', 'business_analysis'],
        weaknesses: ['speed', 'simple_tasks'],
        optimal_for: ['complex_analysis', 'business_intelligence', 'multi_table_queries'],
        complexity_score: 9,
        speed_score: 5,
        accuracy_score: 9,
        resource_usage: 'high'
      }
    };

    // Intent complexity scoring
    this.intentComplexityFactors = {
      table_count: { weight: 0.3, max_score: 10 },
      join_complexity: { weight: 0.25, max_score: 10 },
      business_logic: { weight: 0.2, max_score: 10 },
      filter_complexity: { weight: 0.15, max_score: 10 },
      aggregation_complexity: { weight: 0.1, max_score: 10 }
    };

    // Selection strategies
    this.selectionStrategies = {
      speed_first: 'Prioritize fastest response',
      accuracy_first: 'Prioritize most accurate results',
      balanced: 'Balance speed and accuracy',
      adaptive: 'Learn from performance history',
      cost_optimized: 'Minimize resource usage'
    };

    this.defaultStrategy = 'adaptive';
  }

  /**
   * Select optimal model(s) for a given intent and context
   */
  async selectOptimalModel(intent, userRequest, context = {}) {
    console.log(`[AdaptiveSelector] Selecting optimal model for intent: ${intent.intent} on ${intent.entity}`);

    try {
      // Analyze intent complexity
      const complexityAnalysis = this.analyzeIntentComplexity(intent, userRequest, context);

      // Get user preferences
      const userPrefs = this.getUserPreferences(context.user?.id);

      // Get performance history
      const perfHistory = this.getPerformanceHistory(intent);

      // Calculate model scores
      const modelScores = await this.calculateModelScores(complexityAnalysis, userPrefs, perfHistory);

      // Apply selection strategy
      const selectedModels = this.applySelectionStrategy(modelScores, userPrefs.strategy || this.defaultStrategy);

      console.log(`[AdaptiveSelector] Selected models: ${selectedModels.primary.name} (primary), ${selectedModels.fallback?.name || 'none'} (fallback)`);

      return {
        primary: selectedModels.primary,
        fallback: selectedModels.fallback,
        reasoning: selectedModels.reasoning,
        complexity_analysis: complexityAnalysis,
        model_scores: modelScores,
        confidence: selectedModels.confidence
      };

    } catch (error) {
      console.error('[AdaptiveSelector] Model selection failed:', error.message);
      return this.getDefaultSelection();
    }
  }

  /**
   * Analyze intent complexity to guide model selection
   */
  analyzeIntentComplexity(intent, userRequest, context) {
    const analysis = {
      table_count: 0,
      join_complexity: 0,
      business_logic: 0,
      filter_complexity: 0,
      aggregation_complexity: 0,
      overall_complexity: 0
    };

    // Table count analysis
    const entities = [intent.entity];
    if (intent.filters && intent.filters.length > 0) {
      entities.push(...this.inferRelatedTables(intent.entity, intent.filters));
    }
    analysis.table_count = Math.min(entities.length * 2, 10);

    // Join complexity based on entity relationships
    if (this.requiresJoins(intent)) {
      analysis.join_complexity = this.calculateJoinComplexity(intent);
    }

    // Business logic complexity
    analysis.business_logic = this.assessBusinessLogicComplexity(userRequest, intent);

    // Filter complexity
    analysis.filter_complexity = this.assessFilterComplexity(intent.filters || []);

    // Aggregation complexity
    if (this.requiresAggregation(userRequest, intent)) {
      analysis.aggregation_complexity = this.assessAggregationComplexity(userRequest);
    }

    // Calculate overall complexity score
    analysis.overall_complexity = this.calculateOverallComplexity(analysis);

    console.log(`[AdaptiveSelector] Complexity analysis: Overall=${analysis.overall_complexity}, Tables=${analysis.table_count}, Joins=${analysis.join_complexity}`);

    return analysis;
  }

  /**
   * Calculate model scores based on multiple factors
   */
  async calculateModelScores(complexityAnalysis, userPrefs, perfHistory) {
    const scores = {};
    const availableModels = Object.keys(this.modelCapabilities);

    for (const modelId of availableModels) {
      const capabilities = this.modelCapabilities[modelId];

      // Base capability score
      const capabilityScore = this.calculateCapabilityScore(capabilities, complexityAnalysis);

      // Performance history adjustment
      const perfAdjustment = this.getPerformanceAdjustment(modelId, perfHistory);

      // User preference adjustment
      const prefAdjustment = this.getUserPreferenceAdjustment(modelId, userPrefs);

      // Resource consideration
      const resourceScore = this.getResourceScore(capabilities, complexityAnalysis);

      // Final composite score
      const finalScore = (capabilityScore * 0.4) + (perfAdjustment * 0.3) + (prefAdjustment * 0.2) + (resourceScore * 0.1);

      scores[modelId] = {
        name: this.modelConfig.getModelDetails('ollama', modelId).model.name,
        model_id: modelId,
        final_score: finalScore,
        capability_score: capabilityScore,
        performance_adjustment: perfAdjustment,
        preference_adjustment: prefAdjustment,
        resource_score: resourceScore,
        capabilities: capabilities,
        estimated_time: this.estimateExecutionTime(modelId, complexityAnalysis),
        confidence: this.calculateConfidence(capabilities, complexityAnalysis)
      };
    }

    return scores;
  }

  /**
   * Apply selection strategy to choose final models
   */
  applySelectionStrategy(modelScores, strategy) {
    const sortedModels = Object.values(modelScores).sort((a, b) => b.final_score - a.final_score);

    let primary, fallback, reasoning;

    switch (strategy) {
      case 'speed_first':
        const fastestModels = Object.values(modelScores).sort((a, b) => b.capabilities.speed_score - a.capabilities.speed_score);
        primary = fastestModels[0];
        fallback = fastestModels[1];
        reasoning = 'Selected fastest models for quick response';
        break;

      case 'accuracy_first':
        const accurateModels = Object.values(modelScores).sort((a, b) => b.capabilities.accuracy_score - a.capabilities.accuracy_score);
        primary = accurateModels[0];
        fallback = accurateModels[1];
        reasoning = 'Selected most accurate models for best results';
        break;

      case 'cost_optimized':
        const costEfficient = Object.values(modelScores).filter(m => m.capabilities.resource_usage !== 'high').sort((a, b) => b.final_score - a.final_score);
        primary = costEfficient[0] || sortedModels[0];
        fallback = costEfficient[1] || sortedModels[1];
        reasoning = 'Selected resource-efficient models to minimize costs';
        break;

      case 'balanced':
        // Weight speed and accuracy equally
        const balancedScores = Object.values(modelScores).map(model => ({
          ...model,
          balanced_score: (model.capabilities.speed_score + model.capabilities.accuracy_score) / 2
        })).sort((a, b) => b.balanced_score - a.balanced_score);
        primary = balancedScores[0];
        fallback = balancedScores[1];
        reasoning = 'Balanced selection prioritizing both speed and accuracy';
        break;

      case 'adaptive':
      default:
        // Use the calculated composite scores
        primary = sortedModels[0];
        fallback = sortedModels[1];
        reasoning = 'Adaptive selection based on performance history and capabilities';
        break;
    }

    return {
      primary,
      fallback,
      reasoning,
      confidence: primary.confidence,
      strategy_used: strategy
    };
  }

  /**
   * Record model performance for learning
   */
  recordModelPerformance(modelId, intent, metrics) {
    const intentKey = `${intent.intent}_${intent.entity}`;

    if (!this.performanceHistory.has(intentKey)) {
      this.performanceHistory.set(intentKey, new Map());
    }

    const intentHistory = this.performanceHistory.get(intentKey);

    if (!intentHistory.has(modelId)) {
      intentHistory.set(modelId, {
        executions: 0,
        total_time: 0,
        success_rate: 0,
        avg_accuracy: 0,
        last_updated: new Date()
      });
    }

    const modelHistory = intentHistory.get(modelId);

    // Update metrics
    modelHistory.executions++;
    modelHistory.total_time += metrics.execution_time || 0;
    modelHistory.success_rate = ((modelHistory.success_rate * (modelHistory.executions - 1)) + (metrics.success ? 1 : 0)) / modelHistory.executions;
    modelHistory.avg_accuracy = ((modelHistory.avg_accuracy * (modelHistory.executions - 1)) + (metrics.accuracy || 0)) / modelHistory.executions;
    modelHistory.last_updated = new Date();

    console.log(`[AdaptiveSelector] Recorded performance for ${modelId}: ${metrics.execution_time}ms, Success: ${metrics.success}, Accuracy: ${metrics.accuracy}`);
  }

  /**
   * Update user preferences based on feedback
   */
  updateUserPreferences(userId, preferences) {
    this.userPreferences.set(userId, {
      ...this.getUserPreferences(userId),
      ...preferences,
      updated_at: new Date()
    });

    console.log(`[AdaptiveSelector] Updated preferences for user ${userId}`);
  }

  /**
   * Calculate capability score for a model
   */
  calculateCapabilityScore(capabilities, complexityAnalysis) {
    // Match model strengths with complexity requirements
    let score = 5; // Base score

    // Complexity matching
    const complexityDiff = Math.abs(capabilities.complexity_score - complexityAnalysis.overall_complexity);
    score += Math.max(0, 5 - complexityDiff); // Bonus for good complexity match

    // Speed consideration for simple tasks
    if (complexityAnalysis.overall_complexity < 5) {
      score += capabilities.speed_score * 0.2;
    }

    // Accuracy consideration for complex tasks
    if (complexityAnalysis.overall_complexity > 7) {
      score += capabilities.accuracy_score * 0.3;
    }

    return Math.min(10, score);
  }

  /**
   * Calculate overall complexity from individual factors
   */
  calculateOverallComplexity(analysis) {
    let totalScore = 0;
    let totalWeight = 0;

    for (const [factor, config] of Object.entries(this.intentComplexityFactors)) {
      const score = Math.min(analysis[factor], config.max_score);
      totalScore += score * config.weight;
      totalWeight += config.weight;
    }

    return totalWeight > 0 ? (totalScore / totalWeight) : 0;
  }

  /**
   * Get performance adjustment based on history
   */
  getPerformanceAdjustment(modelId, perfHistory) {
    if (!perfHistory || !perfHistory.has(modelId)) {
      return 5; // Neutral score for unknown performance
    }

    const history = perfHistory.get(modelId);

    // Combine success rate and accuracy
    const performanceScore = (history.success_rate * 5) + (history.avg_accuracy * 5);

    // Adjust based on recency and sample size
    const recencyBonus = this.getRecencyBonus(history.last_updated);
    const sampleSizeBonus = Math.min(2, history.executions / 10);

    return Math.min(10, performanceScore + recencyBonus + sampleSizeBonus);
  }

  /**
   * Get user preference adjustment
   */
  getUserPreferenceAdjustment(modelId, userPrefs) {
    const baseScore = 5;

    if (userPrefs.preferred_models && userPrefs.preferred_models.includes(modelId)) {
      return baseScore + 2;
    }

    if (userPrefs.avoided_models && userPrefs.avoided_models.includes(modelId)) {
      return baseScore - 2;
    }

    return baseScore;
  }

  /**
   * Calculate resource score
   */
  getResourceScore(capabilities, complexityAnalysis) {
    const resourceMap = { low: 8, medium: 6, high: 4 };
    let baseScore = resourceMap[capabilities.resource_usage] || 5;

    // Adjust based on whether high resources are needed
    if (complexityAnalysis.overall_complexity > 8 && capabilities.resource_usage === 'high') {
      baseScore += 2; // Bonus for using appropriate resources for complex tasks
    }

    return baseScore;
  }

  /**
   * Estimate execution time
   */
  estimateExecutionTime(modelId, complexityAnalysis) {
    const capabilities = this.modelCapabilities[modelId];
    const baseTime = 1000; // Base 1 second

    const complexityMultiplier = 1 + (complexityAnalysis.overall_complexity / 10);
    const speedMultiplier = 11 - capabilities.speed_score; // Invert speed score

    return Math.round(baseTime * complexityMultiplier * (speedMultiplier / 10));
  }

  /**
   * Calculate confidence in model selection
   */
  calculateConfidence(capabilities, complexityAnalysis) {
    const complexityMatch = 1 - (Math.abs(capabilities.complexity_score - complexityAnalysis.overall_complexity) / 10);
    const capabilityScore = (capabilities.speed_score + capabilities.accuracy_score) / 20;

    return Math.max(0.1, Math.min(1.0, (complexityMatch + capabilityScore) / 2));
  }

  /**
   * Helper methods for complexity analysis
   */
  inferRelatedTables(entity, filters) {
    const relationships = {
      orders: ['customers', 'order_items'],
      customers: ['orders'],
      products: ['order_items', 'inventory'],
      inventory: ['products', 'warehouses']
    };
    return relationships[entity] || [];
  }

  requiresJoins(intent) {
    return intent.entity && this.inferRelatedTables(intent.entity, intent.filters || []).length > 0;
  }

  calculateJoinComplexity(intent) {
    const relatedTables = this.inferRelatedTables(intent.entity, intent.filters || []);
    return Math.min(10, relatedTables.length * 3);
  }

  assessBusinessLogicComplexity(userRequest, intent) {
    const complexTerms = ['valuable', 'best', 'analyze', 'compare', 'trend', 'performance'];
    let complexity = 0;

    for (const term of complexTerms) {
      if (userRequest.toLowerCase().includes(term)) {
        complexity += 2;
      }
    }

    return Math.min(10, complexity);
  }

  assessFilterComplexity(filters) {
    return Math.min(10, filters.length * 2);
  }

  requiresAggregation(userRequest, intent) {
    const aggTerms = ['total', 'sum', 'count', 'average', 'max', 'min', 'most', 'best'];
    return aggTerms.some(term => userRequest.toLowerCase().includes(term));
  }

  assessAggregationComplexity(userRequest) {
    const complexAgg = ['group by', 'having', 'window', 'partition'];
    let complexity = 5; // Base aggregation complexity

    for (const term of complexAgg) {
      if (userRequest.toLowerCase().includes(term)) {
        complexity += 2;
      }
    }

    return Math.min(10, complexity);
  }

  getUserPreferences(userId) {
    return this.userPreferences.get(userId) || {
      strategy: this.defaultStrategy,
      preferred_models: [],
      avoided_models: [],
      max_wait_time: 30000,
      accuracy_importance: 0.7
    };
  }

  getPerformanceHistory(intent) {
    const intentKey = `${intent.intent}_${intent.entity}`;
    return this.performanceHistory.get(intentKey);
  }

  getRecencyBonus(lastUpdated) {
    const daysSince = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 2 - (daysSince / 7)); // Bonus decreases over weeks
  }

  getDefaultSelection() {
    return {
      primary: {
        name: 'Phi-3 Mini',
        model_id: 'phi3:mini',
        final_score: 7,
        confidence: 0.8
      },
      fallback: {
        name: 'CodeGemma 2B',
        model_id: 'codegemma:2b',
        final_score: 6,
        confidence: 0.7
      },
      reasoning: 'Default fallback selection',
      confidence: 0.6
    };
  }

  /**
   * Get selection statistics
   */
  getSelectionStats() {
    return {
      performance_entries: this.performanceHistory.size,
      user_preferences: this.userPreferences.size,
      available_models: Object.keys(this.modelCapabilities).length,
      selection_strategies: Object.keys(this.selectionStrategies).length,
      default_strategy: this.defaultStrategy
    };
  }
}

module.exports = new AdaptiveModelSelector();