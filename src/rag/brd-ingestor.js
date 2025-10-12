/**
 * BRD Document Ingestor for RAG System
 * Author: Partha Chandramohan
 *
 * Ingests Business Requirements Documents into ChromaDB for RAG retrieval
 */

const fs = require("fs").promises;
const path = require("path");
const { ChromaClient } = require("chromadb");

class BRDIngestor {
  constructor() {
    this.client = null;
    this.collection = null;
    this.collectionName = "business_requirements";
  }

  async initialize() {
    try {
      // Initialize ChromaDB client
      this.client = new ChromaClient({
        path: "http://localhost:8000",
      });

      console.log("🔌 Connected to ChromaDB successfully");

      // Get or create collection
      try {
        this.collection = await this.client.getCollection({
          name: this.collectionName,
        });
        console.log(`📂 Using existing collection: ${this.collectionName}`);
      } catch (error) {
        // Collection doesn't exist, create it
        this.collection = await this.client.createCollection({
          name: this.collectionName,
          metadata: {
            description:
              "Business Requirements Documents for SLM Business Layer",
            created: new Date().toISOString(),
            version: "1.0",
          },
        });
        console.log(`📂 Created new collection: ${this.collectionName}`);
      }

      return true;
    } catch (error) {
      console.error("❌ Failed to initialize ChromaDB:", error.message);
      return false;
    }
  }

  async ingestBRDDocuments(brdDirectory = "docs/sample-brds") {
    try {
      console.log(`📖 Starting BRD ingestion from: ${brdDirectory}`);

      // Read all markdown files in the BRD directory
      const files = await fs.readdir(brdDirectory);
      const markdownFiles = files.filter((file) => file.endsWith(".md"));

      console.log(`📄 Found ${markdownFiles.length} BRD documents to process`);

      let totalChunks = 0;

      for (const file of markdownFiles) {
        const filePath = path.join(brdDirectory, file);
        console.log(`\n🔍 Processing: ${file}`);

        const content = await fs.readFile(filePath, "utf8");
        const chunks = this.chunkDocument(content, file);

        console.log(`  📝 Created ${chunks.length} chunks from ${file}`);

        // Add chunks to ChromaDB
        await this.addChunksToCollection(chunks);
        totalChunks += chunks.length;

        console.log(`  ✅ Ingested ${chunks.length} chunks from ${file}`);
      }

      console.log(`\n🎉 BRD ingestion completed successfully!`);
      console.log(`📊 Total documents processed: ${markdownFiles.length}`);
      console.log(`📊 Total chunks created: ${totalChunks}`);

      return { documentsProcessed: markdownFiles.length, totalChunks };
    } catch (error) {
      console.error("❌ BRD ingestion failed:", error.message);
      throw error;
    }
  }

  chunkDocument(content, filename) {
    const chunks = [];
    const lines = content.split("\n");

    let currentChunk = "";
    let currentSection = "";
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect section headers
      if (line.startsWith("#")) {
        // Save previous chunk if it exists
        if (currentChunk.trim()) {
          chunks.push(
            this.createChunk(
              currentChunk,
              filename,
              currentSection,
              chunkIndex++,
            ),
          );
          currentChunk = "";
        }
        currentSection = line.replace(/^#+\s*/, "");
      }

      currentChunk += line + "\n";

      // Create chunks based on size (approximately 500 words)
      if (currentChunk.length > 2000) {
        chunks.push(
          this.createChunk(
            currentChunk,
            filename,
            currentSection,
            chunkIndex++,
          ),
        );
        currentChunk = "";
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(
        this.createChunk(currentChunk, filename, currentSection, chunkIndex++),
      );
    }

    return chunks;
  }

  createChunk(content, filename, section, index) {
    const id = `${filename.replace(".md", "")}_chunk_${index}`;

    // Determine document type based on filename
    let docType = "general";
    if (filename.includes("comprehensive")) docType = "master";
    else if (filename.includes("financial")) docType = "financial";
    else if (filename.includes("customer")) docType = "customer";
    else if (filename.includes("procurement")) docType = "procurement";
    else if (filename.includes("inventory")) docType = "inventory";

    return {
      id: id,
      content: content.trim(),
      metadata: {
        filename: filename,
        section: section,
        chunk_index: index,
        document_type: docType,
        ingested_at: new Date().toISOString(),
        word_count: content.trim().split(/\s+/).length,
      },
    };
  }

  async addChunksToCollection(chunks) {
    try {
      const ids = chunks.map((chunk) => chunk.id);
      const documents = chunks.map((chunk) => chunk.content);
      const metadatas = chunks.map((chunk) => chunk.metadata);

      await this.collection.add({
        ids: ids,
        documents: documents,
        metadatas: metadatas,
      });
    } catch (error) {
      console.error("❌ Failed to add chunks to collection:", error.message);
      throw error;
    }
  }

  async testRetrieval(query = "customer experience analytics") {
    try {
      console.log(`\n🔍 Testing retrieval with query: "${query}"`);

      const results = await this.collection.query({
        queryTexts: [query],
        nResults: 3,
      });

      console.log(`📊 Found ${results.documents[0].length} relevant chunks:`);

      results.documents[0].forEach((doc, index) => {
        console.log(`\n📄 Result ${index + 1}:`);
        console.log(`   📁 Source: ${results.metadatas[0][index].filename}`);
        console.log(`   📝 Section: ${results.metadatas[0][index].section}`);
        console.log(
          `   📏 Distance: ${results.distances[0][index].toFixed(4)}`,
        );
        console.log(`   📖 Content: ${doc.substring(0, 200)}...`);
      });

      return results;
    } catch (error) {
      console.error("❌ Retrieval test failed:", error.message);
      throw error;
    }
  }

  async getCollectionStats() {
    try {
      const count = await this.collection.count();
      console.log(`📊 Collection Statistics:`);
      console.log(`   📄 Total chunks: ${count}`);
      console.log(`   📂 Collection: ${this.collectionName}`);

      return { totalChunks: count, collectionName: this.collectionName };
    } catch (error) {
      console.error("❌ Failed to get collection stats:", error.message);
      return null;
    }
  }
}

module.exports = { BRDIngestor };

// CLI execution if run directly
if (require.main === module) {
  async function main() {
    const ingestor = new BRDIngestor();

    console.log("🚀 Starting BRD Ingestion Process...\n");

    // Initialize connection
    const initialized = await ingestor.initialize();
    if (!initialized) {
      console.error("❌ Failed to initialize. Exiting.");
      process.exit(1);
    }

    // Ingest BRD documents
    try {
      const results = await ingestor.ingestBRDDocuments();

      // Get collection statistics
      await ingestor.getCollectionStats();

      // Test retrieval
      await ingestor.testRetrieval("customer experience analytics");
      await ingestor.testRetrieval("financial reporting automation");
      await ingestor.testRetrieval("supplier performance optimization");

      console.log("\n✅ BRD Ingestion completed successfully!");
    } catch (error) {
      console.error("\n❌ Ingestion process failed:", error.message);
      process.exit(1);
    }
  }

  main().catch(console.error);
}
