/**
 * SLM Business Service Layer - Intent Classification Service
 *
 * @author Partha Chandramohan
 * @description AI-powered intent understanding with caching and fallback mechanisms
 */

class IntentClassifier {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.maxCacheSize = 1000;
  }

  async classifyIntent(userRequest, ollamaClient) {
    // Check cache first
    const cacheKey = this.generateCacheKey(userRequest);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log('Intent classification cache hit');
      return cached.intent;
    }

    // Fast-fail: Check if Ollama has models before attempting SLM classification
    try {
      const models = await ollamaClient.listAvailableModels();
      if (!models || !models.models || models.models.length === 0) {
        console.log('No models available in Ollama, using fallback');
        return this.classifyWithFallback(userRequest);
      }

      // Use SLM for intent classification
      const intent = await this.classifyWithSLM(userRequest, ollamaClient);

      // Cache the result
      this.cacheIntent(cacheKey, intent);

      return intent;
    } catch (error) {
      console.log('SLM intent classification failed, using fallback');
      return this.classifyWithFallback(userRequest);
    }
  }

  async classifyWithSLM(userRequest, ollamaClient) {
    const prompt = this.buildIntentClassificationPrompt(userRequest);

    const response = await ollamaClient.generateResponse(prompt, {
      temperature: 0.1, // Low temperature for consistent classification
      max_tokens: 200
    });

    return this.parseIntentResponse(response.response || response);
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

  classifyWithFallback(userRequest) {
    const requestLower = userRequest.toLowerCase();

    // Extract limit using improved number parsing
    let limit = this.extractLimit(requestLower);

    // Basic intent classification
    let intent = 'list';
    if (requestLower.includes('how many') || requestLower.includes('count')) {
      intent = 'count';
    } else if (requestLower.includes('find') || requestLower.includes('search')) {
      intent = 'search';
    } else if (requestLower.includes('alert') || requestLower.includes('issue')) {
      intent = 'alert';
    } else if (requestLower.includes('most') || requestLower.includes('top') || requestLower.includes('best') ||
               requestLower.includes('highest') || requestLower.includes('lowest') || requestLower.includes('analyze') ||
               requestLower.includes('who is') || requestLower.includes('which is') ||
               requestLower.includes('marketing') || requestLower.includes('campaign') || requestLower.includes('target') ||
               requestLower.includes('profitable') || requestLower.includes('valuable') || requestLower.includes('segment')) {
      intent = 'analyze';
    }

    // Entity classification with intelligent mapping
    let entity = 'orders';
    if (requestLower.includes('customer')) entity = 'customers';
    else if (requestLower.includes('product') && (requestLower.includes('slow') || requestLower.includes('warehouse') || requestLower.includes('stock'))) entity = 'inventory'; // Products + stock analysis = inventory
    else if (requestLower.includes('product')) entity = 'products';
    else if (requestLower.includes('inventory') || requestLower.includes('stock')) entity = 'inventory';
    else if (requestLower.includes('supplier')) entity = 'suppliers';
    else if (requestLower.includes('warehouse')) entity = 'warehouses';
    else if (requestLower.includes('transaction')) entity = 'transactions';
    else if (requestLower.includes('sales') || requestLower.includes('revenue')) entity = 'sales';

    // Filter classification
    const filters = [];
    if (requestLower.includes('pending')) filters.push('pending');
    if (requestLower.includes('premium')) filters.push('premium');
    if (requestLower.includes('low stock') || requestLower.includes('low_stock')) filters.push('low_stock');
    if (requestLower.includes('high stock') || requestLower.includes('high_stock')) filters.push('high_stock');
    if (requestLower.includes('out of stock') || requestLower.includes('out_of_stock')) filters.push('out_of_stock');
    if (requestLower.includes('slow') || requestLower.includes('slow-moving') || requestLower.includes('overstocked')) filters.push('slow_moving');
    if (requestLower.includes('high priority')) filters.push('high_priority');
    if (requestLower.includes('urgent')) filters.push('urgent');

    // Auto-set limit to 1 for analytical queries asking for "most", "top", "best" etc.
    if (intent === 'analyze' && limit === null) {
      if (requestLower.includes('most') || requestLower.includes('top') ||
          requestLower.includes('best') || requestLower.includes('highest') ||
          requestLower.includes('least') || requestLower.includes('lowest') ||
          requestLower.includes('who is') || requestLower.includes('which is')) {
        limit = 1;
      }
    }

    // Detect if this is a "least" query for reverse sorting
    const isLeastQuery = requestLower.includes('least') || requestLower.includes('lowest');

    return {
      intent,
      entity,
      filters,
      limit,
      sort: this.getDefaultSort(entity),
      confidence: 0.7,
      isLeastQuery
    };
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
      sales: 'order_date'
    };
    return sortDefaults[entity] || null;
  }

  generateCacheKey(userRequest) {
    return userRequest.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  cacheIntent(key, intent) {
    // Clean cache if it's getting too large
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      intent,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
    };
  }
}

module.exports = new IntentClassifier();