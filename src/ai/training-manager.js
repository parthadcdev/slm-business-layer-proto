/**
 * SLM Business Service Layer - Training Manager
 *
 * @author Partha Chandramohan
 * @description Manages human-in-the-loop training with immediate feedback application
 */

const { Pool } = require("pg");
const TrainingVectorStore = require("../rag/training-vector-store");

class TrainingManager {
  constructor() {
    this.trainingMode = false;
    this.feedbackStore = null;
    this.improvementCache = new Map();  // In-memory cache for fast access
    this.pool = null;
    this.isInitialized = false;

    console.log("[Training-Manager] Training manager created");
  }

  /**
   * Initialize training manager
   */
  async initialize() {
    try {
      const postgresUrl = process.env.POSTGRES_URL;
      
      if (!postgresUrl) {
        console.warn("[Training-Manager] POSTGRES_URL not set, training disabled");
        return false;
      }

      // Initialize database connection
      this.pool = new Pool({
        connectionString: postgresUrl,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Initialize vector store
      this.feedbackStore = new TrainingVectorStore();
      await this.feedbackStore.initialize();

      // Load existing improvements into cache
      await this.loadImprovementsIntoCache();

      // Load training mode status
      await this.loadTrainingModeStatus();

      this.isInitialized = true;
      console.log("[Training-Manager] Training manager initialized successfully");
      
      return true;
    } catch (error) {
      console.error("[Training-Manager] Initialization failed:", error.message);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Load training mode status from database
   */
  async loadTrainingModeStatus() {
    try {
      const result = await this.pool.query(
        'SELECT training_mode_enabled FROM training_metadata ORDER BY id DESC LIMIT 1'
      );
      
      if (result.rows.length > 0) {
        this.trainingMode = result.rows[0].training_mode_enabled;
        console.log(`[Training-Manager] Training mode loaded: ${this.trainingMode}`);
      }
    } catch (error) {
      console.warn("[Training-Manager] Failed to load training mode status:", error.message);
      this.trainingMode = false;
    }
  }

  /**
   * Load improvements into cache
   */
  async loadImprovementsIntoCache() {
    try {
      const result = await this.pool.query(
        `SELECT improvement_id, query_pattern, improved_prompt_fragment, application_count
         FROM training_improvements
         WHERE is_active = TRUE
         ORDER BY application_count DESC, created_at DESC
         LIMIT 100`
      );

      for (const row of result.rows) {
        this.improvementCache.set(row.query_pattern, {
          improvement_id: row.improvement_id,
          prompt_fragment: row.improved_prompt_fragment,
          application_count: row.application_count,
        });
      }

      console.log(`[Training-Manager] Loaded ${result.rows.length} improvements into cache`);
    } catch (error) {
      console.warn("[Training-Manager] Failed to load improvements:", error.message);
    }
  }

  /**
   * Check if training mode is enabled
   */
  isTrainingMode() {
    return this.trainingMode;
  }

  /**
   * Toggle training mode
   */
  async toggleTrainingMode(adminUserId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.trainingMode = !this.trainingMode;

    try {
      // Update in database
      await this.pool.query(
        `UPDATE training_metadata SET 
          training_mode_enabled = $1,
          ${this.trainingMode ? 'enabled_at = NOW(), enabled_by = $2' : 'disabled_at = NOW(), disabled_by = $2'},
          updated_at = NOW()`,
        [this.trainingMode, adminUserId]
      );

      console.log(`[Training-Manager] Training mode ${this.trainingMode ? 'ENABLED' : 'DISABLED'} by ${adminUserId}`);
    } catch (error) {
      console.error("[Training-Manager] Failed to update training mode:", error.message);
    }

    return this.trainingMode;
  }

  /**
   * Record query execution for training
   */
  async recordQueryExecution(
    userRequest,
    intent,
    generatedSQL,
    executionResult,
    executionError,
    modelUsed,
    validationScore,
    fallbackChain = null
  ) {
    if (!this.isInitialized || !this.trainingMode) {
      return null;
    }

    try {
      // Store in PostgreSQL
      const result = await this.pool.query(
        `INSERT INTO query_training_history (
          user_request,
          classified_intent,
          generated_sql,
          execution_result,
          execution_error,
          validation_score,
          model_used,
          fallback_chain,
          was_successful
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING training_id`,
        [
          userRequest,
          JSON.stringify(intent),
          generatedSQL,
          executionResult ? JSON.stringify(executionResult) : null,
          executionError,
          validationScore,
          modelUsed,
          fallbackChain,
          !executionError && executionResult?.success,
        ]
      );

      const trainingId = result.rows[0].training_id;

      // Store in ChromaDB for semantic search
      await this.feedbackStore.storeTrainingExample(
        trainingId,
        userRequest,
        generatedSQL,
        executionError,
        modelUsed,
        validationScore
      );

      console.log(`[Training-Manager] Recorded training query: ${trainingId}`);
      return trainingId;
    } catch (error) {
      console.error("[Training-Manager] Failed to record query:", error.message);
      return null;
    }
  }

  /**
   * Apply human feedback and generate improvements
   */
  async applyHumanFeedback(trainingId, rating, feedback, correctedSQL, ratedBy) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Update PostgreSQL
      await this.pool.query(
        `UPDATE query_training_history SET
          human_rating = $1,
          human_feedback = $2,
          improved_sql = $3,
          rated_at = NOW(),
          rated_by = $4,
          used_for_training = TRUE
         WHERE training_id = $5`,
        [rating, feedback, correctedSQL, ratedBy, trainingId]
      );

      // Update ChromaDB
      await this.feedbackStore.updateWithFeedback(trainingId, rating, feedback, correctedSQL);

      console.log(`[Training-Manager] Applied feedback for ${trainingId}: rating=${rating}`);

      // If low rating with correction, generate improvement
      if (rating <= 5 && correctedSQL) {
        await this.generateImprovementFromFeedback(trainingId);
      }

      // Update training metadata
      await this.updateTrainingMetadata();

      return true;
    } catch (error) {
      console.error("[Training-Manager] Failed to apply feedback:", error.message);
      return false;
    }
  }

  /**
   * Generate improvement from low-rated feedback
   */
  async generateImprovementFromFeedback(trainingId) {
    try {
      // Get training record
      const result = await this.pool.query(
        `SELECT * FROM query_training_history WHERE training_id = $1`,
        [trainingId]
      );

      if (result.rows.length === 0) {
        console.warn(`[Training-Manager] Training record not found: ${trainingId}`);
        return;
      }

      const training = result.rows[0];
      
      if (!training.improved_sql || training.human_rating >= 6) {
        return;  // Only learn from failures with corrections
      }

      // Extract pattern from request
      const pattern = this.extractQueryPattern(training.user_request, training.classified_intent);
      
      // Analyze differences
      const differences = this.analyzeSQLDifferences(
        training.generated_sql,
        training.improved_sql
      );

      // Create improvement prompt fragment
      const improvementPrompt = this.createImprovementPrompt(pattern, differences, training);

      // Store or update improvement
      await this.pool.query(
        `INSERT INTO training_improvements (
          query_pattern,
          error_type,
          improved_prompt_fragment,
          source_training_ids,
          average_rating_before,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (query_pattern, error_type) DO UPDATE SET
          improved_prompt_fragment = EXCLUDED.improved_prompt_fragment,
          source_training_ids = array_append(training_improvements.source_training_ids, $4::uuid[]),
          average_rating_before = (training_improvements.average_rating_before + EXCLUDED.average_rating_before) / 2,
          is_active = TRUE`,
        [
          pattern,
          differences.error_type,
          improvementPrompt,
          [trainingId],
          training.human_rating,
          training.rated_by
        ]
      );

      // Update cache immediately
      this.improvementCache.set(pattern, {
        prompt_fragment: improvementPrompt,
        error_type: differences.error_type,
      });

      console.log(`[Training-Manager] Generated improvement for pattern: ${pattern}`);
    } catch (error) {
      console.error("[Training-Manager] Failed to generate improvement:", error.message);
    }
  }

  /**
   * Get improvement prompt for a request
   */
  async getImprovementPrompt(userRequest, intent, previousErrors = []) {
    const pattern = this.extractQueryPattern(userRequest, intent);
    
    // Check cache first
    const cached = this.improvementCache.get(pattern);
    if (cached) {
      return cached.prompt_fragment;
    }

    // Load from database if not cached
    try {
      const result = await this.pool.query(
        `SELECT improved_prompt_fragment FROM training_improvements
         WHERE query_pattern = $1 AND is_active = TRUE
         LIMIT 1`,
        [pattern]
      );

      if (result.rows.length > 0) {
        const prompt = result.rows[0].improved_prompt_fragment;
        this.improvementCache.set(pattern, { prompt_fragment: prompt });
        return prompt;
      }
    } catch (error) {
      console.warn("[Training-Manager] Failed to get improvement:", error.message);
    }

    return "";  // No improvements found
  }

  /**
   * Get similar successful queries from training data
   */
  async getSimilarSuccessfulQueries(userRequest, minRating = 8, limit = 3) {
    if (!this.feedbackStore) {
      console.log("[Training-Manager] Feedback store not available");
      return [];
    }

    try {
      const results = await this.feedbackStore.getSimilarSuccessfulQueries(userRequest, minRating, limit);
      return results || [];
    } catch (error) {
      console.warn("[Training-Manager] ChromaDB unavailable, similar query search disabled:", error.message);
      return [];
    }
  }

  /**
   * Extract query pattern from request
   */
  extractQueryPattern(userRequest, intent) {
    if (!intent) {
      return "unknown";
    }

    const intentObj = typeof intent === 'string' ? JSON.parse(intent) : intent;
    return `${intentObj.intent}_${intentObj.entity}`.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  }

  /**
   * Analyze differences between original and corrected SQL
   */
  analyzeSQLDifferences(originalSQL, correctedSQL) {
    const differences = {
      error_type: "general",
      fix_description: "unknown",
      changes: [],
    };

    const origLower = originalSQL.toLowerCase();
    const corrLower = correctedSQL.toLowerCase();

    // Check for missing JOINs
    const origJoins = (origLower.match(/join/g) || []).length;
    const corrJoins = (corrLower.match(/join/g) || []).length;
    if (corrJoins > origJoins) {
      differences.error_type = "missing_join";
      differences.fix_description = "add required JOIN clauses";
      differences.changes.push(`Added ${corrJoins - origJoins} JOIN(s)`);
    }

    // Check for WHERE clause differences
    if (!origLower.includes('where') && corrLower.includes('where')) {
      differences.error_type = "missing_filter";
      differences.fix_description = "include WHERE clause for filtering";
      differences.changes.push("Added WHERE clause");
    }

    // Check for column selection differences
    if (origLower.includes('select *') && !corrLower.includes('select *')) {
      differences.error_type = "select_all";
      differences.fix_description = "specify explicit columns instead of SELECT *";
      differences.changes.push("Changed to explicit column selection");
    }

    return differences;
  }

  /**
   * Create improvement prompt fragment
   */
  createImprovementPrompt(pattern, differences, training) {
    return `IMPORTANT (Learned from human feedback): When handling "${pattern}" queries, ${differences.fix_description}. Common mistake: ${training.execution_error || 'generic query structure'}.`;
  }

  /**
   * Update training metadata
   */
  async updateTrainingMetadata() {
    try {
      await this.pool.query(
        `UPDATE training_metadata SET
          total_queries_collected = (SELECT COUNT(*) FROM query_training_history),
          total_queries_rated = (SELECT COUNT(*) FROM query_training_history WHERE human_rating IS NOT NULL),
          average_rating = (SELECT ROUND(AVG(human_rating), 2) FROM query_training_history WHERE human_rating IS NOT NULL),
          updated_at = NOW()`
      );
    } catch (error) {
      console.warn("[Training-Manager] Failed to update metadata:", error.message);
    }
  }

  /**
   * Get training analytics
   */
  async getTrainingAnalytics() {
    if (!this.isInitialized) {
      return {
        training_mode: false,
        error: "Training manager not initialized"
      };
    }

    try {
      const summary = await this.pool.query('SELECT * FROM training_analytics_summary');
      const improvements = await this.pool.query(
        `SELECT query_pattern, error_type, application_count, average_rating_before, average_rating_after
         FROM training_improvements
         WHERE is_active = TRUE
         ORDER BY application_count DESC
         LIMIT 20`
      );

      const recent = await this.pool.query(
        `SELECT training_id, user_request, human_rating, model_used, created_at
         FROM query_training_history
         WHERE human_rating IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 10`
      );

      return {
        training_mode: this.trainingMode,
        summary: summary.rows[0] || {},
        active_improvements: improvements.rows,
        recent_feedback: recent.rows,
        cache_size: this.improvementCache.size,
      };
    } catch (error) {
      console.error("[Training-Manager] Failed to get analytics:", error.message);
      return {
        training_mode: this.trainingMode,
        error: error.message
      };
    }
  }

  /**
   * Get training record by ID
   */
  async getTrainingRecord(trainingId) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM query_training_history WHERE training_id = $1',
        [trainingId]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      console.error("[Training-Manager] Failed to get training record:", error.message);
      return null;
    }
  }

  /**
   * Check if database and vector store are ready
   * NOTE: feedbackStore (ChromaDB) is optional - training works with just NeonDB
   */
  isReady() {
    return this.isInitialized && this.pool;
  }

  /**
   * Close connections
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
    }
    console.log("[Training-Manager] Training manager closed");
  }
}

// Export singleton
module.exports = new TrainingManager();

