/**
 * SLM Business Service Layer - Intent Validation Service
 *
 * @author Partha Chandramohan
 * @description Multi-model intent validation and query-intent matching verification
 */

const ModelConfig = require('../config/model-config');
const contextProvider = require('./context-provider');

class IntentValidationService {
  constructor() {
    this.modelConfig = ModelConfig;
    this.validationCache = new Map();
    this.consensusThreshold = 0.8; // 80% model agreement required
    this.confidenceThreshold = 0.85; // Minimum confidence for validation

    // Model specializations for different validation tasks
    this.validationModels = {
      intent_classification: ['phi3:mini', 'qwen3:4b'], // Fast and reasoning models
      sql_verification: ['starcoder2:3b', 'codegemma:2b'], // Code-focused models
      business_logic: ['qwen3:4b'], // Large context for business understanding
      final_consensus: ['phi3:mini', 'qwen3:4b'] // Final validation
    };
  }

  /**
   * Multi-model intent validation with consensus scoring
   */
  async validateIntent(userRequest, generatedIntent, generatedSQL) {
    console.log(`[IntentValidation] Starting multi-model validation for: "${userRequest}"`);

    const validationResults = {
      consensus_score: 0,
      confidence_score: 0,
      model_agreements: [],
      validation_details: {},
      recommendation: 'reject',
      cached_key: null
    };

    try {
      // Step 1: Intent Classification Validation
      const intentValidation = await this.validateIntentClassification(userRequest, generatedIntent);
      validationResults.validation_details.intent = intentValidation;

      // Step 2: SQL-Intent Matching Verification
      const sqlValidation = await this.validateSQLMatching(userRequest, generatedIntent, generatedSQL);
      validationResults.validation_details.sql = sqlValidation;

      // Step 3: Business Logic Validation
      const businessValidation = await this.validateBusinessLogic(userRequest, generatedSQL);
      validationResults.validation_details.business = businessValidation;

      // Step 4: Calculate consensus and confidence
      const consensus = this.calculateConsensus([intentValidation, sqlValidation, businessValidation]);
      validationResults.consensus_score = consensus.score;
      validationResults.confidence_score = consensus.confidence;
      validationResults.model_agreements = consensus.agreements;

      // Step 5: Make recommendation
      if (consensus.score >= this.consensusThreshold && consensus.confidence >= this.confidenceThreshold) {
        validationResults.recommendation = 'accept';
        validationResults.cached_key = this.generateCacheKey(userRequest, generatedIntent);
      } else if (consensus.score >= 0.6) {
        validationResults.recommendation = 'review'; // Human review recommended
      } else {
        validationResults.recommendation = 'reject';
      }

      console.log(`[IntentValidation] Validation complete - Consensus: ${consensus.score.toFixed(2)}, Confidence: ${consensus.confidence.toFixed(2)}, Recommendation: ${validationResults.recommendation}`);

      return validationResults;

    } catch (error) {
      console.error('[IntentValidation] Validation failed:', error.message);
      return {
        ...validationResults,
        error: error.message,
        recommendation: 'reject'
      };
    }
  }

  /**
   * Validate intent classification across multiple models
   */
  async validateIntentClassification(userRequest, generatedIntent) {
    const models = this.validationModels.intent_classification;
    const results = [];

    for (const model of models) {
      try {
        const validation = await this.askModelToValidateIntent(model, userRequest, generatedIntent);
        results.push({
          model: model,
          agrees: validation.agrees,
          confidence: validation.confidence,
          reasoning: validation.reasoning,
          alternative_intent: validation.alternative_intent
        });
      } catch (error) {
        console.warn(`[IntentValidation] Model ${model} failed intent validation:`, error.message);
        results.push({
          model: model,
          agrees: false,
          confidence: 0,
          error: error.message
        });
      }
    }

    return {
      task: 'intent_classification',
      results: results,
      agreement_rate: results.filter(r => r.agrees).length / results.length,
      avg_confidence: results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length
    };
  }

  /**
   * Validate SQL-intent matching
   */
  async validateSQLMatching(userRequest, generatedIntent, generatedSQL) {
    const models = this.validationModels.sql_verification;
    const results = [];

    for (const model of models) {
      try {
        const validation = await this.askModelToValidateSQL(model, userRequest, generatedIntent, generatedSQL);
        results.push({
          model: model,
          sql_matches_intent: validation.matches,
          sql_quality_score: validation.quality_score,
          confidence: validation.confidence,
          issues_found: validation.issues || [],
          suggested_improvements: validation.improvements || []
        });
      } catch (error) {
        console.warn(`[IntentValidation] Model ${model} failed SQL validation:`, error.message);
        results.push({
          model: model,
          sql_matches_intent: false,
          confidence: 0,
          error: error.message
        });
      }
    }

    return {
      task: 'sql_verification',
      results: results,
      match_rate: results.filter(r => r.sql_matches_intent).length / results.length,
      avg_quality: results.reduce((sum, r) => sum + (r.sql_quality_score || 0), 0) / results.length,
      avg_confidence: results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length
    };
  }

  /**
   * Validate business logic appropriateness
   */
  async validateBusinessLogic(userRequest, generatedSQL) {
    const models = this.validationModels.business_logic;
    const results = [];

    // Get business context for validation
    const businessContext = contextProvider.getMCPContext(userRequest, { userRole: 'admin' });

    for (const model of models) {
      try {
        const validation = await this.askModelToValidateBusinessLogic(model, userRequest, generatedSQL, businessContext);
        results.push({
          model: model,
          business_appropriate: validation.appropriate,
          security_score: validation.security_score,
          performance_score: validation.performance_score,
          confidence: validation.confidence,
          business_concerns: validation.concerns || [],
          recommendations: validation.recommendations || []
        });
      } catch (error) {
        console.warn(`[IntentValidation] Model ${model} failed business validation:`, error.message);
        results.push({
          model: model,
          business_appropriate: false,
          confidence: 0,
          error: error.message
        });
      }
    }

    return {
      task: 'business_validation',
      results: results,
      appropriateness_rate: results.filter(r => r.business_appropriate).length / results.length,
      avg_security: results.reduce((sum, r) => sum + (r.security_score || 0), 0) / results.length,
      avg_performance: results.reduce((sum, r) => sum + (r.performance_score || 0), 0) / results.length,
      avg_confidence: results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length
    };
  }

  /**
   * Ask a specific model to validate intent classification
   */
  async askModelToValidateIntent(model, userRequest, generatedIntent) {
    const prompt = `
TASK: Validate if the generated intent correctly represents the user's request.

USER REQUEST: "${userRequest}"

GENERATED INTENT:
${JSON.stringify(generatedIntent, null, 2)}

EVALUATION CRITERIA:
1. Does the intent type match what the user is asking for?
2. Are the entities correctly identified?
3. Are the filters appropriate?
4. Is the confidence level reasonable?

Respond in JSON format:
{
  "agrees": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation",
  "alternative_intent": "if you disagree, suggest better intent"
}`;

    // Use the Ollama client to get model response
    const ollamaClient = require('../slm/ollama-client');
    const response = await ollamaClient.generateResponse(prompt, model, { temperature: 0.1, max_tokens: 300 });

    try {
      const jsonMatch = response.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.warn(`[IntentValidation] Failed to parse ${model} response, using fallback`);
    }

    // Fallback parsing
    const agrees = response.response.toLowerCase().includes('true') || response.response.toLowerCase().includes('correct');
    return {
      agrees: agrees,
      confidence: agrees ? 0.7 : 0.3,
      reasoning: "Fallback parsing used",
      alternative_intent: null
    };
  }

  /**
   * Ask a specific model to validate SQL-intent matching
   */
  async askModelToValidateSQL(model, userRequest, generatedIntent, generatedSQL) {
    const prompt = `
TASK: Validate if the generated SQL correctly implements the user's intent.

USER REQUEST: "${userRequest}"
INTENT: ${JSON.stringify(generatedIntent, null, 2)}

GENERATED SQL:
${generatedSQL}

EVALUATION CRITERIA:
1. Does the SQL query answer the user's question?
2. Are the tables and columns appropriate?
3. Are the JOIN conditions correct?
4. Are the WHERE clauses matching the filters?
5. Is the query efficient and safe?

Rate each aspect 0-10 and provide overall assessment.

Respond in JSON format:
{
  "matches": true/false,
  "quality_score": 0-10,
  "confidence": 0.0-1.0,
  "issues": ["list of issues found"],
  "improvements": ["suggested improvements"]
}`;

    const ollamaClient = require('../slm/ollama-client');
    const response = await ollamaClient.generateResponse(prompt, model, { temperature: 0.1, max_tokens: 400 });

    try {
      const jsonMatch = response.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.warn(`[IntentValidation] Failed to parse ${model} SQL validation, using fallback`);
    }

    // Fallback parsing
    const matches = response.response.toLowerCase().includes('correct') || response.response.toLowerCase().includes('appropriate');
    return {
      matches: matches,
      quality_score: matches ? 7 : 3,
      confidence: 0.6,
      issues: [],
      improvements: []
    };
  }

  /**
   * Ask a specific model to validate business logic
   */
  async askModelToValidateBusinessLogic(model, userRequest, generatedSQL, businessContext) {
    const prompt = `
TASK: Validate if the SQL query follows proper business logic and security practices.

USER REQUEST: "${userRequest}"
GENERATED SQL: ${generatedSQL}

BUSINESS CONTEXT:
- Database tables: ${businessContext.database_schema.tables.length}
- Business intents: ${businessContext.business_context.intents.length}
- Security constraints: RBAC, data privacy, query limits

EVALUATION CRITERIA:
1. Business Logic: Does the query make business sense?
2. Security: Are there any security concerns?
3. Performance: Is the query efficient?
4. Data Privacy: Does it respect access controls?

Rate each aspect 0-10.

Respond in JSON format:
{
  "appropriate": true/false,
  "security_score": 0-10,
  "performance_score": 0-10,
  "confidence": 0.0-1.0,
  "concerns": ["list of concerns"],
  "recommendations": ["business recommendations"]
}`;

    const ollamaClient = require('../slm/ollama-client');
    const response = await ollamaClient.generateResponse(prompt, model, { temperature: 0.1, max_tokens: 400 });

    try {
      const jsonMatch = response.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.warn(`[IntentValidation] Failed to parse ${model} business validation, using fallback`);
    }

    // Fallback parsing
    const appropriate = !response.response.toLowerCase().includes('concern') && !response.response.toLowerCase().includes('issue');
    return {
      appropriate: appropriate,
      security_score: appropriate ? 8 : 4,
      performance_score: appropriate ? 7 : 5,
      confidence: 0.6,
      concerns: [],
      recommendations: []
    };
  }

  /**
   * Calculate consensus from validation results
   */
  calculateConsensus(validationResults) {
    let totalScore = 0;
    let totalConfidence = 0;
    let totalWeights = 0;
    const agreements = [];

    // Weight different validation types
    const weights = {
      intent_classification: 0.4,
      sql_verification: 0.4,
      business_validation: 0.2
    };

    for (const result of validationResults) {
      const weight = weights[result.task] || 0.33;
      const score = result.agreement_rate || result.match_rate || result.appropriateness_rate || 0;
      const confidence = result.avg_confidence || 0;

      totalScore += score * weight;
      totalConfidence += confidence * weight;
      totalWeights += weight;

      agreements.push({
        task: result.task,
        score: score,
        confidence: confidence,
        weight: weight
      });
    }

    return {
      score: totalWeights > 0 ? totalScore / totalWeights : 0,
      confidence: totalWeights > 0 ? totalConfidence / totalWeights : 0,
      agreements: agreements
    };
  }

  /**
   * Generate cache key for validated queries
   */
  generateCacheKey(userRequest, intent) {
    const normalizedRequest = userRequest.toLowerCase().trim();
    const intentHash = JSON.stringify(intent);
    return `validated_${Buffer.from(normalizedRequest + intentHash).toString('base64').slice(0, 32)}`;
  }

  /**
   * Get validation statistics
   */
  getValidationStats() {
    return {
      cache_size: this.validationCache.size,
      consensus_threshold: this.consensusThreshold,
      confidence_threshold: this.confidenceThreshold,
      validation_models: this.validationModels,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new IntentValidationService();