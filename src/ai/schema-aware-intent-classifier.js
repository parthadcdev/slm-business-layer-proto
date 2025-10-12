/**
 * Schema-Aware Intent Classifier
 *
 * Author: Partha Chandramohan
 * Replaces hardcoded pattern matching with intelligent schema-driven intent understanding
 * Uses ChromaDB-stored schema knowledge for semantic entity detection and RBAC enforcement
 */

// const path = require("path");
const SchemaIngestor = require("../rag/schema-ingestor");

class SchemaAwareIntentClassifier {
  constructor() {
    this.schemaIngestor = new SchemaIngestor();
    this.intentPatterns = {
      list: ["get", "show", "list", "display", "find", "fetch", "retrieve"],
      analyze: [
        "analyze",
        "analysis",
        "insights",
        "trends",
        "metrics",
        "performance",
      ],
      count: ["count", "how many", "number of", "total"],
      filter: ["filter", "where", "with", "having", "condition"],
      aggregate: [
        "sum",
        "average",
        "max",
        "min",
        "total",
        "highest",
        "lowest",
        "most",
        "least",
      ],
    };
    this.confidenceThreshold = 0.3;
  }

  /**
   * Classify user intent using schema knowledge and semantic understanding
   * @param {string} userRequest - The natural language business request
   * @param {string} userRole - User's role for RBAC enforcement
   * @returns {Object} Classification result with intent, entity, schema context, and confidence
   */
  async classifyIntent(userRequest, userRole = "employee") {
    try {
      // Step 1: Query schema knowledge base for semantic entity detection
      const schemaContext = await this.schemaIngestor.querySchemaKnowledge(
        userRequest,
        { limit: 5, threshold: this.confidenceThreshold },
      );

      // Step 2: Extract entity from schema context
      const entity = this.extractEntityFromSchema(schemaContext, userRequest);

      // Step 3: Determine intent type from user request
      const intent = this.determineIntentType(userRequest);

      // Step 4: Apply RBAC filtering to schema context
      const filteredSchema = this.applyRBACFiltering(schemaContext, userRole);

      // Step 5: Calculate confidence score
      const confidence = this.calculateConfidence(
        schemaContext,
        intent,
        userRequest,
      );

      // Step 6: Extract additional query parameters
      const queryParams = this.extractQueryParameters(
        userRequest,
        filteredSchema,
      );

      const result = {
        intent,
        entity,
        schemaContext: filteredSchema,
        confidence,
        queryParams,
        userRole,
        userRequest,
        fallbackReason:
          confidence < this.confidenceThreshold ? "low_confidence" : null,
      };

      console.log(
        `[SchemaAwareIntentClassifier] Request: "${userRequest}" → Entity: ${entity}, Intent: ${intent}, Confidence: ${confidence}`,
      );
      return result;
    } catch (error) {
      console.error(
        "[SchemaAwareIntentClassifier] Error in classification:",
        error,
      );
      return this.getFallbackClassification(userRequest, userRole);
    }
  }

  /**
   * Extract entity from schema search results
   * @param {Object} schemaContext - Results from schema knowledge query
   * @param {string} userRequest - Original user request for context
   * @returns {string} Detected entity name
   */
  extractEntityFromSchema(schemaContext, userRequest) {
    if (!schemaContext.results || schemaContext.results.length === 0) {
      return this.extractEntityFromKeywords(userRequest);
    }

    // Get the highest confidence result
    const topResult = schemaContext.results[0];
    if (topResult.metadata && topResult.metadata.table) {
      return topResult.metadata.table;
    }

    // Extract from document content if metadata is missing
    const tableMatch = topResult.document.match(/CREATE TABLE (\w+)/i);
    if (tableMatch) {
      return tableMatch[1];
    }

    return this.extractEntityFromKeywords(userRequest);
  }

  /**
   * Fallback entity extraction using keyword matching
   * @param {string} userRequest - User request text
   * @returns {string} Best guess entity
   */
  extractEntityFromKeywords(userRequest) {
    const request = userRequest.toLowerCase();

    const entityKeywords = {
      orders: ["order", "orders", "purchase", "transaction", "sale"],
      customers: ["customer", "customers", "client", "buyer", "user"],
      products: ["product", "products", "item", "goods", "merchandise"],
      categories: ["category", "categories", "type", "classification", "group"],
      inventory: ["inventory", "stock", "warehouse", "storage"],
      suppliers: ["supplier", "suppliers", "vendor", "provider"],
    };

    for (const [entity, keywords] of Object.entries(entityKeywords)) {
      if (keywords.some((keyword) => request.includes(keyword))) {
        return entity;
      }
    }

    return "orders"; // Default fallback
  }

  /**
   * Determine intent type from user request
   * @param {string} userRequest - User request text
   * @returns {string} Detected intent
   */
  determineIntentType(userRequest) {
    const request = userRequest.toLowerCase();

    // Check for each intent pattern
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      if (patterns.some((pattern) => request.includes(pattern))) {
        return intent;
      }
    }

    // Default to list intent
    return "list";
  }

  /**
   * Apply role-based access control filtering to schema context
   * @param {Object} schemaContext - Schema search results
   * @param {string} userRole - User's role
   * @returns {Object} Filtered schema context
   */
  applyRBACFiltering(schemaContext, userRole) {
    if (!schemaContext.results) {
      return schemaContext;
    }

    const filteredResults = schemaContext.results.filter((result) => {
      const metadata = result.metadata || {};
      const accessLevel = metadata.access || "public";

      // Role-based access control logic
      switch (userRole) {
        case "admin":
          return true; // Admin can access everything
        case "manager":
          return ["public", "internal"].includes(accessLevel);
        case "employee":
        default:
          return accessLevel === "public";
      }
    });

    return {
      ...schemaContext,
      results: filteredResults,
      originalCount: schemaContext.results.length,
      filteredCount: filteredResults.length,
    };
  }

  /**
   * Calculate confidence score for the classification
   * @param {Object} schemaContext - Schema search results
   * @param {string} intent - Detected intent
   * @param {string} userRequest - Original request
   * @returns {number} Confidence score between 0 and 1
   */
  calculateConfidence(schemaContext, intent, userRequest) {
    let confidence = 0.5; // Base confidence

    // Schema match confidence
    if (schemaContext.results && schemaContext.results.length > 0) {
      const topResult = schemaContext.results[0];
      confidence = Math.max(confidence, topResult.relevance || 0.5);
    }

    // Intent clarity bonus
    const request = userRequest.toLowerCase();
    const intentWords = this.intentPatterns[intent] || [];
    const intentMatches = intentWords.filter((word) =>
      request.includes(word),
    ).length;
    if (intentMatches > 0) {
      confidence += 0.2 * Math.min(intentMatches, 2); // Max 0.4 bonus
    }

    // Entity clarity bonus
    const hasSpecificEntity = [
      "categories",
      "customers",
      "products",
      "inventory",
      "suppliers",
    ].some((entity) => request.includes(entity));
    if (hasSpecificEntity) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Extract query parameters like filters, sorting, limits from user request
   * @param {string} userRequest - User request text
   * @param {Object} schemaContext - Schema context for validation
   * @returns {Object} Extracted query parameters
   */
  extractQueryParameters(userRequest, schemaContext) {
    const request = userRequest.toLowerCase();
    const params = {};

    // Extract status filters
    if (request.includes("pending")) params.status = "pending";
    if (request.includes("completed")) params.status = "completed";
    if (request.includes("active")) params.is_active = true;

    // Extract sorting preferences
    if (request.includes("highest") || request.includes("most")) {
      params.sortOrder = "DESC";
    }
    if (request.includes("lowest") || request.includes("least")) {
      params.sortOrder = "ASC";
    }

    // Extract limits
    const limitMatch = request.match(/(\d+)\s*(top|first|limit)/);
    if (limitMatch) {
      params.limit = parseInt(limitMatch[1]);
    }

    // Extract time ranges
    if (request.includes("today")) params.timeRange = "today";
    if (request.includes("this week")) params.timeRange = "week";
    if (request.includes("this month")) params.timeRange = "month";

    // Extract category filters
    const categoryMatch = request.match(
      /in the (\w+) category|(\w+) category|for (\w+)/,
    );
    if (categoryMatch) {
      const category = categoryMatch[1] || categoryMatch[2] || categoryMatch[3];
      if (category) {
        params.category = category;
      }
    }

    // Check for known category names
    const knownCategories = [
      "gaming",
      "electronics",
      "computers",
      "phones",
      "audio",
      "home",
      "office",
    ];
    for (const cat of knownCategories) {
      if (request.includes(cat)) {
        params.category = cat;
        break;
      }
    }

    return params;
  }

  /**
   * Get fallback classification when schema-aware classification fails
   * @param {string} userRequest - User request text
   * @param {string} userRole - User role
   * @returns {Object} Fallback classification result
   */
  getFallbackClassification(userRequest, userRole) {
    return {
      intent: this.determineIntentType(userRequest),
      entity: this.extractEntityFromKeywords(userRequest),
      schemaContext: { results: [], fallback: true },
      confidence: 0.2,
      queryParams: this.extractQueryParameters(userRequest, {}),
      userRole,
      fallbackReason: "schema_error",
    };
  }

  /**
   * Initialize the schema knowledge base if not already done
   * @returns {Promise<boolean>} Success status
   */
  async initializeSchemaKnowledge() {
    try {
      await this.schemaIngestor.initialize();
      await this.schemaIngestor.ingestDatabaseSchema();
      console.log(
        "[SchemaAwareIntentClassifier] Schema knowledge base initialized",
      );
      return true;
    } catch (error) {
      console.error(
        "[SchemaAwareIntentClassifier] Failed to initialize schema knowledge:",
        error,
      );
      console.log(
        "[SchemaAwareIntentClassifier] Continuing with fallback classification mode",
      );
      return false;
    }
  }

  /**
   * Get classification statistics for monitoring and debugging
   * @returns {Object} Classification statistics
   */
  getClassificationStats() {
    return {
      confidenceThreshold: this.confidenceThreshold,
      supportedIntents: Object.keys(this.intentPatterns),
      supportedEntities: [
        "orders",
        "customers",
        "products",
        "categories",
        "inventory",
        "suppliers",
      ],
    };
  }
}

module.exports = SchemaAwareIntentClassifier;
