/**
 * SLM Business Service Layer - AI-Powered Database Adapter
 *
 * @author Partha Chandramohan
 * @description Enhanced database adapter using AI for intent understanding and query generation
 */
const { Pool } = require('pg');
const intentClassifier = require('../ai/intent-classifier');
const sqlGenerator = require('../ai/sql-generator');
const securityConfig = require('../config/security-config');

class AIDatabaseAdapter {
  constructor() {
    this.pool = null;
    this.initialized = false;
    this.queryHistory = [];
    this.maxHistorySize = 100;
  }

  async initialize() {
    try {
      const dbConfig = securityConfig.get('database');

      this.pool = new Pool({
        user: process.env.POSTGRES_USER || 'app_user',
        host: process.env.POSTGRES_HOST || 'localhost',
        database: process.env.POSTGRES_DB || 'business_app',
        password: process.env.POSTGRES_PASSWORD || 'app_password',
        port: process.env.POSTGRES_PORT || 5432,
        max: dbConfig.maxConnections || 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: dbConfig.connectionTimeoutMs || 5000,
        ssl: dbConfig.enableSSL ? { rejectUnauthorized: false } : false
      });

      // Only log connection info in development, never credentials
      if (securityConfig.isDevelopment()) {
        console.log('Connecting to PostgreSQL:', {
          host: process.env.POSTGRES_HOST || 'localhost',
          database: process.env.POSTGRES_DB || 'business_app',
          port: process.env.POSTGRES_PORT || 5432,
          ssl: dbConfig.enableSSL
        });
      }

      // Test connection
      await this.pool.query('SELECT NOW()');
      this.initialized = true;
      console.log('AI Database adapter initialized successfully');
    } catch (error) {
      const sanitizedError = securityConfig.sanitizeForLogging ?
        securityConfig.sanitizeForLogging(error.message) : error.message;
      console.error('Failed to initialize AI Database adapter:', sanitizedError);
      throw new Error('Database initialization failed');
    }
  }

  async processBusinessRequest(userRequest, user, ollamaClient) {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    let intent, sql, results;

    try {
      // Stage 1: Intent Classification
      console.log(`Step 1: Classifying intent for: "${userRequest}"`);
      intent = await intentClassifier.classifyIntent(userRequest, ollamaClient);
      console.log('Intent classified:', JSON.stringify(intent, null, 2));

      // Stage 2: SQL Generation
      console.log('Step 2: Generating SQL query');
      sql = await sqlGenerator.generateSQL(intent, ollamaClient);
      console.log('Generated SQL:', sql);

      // Stage 3: Execute Query
      console.log('Step 3: Executing query');
      results = await this.executeQuery(sql);

      // Stage 4: Format Response
      const response = this.formatResponse(userRequest, intent, sql, results, startTime);

      // Log the interaction
      this.logQueryHistory(userRequest, intent, sql, results.length, Date.now() - startTime);

      return response;

    } catch (error) {
      console.error('AI Database processing error:', error);

      // Fallback to simple processing
      return await this.fallbackProcessing(userRequest, user, error);
    }
  }

  async executeQuery(sql) {
    try {
      // Additional safety check
      if (!sql.trim().toUpperCase().startsWith('SELECT')) {
        throw new Error('Only SELECT statements are allowed');
      }

      const result = await this.pool.query(sql);
      return result.rows;
    } catch (error) {
      console.error('Query execution error:', error);
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  formatResponse(userRequest, intent, sql, results, startTime) {
    const processingTime = Date.now() - startTime;

    // Generate human-readable summary
    const summary = this.generateSummary(intent, results);

    return {
      success: true,
      data: results,
      summary: summary,
      query_type: `ai_${intent.entity}_${intent.intent}`,
      record_count: results.length,
      intent: intent,
      generated_sql: sql,
      processing_time: processingTime,
      confidence: intent.confidence,
      ai_powered: true
    };
  }

  generateSummary(intent, results) {
    const count = results.length;
    const entity = intent.entity;
    const intentAction = intent.intent;

    if (intentAction === 'count') {
      return `Found ${results[0]?.total || 0} ${entity}`;
    }

    if (count === 0) {
      return `No ${entity} found matching your criteria`;
    }

    const filters = intent.filters.length > 0 ? ` with filters: ${intent.filters.join(', ')}` : '';
    const limitText = intent.limit ? ` (showing top ${Math.min(intent.limit, count)})` : '';

    switch (entity) {
      case 'orders':
        return `Found ${count} orders${filters}${limitText}`;
      case 'customers':
        return `Found ${count} customers${filters}${limitText}`;
      case 'inventory':
        return `Found ${count} inventory items${filters}${limitText}`;
      case 'products':
        return `Found ${count} products${filters}${limitText}`;
      case 'suppliers':
        return `Found ${count} suppliers${filters}${limitText}`;
      case 'warehouses':
        return `Found ${count} warehouses${filters}${limitText}`;
      default:
        return `Found ${count} ${entity}${filters}${limitText}`;
    }
  }

  async fallbackProcessing(userRequest, user, originalError) {
    console.log('Using fallback processing for:', userRequest);

    try {
      // Import the old adapter for fallback
      const fallbackAdapter = require('./postgres-adapter');
      const result = await fallbackAdapter.processBusinessRequest(userRequest, user);

      // Mark as fallback
      result.ai_powered = false;
      result.fallback_reason = originalError.message;
      result.processing_method = 'keyword_matching';

      return result;
    } catch (fallbackError) {
      console.error('Fallback processing also failed:', fallbackError);

      return {
        success: false,
        error: 'Both AI and fallback processing failed',
        original_error: originalError.message,
        fallback_error: fallbackError.message,
        suggestions: [
          'Try rephrasing your request',
          'Use simpler language',
          'Check that the system services are running'
        ]
      };
    }
  }

  logQueryHistory(userRequest, intent, sql, resultCount, processingTime) {
    const entry = {
      timestamp: new Date().toISOString(),
      user_request: userRequest,
      intent: intent,
      generated_sql: sql,
      result_count: resultCount,
      processing_time: processingTime,
      confidence: intent.confidence
    };

    this.queryHistory.push(entry);

    // Keep history size manageable
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift();
    }
  }

  getQueryHistory(limit = 10) {
    return this.queryHistory.slice(-limit).reverse();
  }

  getAnalytics() {
    if (this.queryHistory.length === 0) {
      return { message: 'No query history available' };
    }

    const totalQueries = this.queryHistory.length;
    const avgProcessingTime = this.queryHistory.reduce((sum, entry) => sum + entry.processing_time, 0) / totalQueries;
    const avgConfidence = this.queryHistory.reduce((sum, entry) => sum + entry.confidence, 0) / totalQueries;

    const entityCounts = {};
    const intentCounts = {};

    this.queryHistory.forEach(entry => {
      const entity = entry.intent.entity;
      const intent = entry.intent.intent;

      entityCounts[entity] = (entityCounts[entity] || 0) + 1;
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    });

    return {
      total_queries: totalQueries,
      avg_processing_time: Math.round(avgProcessingTime),
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      most_requested_entity: Object.keys(entityCounts).reduce((a, b) => entityCounts[a] > entityCounts[b] ? a : b),
      most_common_intent: Object.keys(intentCounts).reduce((a, b) => intentCounts[a] > intentCounts[b] ? a : b),
      entity_distribution: entityCounts,
      intent_distribution: intentCounts,
      cache_stats: {
        intent_cache: intentClassifier.getCacheStats(),
        sql_cache: sqlGenerator.getCacheStats()
      }
    };
  }

  async checkHealth() {
    try {
      if (!this.initialized) {
        return { healthy: false, error: 'Not initialized' };
      }

      const result = await this.pool.query('SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = $1', ['public']);

      return {
        healthy: true,
        connection: 'active',
        tables: result.rows[0].table_count,
        ai_components: {
          intent_classifier: 'active',
          sql_generator: 'active'
        },
        recent_queries: this.queryHistory.length
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  clearCaches() {
    intentClassifier.clearCache();
    sqlGenerator.clearCache();
    console.log('All AI caches cleared');
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.initialized = false;
      console.log('AI Database connection pool closed');
    }
  }
}

module.exports = new AIDatabaseAdapter();