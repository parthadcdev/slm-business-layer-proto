/**
 * SLM Business Service Layer - Intelligent Cache Service
 *
 * @author Partha Chandramohan
 * @description Smart caching system for validated queries with semantic similarity matching
 */

const LRUCache = require('../utils/lru-cache');
const contextProvider = require('./context-provider');

class IntelligentCacheService {
  constructor() {
    // Multi-tier caching strategy
    this.validatedQueryCache = new LRUCache(1000, 24 * 60 * 60 * 1000); // 1000 entries, 24h TTL
    this.intentPatternCache = new LRUCache(500, 12 * 60 * 60 * 1000);    // 500 patterns, 12h TTL
    this.resultCache = new LRUCache(2000, 6 * 60 * 60 * 1000);          // 2000 results, 6h TTL

    // Semantic similarity threshold for cache hits
    this.similarityThreshold = 0.85;
    this.exactMatchThreshold = 0.95;

    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      semantic_matches: 0,
      exact_matches: 0,
      cache_saves: 0,
      query_time_saved: 0
    };

    // Query pattern recognition
    this.queryPatterns = new Map();
    this.semanticKeywords = this.initializeSemanticKeywords();
  }

  /**
   * Initialize semantic keyword mappings for smart matching
   */
  initializeSemanticKeywords() {
    return {
      customer_value: ['valuable', 'best', 'top', 'premium', 'highest spending', 'most profitable'],
      order_status: ['pending', 'completed', 'shipped', 'cancelled', 'processing'],
      time_ranges: ['today', 'yesterday', 'week', 'month', 'year', 'recent', 'latest'],
      metrics: ['total', 'sum', 'count', 'average', 'maximum', 'minimum'],
      entities: ['customer', 'order', 'product', 'inventory', 'supplier'],
      actions: ['list', 'show', 'find', 'get', 'search', 'analyze']
    };
  }

  /**
   * Check cache for similar validated queries
   */
  async findCachedQuery(userRequest, intent) {
    const startTime = Date.now();

    try {
      // Generate search keys
      const exactKey = this.generateExactKey(userRequest, intent);
      const semanticKey = this.generateSemanticKey(userRequest, intent);

      console.log(`[IntelligentCache] Searching cache for: "${userRequest}"`);

      // Try exact match first
      const exactMatch = this.validatedQueryCache.get(exactKey);
      if (exactMatch) {
        this.metrics.hits++;
        this.metrics.exact_matches++;
        this.metrics.query_time_saved += (Date.now() - startTime);

        console.log(`[IntelligentCache] Exact match found for key: ${exactKey}`);
        return {
          cache_hit: true,
          match_type: 'exact',
          cached_result: exactMatch,
          confidence: 1.0,
          time_saved: Date.now() - startTime
        };
      }

      // Try semantic similarity matching
      const semanticMatch = await this.findSemanticMatch(userRequest, intent, semanticKey);
      if (semanticMatch) {
        this.metrics.hits++;
        this.metrics.semantic_matches++;
        this.metrics.query_time_saved += (Date.now() - startTime);

        console.log(`[IntelligentCache] Semantic match found with confidence: ${semanticMatch.confidence}`);
        return {
          cache_hit: true,
          match_type: 'semantic',
          cached_result: semanticMatch.result,
          confidence: semanticMatch.confidence,
          time_saved: Date.now() - startTime,
          original_query: semanticMatch.original_query
        };
      }

      // No cache hit
      this.metrics.misses++;
      console.log(`[IntelligentCache] No cache match found`);

      return {
        cache_hit: false,
        search_time: Date.now() - startTime
      };

    } catch (error) {
      console.error('[IntelligentCache] Cache search error:', error.message);
      this.metrics.misses++;
      return { cache_hit: false, error: error.message };
    }
  }

  /**
   * Cache a validated query with metadata
   */
  async cacheValidatedQuery(userRequest, intent, sqlQuery, queryResult, validationResult) {
    try {
      const cacheEntry = {
        user_request: userRequest,
        intent: intent,
        sql_query: sqlQuery,
        query_result: queryResult,
        validation: {
          consensus_score: validationResult.consensus_score,
          confidence_score: validationResult.confidence_score,
          recommendation: validationResult.recommendation
        },
        metadata: {
          cached_at: new Date().toISOString(),
          query_time: queryResult.execution_time || 0,
          result_count: queryResult.rows ? queryResult.rows.length : 0,
          tables_used: this.extractTablesFromSQL(sqlQuery),
          semantic_keywords: this.extractSemanticKeywords(userRequest)
        },
        usage_stats: {
          access_count: 0,
          last_accessed: null
        }
      };

      // Generate cache keys
      const exactKey = this.generateExactKey(userRequest, intent);
      const semanticKey = this.generateSemanticKey(userRequest, intent);

      // Cache with multiple keys for different matching strategies
      this.validatedQueryCache.set(exactKey, cacheEntry);

      // Also cache semantic patterns
      const patternKey = this.generatePatternKey(intent);
      this.intentPatternCache.set(patternKey, {
        pattern: intent,
        sql_template: this.createSQLTemplate(sqlQuery),
        examples: [userRequest],
        cached_at: new Date().toISOString()
      });

      // Update query patterns for learning
      this.updateQueryPatterns(userRequest, intent, sqlQuery);

      this.metrics.cache_saves++;
      console.log(`[IntelligentCache] Cached validated query with keys: ${exactKey}, pattern: ${patternKey}`);

      return {
        cached: true,
        cache_key: exactKey,
        pattern_key: patternKey,
        cache_size: this.validatedQueryCache.size
      };

    } catch (error) {
      console.error('[IntelligentCache] Cache save error:', error.message);
      return { cached: false, error: error.message };
    }
  }

  /**
   * Find semantic matches using keyword similarity
   */
  async findSemanticMatch(userRequest, intent, semanticKey) {
    const userKeywords = this.extractSemanticKeywords(userRequest);
    const intentSignature = this.createIntentSignature(intent);

    let bestMatch = null;
    let bestScore = 0;

    // Search through cached entries
    for (const [cacheKey, cacheEntry] of this.validatedQueryCache.getAllEntries()) {
      try {
        const cachedKeywords = cacheEntry.metadata?.semantic_keywords || [];
        const cachedIntent = cacheEntry.intent || {};

        // Calculate similarity scores
        const keywordSimilarity = this.calculateKeywordSimilarity(userKeywords, cachedKeywords);
        const intentSimilarity = this.calculateIntentSimilarity(intent, cachedIntent);

        // Combined similarity score (weighted)
        const combinedScore = (keywordSimilarity * 0.6) + (intentSimilarity * 0.4);

        if (combinedScore > bestScore && combinedScore >= this.similarityThreshold) {
          bestScore = combinedScore;
          bestMatch = {
            result: cacheEntry,
            confidence: combinedScore,
            original_query: cacheEntry.user_request,
            keyword_similarity: keywordSimilarity,
            intent_similarity: intentSimilarity
          };
        }
      } catch (error) {
        console.warn('[IntelligentCache] Error in semantic matching:', error.message);
      }
    }

    return bestMatch;
  }

  /**
   * Extract semantic keywords from user request
   */
  extractSemanticKeywords(userRequest) {
    const keywords = [];
    const normalizedRequest = userRequest.toLowerCase();

    // Extract keywords based on semantic categories
    for (const [category, terms] of Object.entries(this.semanticKeywords)) {
      for (const term of terms) {
        if (normalizedRequest.includes(term.toLowerCase())) {
          keywords.push({ category, term, weight: this.getTermWeight(category) });
        }
      }
    }

    // Extract entity mentions
    const entities = ['customer', 'order', 'product', 'inventory', 'supplier'];
    entities.forEach(entity => {
      if (normalizedRequest.includes(entity)) {
        keywords.push({ category: 'entity', term: entity, weight: 0.8 });
      }
    });

    return keywords;
  }

  /**
   * Calculate keyword similarity between two sets
   */
  calculateKeywordSimilarity(keywords1, keywords2) {
    if (!keywords1.length || !keywords2.length) return 0;

    let matchScore = 0;
    let totalWeight = 0;

    for (const kw1 of keywords1) {
      totalWeight += kw1.weight || 1;

      for (const kw2 of keywords2) {
        if (kw1.category === kw2.category && kw1.term === kw2.term) {
          matchScore += kw1.weight || 1;
          break;
        }
      }
    }

    return totalWeight > 0 ? matchScore / totalWeight : 0;
  }

  /**
   * Calculate intent similarity
   */
  calculateIntentSimilarity(intent1, intent2) {
    let score = 0;
    let checks = 0;

    // Check intent type
    if (intent1.intent === intent2.intent) score += 0.4;
    checks++;

    // Check entity
    if (intent1.entity === intent2.entity) score += 0.3;
    checks++;

    // Check filters similarity
    const filter1 = intent1.filters || [];
    const filter2 = intent2.filters || [];
    if (filter1.length === filter2.length) {
      const commonFilters = filter1.filter(f => filter2.includes(f));
      score += (commonFilters.length / Math.max(filter1.length, 1)) * 0.3;
    }
    checks++;

    return checks > 0 ? score : 0;
  }

  /**
   * Generate exact cache key
   */
  generateExactKey(userRequest, intent) {
    const normalized = userRequest.toLowerCase().trim().replace(/\s+/g, ' ');
    const intentStr = JSON.stringify(intent, Object.keys(intent).sort());
    return `exact_${Buffer.from(normalized + intentStr).toString('base64').slice(0, 32)}`;
  }

  /**
   * Generate semantic cache key
   */
  generateSemanticKey(userRequest, intent) {
    const keywords = this.extractSemanticKeywords(userRequest);
    const intentSignature = this.createIntentSignature(intent);
    const keywordStr = keywords.map(k => `${k.category}:${k.term}`).sort().join('|');
    return `semantic_${Buffer.from(keywordStr + intentSignature).toString('base64').slice(0, 32)}`;
  }

  /**
   * Generate pattern key for intent patterns
   */
  generatePatternKey(intent) {
    const signature = this.createIntentSignature(intent);
    return `pattern_${Buffer.from(signature).toString('base64').slice(0, 24)}`;
  }

  /**
   * Create intent signature for comparison
   */
  createIntentSignature(intent) {
    return `${intent.intent}:${intent.entity}:${(intent.filters || []).sort().join(',')}`;
  }

  /**
   * Extract tables used in SQL query
   */
  extractTablesFromSQL(sqlQuery) {
    const tables = [];
    const tablePattern = /FROM\s+(\w+)|JOIN\s+(\w+)/gi;
    let match;

    while ((match = tablePattern.exec(sqlQuery)) !== null) {
      const table = match[1] || match[2];
      if (table && !tables.includes(table.toLowerCase())) {
        tables.push(table.toLowerCase());
      }
    }

    return tables;
  }

  /**
   * Create SQL template from specific query
   */
  createSQLTemplate(sqlQuery) {
    // Replace specific values with placeholders for template matching
    return sqlQuery
      .replace(/'\d{4}-\d{2}-\d{2}'/g, "'{{DATE}}'")
      .replace(/\d+/g, '{{NUMBER}}')
      .replace(/'[^']*'/g, "'{{STRING}}'");
  }

  /**
   * Update query patterns for machine learning
   */
  updateQueryPatterns(userRequest, intent, sqlQuery) {
    const patternKey = this.createIntentSignature(intent);

    if (!this.queryPatterns.has(patternKey)) {
      this.queryPatterns.set(patternKey, {
        pattern: intent,
        examples: [],
        sql_variations: [],
        usage_count: 0
      });
    }

    const pattern = this.queryPatterns.get(patternKey);
    pattern.examples.push(userRequest);
    pattern.sql_variations.push(sqlQuery);
    pattern.usage_count++;

    // Keep only recent examples (max 10)
    if (pattern.examples.length > 10) {
      pattern.examples = pattern.examples.slice(-10);
      pattern.sql_variations = pattern.sql_variations.slice(-10);
    }
  }

  /**
   * Get term weight for semantic scoring
   */
  getTermWeight(category) {
    const weights = {
      customer_value: 1.0,
      entities: 0.9,
      actions: 0.8,
      metrics: 0.7,
      order_status: 0.6,
      time_ranges: 0.5
    };
    return weights[category] || 0.5;
  }

  /**
   * Get cache performance metrics
   */
  getMetrics() {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    return {
      ...this.metrics,
      hit_rate: totalRequests > 0 ? (this.metrics.hits / totalRequests) : 0,
      cache_sizes: {
        validated_queries: this.validatedQueryCache.size,
        intent_patterns: this.intentPatternCache.size,
        results: this.resultCache.size
      },
      avg_time_saved: this.metrics.hits > 0 ? (this.metrics.query_time_saved / this.metrics.hits) : 0,
      query_patterns_learned: this.queryPatterns.size
    };
  }

  /**
   * Clear cache with optional selective clearing
   */
  clearCache(type = 'all') {
    switch (type) {
      case 'validated':
        this.validatedQueryCache.clear();
        break;
      case 'patterns':
        this.intentPatternCache.clear();
        break;
      case 'results':
        this.resultCache.clear();
        break;
      case 'all':
      default:
        this.validatedQueryCache.clear();
        this.intentPatternCache.clear();
        this.resultCache.clear();
        this.queryPatterns.clear();
        break;
    }

    console.log(`[IntelligentCache] Cleared ${type} cache`);
  }

  /**
   * Export learned patterns for analysis
   */
  exportPatterns() {
    return {
      query_patterns: Array.from(this.queryPatterns.entries()),
      semantic_keywords: this.semanticKeywords,
      metrics: this.getMetrics(),
      exported_at: new Date().toISOString()
    };
  }
}

module.exports = new IntelligentCacheService();