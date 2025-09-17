// RAG database query implementation
const vectorStore = require('../rag/vector-store');

class RetrievalService {
  constructor() {
    this.defaultTopK = 5;
    this.similarityThreshold = 0.7;
  }

  async retrieveRelevantContext(query, options = {}) {
    try {
      const {
        topK = this.defaultTopK,
        threshold = this.similarityThreshold,
        filters = {}
      } = options;

      // Retrieve similar documents from vector store
      const results = await vectorStore.search(query, {
        topK,
        threshold,
        filters
      });

      // Process and rank results
      const processedResults = this.processResults(results, query);

      // Add metadata and context
      const enrichedResults = this.enrichResults(processedResults);

      return enrichedResults;
    } catch (error) {
      console.error('Error retrieving relevant context:', error);
      throw new Error('Failed to retrieve relevant context');
    }
  }

  processResults(results, originalQuery) {
    return results.map((result, index) => ({
      ...result,
      rank: index + 1,
      relevanceScore: result.score,
      queryContext: this.extractRelevantSnippets(result.content, originalQuery)
    }));
  }

  enrichResults(results) {
    return results.map(result => ({
      ...result,
      summary: this.generateSummary(result.content),
      keyTerms: this.extractKeyTerms(result.content),
      documentType: this.classifyDocument(result.metadata),
      lastUpdated: result.metadata?.lastUpdated || null
    }));
  }

  extractRelevantSnippets(content, query, maxSnippets = 3) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const sentences = content.split(/[.!?]+/);

    const scoredSentences = sentences.map(sentence => {
      const lowerSentence = sentence.toLowerCase();
      const matchCount = queryTerms.reduce((count, term) => {
        return count + (lowerSentence.includes(term) ? 1 : 0);
      }, 0);

      return {
        text: sentence.trim(),
        score: matchCount / queryTerms.length
      };
    });

    return scoredSentences
      .filter(s => s.score > 0 && s.text.length > 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSnippets)
      .map(s => s.text);
  }

  generateSummary(content, maxLength = 200) {
    if (content.length <= maxLength) {
      return content;
    }

    const sentences = content.split(/[.!?]+/);
    let summary = '';

    for (const sentence of sentences) {
      if (summary.length + sentence.length > maxLength) {
        break;
      }
      summary += sentence.trim() + '. ';
    }

    return summary.trim() || content.substring(0, maxLength) + '...';
  }

  extractKeyTerms(content, maxTerms = 5) {
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, maxTerms)
      .map(([word]) => word);
  }

  classifyDocument(metadata) {
    if (!metadata) return 'unknown';

    const type = metadata.documentType || metadata.type;
    if (type) return type;

    const source = metadata.source || '';
    if (source.includes('brd')) return 'business-requirement';
    if (source.includes('api')) return 'api-documentation';
    if (source.includes('policy')) return 'policy';

    return 'general';
  }

  async getRetrievalStats() {
    try {
      const stats = await vectorStore.getStats();
      return {
        totalDocuments: stats.documentCount,
        totalEmbeddings: stats.embeddingCount,
        lastUpdated: stats.lastUpdated,
        averageRetrievalTime: stats.averageQueryTime
      };
    } catch (error) {
      console.error('Error getting retrieval stats:', error);
      return null;
    }
  }
}

module.exports = new RetrievalService();