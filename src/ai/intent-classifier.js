/**
 * SLM Business Service Layer - Intent Classification Service
 *
 * @author Partha Chandramohan
 * @description AI-powered intent understanding with caching and fallback mechanisms
 */
const LRUCache = require('../utils/lru-cache');
const securityConfig = require('../config/security-config');

class IntentClassifier {
  constructor() {
    const cacheConfig = securityConfig.get('cache');

    // Enhanced caching with separate cache for LM responses
    this.cache = new LRUCache(
      cacheConfig.maxSize || 1000,
      cacheConfig.defaultTTL || 5 * 60 * 1000 // 5 minutes
    );

    // Smart cache for high-quality LM responses (longer TTL)
    this.smartCache = new LRUCache(
      500, // Smaller size for high-quality responses
      30 * 60 * 1000 // 30 minutes for confidence >= 0.9
    );

    // Health monitoring
    this.healthMetrics = {
      lmSuccessCount: 0,
      lmFailureCount: 0,
      fallbackCount: 0,
      cacheHitCount: 0,
      totalRequests: 0,
      lastLMSuccess: null,
      lastLMFailure: null,
      consecutiveFailures: 0
    };

    // LM health status
    this.lmHealthy = true;
    this.lastHealthCheck = Date.now();
    this.healthCheckInterval = 60000; // 1 minute
  }

  async classifyIntent(userRequest, ollamaClient) {
    this.healthMetrics.totalRequests++;
    const cacheKey = this.generateCacheKey(userRequest);

    // Check smart cache first (high-quality responses)
    const smartCached = this.smartCache.get(cacheKey);
    if (smartCached) {
      console.log('[SMART-CACHE] High-quality intent classification cache hit');
      this.healthMetrics.cacheHitCount++;
      return smartCached;
    }

    // Check regular cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('[CACHE] Intent classification cache hit');
      this.healthMetrics.cacheHitCount++;
      return cached;
    }

    // Perform health check if needed
    await this.performHealthCheck(ollamaClient);

    // Decide strategy based on LM health
    if (this.shouldUseLM()) {
      try {
        // Use LM for intent classification and parameter extraction
        const intent = await this.classifyWithLM(userRequest, ollamaClient);

        // Update health metrics
        this.updateHealthMetrics(true);

        // Smart caching: cache high-confidence responses longer
        if (intent.confidence >= 0.9) {
          console.log('[SMART-CACHE] Caching high-confidence response');
          this.smartCache.set(cacheKey, intent);
        } else {
          this.cache.set(cacheKey, intent);
        }

        return intent;
      } catch (error) {
        console.log('[LM-HEALTH] LM classification failed, using fallback:', error.message);
        this.updateHealthMetrics(false);
        return this.classifyWithFallback(userRequest);
      }
    } else {
      console.log('[LM-HEALTH] LM unhealthy, using fallback directly');
      return this.classifyWithFallback(userRequest);
    }
  }

  async classifyWithLM(userRequest, ollamaClient) {
    const prompt = this.buildStructuredIntentPrompt(userRequest);

    const response = await ollamaClient.generateResponse(prompt, 'phi3:mini', {
      temperature: 0.1, // Low temperature for consistent classification
      max_tokens: 300
    });

    return this.parseLMIntentResponse(response.response || response, userRequest);
  }

  buildIntentClassificationPrompt(userRequest) {
    return `You are an expert AI assistant for business data analysis. Your job is to understand natural language requests and convert them into structured database queries.

You have access to a comprehensive business database with these entities and their relationships:

CORE ENTITIES:
- orders: Customer orders with status, dates, amounts, priorities
- customers: Customer profiles, types, loyalty tiers, spending history
- products: Product catalog with categories, suppliers, pricing
- inventory: Stock levels, locations, reservations across warehouses
- suppliers: Vendor information, ratings, performance metrics
- warehouses: Storage facilities, capacities, managers
- transactions: Financial transactions, payments, refunds
- sales: Sales data, revenue, performance metrics

INTENT CATEGORIES (be flexible - these are guidelines, not strict rules):
- list/show/display: Present data in tabular or detailed format
- count/total: Aggregate counting or numerical summaries
- search/find: Locate specific items matching criteria
- analyze: Business intelligence, insights, comparisons, rankings
- alert/warning: Identify issues, problems, or exceptions
- report: Comprehensive summaries and business reports
- compare: Side-by-side analysis of entities
- trend: Time-based analysis and patterns

INTELLIGENT FILTERING (extract meaning, not just keywords):
- Status filters: pending, confirmed, processing, shipped, delivered, cancelled, active, inactive
- Customer types: premium, regular, guest, vip, enterprise, retail
- Stock conditions: low_stock, high_stock, out_of_stock, overstocked, critical
- Priority levels: low, normal, high, urgent, critical
- Time periods: today, yesterday, week, month, quarter, year, recent
- Performance: top, bottom, best, worst, highest, lowest
- Geographic: by location, region, warehouse, store
- Financial: profitable, loss-making, high-value, budget

ADVANCED UNDERSTANDING:
- Detect comparative language: "better than", "worse than", "compared to"
- Understand superlatives: "most", "least", "highest", "lowest", "best", "worst"
- Recognize business context: "profitable customers", "slow-moving inventory", "overdue orders"
- Handle complex queries: "customers who haven't ordered in 6 months"
- Understand implicit entities: "sales" could mean sales data or salespeople depending on context

User Request: "${userRequest}"

Analyze this request considering:
1. What business question is being asked?
2. What data entities are involved?
3. What business logic should be applied?
4. What filters or conditions are implied?
5. What sorting or ranking is needed?
6. How many results are expected?

Respond with a JSON object that captures the business intent:
{
  "intent": "primary_action_being_requested",
  "entity": "primary_data_entity",
  "secondary_entities": ["related_entities_if_any"],
  "filters": ["extracted_conditions"],
  "business_logic": "description_of_business_rules_to_apply",
  "sort_field": "field_to_sort_by",
  "sort_direction": "ASC|DESC|null",
  "limit": number_or_null,
  "time_scope": "time_period_if_relevant",
  "confidence": 0.0_to_1.0,
  "query_complexity": "simple|moderate|complex",
  "requires_joins": true_or_false,
  "business_context": "brief_description_of_business_meaning"
}

Examples:
"Show me 5 pending orders" → {"intent":"list","entity":"orders","secondary_entities":[],"filters":["pending"],"business_logic":"active orders awaiting processing","sort_field":"order_date","sort_direction":"DESC","limit":5,"time_scope":null,"confidence":0.95,"query_complexity":"simple","requires_joins":false,"business_context":"operational order management"}

"Who are our most valuable customers by lifetime spending?" → {"intent":"analyze","entity":"customers","secondary_entities":["orders"],"filters":[],"business_logic":"rank customers by total purchase value","sort_field":"total_spent","sort_direction":"DESC","limit":null,"time_scope":"lifetime","confidence":0.95,"query_complexity":"moderate","requires_joins":true,"business_context":"customer value analysis for retention strategy"}

"Which products are slow-moving and taking up warehouse space?" → {"intent":"analyze","entity":"inventory","secondary_entities":["products","warehouses"],"filters":["slow_moving","high_stock"],"business_logic":"identify products with low turnover consuming storage","sort_field":"days_since_last_sale","sort_direction":"DESC","limit":null,"time_scope":"recent","confidence":0.9,"query_complexity":"complex","requires_joins":true,"business_context":"inventory optimization and space management"}`;
  }

  buildStructuredIntentPrompt(userRequest) {
    return `You are a business data analyst AI. Extract intent and parameters from natural language business queries.

Database Schema Context:
- orders: customer_id, order_date, status (pending, confirmed, processing, shipped, delivered, cancelled), total_amount
- order_items: order_id, product_id, product_name, sku, quantity, unit_price, line_total
- customers: customer_id, first_name, last_name, customer_type (premium, regular, vip), total_spent
- products: product_id, product_name, category, price, supplier_id
- inventory: product_id, warehouse_id, quantity_available, reorder_level
- suppliers: supplier_id, supplier_name, rating, performance_score

User Request: "${userRequest}"

Extract and return ONLY valid JSON in this exact format:
{
  "intent": "list|count|search|analyze",
  "entity": "orders|order_items|customers|products|inventory|suppliers",
  "filters": {
    "customer_name": "FirstName",
    "status": "status_value",
    "customer_type": "type_value",
    "product_name": "product_value"
  },
  "sort": "relevant_field_name",
  "limit": number_or_null,
  "confidence": 0.9
}

Examples:
"What did David buy?" → {"intent":"list","entity":"order_items","filters":{"customer_name":"David"},"sort":"product_name","limit":null,"confidence":0.95}
"Show me what Sarah Johnson ordered" → {"intent":"list","entity":"order_items","filters":{"customer_name":"Sarah Johnson"},"sort":"product_name","limit":null,"confidence":0.95}
"Show 5 pending orders" → {"intent":"list","entity":"orders","filters":{"status":"pending"},"sort":"order_date","limit":5,"confidence":0.95}
"Count premium customers" → {"intent":"count","entity":"customers","filters":{"customer_type":"premium"},"sort":null,"limit":null,"confidence":0.9}
"Who are the top customers?" → {"intent":"analyze","entity":"customers","filters":{},"sort":"total_spent","limit":null,"confidence":0.85}

Respond with JSON only, no explanations:`;
  }

  parseIntentResponse(response) {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const intent = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!intent.intent || !intent.entity) {
        throw new Error('Missing required fields in intent');
      }

      // Transform enhanced format to backward-compatible format
      const transformedIntent = {
        intent: intent.intent,
        entity: intent.entity,
        filters: intent.filters || [],
        limit: intent.limit || null,
        sort: intent.sort_field || intent.sort || null,
        confidence: intent.confidence || 0.5,

        // Enhanced fields for advanced processing
        secondary_entities: intent.secondary_entities || [],
        business_logic: intent.business_logic || '',
        sort_direction: intent.sort_direction || null,
        time_scope: intent.time_scope || null,
        query_complexity: intent.query_complexity || 'simple',
        requires_joins: intent.requires_joins || false,
        business_context: intent.business_context || '',

        // Detect least queries from sort direction or business logic
        isLeastQuery: intent.sort_direction === 'ASC' ||
                     (intent.business_logic && intent.business_logic.toLowerCase().includes('least')) ||
                     (intent.business_context && intent.business_context.toLowerCase().includes('least'))
      };

      return transformedIntent;
    } catch (error) {
      console.error('Failed to parse intent response:', error);
      throw new Error('Invalid intent response format');
    }
  }

  parseLMIntentResponse(response, originalRequest) {
    try {
      console.log(`[LM-PARSER] Parsing LM response for: "${originalRequest}"`);
      console.log(`[LM-PARSER] Raw response:`, response);

      // Extract JSON from response - use proper balance counting
      let jsonStart = response.indexOf('{');
      if (jsonStart === -1) {
        throw new Error('No JSON found in LM response');
      }

      let braceCount = 0;
      let jsonEnd = jsonStart;

      for (let i = jsonStart; i < response.length; i++) {
        if (response[i] === '{') braceCount++;
        if (response[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }

      let jsonString = response.substring(jsonStart, jsonEnd + 1);

      // Clean and normalize JSON string
      jsonString = jsonString
        .replace(/\n/g, ' ')        // Replace newlines with spaces
        .replace(/\s+/g, ' ')       // Normalize multiple spaces
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        .trim();

      console.log(`[LM-PARSER] Cleaned JSON:`, jsonString);

      const parsed = JSON.parse(jsonString);

      // Validate required fields
      if (!parsed.intent || !parsed.entity) {
        throw new Error('Missing required fields (intent, entity) in LM response');
      }

      // Transform LM response to backward-compatible format
      const transformedIntent = {
        intent: parsed.intent,
        entity: parsed.entity,
        filters: [],
        limit: parsed.limit || null,
        sort: parsed.sort || this.getDefaultSort(parsed.entity),
        confidence: parsed.confidence || 0.8,

        // Extract queryParams from LM filters for SQL generator compatibility
        queryParams: {},

        // Store original request for validation
        originalRequest: originalRequest
      };

      // Convert LM filters object to backward-compatible format
      if (parsed.filters) {
        // Handle customer_name
        if (parsed.filters.customer_name) {
          transformedIntent.queryParams.customer_name = parsed.filters.customer_name;
          transformedIntent.filters.push('customer_filter');
        }

        // Handle status
        if (parsed.filters.status) {
          transformedIntent.queryParams.status = parsed.filters.status;
          transformedIntent.filters.push(parsed.filters.status);
        }

        // Handle customer_type
        if (parsed.filters.customer_type) {
          transformedIntent.queryParams.customer_type = parsed.filters.customer_type;
          transformedIntent.filters.push(parsed.filters.customer_type);
        }

        // Handle product_name
        if (parsed.filters.product_name) {
          transformedIntent.queryParams.product_name = parsed.filters.product_name;
          transformedIntent.filters.push('product_filter');
        }
      }

      console.log(`[LM-PARSER] Transformed intent:`, transformedIntent);
      return transformedIntent;

    } catch (error) {
      console.error('[LM-PARSER] Failed to parse LM response:', error.message);
      console.error('[LM-PARSER] Raw response was:', response);
      throw new Error(`Invalid LM response format: ${error.message}`);
    }
  }

  classifyWithFallback(userRequest) {
    console.log('[FALLBACK] Using simplified fallback classification for:', userRequest);

    const requestLower = userRequest.toLowerCase();

    // Simple intent classification
    let intent = 'list';
    if (requestLower.includes('count') || requestLower.includes('how many')) {
      intent = 'count';
    } else if (requestLower.includes('search') || requestLower.includes('find')) {
      intent = 'search';
    } else if (requestLower.includes('analyze') || requestLower.includes('top') || requestLower.includes('best')) {
      intent = 'analyze';
    }

    // Simple entity classification with special handling for "what did [name] order" queries
    let entity = 'orders';
    if (requestLower.includes('customer')) entity = 'customers';
    else if (requestLower.includes('product')) entity = 'products';
    else if (requestLower.includes('inventory') || requestLower.includes('stock')) entity = 'inventory';
    else if (requestLower.includes('supplier')) entity = 'suppliers';

    // Special case: "what did [name] order/buy" should return order items (products)
    if (requestLower.match(/(what did|what has).+(order|buy|purchase)/i)) {
      entity = 'order_items';
    }

    // Basic filter and parameter extraction
    const filters = [];
    const queryParams = this.extractQueryParams(requestLower, userRequest);

    // Extract status
    if (requestLower.includes('pending')) {
      filters.push('pending');
      queryParams.status = 'pending';
    }

    return {
      intent,
      entity,
      filters,
      limit: null,
      sort: this.getDefaultSort(entity),
      confidence: 0.6, // Lower confidence for fallback
      queryParams,
      originalRequest: userRequest
    };
  }

  extractQueryParams(requestLower, originalRequest) {
    const params = {};

    // Extract customer names - improved to handle full names like "Sarah Johnson"
    console.log(`[DEBUG] Extracting params from: "${originalRequest}"`);

    // Try the most specific pattern first: "what did [full name] order/buy"
    let match = originalRequest.match(/what did\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:order|buy|purchase)/i);
    if (match && match[1]) {
      params.customer_name = match[1].trim();
      console.log(`[DEBUG] Found customer name: ${params.customer_name}`);
    } else {
      // Try other patterns for full names
      const customerPatterns = [
        /(?:what has)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:buy|bought|order|purchase)/i,
        /(?:show me what)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:order|buy|purchase)/i,
        /(?:orders? (?:for|from|by)|purchases? (?:for|from|by))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:buy|bought|order|purchase|orders?)/i,
        /(?:customer|client)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
      ];

      for (const pattern of customerPatterns) {
        const match = originalRequest.match(pattern);
        if (match && match[1]) {
          params.customer_name = match[1].trim();
          console.log(`[DEBUG] Found customer name: ${params.customer_name}`);
          break;
        }
      }
    }

    // Extract product names
    const productPatterns = [
      /(?:product|item)\s+([a-zA-Z0-9\s]+)/i,
      /(?:show|find|get)\s+([a-zA-Z0-9\s]+)\s+(?:products?|items?)/i
    ];

    for (const pattern of productPatterns) {
      const match = originalRequest.match(pattern);
      if (match && match[1]) {
        params.product_name = match[1].trim();
        break;
      }
    }

    // Extract status values
    if (requestLower.includes('pending')) params.status = 'pending';
    else if (requestLower.includes('confirmed')) params.status = 'confirmed';
    else if (requestLower.includes('processing')) params.status = 'processing';
    else if (requestLower.includes('shipped')) params.status = 'shipped';
    else if (requestLower.includes('delivered')) params.status = 'delivered';
    else if (requestLower.includes('cancelled')) params.status = 'cancelled';

    // Extract customer type
    if (requestLower.includes('premium')) params.customer_type = 'premium';
    else if (requestLower.includes('regular')) params.customer_type = 'regular';
    else if (requestLower.includes('vip')) params.customer_type = 'vip';

    console.log(`[DEBUG] Final extracted params:`, params);
    return params;
  }

  extractLimit(requestLower) {
    // Number words mapping
    const numberWords = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
      'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20
    };

    // Try numeric patterns first - improved to handle various number patterns
    let limitMatch = requestLower.match(/(?:top|first|show(?:\s+me)?|get|find)\s+(\d+)|(\d+)\s+(?:records?|items?|entries?|orders?|alerts?|customers?|products?|stock|high\s+stock|low\s+stock)/);
    let limit = limitMatch ? parseInt(limitMatch[1] || limitMatch[2]) : null;

    // Try written numbers - improved to handle "show me two" and "two items" patterns
    if (!limit) {
      const wordPattern = Object.keys(numberWords).join('|');
      const wordMatch = requestLower.match(new RegExp(`(?:top|first|show(?:\\s+me)?|get|find)\\s+(${wordPattern})|(${wordPattern})\\s+(?:records?|items?|entries?|orders?|alerts?|customers?|products?|stock|high\\s+stock|low\\s+stock)`));
      if (wordMatch) {
        const wordNumber = wordMatch[1] || wordMatch[2];
        limit = numberWords[wordNumber];
      }
    }

    return limit;
  }

  getDefaultSort(entity) {
    const sortDefaults = {
      orders: 'order_date',
      customers: 'total_spent',
      products: 'product_name',
      inventory: 'quantity_available',
      suppliers: 'rating',
      warehouses: 'warehouse_name',
      transactions: 'created_at',
      sales: 'order_date',
      order_items: 'product_name'
    };
    return sortDefaults[entity] || null;
  }

  async performHealthCheck(ollamaClient) {
    const now = Date.now();

    // Only check health if enough time has passed
    if (now - this.lastHealthCheck < this.healthCheckInterval) {
      return;
    }

    try {
      console.log('[HEALTH-CHECK] Performing LM health check...');
      const testPrompt = "Reply with JSON: {\"status\":\"healthy\"}";

      const response = await ollamaClient.generateResponse(testPrompt, 'phi3:mini', {
        temperature: 0.1,
        max_tokens: 50
      });

      // Simple test - if we get any response, consider LM healthy
      if (response && (response.response || response)) {
        this.lmHealthy = true;
        this.consecutiveFailures = 0;
        console.log('[HEALTH-CHECK] LM is healthy');
      } else {
        throw new Error('No response from LM');
      }

    } catch (error) {
      this.consecutiveFailures++;
      console.log(`[HEALTH-CHECK] LM health check failed (${this.consecutiveFailures} consecutive failures):`, error.message);

      // Mark as unhealthy after 3 consecutive failures
      if (this.consecutiveFailures >= 3) {
        this.lmHealthy = false;
        console.log('[HEALTH-CHECK] LM marked as unhealthy');
      }
    }

    this.lastHealthCheck = now;
  }

  shouldUseLM() {
    // Don't use LM if it's unhealthy
    if (!this.lmHealthy) {
      return false;
    }

    // Don't use LM if failure rate is too high (>50% in recent requests)
    const totalRecentRequests = this.healthMetrics.lmSuccessCount + this.healthMetrics.lmFailureCount;
    if (totalRecentRequests >= 10) {
      const failureRate = this.healthMetrics.lmFailureCount / totalRecentRequests;
      if (failureRate > 0.5) {
        console.log(`[LM-HEALTH] High failure rate (${(failureRate * 100).toFixed(1)}%), using fallback`);
        return false;
      }
    }

    return true;
  }

  updateHealthMetrics(success) {
    if (success) {
      this.healthMetrics.lmSuccessCount++;
      this.healthMetrics.lastLMSuccess = Date.now();
      this.healthMetrics.consecutiveFailures = 0;
    } else {
      this.healthMetrics.lmFailureCount++;
      this.healthMetrics.lastLMFailure = Date.now();
      this.healthMetrics.consecutiveFailures++;
      this.healthMetrics.fallbackCount++;
    }

    // Reset counters periodically to prevent overflow
    const totalRequests = this.healthMetrics.lmSuccessCount + this.healthMetrics.lmFailureCount;
    if (totalRequests > 1000) {
      console.log('[HEALTH-METRICS] Resetting metrics counters');
      this.healthMetrics.lmSuccessCount = Math.floor(this.healthMetrics.lmSuccessCount / 2);
      this.healthMetrics.lmFailureCount = Math.floor(this.healthMetrics.lmFailureCount / 2);
      this.healthMetrics.fallbackCount = Math.floor(this.healthMetrics.fallbackCount / 2);
    }
  }

  generateCacheKey(userRequest) {
    return userRequest.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  clearCache() {
    this.cache.clear();
    this.smartCache.clear();
    console.log('[CACHE] All caches cleared');
  }

  getCacheStats() {
    return {
      regular_cache: this.cache.getStats(),
      smart_cache: this.smartCache.getStats(),
      health_metrics: this.healthMetrics,
      lm_healthy: this.lmHealthy,
      last_health_check: new Date(this.lastHealthCheck).toISOString()
    };
  }
}

module.exports = new IntentClassifier();