# SLM Business Service Layer - Functional Documentation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Modules](#core-modules)
3. [Orchestration Layer](#orchestration-layer)
4. [SLM Integration Layer](#slm-integration-layer)
5. [RAG (Retrieval-Augmented Generation) Layer](#rag-layer)
6. [Security Layer](#security-layer)
7. [Inference Layer](#inference-layer)
8. [API Reference](#api-reference)
9. [Configuration](#configuration)
10. [Testing and Monitoring](#testing-and-monitoring)

---

## Architecture Overview

The SLM Business Service Layer is a revolutionary architecture that replaces traditional custom-coded business service layers with Small Language Model (SLM) driven systems. The system uses Retrieval-Augmented Generation (RAG) to understand business requirements and execute appropriate actions.

### Key Components

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Client Apps       │    │   Browser Interface │    │   External APIs     │
└─────────┬───────────┘    └─────────┬───────────┘    └─────────┬───────────┘
          │                          │                          │
          └─────────────────┐        │        ┌─────────────────┘
                           │        │        │
                    ┌──────▼────────▼────────▼──────┐
                    │     Orchestration Layer       │
                    │        (Express.js)           │
                    └─────────────┬─────────────────┘
                                  │
                    ┌─────────────▼─────────────────┐
                    │       Security Layer          │
                    │   (Auth, RBAC, Validation)    │
                    └─────────────┬─────────────────┘
                                  │
                    ┌─────────────▼─────────────────┐
                    │         SLM Layer             │
                    │      (Ollama, Models)         │
                    └─────────────┬─────────────────┘
                                  │
                    ┌─────────────▼─────────────────┐
                    │        RAG Layer              │
                    │   (ChromaDB, Embeddings)      │
                    └─────────────┬─────────────────┘
                                  │
                    ┌─────────────▼─────────────────┐
                    │     Inference Layer           │
                    │   (DB Functions, Executors)   │
                    └───────────────────────────────┘
```

---

## Core Modules

### Module Directory Structure

```
src/
├── orchestration/          # Main API and request orchestration
│   ├── app.js              # Express server and routes
│   ├── context-manager.js  # Context enrichment and management
│   ├── prompt-builder.js   # Dynamic prompt construction
│   └── middleware/         # Authentication and validation
├── slm/                    # Small Language Model integration
│   ├── ollama-client.js    # Ollama API client
│   ├── model-manager.js    # Model lifecycle management
│   ├── inference-service.js # SLM inference orchestration
│   ├── action-parser.js    # Parse SLM outputs into actions
│   ├── retrieval-service.js # Document retrieval for context
│   └── guardrails.js       # Safety and validation rules
├── rag/                    # Retrieval-Augmented Generation
│   ├── vector-store.js     # Vector database operations
│   ├── chromadb-client.js  # ChromaDB integration
│   ├── embedding-service.js # Text-to-vector embeddings
│   ├── chunk-processor.js  # Document chunking and processing
│   └── brd-parser.js       # Business Requirements parser
├── security/               # Security and access control
│   ├── rbac.js            # Role-Based Access Control
│   └── prompt-sanitizer.js # Input sanitization
├── inference/              # Business logic execution
│   ├── executor.js         # Action execution engine
│   └── db-functions.js     # Database operation functions
└── data-adapters/          # External system integrations
    ├── database-adapter.js # Database connectivity
    ├── api-adapter.js      # External API integration
    ├── file-adapter.js     # File system operations
    └── notification-adapter.js # Notification services
```

---

## Orchestration Layer

The orchestration layer serves as the main entry point and coordinator for all business requests.

### app.js - Main Application Server

**Purpose**: Express.js server that handles HTTP requests, authentication, and routes requests to appropriate services.

**Key Functions**:
- HTTP server setup with security middleware
- Route handling for business requests
- Service status monitoring
- JWT token generation and validation
- Static file serving for test interface

**API Endpoints**:

#### Business Operations
```javascript
POST /api/business-request
```
- **Purpose**: Process natural language business requests
- **Authentication**: JWT Bearer token required
- **Input**:
  ```json
  {
    "request": "Show me all pending orders",
    "context": {
      "department": "sales",
      "user_role": "manager"
    }
  }
  ```
- **Output**:
  ```json
  {
    "success": true,
    "message": "Request processed successfully",
    "data": {...}
  }
  ```

#### Service Status
```javascript
GET /api/service-status/chromadb
GET /api/service-status/ollama
```
- **Purpose**: Check health of external services
- **Authentication**: None required
- **Output**: Service status, version, and connection details

#### Token Management
```javascript
POST /api/generate-token
```
- **Purpose**: Generate JWT tokens for authentication
- **Input**: User credentials and role information
- **Output**: Signed JWT token with expiration

#### Health Check
```javascript
GET /health
```
- **Purpose**: Application health status
- **Output**: Timestamp and health status

### context-manager.js - Context Enrichment

**Purpose**: Enriches user requests with additional context from user profile, permissions, and system state.

**Key Functions**:
```javascript
async enrichContext(context, user)
```
- Adds user permissions and role information
- Retrieves relevant business context
- Validates context against security policies

**Context Enhancement Process**:
1. **User Context**: Role, permissions, department
2. **Temporal Context**: Current time, business hours, fiscal period
3. **Business Context**: Active campaigns, system status, data freshness
4. **Security Context**: Access levels, data sensitivity, audit trail

### prompt-builder.js - Dynamic Prompt Construction

**Purpose**: Constructs context-aware prompts for the SLM based on user requests and retrieved documents.

**Key Functions**:
```javascript
async buildPrompt(request, enrichedContext)
```
- Retrieves relevant documents from RAG system
- Constructs structured prompts with business context
- Applies prompt templates and formatting
- Injects safety guidelines and constraints

**Prompt Structure**:
```
SYSTEM: You are a business intelligence assistant...
CONTEXT: [Retrieved business documents]
CONSTRAINTS: [Security and business rules]
USER REQUEST: [Original user request]
INSTRUCTIONS: [Specific action guidance]
```

### middleware/auth.js - Authentication Middleware

**Purpose**: Validates JWT tokens and extracts user information for request authorization.

**Key Functions**:
- JWT token validation and decoding
- User session management
- Request logging and audit trail
- Error handling for authentication failures

### middleware/validation.js - Request Validation

**Purpose**: Validates incoming requests for structure, content, and business rules compliance.

**Key Functions**:
- Request schema validation
- Business rule enforcement
- Input sanitization
- Rate limiting and abuse prevention

---

## SLM Integration Layer

This layer manages interaction with Small Language Models, particularly through Ollama.

### ollama-client.js - Ollama API Client

**Purpose**: Direct interface to Ollama API for model inference and management.

**Key Functions**:
```javascript
async generateResponse(prompt, modelName)
async listAvailableModels()
async getModelInfo(modelName)
async healthCheck()
```

**Features**:
- Connection pooling and retry logic
- Model switching and optimization
- Response streaming for large outputs
- Error handling and fallback strategies

**Supported Models**:
- Llama 3.2 (3B, 7B parameters)
- Mistral 7B
- CodeLlama for technical queries
- Custom fine-tuned models

### model-manager.js - Model Lifecycle Management

**Purpose**: Manages model loading, unloading, and optimization based on usage patterns.

**Key Functions**:
```javascript
async loadModel(modelName)
async unloadModel(modelName)
async optimizeModelUsage()
async getModelMetrics()
```

**Features**:
- Automatic model loading based on request patterns
- Memory optimization and model switching
- Performance monitoring and metrics
- Model version management

### inference-service.js - SLM Inference Orchestration

**Purpose**: Orchestrates the complete inference pipeline from request to response.

**Key Functions**:
```javascript
async processBusinessRequest(prompt, context)
async streamResponse(prompt, callback)
async batchProcess(requests)
```

**Pipeline Steps**:
1. Request preprocessing and validation
2. Model selection based on request type
3. Prompt optimization and injection
4. Inference execution with monitoring
5. Response post-processing and validation

### action-parser.js - SLM Output Parser

**Purpose**: Parses SLM responses into structured actions and data.

**Key Functions**:
```javascript
async parseResponse(rawResponse)
async extractActions(response)
async validateActions(actions)
```

**Supported Action Types**:
- Database queries (SELECT, UPDATE, INSERT)
- API calls to external systems
- File operations and report generation
- Notification and alert triggers
- Business process initiation

### retrieval-service.js - Document Retrieval

**Purpose**: Retrieves relevant documents and context for prompt enhancement.

**Key Functions**:
```javascript
async retrieveRelevantDocuments(query, limit)
async searchBySemanticSimilarity(embedding)
async filterByPermissions(documents, user)
```

### guardrails.js - Safety and Validation

**Purpose**: Implements safety checks and business rule validation for SLM outputs.

**Key Functions**:
```javascript
async validateResponse(response, context)
async checkBusinessRules(actions)
async sanitizeOutput(response)
```

**Safety Measures**:
- Prompt injection detection
- Harmful content filtering
- Business rule validation
- Data access permission checks
- Output sanitization

---

## RAG Layer

The Retrieval-Augmented Generation layer provides document storage, retrieval, and embedding services.

### vector-store.js - Vector Database Operations

**Purpose**: High-level interface for vector database operations and semantic search.

**Key Functions**:
```javascript
async initialize()
async addDocuments(documents)
async search(query, filters)
async retrieveRelevant(query, topK)
async updateDocument(id, content)
async deleteDocument(id)
```

**Features**:
- Semantic similarity search
- Metadata filtering and ranking
- Document versioning and history
- Batch operations for performance
- Index optimization and maintenance

### chromadb-client.js - ChromaDB Integration

**Purpose**: Direct interface to ChromaDB for vector storage and retrieval.

**Key Functions**:
```javascript
async createCollection(name, metadata)
async addEmbeddings(collection, documents, embeddings)
async queryCollection(collection, queryEmbedding, nResults)
async getCollection(name)
async deleteCollection(name)
```

**Configuration**:
- Persistent storage configuration
- Collection management and metadata
- Embedding dimension settings
- Distance metrics and similarity functions

### embedding-service.js - Text Embeddings

**Purpose**: Converts text documents into vector embeddings for semantic search.

**Key Functions**:
```javascript
async generateEmbedding(text)
async batchEmbeddings(texts)
async compareEmbeddings(embedding1, embedding2)
```

**Supported Models**:
- all-MiniLM-L6-v2 (default)
- sentence-transformers models
- Custom domain-specific embeddings
- Multilingual embedding models

### chunk-processor.js - Document Processing

**Purpose**: Processes large documents into manageable chunks for embedding and storage.

**Key Functions**:
```javascript
async chunkDocument(document, strategy)
async extractMetadata(document)
async processBusinessDocument(content, type)
```

**Chunking Strategies**:
- Fixed-size chunking with overlap
- Semantic boundary detection
- Section-based chunking for structured documents
- Hierarchical chunking for complex documents

### brd-parser.js - Business Requirements Parser

**Purpose**: Parses and processes Business Requirements Documents (BRDs) for RAG integration.

**Key Functions**:
```javascript
async parseBRD(document)
async extractRequirements(content)
async categorizeRequirements(requirements)
```

**Document Types Supported**:
- Business Requirements Documents (BRD)
- Technical Specifications
- API Documentation
- Policy Documents
- Standard Operating Procedures (SOPs)

---

## Security Layer

### rbac.js - Role-Based Access Control

**Purpose**: Implements role-based access control for business data and operations.

**Key Functions**:
```javascript
async checkPermission(user, resource, action)
async getUserRoles(userId)
async getResourcePermissions(resource)
async validateAccess(context)
```

**Role Hierarchy**:
- **Admin**: Full system access
- **Manager**: Department-level access
- **User**: Limited operational access
- **Guest**: Read-only access

**Resource Types**:
- Business data (customers, orders, financial)
- System configuration
- User management
- Audit logs and reports

### prompt-sanitizer.js - Input Sanitization

**Purpose**: Sanitizes user inputs to prevent prompt injection and security vulnerabilities.

**Key Functions**:
```javascript
async sanitizePrompt(input)
async detectInjection(prompt)
async cleanInput(text)
```

**Security Measures**:
- Prompt injection detection and prevention
- XSS and script injection filtering
- Business data validation
- Input length and complexity limits

---

## Inference Layer

### executor.js - Action Execution Engine

**Purpose**: Executes business actions derived from SLM responses.

**Key Functions**:
```javascript
async executeAction(action, context)
async validateExecution(action)
async rollbackAction(actionId)
```

**Supported Actions**:
- Database operations (CRUD)
- External API calls
- File and report generation
- Notification dispatch
- Workflow initiation

### db-functions.js - Database Operations

**Purpose**: Implements database functions for business data access and manipulation.

**Key Functions**:
```javascript
async queryDatabase(sql, params)
async executeStoredProcedure(name, params)
async getTableSchema(tableName)
async validateQuery(sql)
```

**Database Support**:
- PostgreSQL (primary)
- SQLite (development)
- Redis (caching)
- ChromaDB (vectors)

---

## API Reference

### Authentication

All business API endpoints require JWT authentication:

```bash
Authorization: Bearer <JWT_TOKEN>
```

### Error Responses

Standard error format:
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Rate Limiting

- **Limit**: 100 requests per 15 minutes per IP
- **Headers**:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset time

---

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=8001
NODE_ENV=production
JWT_SECRET=your-secret-key

# Service URLs
OLLAMA_URL=http://localhost:11434
CHROMADB_URL=http://localhost:8000
POSTGRES_URL=postgresql://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379

# Model Configuration
DEFAULT_MODEL=llama3.2:3b
MAX_TOKENS=2048
TEMPERATURE=0.7

# Security Configuration
MAX_REQUEST_SIZE=10mb
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

### Model Configuration

Models are configured in `config/models.yaml`:

```yaml
models:
  default: "llama3.2:3b"

  business_queries:
    model: "llama3.2:3b"
    temperature: 0.3
    max_tokens: 1024

  technical_queries:
    model: "codellama:7b"
    temperature: 0.1
    max_tokens: 2048

  creative_tasks:
    model: "mistral:7b"
    temperature: 0.9
    max_tokens: 1024
```

---

## Testing and Monitoring

### Browser Test Interface

Access the comprehensive test interface at: `http://localhost:8001/test-interface.html`

**Features**:
- Service health monitoring
- JWT token generation and testing
- Business request simulation
- Real-time response viewing
- Error debugging and diagnostics

### Health Monitoring

#### Service Health Endpoints
```bash
GET /health                        # Main API health
GET /api/service-status/chromadb   # ChromaDB status
GET /api/service-status/ollama     # Ollama status
```

#### Key Metrics
- Response time and latency
- Model inference performance
- Database connection status
- Memory and CPU usage
- Error rates and types

### Testing Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- --grep "business-request"

# Load testing
npm run test:load
```

### Monitoring and Logging

- **Logs**: Structured JSON logs with correlation IDs
- **Metrics**: Prometheus-compatible metrics endpoint
- **Tracing**: Request tracing for performance analysis
- **Alerts**: Automated alerts for service degradation

---

## Deployment and Scaling

### Docker Deployment

```bash
# Start all services
npm run dev:services

# Start with full monitoring
npm run dev:docker

# Production deployment
npm run docker:build
npm run docker:up
```

### Service Dependencies

```mermaid
graph TD
    A[Main API] --> B[ChromaDB]
    A --> C[Ollama]
    A --> D[PostgreSQL]
    A --> E[Redis]

    B --> F[Vector Storage]
    C --> G[LLM Models]
    D --> H[Business Data]
    E --> I[Session Cache]
```

### Scaling Considerations

- **Horizontal Scaling**: Multiple API instances behind load balancer
- **Model Scaling**: Dedicated Ollama instances for different model types
- **Database Scaling**: Read replicas for query performance
- **Caching Strategy**: Redis for session and query caching

---

## Support and Maintenance

### Common Operations

```bash
# View service logs
docker logs slm-orchestration

# Restart services
npm run docker:restart

# Update models
ollama pull llama3.2:3b

# Database backup
npm run db:backup

# Clear vector cache
npm run vector:clear
```

### Troubleshooting

#### Common Issues

1. **Model Loading Errors**: Check Ollama service status and model availability
2. **ChromaDB Connection Issues**: Verify network connectivity and API version
3. **Authentication Failures**: Check JWT secret configuration and token expiration
4. **Performance Issues**: Monitor resource usage and enable query optimization

#### Debug Mode

Enable debug logging:
```bash
NODE_ENV=development LOG_LEVEL=debug npm run dev
```

---

This documentation provides a comprehensive overview of the SLM Business Service Layer architecture and functionality. For specific implementation details, refer to the individual module source code and inline documentation.