# SLM Training Guide: Using BRDs with Your Business Service Layer

**Author:** Partha Chandramohan
**Description:** Complete guide for training/configuring your SLM to use Business Requirements Documents

## Overview

Your SLM Business Service Layer uses **Retrieval-Augmented Generation (RAG)** rather than traditional model training. This means the SLM doesn't need to be retrained - instead, we load your BRDs into a vector database for semantic retrieval during inference.

## Training Process Architecture

```
BRD Document → Parsing & Chunking → Vector Embeddings → ChromaDB Storage → SLM Retrieval
```

## Step-by-Step Training Process

### 1. Prepare Your BRD Documents

Your BRDs should follow the structured format that the parser expects:

**Required Sections:**
- Business Requirements (`## Business Requirements`)
- Functional Requirements (`## Functional Requirements`)
- Business Rules (`## Business Rules`)
- User Stories (`## User Stories`)
- Acceptance Criteria (`## Acceptance Criteria`)

**Supported Formats:**
- Markdown (.md) - Recommended
- Plain text (.txt)
- JSON (.json)
- DOCX (.docx) - via parser
- PDF (.pdf) - via parser

### 2. Set Up the Environment

```bash
# Activate virtual environment
source venv/bin/activate

# Install dependencies if not already done
pip install -r requirements.txt

# Start ChromaDB service
docker-compose -f docker-compose.simple.yml up chromadb -d
```

### 3. Ingest BRD Documents

**Option A: Use the specialized BRD ingestion script (Recommended)**

```bash
# Ingest a single BRD file
python3 scripts/ingest-brd.py --input docs/sample-brds/inventory-order-management-brd.md --test

# Ingest all BRDs from a directory
python3 scripts/ingest-brd.py --input data/brds/ --test

# Custom test query
python3 scripts/ingest-brd.py --input data/brds/ --test --query "What are the inventory management business rules?"
```

**Option B: Use the general RAG initialization script**

```bash
# Initialize with sample documents
python3 scripts/init-rag-db.py

# Clear existing and reinitialize
python3 scripts/init-rag-db.py --clear
```

### 4. Verify BRD Ingestion

Check that your BRDs were properly parsed and stored:

```python
import chromadb

# Connect to ChromaDB
client = chromadb.PersistentClient(path="./chroma_data")
collection = client.get_collection("business_requirements")

# Check collection stats
print(f"Documents in collection: {collection.count()}")

# Test retrieval
results = collection.query(
    query_texts=["order management business rules"],
    n_results=3
)

for i, doc in enumerate(results['documents'][0]):
    print(f"Result {i+1}: {doc[:100]}...")
```

### 5. Configure SLM for Business Queries

The SLM automatically uses the ingested BRDs through the RAG pipeline:

**Prompt Builder Integration:**
- Retrieves relevant BRD sections based on user query
- Constructs context-aware prompts with business rules
- Includes constraints and guidelines from BRDs

**Business Query Flow:**
```
User Query → Context Enrichment → RAG Retrieval → Prompt Construction → SLM Inference → Action Parsing
```

### 6. Test the Integrated System

**Start the complete system:**

```bash
# Start all services
npm run dev:services

# Start the orchestration layer
npm run dev
```

**Test via API:**

```bash
# Generate JWT token
curl -X POST http://localhost:8001/api/generate-token \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "role": "admin"}'

# Test business query with BRD context
curl -X POST http://localhost:8001/api/business-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "request": "What are the business rules for order cancellation?",
    "context": {"department": "operations"}
  }'
```

**Test via Browser Interface:**

1. Open http://localhost:8001/test-interface.html
2. Generate a token
3. Try business queries like:
   - "Show me the inventory management requirements"
   - "What are the order processing business rules?"
   - "List the acceptance criteria for payment processing"

## Advanced Configuration

### Custom Section Types

Modify `src/rag/brd-parser.js` to recognize custom section headers:

```javascript
this.sectionHeaders = [
  'business requirements',
  'functional requirements',
  'business rules',
  'your_custom_section',  // Add custom sections
  // ... other headers
];
```

### Fine-tune Retrieval

Adjust retrieval parameters in `src/orchestration/prompt-builder.js`:

```javascript
const relevantDocs = await ragService.search(query, {
  limit: 5,           // Number of chunks to retrieve
  threshold: 0.7,     // Similarity threshold
  filters: {
    document_type: 'BRD',
    section_type: 'business_rules'
  }
});
```

### SLM Model Selection

Configure different models for different query types in `config/models.yaml`:

```yaml
business_queries:
  model: "llama3.2:3b"
  temperature: 0.3      # Low temperature for factual responses
  max_tokens: 1024

technical_queries:
  model: "codellama:7b"
  temperature: 0.1
  max_tokens: 2048
```

## Monitoring and Optimization

### Track BRD Usage

Monitor which BRD sections are being retrieved:

```javascript
// In prompt-builder.js
const retrievalStats = {
  query: userQuery,
  retrieved_sections: relevantDocs.map(doc => ({
    source: doc.metadata.source_file,
    section: doc.metadata.section_title,
    relevance_score: doc.score
  })),
  timestamp: new Date().toISOString()
};

console.log('BRD Retrieval Stats:', retrievalStats);
```

### Optimize Chunk Size

Experiment with different chunk sizes for better retrieval:

```python
# In brd-parser.js or ingest-brd.py
def chunkDocument(content, chunkSize=1000, overlap=200):
    # Adjust these parameters based on your BRD structure
    # Smaller chunks: More specific retrieval
    # Larger chunks: More context but less precision
```

### Update BRDs

To update BRDs after changes:

```bash
# Clear existing collection
python3 scripts/ingest-brd.py --input data/brds/ --clear

# Re-ingest updated BRDs
python3 scripts/ingest-brd.py --input data/brds/ --test
```

## Troubleshooting

### Common Issues

**1. No documents found during retrieval**
- Check if ChromaDB service is running: `curl http://localhost:8000/api/v2/version`
- Verify collection exists: Check `chroma_data` directory
- Test with simpler queries first

**2. Poor retrieval quality**
- Ensure BRD sections are well-structured with clear headers
- Try different embedding models in `src/rag/embedding-service.js`
- Adjust similarity thresholds

**3. SLM not using BRD context**
- Verify prompt-builder is retrieving documents
- Check SLM model is loaded: `curl http://localhost:11434/api/tags`
- Review generated prompts in logs

### Debug Mode

Enable debug logging to see RAG retrieval in action:

```bash
NODE_ENV=development LOG_LEVEL=debug npm run dev
```

## Production Considerations

### Scaling BRD Collections

For large numbers of BRDs:

```python
# Use multiple collections for different domains
collections = {
    'order_management': client.create_collection('order_mgmt_brds'),
    'inventory': client.create_collection('inventory_brds'),
    'finance': client.create_collection('finance_brds')
}
```

### Version Control

Track BRD versions in metadata:

```python
metadata = {
    'source_file': filename,
    'version': '2.1',
    'effective_date': '2024-01-15',
    'department': 'operations',
    'approval_status': 'approved'
}
```

### Security

Implement access controls for sensitive BRDs:

```javascript
// In rbac.js
const canAccessBRD = await rbac.checkPermission(user, 'brd:read', {
  department: brdMetadata.department,
  classification: brdMetadata.classification
});
```

## Success Metrics

Track these metrics to measure BRD training effectiveness:

- **Retrieval Accuracy**: Percentage of queries that retrieve relevant BRD sections
- **Query Resolution Rate**: Percentage of business queries successfully answered
- **Response Quality**: User satisfaction with SLM responses
- **BRD Coverage**: Percentage of BRD content that gets retrieved in queries

Your SLM Business Service Layer is now ready to intelligently process business queries using your specific BRDs!