# CLAUDE.md

# SLM-Powered Business Service Layer Project

**Author:** Partha Chandramohan
**Description:** Small Language Model powered business service layer replacing traditional custom-coded business logic

## Project Overview
This project implements a revolutionary web application architecture that replaces traditional custom-coded business service layers with a Small Language Model (SLM) driven system. The architecture leverages Retrieval-Augmented Generation (RAG) with business requirement documents (BRDs) to eliminate manual coding of business logic.

## Architecture Components

### Core Components
- **User Interface (UI)**: Front-end application that initiates requests
- **Orchestration Layer**: Request router that prepares prompts for the SLM
- **SLM Business Service Layer**: Core component with retrieval and inference capabilities
- **API/Database Inference Layer**: Pre-defined, sandboxed operations library
- **RAG Database**: Vector database containing embedded BRD documents

### Technology Stack (Local Prototype)
- **SLM**: Ollama with Llama 3.2, Mistral, or CodeLlama models
- **Vector Database**: ChromaDB or Qdrant (local deployment)
- **Orchestration**: Python with FastAPI or Node.js with Express.js
- **Inference Layer**: Docker containers with local microservices
- **API Gateway**: Traefik or NGINX for local reverse proxy and routing
- **Monitoring**: ELK Stack (Elasticsearch, Logstash, Kibana) or Grafana + Prometheus

## Security Framework - Zero Trust Model

### Core Principles
1. **Explicit Verification**: All requests must be authenticated and authorized
2. **Least Privilege Access**: Components access only required resources
3. **Assume Breach**: System designed with compromise assumption

### Security Controls
- **API Gateway**: Centralized authentication and authorization
- **Prompt Injection Protection**: Input validation, sanitation, and guardrails
- **RBAC**: Role-based access control throughout the system
- **Sandboxed Inference**: Strict permissions for database and API operations
- **Comprehensive Logging**: Full audit trail of all SLM interactions

## Implementation Strategy

### Phase 1: Local Environment Setup
- [ ] Install and configure Ollama with selected SLM model
- [ ] Set up ChromaDB or Qdrant vector database locally
- [ ] Implement BRD parsing, chunking, and embedding pipeline
- [ ] Create basic FastAPI orchestration service
- [ ] Set up Docker development environment

### Phase 2: Core Prototype Services
- [ ] Develop SLM business service layer with Ollama integration
- [ ] Implement RAG retrieval component with local vector DB
- [ ] Build inference component for action generation
- [ ] Create API/Database inference layer with Docker containers
- [ ] Integrate Traefik/NGINX for local API routing

### Phase 3: Security & Monitoring (Prototype Level)
- [ ] Implement basic authentication and authorization
- [ ] Deploy prompt injection protection mechanisms
- [ ] Set up local logging with ELK stack or simple file logging
- [ ] Configure basic RBAC for prototype testing

### Phase 4: Testing & Validation
- [ ] Unit and integration testing
- [ ] Basic security testing for prompt injection
- [ ] Performance testing with local resources
- [ ] End-to-end workflow validation

## Key Implementation Files

### Orchestration Layer
- `src/orchestration/app.js` - Main orchestration service
- `src/orchestration/prompt-builder.js` - SLM prompt construction
- `src/orchestration/context-manager.js` - User context and session management
- `src/orchestration/middleware/auth.js` - Authentication middleware
- `src/orchestration/middleware/validation.js` - Input validation

### SLM Integration (Ollama)
- `src/slm/ollama-client.js` - Ollama API client and connection management
- `src/slm/model-manager.js` - Model loading and switching utilities
- `src/slm/retrieval-service.js` - RAG database query implementation
- `src/slm/inference-service.js` - SLM interaction and response processing
- `src/slm/action-parser.js` - Parse SLM responses into executable actions
- `src/slm/guardrails.js` - Prompt injection protection

### Local RAG Implementation
- `src/rag/chromadb-client.js` - ChromaDB client for local vector storage
- `src/rag/embedding-service.js` - Local embedding service (sentence-transformers)
- `src/rag/brd-parser.js` - Business requirements document parser
- `src/rag/chunk-processor.js` - Document chunking and preprocessing
- `src/rag/vector-store.js` - Vector storage and retrieval operations

### Inference Layer
- `src/inference/api-functions.js` - Pre-approved API operations
- `src/inference/db-functions.js` - Sandboxed database operations
- `src/inference/executor.js` - Action execution engine
- `src/inference/permissions.js` - Permission validation

### Security & Monitoring
- `src/security/rbac.js` - Role-based access control
- `src/security/prompt-sanitizer.js` - Input sanitization
- `src/monitoring/logger.js` - Comprehensive logging service
- `src/monitoring/metrics.js` - Performance and security metrics

### Local Development Configuration
- `config/ollama-config.yaml` - Ollama model and connection settings
- `config/chromadb-config.yaml` - ChromaDB configuration and persistence
- `config/security-config.yaml` - Basic security policies for prototype
- `docker-compose.yml` - Complete local development environment
- `docker-compose.override.yml` - Development-specific overrides
- `.env.local` - Local environment variables and secrets
- `scripts/setup-local.sh` - Local environment setup script

## Development Guidelines

### Code Organization
- Follow microservices architecture principles
- Implement clear separation of concerns
- Use dependency injection for testability
- Maintain comprehensive error handling

### Security Best Practices
- Never trust user input - validate and sanitize everything
- Implement defense in depth
- Log all security-relevant events
- Regular security audits and penetration testing

### Performance Considerations
- Optimize SLM inference latency
- Implement caching strategies for frequent queries
- Use connection pooling for database operations
- Monitor and optimize vector database query performance

## Testing Strategy
- Unit tests for all components
- Integration tests for service interactions
- Security tests including prompt injection scenarios
- Performance and load testing
- End-to-end workflow testing

## Local Deployment Architecture

### Core Local Services
- **Ollama Server**: Local SLM hosting with GPU/CPU support
- **ChromaDB**: Local vector database with persistence
- **FastAPI Backend**: Orchestration and business logic
- **SQLite/PostgreSQL**: Local relational database for structured data
- **Traefik**: Local reverse proxy and load balancer
- **Redis**: Local caching and session management

### Docker Services Configuration
```yaml
# docker-compose.yml structure
services:
  ollama:
    image: ollama/ollama:latest
    volumes: ["./models:/root/.ollama"]
    ports: ["11434:11434"]
  
  chromadb:
    image: chromadb/chroma:latest
    volumes: ["./chroma_data:/chroma/chroma"]
    
  fastapi-orchestrator:
    build: ./src/orchestration
    depends_on: [ollama, chromadb]
    
  traefik:
    image: traefik:v3.0
    ports: ["80:80", "8080:8080"]
```

### Development Hardware Requirements
- **Minimum**: 16GB RAM, 4-core CPU, 50GB storage
- **Recommended**: 32GB RAM, 8-core CPU, 100GB storage, NVIDIA GPU (optional)
- **GPU Support**: CUDA-compatible for faster inference (optional for prototype)

## Risk Mitigation

### Primary Risks
1. **Prompt Injection Attacks**: Mitigated through input validation and guardrails
2. **SLM Hallucination**: Addressed with RAG grounding and validation
3. **Performance Bottlenecks**: Optimized through caching and scaling strategies
4. **Data Privacy**: Protected through encryption and access controls

### Monitoring & Alerting
- Real-time monitoring of SLM responses for anomalies
- Performance metrics tracking
- Security event alerting
- Automated incident response procedures

## Getting Started (Local Prototype)

### Prerequisites
```bash
# Install required tools
curl -fsSL https://ollama.com/install.sh | sh
docker --version && docker-compose --version
python3 --version && pip --version
node --version && npm --version
```

### Quick Start
```bash
# 1. Clone and setup project
git clone <repository>
cd slm-business-service

# 2. Install dependencies
pip install -r requirements.txt
npm install

# 3. Start local services
docker-compose up -d

# 4. Install and run Ollama model
ollama pull llama3.2:3b
ollama serve

# 5. Initialize vector database and load BRDs
python scripts/init-rag-db.py

# 6. Start the orchestration service
python src/orchestration/main.py
```

### Local URLs
- **API Gateway**: http://localhost:80
- **Orchestration Service**: http://localhost:8000
- **Ollama API**: http://localhost:11434
- **ChromaDB**: http://localhost:8000
- **Traefik Dashboard**: http://localhost:8080

## Future Enhancements
- Multi-modal SLM capabilities for document and image processing
- Advanced fine-tuning based on usage patterns
- Integration with business intelligence tools
- Automated BRD updates and model retraining

---

**Note**: This architecture represents a paradigm shift from traditional development approaches. Ensure thorough testing and gradual rollout to validate the approach in your specific business context.