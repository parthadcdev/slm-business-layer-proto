#!/usr/bin/env python3
"""
BRD Document Ingestor for RAG System (Docker ChromaDB)
Author: Partha Chandramohan

Ingests Business Requirements Documents into ChromaDB for RAG retrieval
"""

import os
import glob
import chromadb
from pathlib import Path

class BRDIngestor:
    def __init__(self, chromadb_host="localhost", chromadb_port=8000):
        self.client = None
        self.collection = None
        self.collection_name = "business_requirements"
        self.chromadb_host = chromadb_host
        self.chromadb_port = chromadb_port

    def initialize(self):
        """Initialize ChromaDB client and collection"""
        try:
            # Connect to ChromaDB Docker instance
            self.client = chromadb.HttpClient(
                host=self.chromadb_host,
                port=self.chromadb_port
            )

            print(f"🔌 Connected to ChromaDB at {self.chromadb_host}:{self.chromadb_port}")

            # Get or create collection
            try:
                self.collection = self.client.get_collection(name=self.collection_name)
                print(f"📂 Using existing collection: {self.collection_name}")
            except Exception:
                # Collection doesn't exist, create it
                self.collection = self.client.create_collection(
                    name=self.collection_name,
                    metadata={
                        "description": "Business Requirements Documents for SLM Business Layer",
                        "created": "2024-09-20",
                        "version": "1.0"
                    }
                )
                print(f"📂 Created new collection: {self.collection_name}")

            return True

        except Exception as e:
            print(f"❌ Failed to initialize ChromaDB: {e}")
            return False

    def chunk_document(self, content, filename):
        """Chunk document into smaller sections for embedding"""
        chunks = []
        lines = content.split('\n')

        current_chunk = ""
        current_section = ""
        chunk_index = 0

        for line in lines:
            # Detect section headers
            if line.startswith('#'):
                # Save previous chunk if it exists
                if current_chunk.strip():
                    chunks.append(self.create_chunk(current_chunk, filename, current_section, chunk_index))
                    chunk_index += 1
                    current_chunk = ""
                current_section = line.replace('#', '').strip()

            current_chunk += line + '\n'

            # Create chunks based on size (approximately 500 words)
            if len(current_chunk) > 2000:
                chunks.append(self.create_chunk(current_chunk, filename, current_section, chunk_index))
                chunk_index += 1
                current_chunk = ""

        # Add final chunk
        if current_chunk.strip():
            chunks.append(self.create_chunk(current_chunk, filename, current_section, chunk_index))

        return chunks

    def create_chunk(self, content, filename, section, index):
        """Create a chunk with metadata"""
        chunk_id = f"{filename.replace('.md', '')}_chunk_{index}"

        # Determine document type based on filename
        doc_type = "general"
        if "comprehensive" in filename.lower():
            doc_type = "master"
        elif "financial" in filename.lower():
            doc_type = "financial"
        elif "customer" in filename.lower():
            doc_type = "customer"
        elif "procurement" in filename.lower():
            doc_type = "procurement"
        elif "inventory" in filename.lower():
            doc_type = "inventory"

        return {
            "id": chunk_id,
            "content": content.strip(),
            "metadata": {
                "filename": filename,
                "section": section,
                "chunk_index": index,
                "document_type": doc_type,
                "word_count": len(content.strip().split())
            }
        }

    def ingest_brd_documents(self, brd_directory="docs/sample-brds"):
        """Ingest all BRD documents from directory"""
        try:
            print(f"📖 Starting BRD ingestion from: {brd_directory}")

            # Find all markdown files
            md_files = glob.glob(os.path.join(brd_directory, "*.md"))
            print(f"📄 Found {len(md_files)} BRD documents to process")

            all_chunks = []
            total_chunks = 0

            for file_path in md_files:
                filename = os.path.basename(file_path)
                print(f"\n🔍 Processing: {filename}")

                # Read file content
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Chunk the document
                chunks = self.chunk_document(content, filename)
                all_chunks.extend(chunks)
                total_chunks += len(chunks)

                print(f"  📝 Created {len(chunks)} chunks from {filename}")

            # Add all chunks to ChromaDB in batches
            if all_chunks:
                print(f"\n🔄 Adding {len(all_chunks)} chunks to ChromaDB...")

                # Process in batches to avoid memory issues
                batch_size = 50
                for i in range(0, len(all_chunks), batch_size):
                    batch = all_chunks[i:i + batch_size]

                    ids = [chunk["id"] for chunk in batch]
                    documents = [chunk["content"] for chunk in batch]
                    metadatas = [chunk["metadata"] for chunk in batch]

                    self.collection.add(
                        ids=ids,
                        documents=documents,
                        metadatas=metadatas
                    )

                    print(f"  ✅ Added batch {i//batch_size + 1} ({len(batch)} chunks)")

                print(f"✅ Successfully ingested {len(all_chunks)} chunks!")

            print(f"\n🎉 BRD ingestion completed successfully!")
            print(f"📊 Total documents processed: {len(md_files)}")
            print(f"📊 Total chunks created: {total_chunks}")

            return {"documents_processed": len(md_files), "total_chunks": total_chunks}

        except Exception as e:
            print(f"❌ BRD ingestion failed: {e}")
            raise

    def test_retrieval(self, query="customer experience analytics", n_results=3):
        """Test retrieval with a sample query"""
        try:
            print(f"\n🔍 Testing retrieval with query: '{query}'")

            results = self.collection.query(
                query_texts=[query],
                n_results=n_results
            )

            print(f"📊 Found {len(results['documents'][0])} relevant chunks:")

            for i, (doc, metadata, distance) in enumerate(zip(
                results['documents'][0],
                results['metadatas'][0],
                results['distances'][0]
            )):
                print(f"\n📄 Result {i+1}:")
                print(f"   📁 Source: {metadata['filename']}")
                print(f"   📝 Section: {metadata['section']}")
                print(f"   📏 Distance: {distance:.4f}")
                print(f"   📖 Content: {doc[:200]}...")

            return results

        except Exception as e:
            print(f"❌ Retrieval test failed: {e}")
            return None

    def get_collection_stats(self):
        """Get collection statistics"""
        try:
            count = self.collection.count()
            print(f"📊 Collection Statistics:")
            print(f"   📄 Total chunks: {count}")
            print(f"   📂 Collection: {self.collection_name}")

            return {"total_chunks": count, "collection_name": self.collection_name}

        except Exception as e:
            print(f"❌ Failed to get collection stats: {e}")
            return None

def main():
    """Main execution function"""
    ingestor = BRDIngestor()

    print("🚀 Starting BRD Ingestion Process...\n")

    # Initialize connection
    if not ingestor.initialize():
        print("❌ Failed to initialize. Exiting.")
        return 1

    try:
        # Ingest BRD documents
        results = ingestor.ingest_brd_documents()

        # Get collection statistics
        ingestor.get_collection_stats()

        # Test retrieval with various queries
        test_queries = [
            "customer experience analytics",
            "financial reporting automation",
            "supplier performance optimization",
            "inventory management system"
        ]

        for query in test_queries:
            ingestor.test_retrieval(query)

        print('\n✅ BRD Ingestion completed successfully!')
        return 0

    except Exception as e:
        print(f'\n❌ Ingestion process failed: {e}')
        return 1

if __name__ == "__main__":
    exit(main())