/**
 * SLM Business Service Layer - Training Analytics
 *
 * @author Partha Chandramohan
 * @description Analytics and performance tracking for training system
 */

const { Pool } = require("pg");

class TrainingAnalytics {
  constructor(pool) {
    this.pool = pool;
    console.log("[Training-Analytics] Analytics module initialized");
  }

  /**
   * Get average rating by query pattern
   */
  async getAverageRatingByPattern(pattern) {
    try {
      const result = await this.pool.query(
        `SELECT 
          query_pattern,
          COUNT(*) as total_queries,
          ROUND(AVG(human_rating), 2) as average_rating,
          COUNT(CASE WHEN human_rating >= 8 THEN 1 END) as high_quality_count,
          COUNT(CASE WHEN human_rating <= 5 THEN 1 END) as low_quality_count
         FROM query_training_history qth
         JOIN training_improvements ti ON ti.query_pattern = $1
         WHERE human_rating IS NOT NULL
         GROUP BY query_pattern`,
        [pattern]
      );

      return result.rows[0] || { pattern, average_rating: 0, total_queries: 0 };
    } catch (error) {
      console.error("[Training-Analytics] Failed to get pattern rating:", error.message);
      return { pattern, error: error.message };
    }
  }

  /**
   * Get model performance by intent type
   */
  async getModelPerformanceByIntent(intentType) {
    try {
      const result = await this.pool.query(
        `SELECT 
          model_used,
          COUNT(*) as total_attempts,
          ROUND(AVG(human_rating), 2) as average_rating,
          ROUND(AVG(validation_score), 2) as average_validation_score,
          COUNT(CASE WHEN was_successful = TRUE THEN 1 END) as success_count
         FROM query_training_history
         WHERE classified_intent->>'intent' = $1
           AND human_rating IS NOT NULL
         GROUP BY model_used
         ORDER BY average_rating DESC`,
        [intentType]
      );

      return result.rows;
    } catch (error) {
      console.error("[Training-Analytics] Failed to get model performance:", error.message);
      return [];
    }
  }

  /**
   * Get common error patterns
   */
  async getCommonErrorPatterns(limit = 10) {
    try {
      const result = await this.pool.query(
        `SELECT 
          error_type,
          COUNT(*) as occurrence_count,
          ROUND(AVG(average_rating_before), 2) as avg_rating_before,
          ROUND(AVG(average_rating_after), 2) as avg_rating_after,
          SUM(application_count) as total_applications
         FROM training_improvements
         WHERE is_active = TRUE
         GROUP BY error_type
         ORDER BY occurrence_count DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      console.error("[Training-Analytics] Failed to get error patterns:", error.message);
      return [];
    }
  }

  /**
   * Measure improvement impact
   */
  async measureImprovementImpact(improvementId) {
    try {
      const result = await this.pool.query(
        `SELECT 
          improvement_id,
          query_pattern,
          error_type,
          average_rating_before,
          average_rating_after,
          application_count,
          (average_rating_after - average_rating_before) as rating_improvement,
          CASE 
            WHEN average_rating_after > average_rating_before THEN 'positive'
            WHEN average_rating_after < average_rating_before THEN 'negative'
            ELSE 'neutral'
          END as impact
         FROM training_improvements
         WHERE improvement_id = $1`,
        [improvementId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error("[Training-Analytics] Failed to measure impact:", error.message);
      return null;
    }
  }

  /**
   * Get query success rate over time
   */
  async getSuccessRateOverTime(days = 30) {
    try {
      const result = await this.pool.query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as total_queries,
          COUNT(CASE WHEN was_successful = TRUE THEN 1 END) as successful_queries,
          ROUND(AVG(human_rating), 2) as average_rating,
          ROUND(AVG(validation_score), 2) as average_validation_score
         FROM query_training_history
         WHERE created_at >= NOW() - INTERVAL '${days} days'
           AND human_rating IS NOT NULL
         GROUP BY DATE(created_at)
         ORDER BY date DESC`
      );

      return result.rows;
    } catch (error) {
      console.error("[Training-Analytics] Failed to get success rate:", error.message);
      return [];
    }
  }

  /**
   * Get model comparison statistics
   */
  async getModelComparison() {
    try {
      const result = await this.pool.query(
        `SELECT 
          model_used,
          COUNT(*) as total_uses,
          ROUND(AVG(human_rating), 2) as avg_rating,
          ROUND(AVG(validation_score), 2) as avg_validation_score,
          COUNT(CASE WHEN human_rating >= 8 THEN 1 END) as high_quality_count,
          COUNT(CASE WHEN human_rating <= 5 THEN 1 END) as low_quality_count,
          ROUND(AVG(model_attempt), 1) as avg_attempt_position
         FROM query_training_history
         WHERE human_rating IS NOT NULL
         GROUP BY model_used
         ORDER BY avg_rating DESC, total_uses DESC`
      );

      return result.rows;
    } catch (error) {
      console.error("[Training-Analytics] Failed to get model comparison:", error.message);
      return [];
    }
  }

  /**
   * Get training progress summary
   */
  async getTrainingProgress() {
    try {
      const summary = await this.pool.query('SELECT * FROM training_analytics_summary');
      const recentTrend = await this.getSuccessRateOverTime(7);  // Last week
      const modelPerf = await this.getModelComparison();
      const errorPatterns = await this.getCommonErrorPatterns(5);

      return {
        summary: summary.rows[0] || {},
        recent_trend: recentTrend,
        model_performance: modelPerf,
        common_errors: errorPatterns,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[Training-Analytics] Failed to get progress:", error.message);
      return { error: error.message };
    }
  }
}

module.exports = TrainingAnalytics;

