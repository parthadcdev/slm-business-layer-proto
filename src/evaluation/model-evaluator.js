/**
 * SLM Business Service Layer - Model Evaluation Framework
 *
 * @author Partha Chandramohan
 * @description Comprehensive framework for evaluating and comparing multiple language models
 */

const modelConfig = require('../config/model-config');
const sqlGenerator = require('../ai/sql-generator');
const intentClassifier = require('../ai/intent-classifier');
const dbAdapter = require('../database/ai-database-adapter');

class ModelEvaluator {
  constructor() {
    this.evaluationHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Evaluate all available models for a given business request
   */
  async evaluateAllModels(businessRequest, context = {}, userRole = 'admin', ollamaClient) {
    const startTime = Date.now();
    console.log(`[ModelEvaluator] Starting comprehensive evaluation for: "${businessRequest}"`);

    // Get all available models
    const availableModels = await this.getAvailableModels(ollamaClient);

    const evaluationResults = {
      request: businessRequest,
      context: context,
      userRole: userRole,
      timestamp: new Date().toISOString(),
      totalEvaluationTime: 0,
      models: [],
      summary: {},
      bestModel: null
    };

    // Evaluate each model
    for (const modelInfo of availableModels) {
      console.log(`[ModelEvaluator] Evaluating model: ${modelInfo.provider}/${modelInfo.model}`);

      try {
        const modelResult = await this.evaluateModel(
          modelInfo,
          businessRequest,
          context,
          userRole,
          ollamaClient
        );
        evaluationResults.models.push(modelResult);
      } catch (error) {
        console.error(`[ModelEvaluator] Error evaluating ${modelInfo.provider}/${modelInfo.model}:`, error.message);

        evaluationResults.models.push({
          ...modelInfo,
          success: false,
          error: error.message,
          latency: null,
          accuracy: 0,
          sqlQuery: null,
          prompt: null,
          result: null
        });
      }
    }

    // Calculate summary metrics
    evaluationResults.totalEvaluationTime = Date.now() - startTime;
    evaluationResults.summary = this.calculateSummaryMetrics(evaluationResults.models);
    evaluationResults.bestModel = this.determineBestModel(evaluationResults.models);

    // Store in history
    this.storeEvaluationResult(evaluationResults);

    console.log(`[ModelEvaluator] Evaluation complete in ${evaluationResults.totalEvaluationTime}ms`);
    return evaluationResults;
  }

  /**
   * Evaluate a single model
   */
  async evaluateModel(modelInfo, businessRequest, context, userRole, ollamaClient) {
    const startTime = Date.now();

    const modelResult = {
      provider: modelInfo.provider,
      model: modelInfo.model,
      displayName: modelInfo.displayName,
      strengths: modelInfo.strengths,
      useCase: modelInfo.useCase,
      success: false,
      latency: null,
      accuracy: 0,
      sqlQuery: null,
      prompt: null,
      result: null,
      error: null,
      metrics: {}
    };

    try {
      // Step 1: Intent Classification
      const intentStartTime = Date.now();
      const intent = await intentClassifier.classifyIntent(businessRequest, ollamaClient);
      const intentTime = Date.now() - intentStartTime;

      // Step 2: SQL Generation with specific model
      const sqlStartTime = Date.now();
      const modelOverride = {
        provider: modelInfo.provider,
        model: modelInfo.model,
        options: {
          temperature: modelInfo.temperature,
          max_tokens: modelInfo.max_tokens
        }
      };

      const sqlResult = await sqlGenerator.generateSQL(
        intent,
        null,
        userRole,
        ollamaClient,
        modelOverride
      );

      const sqlTime = Date.now() - sqlStartTime;

      // Step 3: Execute SQL and get results
      const executionStartTime = Date.now();
      let executionResult = null;
      let executionError = null;

      try {
        if (sqlResult.sql) {
          executionResult = await dbAdapter.executeQuery(sqlResult.sql);
        }
      } catch (execError) {
        executionError = execError.message;
      }

      const executionTime = Date.now() - executionStartTime;
      const totalLatency = Date.now() - startTime;

      // Step 4: Calculate accuracy and quality metrics
      const accuracy = this.calculateAccuracy(intent, sqlResult, executionResult, executionError);
      const qualityMetrics = this.calculateQualityMetrics(sqlResult, intent, executionResult);

      modelResult.success = true;
      modelResult.latency = totalLatency;
      modelResult.accuracy = accuracy;
      modelResult.sqlQuery = sqlResult.sql || 'No SQL generated';
      modelResult.prompt = sqlResult.prompt || 'No prompt available';
      modelResult.result = executionResult;
      modelResult.executionError = executionError;

      modelResult.metrics = {
        intentClassificationTime: intentTime,
        sqlGenerationTime: sqlTime,
        sqlExecutionTime: executionTime,
        totalTime: totalLatency,
        method: sqlResult.method || 'unknown',
        attempts: sqlResult.attempts || 1,
        validationScore: sqlResult.validationScore || 0,
        ...qualityMetrics
      };

    } catch (error) {
      modelResult.error = error.message;
      modelResult.latency = Date.now() - startTime;
    }

    return modelResult;
  }

  /**
   * Get available models from configuration
   */
  async getAvailableModels(ollamaClient) {
    const availableModels = [];

    // Get Ollama models
    try {
      const ollamaModels = await ollamaClient.listAvailableModels();
      const configuredModels = modelConfig.getModelsForProvider('ollama');

      for (const configModel of configuredModels) {
        // Check if model is actually available in Ollama
        const isAvailable = ollamaModels.models &&
          ollamaModels.models.some(m => m.name === configModel.id);

        if (isAvailable) {
          availableModels.push({
            provider: 'ollama',
            model: configModel.id,
            displayName: configModel.name,
            strengths: configModel.strengths,
            useCase: configModel.use_case,
            temperature: configModel.recommended_temperature,
            max_tokens: configModel.recommended_max_tokens
          });
        }
      }
    } catch (error) {
      console.warn('[ModelEvaluator] Could not fetch Ollama models:', error.message);
    }

    return availableModels;
  }

  /**
   * Calculate accuracy score based on multiple factors
   */
  calculateAccuracy(intent, sqlResult, executionResult, executionError) {
    let accuracy = 0;

    // Base accuracy from validation score
    if (sqlResult.validationScore) {
      accuracy += sqlResult.validationScore * 40; // 40% weight
    }

    // SQL generation success
    if (sqlResult.sql && sqlResult.sql.trim().length > 0) {
      accuracy += 20; // 20% weight
    }

    // SQL execution success
    if (!executionError && executionResult) {
      accuracy += 20; // 20% weight
    }

    // Result relevance (basic check)
    if (executionResult && Array.isArray(executionResult) && executionResult.length > 0) {
      accuracy += 10; // 10% weight
    }

    // Intent alignment
    if (intent && intent.confidence) {
      accuracy += intent.confidence * 10; // 10% weight
    }

    return Math.min(100, Math.max(0, accuracy));
  }

  /**
   * Calculate quality metrics for SQL and results
   */
  calculateQualityMetrics(sqlResult, intent, executionResult) {
    return {
      sqlComplexity: this.calculateSQLComplexity(sqlResult.sql),
      resultRelevance: this.calculateResultRelevance(intent, executionResult),
      queryOptimization: this.calculateQueryOptimization(sqlResult.sql),
      errorHandling: sqlResult.method === 'template' ? 0.8 : 1.0
    };
  }

  /**
   * Calculate SQL complexity score
   */
  calculateSQLComplexity(sql) {
    if (!sql) return 0;

    let complexity = 0;
    const sqlUpper = sql.toUpperCase();

    // Basic SELECT = 1
    if (sqlUpper.includes('SELECT')) complexity += 1;

    // JOINs add complexity
    const joinCount = (sqlUpper.match(/JOIN/g) || []).length;
    complexity += joinCount * 2;

    // Subqueries
    const subqueryCount = (sql.match(/\(/g) || []).length;
    complexity += subqueryCount * 1.5;

    // Aggregations
    if (sqlUpper.includes('GROUP BY')) complexity += 2;
    if (sqlUpper.includes('HAVING')) complexity += 1.5;

    // Window functions
    if (sqlUpper.includes('OVER')) complexity += 3;

    return Math.min(10, complexity);
  }

  /**
   * Calculate result relevance score
   */
  calculateResultRelevance(intent, executionResult) {
    if (!executionResult || !Array.isArray(executionResult)) return 0;

    let relevance = 5; // Base score

    // Check if we got results
    if (executionResult.length > 0) {
      relevance += 3;

      // Check if result count makes sense for intent
      if (intent.limit && executionResult.length <= intent.limit) {
        relevance += 2;
      }
    }

    return Math.min(10, relevance);
  }

  /**
   * Calculate query optimization score
   */
  calculateQueryOptimization(sql) {
    if (!sql) return 0;

    let optimization = 5; // Base score
    const sqlUpper = sql.toUpperCase();

    // Good practices
    if (sqlUpper.includes('LIMIT')) optimization += 1;
    if (sqlUpper.includes('INDEX') || sqlUpper.includes('WHERE')) optimization += 1;

    // Avoid SELECT *
    if (!sqlUpper.includes('SELECT *')) optimization += 1;

    // Proper JOIN syntax
    if (sqlUpper.includes('ON ') && !sqlUpper.includes('WHERE ')) optimization += 1;

    return Math.min(10, optimization);
  }

  /**
   * Calculate summary metrics across all models
   */
  calculateSummaryMetrics(modelResults) {
    const successfulModels = modelResults.filter(m => m.success);

    if (successfulModels.length === 0) {
      return {
        averageLatency: 0,
        averageAccuracy: 0,
        successRate: 0,
        fastestModel: null,
        mostAccurate: null,
        totalModels: modelResults.length
      };
    }

    const latencies = successfulModels.map(m => m.latency);
    const accuracies = successfulModels.map(m => m.accuracy);

    return {
      averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      averageAccuracy: accuracies.reduce((a, b) => a + b, 0) / accuracies.length,
      successRate: (successfulModels.length / modelResults.length) * 100,
      fastestModel: successfulModels.reduce((prev, curr) =>
        prev.latency < curr.latency ? prev : curr
      ),
      mostAccurate: successfulModels.reduce((prev, curr) =>
        prev.accuracy > curr.accuracy ? prev : curr
      ),
      totalModels: modelResults.length,
      successfulModels: successfulModels.length
    };
  }

  /**
   * Determine the best overall model
   */
  determineBestModel(modelResults) {
    const successfulModels = modelResults.filter(m => m.success);

    if (successfulModels.length === 0) return null;

    // Weighted scoring: 60% accuracy, 25% speed, 15% complexity handling
    const scoredModels = successfulModels.map(model => {
      const speedScore = Math.max(0, 100 - (model.latency / 1000)); // Lower latency = higher score
      const accuracyScore = model.accuracy;
      const complexityScore = (model.metrics.sqlComplexity || 0) * 10;

      const overallScore = (
        accuracyScore * 0.6 +
        speedScore * 0.25 +
        complexityScore * 0.15
      );

      return {
        ...model,
        overallScore: overallScore
      };
    });

    return scoredModels.reduce((prev, curr) =>
      prev.overallScore > curr.overallScore ? prev : curr
    );
  }

  /**
   * Store evaluation result in history
   */
  storeEvaluationResult(evaluationResult) {
    this.evaluationHistory.unshift(evaluationResult);

    if (this.evaluationHistory.length > this.maxHistorySize) {
      this.evaluationHistory = this.evaluationHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get evaluation history
   */
  getEvaluationHistory(limit = 10) {
    return this.evaluationHistory.slice(0, limit);
  }

  /**
   * Clear evaluation history
   */
  clearHistory() {
    this.evaluationHistory = [];
  }
}

module.exports = new ModelEvaluator();