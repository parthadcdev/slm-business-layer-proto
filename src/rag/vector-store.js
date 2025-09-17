/**
 * SLM Business Service Layer - Vector Store
 *
 * @author Partha Chandramohan
 * @description High-level interface for vector database operations and semantic search with ChromaDB
 */
const chromaClient = require('./chromadb-client');
const embeddingService = require('./embedding-service');
const chunkProcessor = require('./chunk-processor');

class VectorStore {
  constructor() {
    this.client = chromaClient;
    this.embeddingService = embeddingService;
    this.chunkProcessor = chunkProcessor;
    this.initialized = false;
  }

  async initialize() {
    try {
      await this.client.initialize();
      await this.embeddingService.checkServiceHealth();
      this.initialized = true;
      console.log('Vector store initialized successfully');
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      throw new Error('Vector store initialization failed');
    }
  }

  async addDocument(document, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const {
        generateEmbeddings = true,
        chunkOptions = {}
      } = options;

      // Process document into chunks
      const processedResult = await this.chunkProcessor.processDocumentChunks(
        document,
        { generateEmbeddings, ...chunkOptions }
      );

      // Prepare documents for storage
      const documentsToStore = processedResult.chunks.map(chunk => ({
        content: chunk.content,
        metadata: {
          ...chunk.metadata,
          chunk_id: chunk.id,
          chunk_index: chunk.chunk_index,
          chunk_type: chunk.type,
          source_document: document.metadata.filename,
          document_type: document.metadata.type || 'unknown',
          keywords: chunk.keywords,
          entities: chunk.entities,
          readability: chunk.readability,
          structure: chunk.structure,
          added_at: new Date().toISOString()
        },
        embedding: chunk.embedding
      }));

      // Store in vector database
      const result = await this.client.addDocuments(documentsToStore);

      console.log(`Added document ${document.metadata.filename} with ${documentsToStore.length} chunks`);

      return {
        success: true,
        documentId: document.metadata.filename,
        chunksAdded: documentsToStore.length,
        chunkIds: result.ids,
        metadata: processedResult.metadata
      };
    } catch (error) {
      console.error('Error adding document to vector store:', error);
      throw new Error(`Failed to add document: ${error.message}`);
    }
  }

  async search(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const {
        topK = 5,
        threshold = 0.0,
        filters = {},
        includeMetadata = true,
        rerank = true
      } = options;

      // Perform vector search
      const results = await this.client.search(query, {
        topK: Math.min(topK * 2, 20), // Get more results for potential reranking
        threshold,
        filters
      });

      if (results.length === 0) {
        return [];
      }

      // Rerank results if requested
      let finalResults = results;
      if (rerank) {
        finalResults = await this.rerankResults(query, results);
      }

      // Limit to requested number of results
      finalResults = finalResults.slice(0, topK);

      // Enrich results with additional metadata if requested
      if (includeMetadata) {
        finalResults = this.enrichSearchResults(finalResults, query);
      }

      return finalResults;
    } catch (error) {
      console.error('Error searching vector store:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  async retrieveRelevant(query, context = {}) {
    try {
      const searchOptions = {
        topK: context.maxResults || 5,
        threshold: context.minSimilarity || 0.3,
        filters: this.buildContextFilters(context),
        includeMetadata: true,
        rerank: true
      };

      const results = await this.search(query, searchOptions);

      return results.map(result => ({
        content: result.content,
        source: result.metadata.source_document,
        type: result.metadata.document_type,
        relevanceScore: result.score,
        chunkInfo: {
          id: result.metadata.chunk_id,
          index: result.metadata.chunk_index,
          type: result.metadata.chunk_type
        },
        keywords: result.metadata.keywords,
        entities: result.metadata.entities,
        metadata: result.metadata
      }));
    } catch (error) {
      console.error('Error retrieving relevant documents:', error);
      return [];
    }
  }

  buildContextFilters(context) {
    const filters = {};

    if (context.documentType) {
      filters.document_type = context.documentType;
    }

    if (context.source) {
      filters.source_document = context.source;
    }

    if (context.dateRange) {
      // Add date range filtering if needed
      filters.added_at = {
        $gte: context.dateRange.start,
        $lte: context.dateRange.end
      };
    }

    return filters;
  }

  async rerankResults(query, results) {
    try {
      // Simple reranking based on keyword overlap and context relevance
      const queryWords = query.toLowerCase().split(/\s+/);

      return results.map(result => {
        let score = result.score;

        // Boost score based on keyword matches
        if (result.metadata.keywords) {
          const keywordMatches = result.metadata.keywords.filter(kw =>
            queryWords.some(qw => qw.includes(kw.word) || kw.word.includes(qw))
          );
          score += keywordMatches.length * 0.1;
        }

        // Boost score based on document type relevance
        if (result.metadata.document_type === 'business-requirement') {
          score += 0.2;
        }

        // Boost score based on chunk type
        if (result.metadata.chunk_type === 'section' &&
            result.metadata.section_type === 'requirements') {
          score += 0.15;
        }

        return {
          ...result,
          score: Math.min(score, 1.0),
          reranked: true
        };
      }).sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('Error reranking results:', error);
      return results;
    }
  }

  enrichSearchResults(results, query) {
    return results.map(result => ({
      ...result,
      queryContext: this.extractQueryContext(result.content, query),
      relevanceExplanation: this.generateRelevanceExplanation(result, query),
      confidence: this.calculateConfidence(result)
    }));
  }

  extractQueryContext(content, query, contextWindow = 100) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const lowerContent = content.toLowerCase();

    let bestMatch = { start: 0, score: 0 };

    // Find the best matching section
    for (let i = 0; i < content.length - contextWindow; i += 50) {
      const window = lowerContent.substring(i, i + contextWindow);
      const score = queryWords.reduce((acc, word) => {
        return acc + (window.includes(word) ? 1 : 0);
      }, 0);

      if (score > bestMatch.score) {
        bestMatch = { start: i, score };
      }
    }

    return content.substring(bestMatch.start, bestMatch.start + contextWindow);
  }

  generateRelevanceExplanation(result, query) {
    const explanations = [];

    if (result.score > 0.8) {
      explanations.push('High semantic similarity');
    }

    if (result.metadata.keywords) {
      const queryWords = query.toLowerCase().split(/\s+/);
      const matchingKeywords = result.metadata.keywords.filter(kw =>
        queryWords.some(qw => qw.includes(kw.word) || kw.word.includes(qw))
      );

      if (matchingKeywords.length > 0) {
        explanations.push(`Keyword matches: ${matchingKeywords.map(kw => kw.word).join(', ')}`);
      }
    }

    if (result.metadata.document_type === 'business-requirement') {
      explanations.push('Business requirement document');
    }

    return explanations.join('; ');
  }

  calculateConfidence(result) {
    let confidence = result.score;

    // Boost confidence for structured content
    if (result.metadata.structure?.hasHeaders) {
      confidence += 0.1;
    }

    // Boost confidence for business-relevant content
    if (result.metadata.document_type === 'business-requirement') {
      confidence += 0.15;
    }

    // Reduce confidence for very short chunks
    if (result.content.length < 200) {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  async updateDocument(documentId, newContent, metadata = {}) {
    try {
      const result = await this.client.updateDocument(documentId, newContent, metadata);
      console.log(`Updated document: ${documentId}`);
      return result;
    } catch (error) {
      console.error('Error updating document:', error);
      throw new Error(`Failed to update document: ${error.message}`);
    }
  }

  async deleteDocument(documentId) {
    try {
      const result = await this.client.deleteDocument(documentId);
      console.log(`Deleted document: ${documentId}`);
      return result;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }

  async getStats() {
    try {
      const stats = await this.client.getStats();
      const embeddingHealth = await this.embeddingService.checkServiceHealth();

      return {
        ...stats,
        embeddingService: embeddingHealth,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting vector store stats:', error);
      return null;
    }
  }

  async listDocuments(options = {}) {
    try {
      const { limit = 100, offset = 0 } = options;
      return await this.client.listDocuments(limit, offset);
    } catch (error) {
      console.error('Error listing documents:', error);
      throw new Error('Failed to list documents');
    }
  }

  async clearStore() {
    try {
      const result = await this.client.clearCollection();
      console.log('Vector store cleared');
      return result;
    } catch (error) {
      console.error('Error clearing vector store:', error);
      throw new Error('Failed to clear vector store');
    }
  }

  async checkHealth() {
    try {
      const [clientHealth, embeddingHealth] = await Promise.all([
        this.client.checkHealth(),
        this.embeddingService.checkServiceHealth()
      ]);

      return {
        healthy: clientHealth.healthy && embeddingHealth.healthy,
        components: {
          vectorDB: clientHealth,
          embeddingService: embeddingHealth
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new VectorStore();