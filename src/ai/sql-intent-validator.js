/**
 * SQL-Intent Validation Service
 *
 * @author Partha Chandramohan
 * @description Validates that generated SQL queries match the user's intent and schema constraints
 */

class SQLIntentValidator {
  constructor() {
    this.maxRetries = 3;
    this.validationCache = new Map();
  }

  /**
   * Validates if the generated SQL matches the classified intent
   * @param {Object} intent - The classified intent
   * @param {string} sql - The generated SQL query
   * @param {Object} ollamaClient - Ollama client for LM validation
   * @param {Object} schema - Database schema information
   * @param {string} originalRequest - Original user request for intent validation
   * @returns {Object} Validation result with score and issues
   */
  async validateSQLMatchesIntent(
    intent,
    sql,
    ollamaClient,
    schema,
    originalRequest = "",
    validationModel = "phi3:mini",
  ) {
    const cacheKey = this.generateValidationCacheKey(intent, sql);

    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey);
    }

    try {
      // Perform validation checks
      // NOTE: Disabled LLM-based intent classification due to hallucination issues
      // Using only reliable rule-based and lightweight LLM validations
      const validations = await Promise.all([
        // this.validateIntentClassification(intent, originalRequest, ollamaClient, validationModel),  // DISABLED: causes hallucinations
        // this.validateIntentEntityMapping(intent, sql, ollamaClient, validationModel),  // DISABLED: causes hallucinations
        this.validateFilterApplication(intent, sql),  // Rule-based, reliable
        this.validateSchemaCompliance(sql, schema),  // Rule-based, reliable
        // this.validateBusinessLogic(intent, sql, ollamaClient, validationModel),  // DISABLED: causes hallucinations
      ]);

      // Add simple intent validation (rule-based)
      const simpleIntentValidation = this.simpleIntentValidation(intent, sql);
      validations.unshift(simpleIntentValidation);

      const result = this.combineValidationResults(validations);

      // Cache successful validations
      if (result.isValid) {
        this.validationCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      console.error("[SQL-Validator] Validation failed:", error);
      return {
        isValid: false,
        score: 0,
        issues: [`Validation error: ${error.message}`],
        recommendations: ["Use fallback SQL generation"],
      };
    }
  }

  /**
   * Simple rule-based intent validation (no LLM, no hallucinations)
   */
  simpleIntentValidation(intent, sql) {
    const issues = [];
    const recommendations = [];
    let score = 1.0;

    // Check if SQL contains the expected entity
    const sqlLower = sql.toLowerCase();
    const entity = intent.entity.toLowerCase();
    
    if (!sqlLower.includes(entity)) {
      issues.push(`SQL doesn't query the expected entity: ${intent.entity}`);
      score -= 0.3;
    }

    // Check if SQL has SELECT (basic sanity check)
    if (!sqlLower.includes('select')) {
      issues.push('SQL missing SELECT statement');
      score -= 0.5;
    }

    // Check if SQL has FROM (basic sanity check)
    if (!sqlLower.includes('from')) {
      issues.push('SQL missing FROM clause');
      score -= 0.5;
    }

    return {
      type: "simple-intent-validation",
      score: Math.max(0, score),
      issues,
      recommendations,
      isValid: score >= 0.6,
    };
  }

  /**
   * Validates if the intent classification itself is correct based on the original user request
   * NOTE: DISABLED - causes LLM hallucinations about endocrine disruptors and other random topics
   */
  async validateIntentClassification(intent, originalRequest, ollamaClient, model = "phi3:mini") {
    if (!originalRequest) {
      return {
        type: "intent-classification",
        score: 1.0,
        issues: [],
        recommendations: [],
        isValid: true,
      };
    }

    const prompt = `Analyze if this intent classification matches the user's original request:

ORIGINAL USER REQUEST:
"${originalRequest}"

CLASSIFIED INTENT:
- Intent: ${intent.intent}
- Entity: ${intent.entity}
- Filters: ${JSON.stringify(intent.filters || [])}
- Query Parameters: ${JSON.stringify(intent.queryParams || {})}

VALIDATION RULES:
1. If user asks "what did [name] order/buy/purchase", entity should be "order_items" (not "orders")
2. If user asks "show me orders", entity should be "orders"
3. If user asks about products/items someone bought, they want product details (order_items)
4. If user asks about order summaries/status, they want order information (orders)

CRITICAL PATTERNS:
- "what did [name] order" → should be entity: "order_items"
- "what has [name] bought" → should be entity: "order_items"
- "show me what [name] ordered" → should be entity: "order_items"
- "list [name]'s orders" → should be entity: "orders"

Check if the classified entity matches the user's actual intent.

CRITICAL: Return ONLY valid JSON. No comments, no explanations, no extra text.
Do NOT include // or /* */ comments in or around the JSON.

Respond with this exact JSON format:
{
  "classificationCorrect": true,
  "correctEntity": "order_items",
  "overallScore": 0.8,
  "issues": ["issue text"],
  "recommendations": ["recommendation text"]
}`;

    const response = await ollamaClient.generateResponse(prompt, model, {
      temperature: 0.1,
      max_tokens: 300,
      timeout: 30000,
    });

    return this.parseLMValidationResponse(
      response.response || response,
      "intent-classification",
    );
  }

  /**
   * Validates that the SQL query targets the correct entity as per intent
   */
  async validateIntentEntityMapping(intent, sql, ollamaClient, model = "phi3:mini") {
    const prompt = `Analyze if this SQL query matches the user's intent:

INTENT ANALYSIS:
- Intent: ${intent.intent}
- Entity: ${intent.entity}
- Filters: ${JSON.stringify(intent.filters || [])}
- Query Parameters: ${JSON.stringify(intent.queryParams || {})}

GENERATED SQL:
${sql}

VALIDATION RULES:
1. Entity Mapping: Does the SQL query the correct main entity (${intent.entity})?
2. Filter Application: Are the specified filters (${intent.filters?.join(", ") || "none"}) applied in WHERE clause?
3. Customer Filtering: If customer_name is specified (${intent.queryParams?.customer_name || "none"}), is it properly filtered?
4. Result Type: Does the query return the right type of data for the intent?

Specific Intent Analysis:
- If intent.entity is "order_items", SQL should JOIN order_items with orders and customers
- If customer_name is specified, WHERE clause must filter by customer name
- If intent is "list" for "order_items", should return product details, not just order summaries

CRITICAL: Return ONLY valid JSON. No comments, no explanations, no extra text.
Do NOT include // or /* */ comments in or around the JSON.

Respond with this exact JSON format:
{
  "entityMatch": true,
  "filtersApplied": true,
  "customerFilterCorrect": true,
  "resultTypeCorrect": true,
  "overallScore": 0.8,
  "issues": ["issue text"],
  "recommendations": ["recommendation text"]
}`;

    const response = await ollamaClient.generateResponse(prompt, model, {
      temperature: 0.1,
      max_tokens: 400,
      timeout: 30000, // 30 second timeout for validation
    });

    return this.parseLMValidationResponse(
      response.response || response,
      "entity-mapping",
    );
  }

  /**
   * Validates filter application in SQL
   */
  validateFilterApplication(intent, sql) {
    const issues = [];
    const recommendations = [];
    let score = 1.0;

    // Check if customer name filter is applied when specified
    if (intent.queryParams?.customer_name) {
      const hasCustomerFilter =
        sql.toLowerCase().includes("where") &&
        (sql.toLowerCase().includes("first_name") ||
          sql.toLowerCase().includes("last_name") ||
          sql.toLowerCase().includes("customer_name"));

      if (!hasCustomerFilter) {
        issues.push(
          `Customer name filter "${intent.queryParams.customer_name}" not applied in WHERE clause`,
        );
        recommendations.push("Add customer name filtering to WHERE clause");
        score -= 0.4;
      }
    }

    // Check entity-specific filtering
    if (
      intent.entity === "order_items" &&
      !sql.toLowerCase().includes("order_items")
    ) {
      issues.push(
        "Intent specifies order_items but SQL does not query order_items table",
      );
      recommendations.push(
        "Change FROM clause to include order_items table with proper JOINs",
      );
      score -= 0.5;
    }

    // Check status filters
    if (
      intent.filters?.includes("pending") &&
      !sql.toLowerCase().includes("status")
    ) {
      issues.push("Status filter not applied");
      recommendations.push("Add status filtering to WHERE clause");
      score -= 0.2;
    }

    return {
      type: "filter-application",
      score: Math.max(0, score),
      issues,
      recommendations,
      isValid: score >= 0.6,  // Lowered to allow minor filter issues
    };
  }

  /**
   * Validates SQL schema compliance
   */
  validateSchemaCompliance(sql, schema) {
    const issues = [];
    const recommendations = [];
    let score = 1.0;

    // Extract table names from SQL
    const tableMatches = sql.match(/(?:FROM|JOIN)\s+(\w+)/gi);
    if (tableMatches) {
      for (const match of tableMatches) {
        const tableName = match.replace(/(?:FROM|JOIN)\s+/i, "").trim();
        if (tableName && !schema.tables[tableName]) {
          issues.push(`Unknown table: ${tableName}`);
          recommendations.push(`Use valid table name instead of ${tableName}`);
          score -= 0.3;
        }
      }
    }

    // Extract column references and validate
    const columnMatches = sql.match(/\w+\.\w+/g);
    if (columnMatches) {
      for (const columnRef of columnMatches) {
        const [table, column] = columnRef.split(".");
        const tableSchema = schema.tables[table];
        if (tableSchema && !tableSchema.columns.includes(column)) {
          issues.push(`Column ${column} does not exist in table ${table}`);
          recommendations.push(
            `Use valid column from ${table}: ${tableSchema.columns.join(", ")}`,
          );
          score -= 0.2;
        }
      }
    }

    return {
      type: "schema-compliance",
      score: Math.max(0, score),
      issues,
      recommendations,
      isValid: score >= 0.6,  // Lowered to allow minor schema issues
    };
  }

  /**
   * Validates business logic alignment
   */
  async validateBusinessLogic(intent, sql, ollamaClient, model = "phi3:mini") {
    const prompt = `Analyze if this SQL query implements correct business logic:

USER REQUEST INTENT:
${JSON.stringify(intent, null, 2)}

GENERATED SQL:
${sql}

BUSINESS LOGIC VALIDATION:
1. If user asks "what did [customer] order/buy", should return PRODUCTS/ITEMS, not order summaries
2. If customer_name is specified, results should be filtered to ONLY that customer
3. If intent.entity is "order_items", should show product names, quantities, prices
4. JOIN logic should be appropriate for the data relationships

Rate this query's business logic alignment (0.0-1.0) and provide specific feedback.

CRITICAL: Return ONLY valid JSON. No comments, no explanations, no extra text.
Do NOT include // comments or any text outside the JSON object.

Respond with this exact JSON format:
{
  "businessLogicScore": 0.8,
  "correctDataType": true,
  "correctFiltering": true,
  "correctJoins": true,
  "issues": ["issue 1", "issue 2"],
  "recommendations": ["rec 1", "rec 2"]
}`;

    const response = await ollamaClient.generateResponse(prompt, model, {
      temperature: 0.1,
      max_tokens: 300,
      timeout: 30000, // 30 second timeout for validation
    });

    return this.parseLMValidationResponse(
      response.response || response,
      "business-logic",
    );
  }

  /**
   * Combines multiple validation results into a single score
   */
  combineValidationResults(validations) {
    const totalScore =
      validations.reduce((sum, v) => sum + (v.score || 0), 0) /
      validations.length;
    const allIssues = validations.flatMap((v) => v.issues || []);
    const allRecommendations = validations.flatMap(
      (v) => v.recommendations || [],
    );

    // Check each validation
    const invalidValidations = validations.filter((v) => v.isValid === false);
    const criticalFailures = validations.filter((v) => v.type === 'schema-compliance' && v.isValid === false);
    
    // More lenient validation strategy:
    // - Accept if score >= 0.65 (lowered from 0.70)
    // - Allow validation failures UNLESS it's a critical schema compliance issue
    // - Prioritize functional SQL over perfect validation scores
    const scoreThresholdMet = totalScore >= 0.65;  
    const noCriticalFailures = criticalFailures.length === 0;  // Only block on schema failures
    const isValid = scoreThresholdMet && noCriticalFailures;

    console.log(`[SQL-Validator] Combined validation: score=${totalScore.toFixed(2)}, threshold=0.65, scoreOK=${scoreThresholdMet}, explicitFailures=${invalidValidations.length}, criticalFailures=${criticalFailures.length}, isValid=${isValid}`);

    return {
      isValid,
      score: totalScore,
      issues: allIssues,
      recommendations: allRecommendations,
      validationDetails: validations,
    };
  }

  /**
   * Generates SQL improvement suggestions based on validation results
   */
  generateSQLImprovementPrompt(intent, sql, validationResult) {
    return `Fix this SQL query to better match the user's intent:

ORIGINAL INTENT:
${JSON.stringify(intent, null, 2)}

CURRENT SQL (NEEDS IMPROVEMENT):
${sql}

VALIDATION ISSUES FOUND:
${validationResult.issues.map((issue) => `- ${issue}`).join("\n")}

RECOMMENDATIONS:
${validationResult.recommendations.map((rec) => `- ${rec}`).join("\n")}

CRITICAL OUTPUT FORMAT REQUIREMENTS:
- Return ONLY the SQL query itself (no explanations, no markdown, no additional text)
- Do NOT include ANY SQL comments (no -- or /* */ style comments)
- Do NOT include explanatory text before or after the query
- Do NOT use semicolons except at the very end of the query
- The response must be executable SQL only

CRITICAL REQUIREMENTS:
1. If intent.entity is "order_items", query order_items table with proper JOINs
2. If customer_name is specified, apply customer filtering in WHERE clause
3. Return the correct data type (products vs orders vs summaries)
4. Use only valid schema tables and columns

Generate ONLY an improved SQL query that addresses all issues (NO explanations or comments):`;
  }

  /**
   * Parse LM validation responses
   */
  parseLMValidationResponse(response, validationType) {
    try {
      // Remove any comments before parsing
      let cleaned = response;
      
      // Remove line comments // ...
      cleaned = cleaned.replace(/\/\/[^\r\n]*/g, '');
      
      // Remove block comments /* ... */
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
      
      // Extract JSON object
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LM response");
      }

      // Clean the JSON string more aggressively
      let jsonStr = jsonMatch[0];
      
      // Remove any remaining comments within the JSON
      jsonStr = jsonStr.replace(/\/\/[^\r\n]*/g, '');
      jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
      
      const parsed = JSON.parse(jsonStr);

      return {
        type: validationType,
        score: parsed.overallScore || parsed.businessLogicScore || 0.5,
        issues: parsed.issues || [],
        recommendations: parsed.recommendations || [],
        isValid:
          (parsed.overallScore || parsed.businessLogicScore || 0.5) >= 0.6,  // Lowered to 0.6
        details: parsed,
      };
    } catch (error) {
      console.error(
        `[SQL-Validator] Failed to parse ${validationType} response:`,
        error,
      );
      console.error(`[SQL-Validator] Raw response:`, response);
      return {
        type: validationType,
        score: 0.3,
        issues: [`Failed to validate ${validationType}`],
        recommendations: ["Manual review required"],
        isValid: false,
      };
    }
  }

  /**
   * Generate cache key for validation results
   */
  generateValidationCacheKey(intent, sql) {
    const intentKey = JSON.stringify({
      intent: intent.intent,
      entity: intent.entity,
      filters: intent.filters,
      queryParams: intent.queryParams,
    });
    return `${Buffer.from(intentKey).toString("base64")}_${Buffer.from(sql).toString("base64").slice(0, 32)}`;
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.validationCache.clear();
  }
}

module.exports = new SQLIntentValidator();
