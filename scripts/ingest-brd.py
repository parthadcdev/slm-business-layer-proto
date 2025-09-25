#!/usr/bin/env python3
"""
SLM Business Service Layer - BRD Ingestion Script

@author: Partha Chandramohan
@description: Specialized script for ingesting Business Requirements Documents into the RAG system
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import List, Dict, Any

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import dependencies
try:
    import chromadb
    print("✓ ChromaDB available")
except ImportError as e:
    print(f"❌ ChromaDB not available: {e}")
    print("Please run: pip install chromadb")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class BRDIngestionService:
    """Service for ingesting Business Requirements Documents into the RAG system."""

    def __init__(self, chroma_path: str = None):
        self.project_root = project_root
        self.chroma_path = chroma_path or str(project_root / "chroma_data")
        self.chroma_client = None
        self.collection = None

    def initialize_chroma(self):
        """Initialize ChromaDB connection."""
        try:
            self.chroma_client = chromadb.PersistentClient(path=self.chroma_path)

            # Get or create collection
            try:
                self.collection = self.chroma_client.get_collection(name="business_requirements")
                logger.info("Connected to existing business_requirements collection")
            except Exception:
                self.collection = self.chroma_client.create_collection(
                    name="business_requirements",
                    metadata={"description": "Business requirements and documentation for SLM processing"}
                )
                logger.info("Created new business_requirements collection")

            return True
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")
            return False

    def parse_brd_content(self, content: str, filename: str) -> List[Dict[str, Any]]:
        """Parse BRD content into structured sections."""
        sections = []
        lines = content.split('\n')
        current_section = None

        for i, line in enumerate(lines):
            line = line.strip()

            # Detect section headers (markdown style)
            if line.startswith('#') and len(line) > 1:
                # Save previous section
                if current_section and current_section['content'].strip():
                    sections.append(current_section)

                # Start new section
                title = line.lstrip('#').strip()
                section_type = self.classify_section_type(title)

                current_section = {
                    'title': title,
                    'type': section_type,
                    'content': title + '\n\n',
                    'line_start': i,
                    'source_file': filename
                }
            elif current_section and line:
                current_section['content'] += line + '\n'

        # Add final section
        if current_section and current_section['content'].strip():
            sections.append(current_section)

        return sections

    def classify_section_type(self, title: str) -> str:
        """Classify section type based on title."""
        title_lower = title.lower()

        classification_map = {
            'business_requirements': ['business requirement', 'business objective', 'br-'],
            'functional_requirements': ['functional requirement', 'req-', 'system shall'],
            'business_rules': ['business rule', 'business logic', 'rule'],
            'user_stories': ['user stor', 'as a', 'as an'],
            'acceptance_criteria': ['acceptance', 'given', 'when', 'then'],
            'process_flow': ['process', 'workflow', 'flow'],
            'data_requirements': ['data requirement', 'data model', 'database'],
            'integration_requirements': ['integration', 'api', 'endpoint'],
            'security_requirements': ['security', 'authentication', 'authorization'],
            'performance_requirements': ['performance', 'scalability', 'sla']
        }

        for section_type, keywords in classification_map.items():
            if any(keyword in title_lower for keyword in keywords):
                return section_type

        return 'general'

    def extract_business_entities(self, content: str) -> Dict[str, List[str]]:
        """Extract business entities from content."""
        import re

        entities = {
            'requirements': [],
            'business_rules': [],
            'user_stories': [],
            'acceptance_criteria': [],
            'endpoints': [],
            'entities': []
        }

        # Extract numbered requirements
        req_pattern = r'(?:REQ|R)[-_]?(\d+)[:.]\s*(.+)'
        requirements = re.findall(req_pattern, content, re.IGNORECASE | re.MULTILINE)
        entities['requirements'] = [f"REQ-{num}: {desc.strip()}" for num, desc in requirements]

        # Extract business rules
        br_pattern = r'(?:BR|Business Rule)[-_]?(\d+)?[:.]\s*(.+)'
        business_rules = re.findall(br_pattern, content, re.IGNORECASE | re.MULTILINE)
        entities['business_rules'] = [f"BR-{num or 'X'}: {desc.strip()}" for num, desc in business_rules]

        # Extract user stories
        story_pattern = r'As (?:a|an)\s+(.+?),?\s+I want\s+(.+?),?\s+so that\s+(.+)'
        user_stories = re.findall(story_pattern, content, re.IGNORECASE | re.MULTILINE)
        entities['user_stories'] = [f"As a {role}, I want {want}, so that {benefit}"
                                   for role, want, benefit in user_stories]

        # Extract acceptance criteria
        ac_pattern = r'Given\s+(.+?),?\s+When\s+(.+?),?\s+Then\s+(.+)'
        acceptance_criteria = re.findall(ac_pattern, content, re.IGNORECASE | re.MULTILINE)
        entities['acceptance_criteria'] = [f"Given {given}, When {when}, Then {then}"
                                         for given, when, then in acceptance_criteria]

        # Extract API endpoints
        endpoint_pattern = r'(?:GET|POST|PUT|DELETE|PATCH)\s+(/[^\s]+)'
        endpoints = re.findall(endpoint_pattern, content, re.IGNORECASE)
        entities['endpoints'] = list(set(endpoints))

        return entities

    def ingest_brd_file(self, file_path: str):
        """Ingest a single BRD file into the vector store."""
        try:
            logger.info(f"Processing BRD file: {file_path}")

            # Read file content
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            filename = os.path.basename(file_path)

            # Parse content into sections
            sections = self.parse_brd_content(content, filename)

            # Extract business entities
            entities = self.extract_business_entities(content)

            # Add sections to vector store
            documents = []
            metadatas = []
            ids = []

            for i, section in enumerate(sections):
                doc_id = f"{filename}_section_{i}_{hash(section['content'][:50])}"

                # Enhanced metadata
                metadata = {
                    'source_file': filename,
                    'section_title': section['title'],
                    'section_type': section['type'],
                    'document_type': 'BRD',
                    'chunk_index': i,
                    'total_sections': len(sections),
                    'ingested_at': '2024-12-17T12:00:00Z',
                    'requirements_count': len([e for e in entities['requirements'] if e.lower() in section['content'].lower()]),
                    'business_rules_count': len([e for e in entities['business_rules'] if e.lower() in section['content'].lower()])
                }

                documents.append(section['content'])
                metadatas.append(metadata)
                ids.append(doc_id)

            # Add to ChromaDB collection
            if documents:
                self.collection.add(
                    documents=documents,
                    metadatas=metadatas,
                    ids=ids
                )

                logger.info(f"✓ Successfully ingested {len(documents)} sections from {filename}")

                # Log entity summary
                for entity_type, entity_list in entities.items():
                    if entity_list:
                        logger.info(f"  - Found {len(entity_list)} {entity_type}")

                return True
            else:
                logger.warning(f"No sections found in {filename}")
                return False

        except Exception as e:
            logger.error(f"Failed to ingest {file_path}: {e}")
            return False

    def ingest_directory(self, directory_path: str):
        """Ingest all BRD files from a directory."""
        if not os.path.exists(directory_path):
            logger.error(f"Directory does not exist: {directory_path}")
            return False

        brd_files = []
        for ext in ['*.md', '*.txt', '*.json']:
            brd_files.extend(Path(directory_path).glob(ext))

        if not brd_files:
            logger.warning(f"No BRD files found in {directory_path}")
            return False

        logger.info(f"Found {len(brd_files)} BRD files to process")

        success_count = 0
        for file_path in brd_files:
            if self.ingest_brd_file(str(file_path)):
                success_count += 1

        logger.info(f"Successfully ingested {success_count}/{len(brd_files)} files")
        return success_count > 0

    def test_retrieval(self, query: str = "What are the order management business rules?"):
        """Test the retrieval system with a sample query."""
        try:
            logger.info(f"Testing retrieval with query: {query}")

            results = self.collection.query(
                query_texts=[query],
                n_results=5,
                include=['documents', 'metadatas', 'distances']
            )

            if results['documents'] and results['documents'][0]:
                logger.info(f"Found {len(results['documents'][0])} relevant sections")

                for i, (doc, metadata, distance) in enumerate(zip(
                    results['documents'][0],
                    results['metadatas'][0],
                    results['distances'][0]
                )):
                    logger.info(f"Result {i+1} (score: {1-distance:.3f}):")
                    logger.info(f"  Source: {metadata['source_file']}")
                    logger.info(f"  Section: {metadata['section_title']}")
                    logger.info(f"  Type: {metadata['section_type']}")
                    logger.info(f"  Content preview: {doc[:100]}...")
                    logger.info("")

                return True
            else:
                logger.warning("No relevant documents found")
                return False

        except Exception as e:
            logger.error(f"Retrieval test failed: {e}")
            return False

    def get_collection_stats(self):
        """Get statistics about the collection."""
        try:
            count = self.collection.count()
            logger.info(f"Collection statistics:")
            logger.info(f"  Total documents: {count}")

            # Get sample of metadata to show document types
            if count > 0:
                sample = self.collection.peek(limit=min(10, count))
                if sample['metadatas']:
                    doc_types = {}
                    section_types = {}

                    for metadata in sample['metadatas']:
                        doc_type = metadata.get('document_type', 'unknown')
                        section_type = metadata.get('section_type', 'unknown')

                        doc_types[doc_type] = doc_types.get(doc_type, 0) + 1
                        section_types[section_type] = section_types.get(section_type, 0) + 1

                    logger.info(f"  Document types: {dict(doc_types)}")
                    logger.info(f"  Section types: {dict(section_types)}")

            return count
        except Exception as e:
            logger.error(f"Failed to get collection stats: {e}")
            return 0


def main():
    """Main function for BRD ingestion."""
    import argparse

    parser = argparse.ArgumentParser(description="Ingest Business Requirements Documents into RAG system")
    parser.add_argument("--input", "-i", required=True, help="BRD file or directory to ingest")
    parser.add_argument("--chroma-path", help="Path to ChromaDB storage (default: ./chroma_data)")
    parser.add_argument("--test", "-t", action="store_true", help="Run retrieval test after ingestion")
    parser.add_argument("--query", help="Custom test query (requires --test)")

    args = parser.parse_args()

    # Initialize ingestion service
    service = BRDIngestionService(chroma_path=args.chroma_path)

    if not service.initialize_chroma():
        print("❌ Failed to initialize ChromaDB")
        sys.exit(1)

    # Ingest BRD(s)
    input_path = args.input
    if os.path.isfile(input_path):
        success = service.ingest_brd_file(input_path)
    elif os.path.isdir(input_path):
        success = service.ingest_directory(input_path)
    else:
        print(f"❌ Input path does not exist: {input_path}")
        sys.exit(1)

    if not success:
        print("❌ BRD ingestion failed")
        sys.exit(1)

    # Get collection statistics
    service.get_collection_stats()

    # Run retrieval test if requested
    if args.test:
        query = args.query or "What are the business requirements for order management?"
        service.test_retrieval(query)

    print("\n✅ BRD ingestion completed successfully!")
    print("\nNext steps to use the BRD in your SLM:")
    print("1. Start ChromaDB service: podman-compose -f docker-compose.yml up chromadb")
    print("2. Start the orchestration service: npm run dev")
    print("3. Test business queries via API: POST /api/business-request")
    print("4. Example query: 'Show me the business rules for order processing'")


if __name__ == "__main__":
    main()