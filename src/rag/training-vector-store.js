/**
 * SLM Business Service Layer - Training Vector Store
 *
 * @author Partha Chandramohan
 * @description ChromaDB-based storage for training examples with semantic search
 */

const chromaDBClient = require("./chromadb-client");  // Singleton instance
const embeddingService = require("./embedding-service");  // Singleton instance

class TrainingVectorStore {
  constructor() {
    this.chromaClient = chromaDBClient;
    this.embeddingService = embeddingService;
    this.collectionName = "query_training_feedback";
    this.collection = null;
    this.isInitialized = false;

    console.log("[Training-Vector] Training vector store initialized");
  }

  /**
   * Initialize the training collection
   */
  async initialize() {
    try {
      console.log("[Training-Vector] Creating/accessing training collection...");
      
      // Create or get collection
      this.collection = await this.chromaClient.getOrCreateCollection(
        this.collectionName,
        {
          description: "Human-in-the-loop training feedback for SQL generation",
          metadata: {
            purpose: "training",
            version: "1.0",
          },
        }
      );

      this.isInitialized = true;
      console.log("[Training-Vector] Training collection ready");
      
      return true;
    } catch (error) {
      console.warn("[Training-Vector] ChromaDB not available (semantic search disabled):", error.message);
      console.log("[Training-Vector] Training system will work without ChromaDB (no similar query search)");
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Store a training example in ChromaDB
   */
  async storeTrainingExample(
    trainingId,
    userRequest,
    generatedSQL,
    executionError,
    modelUsed,
    validationScore
  ) {
    if (!this.isInitialized) {
      const success = await this.initialize();
      if (!success) {
        console.log("[Training-Vector] Skipping ChromaDB storage (not available)");
        return false;
      }
    }

    try {
      // Generate embedding for the user request
      const embedding = await this.embeddingService.generateEmbedding(userRequest);

      // Prepare document
      const document = `Request: ${userRequest}\nSQL: ${generatedSQL}${executionError ? `\nError: ${executionError}` : ''}`;

      // Store in ChromaDB
      await this.collection.add({
        ids: [trainingId],
        embeddings: [embedding],
        documents: [document],
        metadatas: [
          {
            training_id: trainingId,
            user_request: userRequest.substring(0, 500),  // Truncate for metadata
            model_used: modelUsed,
            validation_score: validationScore,
            has_error: !!executionError,
            error_type: executionError ? this.classifyError(executionError) : null,
            rated: false,
            rating: 0,
            created_at: new Date().toISOString(),
          },
        ],
      });

      console.log(`[Training-Vector] Stored training example: ${trainingId}`);
      return true;
    } catch (error) {
      console.error("[Training-Vector] Failed to store training example:", error.message);
      return false;
    }
  }

  /**
   * Update training example with human feedback
   */
  async updateWithFeedback(trainingId, rating, feedback, correctedSQL) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Get existing entry
      const existing = await this.collection.get({
        ids: [trainingId],
      });

      if (!existing || existing.ids.length === 0) {
        console.warn(`[Training-Vector] Training ID not found: ${trainingId}`);
        return false;
      }

      // Update metadata
      const updatedMetadata = {
        ...existing.metadatas[0],
        rated: true,
        rating: rating,
        has_correction: !!correctedSQL,
        has_feedback: !!feedback,
        rated_at: new Date().toISOString(),
      };

      // Update document if corrected SQL provided
      let updatedDocument = existing.documents[0];
      if (correctedSQL) {
        updatedDocument += `\nCorrected SQL: ${correctedSQL}`;
        if (feedback) {
          updatedDocument += `\nFeedback: ${feedback}`;
        }
      }

      // Update in ChromaDB
      await this.collection.update({
        ids: [trainingId],
        documents: [updatedDocument],
        metadatas: [updatedMetadata],
      });

      console.log(`[Training-Vector] Updated training ${trainingId} with rating ${rating}`);
      return true;
    } catch (error) {
      console.error("[Training-Vector] Failed to update feedback:", error.message);
      return false;
    }
  }

  /**
   * Find similar successful queries (rating >= minRating)
   */
  async getSimilarSuccessfulQueries(userRequest, minRating = 8, limit = 5) {
    if (!this.isInitialized) {
      const success = await this.initialize();
      if (!success) {
        console.log("[Training-Vector] ChromaDB not available, returning empty results");
        return [];
      }
    }

    try {
      // Generate embedding for the query
      const embedding = await this.embeddingService.generateEmbedding(userRequest);

      // Search for similar queries with high ratings
      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: limit * 3,  // Get more to filter
        where: {
          $and: [
            { rated: true },
            { rating: { $gte: minRating } },
          ],
        },
      });

      if (!results || !results.ids || results.ids[0].length === 0) {
        console.log(`[Training-Vector] No similar successful queries found (min rating: ${minRating})`);
        return [];
      }

      // Format results
      const similarQueries = results.ids[0].slice(0, limit).map((id, index) => ({
        training_id: id,
        request: results.metadatas[0][index].user_request,
        sql: this.extractSQLFromDocument(results.documents[0][index]),
        rating: results.metadatas[0][index].rating,
        model_used: results.metadatas[0][index].model_used,
        similarity: 1 - (results.distances ? results.distances[0][index] : 0),
      }));

      console.log(`[Training-Vector] Found ${similarQueries.length} similar successful queries`);
      return similarQueries;
    } catch (error) {
      console.error("[Training-Vector] Failed to find similar queries:", error.message);
      return [];
    }
  }

  /**
   * Get feedback for a specific query pattern
   */
  async getFeedbackForPattern(pattern, limit = 20) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const results = await this.collection.get({
        where: { rated: true },
        limit: limit,
      });

      // Filter by pattern matching in user request
      const filtered = [];
      if (results && results.ids) {
        for (let i = 0; i < results.ids.length; i++) {
          const request = results.metadatas[i].user_request.toLowerCase();
          if (request.includes(pattern.toLowerCase())) {
            filtered.push({
              training_id: results.ids[i],
              request: results.metadatas[i].user_request,
              rating: results.metadatas[i].rating,
              model_used: results.metadatas[i].model_used,
            });
          }
        }
      }

      return filtered;
    } catch (error) {
      console.error("[Training-Vector] Failed to get pattern feedback:", error.message);
      return [];
    }
  }

  /**
   * Classify error type from error message
   */
  classifyError(errorMessage) {
    const errorLower = errorMessage.toLowerCase();
    
    if (errorLower.includes("column") && errorLower.includes("does not exist")) {
      return "invalid_column";
    }
    if (errorLower.includes("table") && errorLower.includes("does not exist")) {
      return "invalid_table";
    }
    if (errorLower.includes("syntax error")) {
      return "syntax_error";
    }
    if (errorLower.includes("join")) {
      return "join_error";
    }
    if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
      return "timeout";
    }
    
    return "other";
  }

  /**
   * Extract SQL from document text
   */
  extractSQLFromDocument(document) {
    const sqlMatch = document.match(/SQL: ([^\n]+)/);
    return sqlMatch ? sqlMatch[1] : "";
  }

  /**
   * Get training statistics
   */
  async getTrainingStats() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const count = await this.collection.count();
      
      return {
        total_examples: count,
        collection_name: this.collectionName,
        is_initialized: this.isInitialized,
      };
    } catch (error) {
      console.error("[Training-Vector] Failed to get stats:", error.message);
      return { total_examples: 0, error: error.message };
    }
  }

  /**
   * Delete training example
   */
  async deleteTrainingExample(trainingId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.collection.delete({
        ids: [trainingId],
      });
      
      console.log(`[Training-Vector] Deleted training example: ${trainingId}`);
      return true;
    } catch (error) {
      console.error("[Training-Vector] Failed to delete:", error.message);
      return false;
    }
  }
}

module.exports = TrainingVectorStore;

