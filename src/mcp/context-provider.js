/**
 * SLM Business Service Layer - MCP Context Provider
 *
 * @author Partha Chandramohan
 * @description Provides enhanced schema and BRD context to MCP infrastructure
 */

const enhancedSchema = require('../config/enhanced-schema-config');
const brdContext = require('../config/brd-context-config');

class MCPContextProvider {
  constructor() {
    this.contextCache = new Map();
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes
    this.lastCacheUpdate = new Date();

    console.log('[MCP-Context] Context provider initialized');
  }

  /**
   * Get comprehensive MCP context for SQL generation
   */
  getMCPContext(query = '', options = {}) {
    const cacheKey = `context_${this.hashQuery(query)}_${JSON.stringify(options)}`;

    // Check cache first
    if (this.contextCache.has(cacheKey)) {
      const cached = this.contextCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        console.log('[MCP-Context] Cache hit for context request');
        return cached.data;
      }
    }

    console.log('[MCP-Context] Generating fresh context for query:', query.substring(0, 100));

    const context = {
      timestamp: new Date().toISOString(),
      query_context: query,

      // Enhanced database schema with business metadata
      database_schema: this.getEnhancedDatabaseSchema(),

      // BRD-derived business context
      business_context: this.getBusinessContext(query),

      // Query pattern recognition
      query_patterns: this.getQueryPatterns(query),

      // Business terminology mappings
      terminology: this.getBusinessTerminology(),

      // Business rules and constraints
      business_rules: this.getBusinessRules(),

      // SQL generation hints
      sql_hints: this.getSQLHints(query),

      // Performance optimization suggestions
      optimization_hints: this.getOptimizationHints(query),

      // Security and validation context
      security_context: this.getSecurityContext(options.userRole || 'employee')
    };

    // Cache the result
    this.contextCache.set(cacheKey, {
      data: context,
      timestamp: Date.now()
    });

    return context;
  }

  /**
   * Get enhanced database schema with business metadata
   */
  getEnhancedDatabaseSchema() {
    const schema = enhancedSchema.getSchema();

    return {
      version: schema.database.version,
      description: schema.database.description,
      tables: Object.entries(schema.tables).map(([name, metadata]) => ({
        name,
        business_purpose: metadata.business_purpose,
        description: metadata.description,
        columns: Object.entries(metadata.columns).map(([colName, colMeta]) => ({
          name: colName,
          type: colMeta.type,
          business_meaning: colMeta.business_meaning,
          description: colMeta.description,
          constraints: {
            required: colMeta.required || false,
            unique: colMeta.unique || false,
            primary_key: colMeta.primary_key || false,
            foreign_key: colMeta.foreign_key || null,
            values: colMeta.values || null,
            range: colMeta.range || null,
            default: colMeta.default || null
          },
          example: colMeta.example || null
        })),
        relationships: metadata.relationships || [],
        business_queries: metadata.business_queries || [],
        indexes: this.getTableIndexes(name)
      })),
      views: Object.entries(schema.views || {}).map(([name, metadata]) => ({
        name,
        description: metadata.description,
        business_purpose: metadata.business_purpose,
        includes_tables: metadata.includes_tables
      }))
    };
  }

  /**
   * Get business context derived from BRDs
   */
  getBusinessContext(query) {
    if (!query || query.trim().length === 0) {
      return {
        requirements: [],
        processes: [],
        intents: []
      };
    }

    const sqlContext = brdContext.generateSQLContext(query);

    return {
      requirements: sqlContext.business_context.requirements,
      intents: sqlContext.business_context.intents,
      recommended_tables: sqlContext.sql_guidance.recommended_tables,
      business_rules: sqlContext.sql_guidance.business_rules,
      example_patterns: sqlContext.sql_guidance.example_patterns,
      processes: this.getRelevantProcesses(query)
    };
  }

  /**
   * Get relevant business processes for the query
   */
  getRelevantProcesses(query) {
    const processes = brdContext.getBusinessProcesses();
    const queryLower = query.toLowerCase();
    const relevantProcesses = [];

    for (const [processKey, process] of Object.entries(processes)) {
      // Check if query mentions process-related terms
      const processTerms = [
        processKey.replace('_', ' '),
        process.process_name.toLowerCase(),
        ...process.stages.map(s => s.stage.toLowerCase())
      ];

      if (processTerms.some(term => queryLower.includes(term))) {
        relevantProcesses.push({
          key: processKey,
          name: process.process_name,
          stages: process.stages.map(stage => ({
            stage: stage.stage,
            sql_context: stage.sql_context,
            business_rules: stage.business_rules
          }))
        });
      }
    }

    return relevantProcesses;
  }

  /**
   * Recognize query patterns from business intents
   */
  getQueryPatterns(query) {
    const intents = brdContext.getQueryIntents();
    const patterns = [];
    const queryLower = query.toLowerCase();

    for (const [category, categoryIntents] of Object.entries(intents)) {
      for (const [intentKey, intentData] of Object.entries(categoryIntents)) {
        // Check if query matches this intent pattern
        const intentTerms = [
          intentKey,
          ...intentData.intent.toLowerCase().split(' ')
        ];

        if (intentTerms.some(term => queryLower.includes(term))) {
          patterns.push({
            category,
            intent: intentKey,
            description: intentData.intent,
            tables: intentData.tables,
            example_sql: intentData.typical_sql,
            confidence: this.calculatePatternConfidence(query, intentData)
          });
        }
      }
    }

    // Sort by confidence
    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate confidence score for pattern matching
   */
  calculatePatternConfidence(query, intentData) {
    const queryLower = query.toLowerCase();
    let score = 0;

    // Check for exact intent matches
    if (queryLower.includes(intentData.intent.toLowerCase())) {
      score += 50;
    }

    // Check for table name matches
    for (const table of intentData.tables) {
      if (queryLower.includes(table)) {
        score += 20;
      }
    }

    // Check for description keywords
    const descWords = intentData.intent.toLowerCase().split(' ');
    for (const word of descWords) {
      if (word.length > 3 && queryLower.includes(word)) {
        score += 10;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Get business terminology mappings
   */
  getBusinessTerminology() {
    return enhancedSchema.getBusinessTerminology();
  }

  /**
   * Get business rules and constraints
   */
  getBusinessRules() {
    return enhancedSchema.getBusinessRules();
  }

  /**
   * Generate SQL hints based on query analysis
   */
  getSQLHints(query) {
    const hints = [];
    const queryLower = query.toLowerCase();

    // Performance hints
    if (queryLower.includes('customer') && queryLower.includes('order')) {
      hints.push({
        type: 'performance',
        suggestion: 'Consider using customer_id index for customer-order joins',
        priority: 'medium'
      });
    }

    if (queryLower.includes('inventory') && queryLower.includes('product')) {
      hints.push({
        type: 'performance',
        suggestion: 'Use product_id and warehouse_id composite index for inventory queries',
        priority: 'high'
      });
    }

    // Business logic hints
    if (queryLower.includes('pending')) {
      hints.push({
        type: 'business_logic',
        suggestion: 'Consider filtering by status IN (\'pending\', \'confirmed\', \'processing\') for active orders',
        priority: 'medium'
      });
    }

    if (queryLower.includes('low stock') || queryLower.includes('stock level')) {
      hints.push({
        type: 'business_logic',
        suggestion: 'Use quantity_available <= reorder_point for low stock analysis',
        priority: 'high'
      });
    }

    // Data quality hints
    if (queryLower.includes('customer') && queryLower.includes('email')) {
      hints.push({
        type: 'data_quality',
        suggestion: 'Filter out inactive customers for current customer analysis',
        priority: 'medium'
      });
    }

    return hints;
  }

  /**
   * Get optimization hints for query performance
   */
  getOptimizationHints(query) {
    const hints = [];
    const queryLower = query.toLowerCase();

    // Index usage hints
    if (queryLower.includes('order_date')) {
      hints.push({
        type: 'index',
        suggestion: 'Use idx_orders_order_date for date-based filtering',
        impact: 'high'
      });
    }

    if (queryLower.includes('customer_code')) {
      hints.push({
        type: 'index',
        suggestion: 'Use idx_customers_customer_code for customer lookups',
        impact: 'high'
      });
    }

    // Query structure hints
    if (queryLower.includes('count') && queryLower.includes('group by')) {
      hints.push({
        type: 'query_structure',
        suggestion: 'Consider using EXISTS instead of COUNT(*) > 0 for better performance',
        impact: 'medium'
      });
    }

    // JOIN optimization hints
    if (queryLower.includes('join') && queryLower.includes('order')) {
      hints.push({
        type: 'join_optimization',
        suggestion: 'Use INNER JOIN instead of LEFT JOIN when referential integrity is guaranteed',
        impact: 'medium'
      });
    }

    return hints;
  }

  /**
   * Get security context based on user role
   */
  getSecurityContext(userRole) {
    const securityContext = {
      user_role: userRole,
      allowed_operations: ['SELECT'],
      restricted_columns: [],
      row_level_security: []
    };

    switch (userRole) {
      case 'admin':
        securityContext.allowed_tables = enhancedSchema.getAllowedTables();
        break;
      case 'manager':
        securityContext.allowed_tables = enhancedSchema.getAllowedTables();
        securityContext.restricted_columns = ['credit_card_info', 'ssn', 'tax_id'];
        break;
      case 'employee':
      default:
        securityContext.allowed_tables = enhancedSchema.getAllowedTables();
        securityContext.restricted_columns = [
          'email', 'phone', 'address', 'payment_details',
          'credit_card_info', 'contact_details', 'pricing_terms',
          'cost_price', 'ssn', 'tax_id'
        ];
        securityContext.row_level_security = [
          'customers.status = \'active\' -- Employees only see active customers'
        ];
        break;
    }

    return securityContext;
  }

  /**
   * Get table indexes for performance optimization
   */
  getTableIndexes(tableName) {
    const indexMap = {
      customers: ['idx_customers_email', 'idx_customers_customer_code', 'idx_customers_status'],
      orders: ['idx_orders_customer', 'idx_orders_status', 'idx_orders_order_date'],
      products: ['idx_products_sku', 'idx_products_category', 'idx_products_supplier'],
      inventory: ['idx_inventory_product', 'idx_inventory_warehouse', 'idx_inventory_product_warehouse'],
      order_items: ['idx_order_items_order', 'idx_order_items_product']
    };

    return indexMap[tableName] || [];
  }

  /**
   * Generate hash for query caching
   */
  hashQuery(query) {
    return Buffer.from(query.toLowerCase().trim()).toString('base64').slice(0, 16);
  }

  /**
   * Clear context cache
   */
  clearCache() {
    this.contextCache.clear();
    this.lastCacheUpdate = new Date();
    console.log('[MCP-Context] Context cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cache_size: this.contextCache.size,
      last_update: this.lastCacheUpdate.toISOString(),
      cache_expiry_ms: this.cacheExpiry
    };
  }

  /**
   * Update context data from source configurations
   */
  refreshContext() {
    console.log('[MCP-Context] Refreshing context from source configurations');
    this.clearCache();

    // Force reload of enhanced schema and BRD context
    // Note: In a production system, you might want to reload these modules
    this.lastCacheUpdate = new Date();
  }

  /**
   * Get context metadata for debugging
   */
  getContextMetadata() {
    return {
      schema_version: enhancedSchema.getSchema().database.version,
      brd_version: brdContext.generateMCPContext().context_version,
      cache_stats: this.getCacheStats(),
      available_tables: enhancedSchema.getAllowedTables(),
      business_processes: Object.keys(brdContext.getBusinessProcesses()),
      query_intent_categories: Object.keys(brdContext.getQueryIntents())
    };
  }
}

module.exports = new MCPContextProvider();