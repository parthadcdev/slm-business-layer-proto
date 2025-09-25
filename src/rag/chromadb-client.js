/**
 * SLM Business Service Layer - ChromaDB Client
 *
 * @author Partha Chandramohan
 * @description ChromaDB client for local vector storage and semantic search operations
 */
const { ChromaClient } = require('chromadb');
const { urlBuilder } = require('../../config/service-urls');

class ChromaDBClient {
  constructor() {
    this.client = null;
    this.collection = null;
    this.collectionName = 'business_requirements';
    this.initialized = false;
  }

  async initialize() {
    try {
      // Use ChromaDB client connected to Docker instance
      this.client = new ChromaClient({
        path: "http://localhost:8000"
      });

      // Create or get collection
      await this.initializeCollection();

      this.initialized = true;
      console.log('ChromaDB client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ChromaDB client:', error);
      throw new Error('ChromaDB initialization failed');
    }
  }

  async initializeCollection() {
    try {
      // Try to get existing collection
      this.collection = await this.client.getCollection({
        name: this.collectionName
      });
      console.log(`Connected to existing collection: ${this.collectionName}`);
    } catch (error) {
      // Create new collection if it doesn't exist
      this.collection = await this.client.createCollection({
        name: this.collectionName,
        metadata: {
          description: 'Business requirements and documentation storage',
          created_at: new Date().toISOString()
        }
      });
      console.log(`Created new collection: ${this.collectionName}`);
    }
  }

  async addDocuments(documents) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const ids = documents.map((_, index) => `doc_${Date.now()}_${index}`);
      const texts = documents.map(doc => doc.content || doc.text);
      const metadatas = documents.map(doc => ({
        source: doc.source || 'unknown',
        type: doc.type || 'document',
        title: doc.title || '',
        created_at: doc.created_at || new Date().toISOString(),
        ...doc.metadata
      }));

      await this.collection.add({
        ids: ids,
        documents: texts,
        metadatas: metadatas
      });

      console.log(`Added ${documents.length} documents to collection`);
      return { success: true, added: documents.length, ids };
    } catch (error) {
      console.error('Error adding documents:', error);
      throw new Error('Failed to add documents to vector store');
    }
  }

  /**
   * Get or create a collection with the specified name
   */
  async getOrCreateCollection(collectionName, metadata = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Use ChromaDB's built-in getOrCreateCollection method
      const collection = await this.client.getOrCreateCollection({
        name: collectionName,
        metadata: {
          description: metadata.description || 'ChromaDB collection',
          created_at: new Date().toISOString(),
          ...metadata
        }
      });
      console.log(`Collection ready: ${collectionName}`);
      return collection;
    } catch (error) {
      console.error(`Failed to get/create collection ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific collection by name
   */
  async getCollection(collectionName) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.client.getCollection({
      name: collectionName
    });
  }

  async search(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const {
        topK = 5,
        threshold = 0.0,
        filters = {}
      } = options;

      const results = await this.collection.query({
        queryTexts: [query],
        nResults: topK,
        where: Object.keys(filters).length > 0 ? filters : undefined
      });

      if (!results.documents || !results.documents[0]) {
        return [];
      }

      const formattedResults = results.documents[0].map((doc, index) => ({
        content: doc,
        metadata: results.metadatas[0][index],
        score: results.distances[0][index],
        id: results.ids[0][index]
      }))
      .filter(result => result.score >= threshold)
      .sort((a, b) => b.score - a.score);

      return formattedResults;
    } catch (error) {
      console.error('Error searching documents:', error);
      throw new Error('Failed to search vector store');
    }
  }

  async updateDocument(id, newContent, metadata = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await this.collection.update({
        ids: [id],
        documents: [newContent],
        metadatas: [{
          ...metadata,
          updated_at: new Date().toISOString()
        }]
      });

      console.log(`Updated document: ${id}`);
      return { success: true, id };
    } catch (error) {
      console.error('Error updating document:', error);
      throw new Error('Failed to update document');
    }
  }

  async deleteDocument(id) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await this.collection.delete({
        ids: [id]
      });

      console.log(`Deleted document: ${id}`);
      return { success: true, id };
    } catch (error) {
      console.error('Error deleting document:', error);
      throw new Error('Failed to delete document');
    }
  }

  async getStats() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const count = await this.collection.count();

      return {
        documentCount: count,
        collectionName: this.collectionName,
        embeddingModel: 'sentence-transformers',
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return null;
    }
  }

  async listDocuments(limit = 100, offset = 0) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const results = await this.collection.get({
        limit: limit,
        offset: offset,
        include: ['documents', 'metadatas']
      });

      return results.documents.map((doc, index) => ({
        id: results.ids[index],
        content: doc,
        metadata: results.metadatas[index]
      }));
    } catch (error) {
      console.error('Error listing documents:', error);
      throw new Error('Failed to list documents');
    }
  }

  async clearCollection() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await this.client.deleteCollection({
        name: this.collectionName
      });

      await this.initializeCollection();
      console.log('Collection cleared and reinitialized');
      return { success: true };
    } catch (error) {
      console.error('Error clearing collection:', error);
      throw new Error('Failed to clear collection');
    }
  }

  async checkHealth() {
    try {
      if (!this.initialized) {
        return { healthy: false, error: 'Not initialized' };
      }

      const stats = await this.getStats();
      return {
        healthy: true,
        stats: stats,
        connection: 'active'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

module.exports = new ChromaDBClient();