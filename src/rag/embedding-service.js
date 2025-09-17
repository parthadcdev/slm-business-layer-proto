// Local embedding service using sentence-transformers
const axios = require('axios');

class EmbeddingService {
  constructor() {
    this.model = process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2';
    this.serviceUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8001';
    this.maxTextLength = 8192;
    this.batchSize = 32;
  }

  async generateEmbedding(text) {
    try {
      if (typeof text !== 'string') {
        throw new Error('Input must be a string');
      }

      if (text.length > this.maxTextLength) {
        text = text.substring(0, this.maxTextLength);
      }

      const response = await axios.post(`${this.serviceUrl}/embed`, {
        text: text,
        model: this.model
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        embedding: response.data.embedding,
        model: this.model,
        text_length: text.length
      };
    } catch (error) {
      console.error('Error generating embedding:', error.message);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  async generateBatchEmbeddings(texts) {
    try {
      if (!Array.isArray(texts)) {
        throw new Error('Input must be an array of strings');
      }

      const processedTexts = texts.map(text => {
        if (typeof text !== 'string') {
          throw new Error('All inputs must be strings');
        }
        return text.length > this.maxTextLength
          ? text.substring(0, this.maxTextLength)
          : text;
      });

      // Process in batches to avoid overwhelming the service
      const results = [];
      for (let i = 0; i < processedTexts.length; i += this.batchSize) {
        const batch = processedTexts.slice(i, i + this.batchSize);

        const response = await axios.post(`${this.serviceUrl}/embed_batch`, {
          texts: batch,
          model: this.model
        }, {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        results.push(...response.data.embeddings);
      }

      return {
        embeddings: results,
        model: this.model,
        count: results.length
      };
    } catch (error) {
      console.error('Error generating batch embeddings:', error.message);
      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
    }
  }

  async calculateSimilarity(embedding1, embedding2) {
    try {
      if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
        throw new Error('Embeddings must be arrays');
      }

      if (embedding1.length !== embedding2.length) {
        throw new Error('Embeddings must have the same dimensions');
      }

      // Calculate cosine similarity
      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;

      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
      }

      const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
      return Math.max(-1, Math.min(1, similarity)); // Clamp to [-1, 1]
    } catch (error) {
      console.error('Error calculating similarity:', error.message);
      throw new Error('Failed to calculate similarity');
    }
  }

  async findMostSimilar(queryEmbedding, candidateEmbeddings, topK = 5) {
    try {
      const similarities = await Promise.all(
        candidateEmbeddings.map(async (candidate, index) => ({
          index,
          similarity: await this.calculateSimilarity(queryEmbedding, candidate.embedding),
          metadata: candidate.metadata || {}
        }))
      );

      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    } catch (error) {
      console.error('Error finding most similar:', error.message);
      throw new Error('Failed to find most similar embeddings');
    }
  }

  async checkServiceHealth() {
    try {
      const response = await axios.get(`${this.serviceUrl}/health`, {
        timeout: 5000
      });

      return {
        healthy: response.status === 200,
        model: this.model,
        service_url: this.serviceUrl,
        version: response.data.version || 'unknown'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        service_url: this.serviceUrl
      };
    }
  }

  async getModelInfo() {
    try {
      const response = await axios.get(`${this.serviceUrl}/model_info`, {
        timeout: 5000
      });

      return {
        model: this.model,
        dimensions: response.data.dimensions,
        max_sequence_length: response.data.max_sequence_length,
        tokenizer: response.data.tokenizer || 'unknown'
      };
    } catch (error) {
      console.error('Error getting model info:', error.message);
      return {
        model: this.model,
        error: error.message
      };
    }
  }

  preprocessText(text) {
    if (typeof text !== 'string') {
      return '';
    }

    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s.,!?;:-]/g, '') // Remove special characters
      .trim()
      .substring(0, this.maxTextLength);
  }

  chunkText(text, chunkSize = 500, overlap = 50) {
    if (typeof text !== 'string') {
      return [];
    }

    const chunks = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.substring(start, end);

      // Try to break at sentence boundaries
      if (end < text.length) {
        const lastSentence = chunk.lastIndexOf('.');
        const lastQuestion = chunk.lastIndexOf('?');
        const lastExclamation = chunk.lastIndexOf('!');

        const lastPunctuation = Math.max(lastSentence, lastQuestion, lastExclamation);

        if (lastPunctuation > chunk.length * 0.8) {
          chunks.push(chunk.substring(0, lastPunctuation + 1).trim());
          start = start + lastPunctuation + 1 - overlap;
        } else {
          chunks.push(chunk.trim());
          start = end - overlap;
        }
      } else {
        chunks.push(chunk.trim());
        break;
      }
    }

    return chunks.filter(chunk => chunk.length > 10);
  }
}

module.exports = new EmbeddingService();