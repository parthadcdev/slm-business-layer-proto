# SLM-Powered Business Service Layer

**Author:** Partha Chandramohan

A revolutionary web application architecture that replaces traditional custom-coded business service layers with a Small Language Model (SLM) driven system. This prototype leverages Retrieval-Augmented Generation (RAG) with business requirement documents (BRDs) to eliminate manual coding of business logic.

## 🚀 Architecture Overview

This project implements a paradigm-shifting approach to business application development:

- **Traditional Approach**: Custom-coded business service layers requiring manual development for each business rule
- **SLM Approach**: AI-powered business logic that interprets natural language requirements and generates executable actions

### Core Components

- **User Interface (UI)**: Front-end application that initiates requests
- **Orchestration Layer**: Request router that prepares prompts for the SLM
- **SLM Business Service Layer**: Core component with retrieval and inference capabilities
- **API/Database Inference Layer**: Pre-defined, sandboxed operations library
- **RAG Database**: Vector database containing embedded BRD documents

### Technology Stack

- **SLM**: Ollama with Llama 3.2, Mistral, or CodeLlama models
- **Vector Database**: ChromaDB for local deployment
- **Orchestration**: Node.js with Express.js
- **Inference Layer**: Containerized microservices
- **API Gateway**: Traefik for reverse proxy and routing
- **Monitoring**: Comprehensive logging and metrics collection

## 🛡️ Security Framework - Zero Trust Model

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

## 🚀 Quick Start

### Prerequisites

```bash
# Required tools
curl -fsSL https://ollama.com/install.sh | sh  # Ollama
docker --version && docker-compose --version   # Docker
python3 --version && pip --version             # Python 3.8+
node --version && npm --version                # Node.js 16+
```

### Installation

1. **Clone and setup project**
   ```bash
   git clone <repository>
   cd slm-business-layer-proto
   chmod +x scripts/setup-local.sh
   ./scripts/setup-local.sh
   ```

2. **Start services using Docker Compose** (Recommended)
   ```bash
   docker-compose up -d
   ```

3. **Or start services individually**
   ```bash
   # Terminal 1: Start Ollama
   ollama serve

   # Terminal 2: Pull models
   ollama pull llama3.2:3b
   ollama pull mistral:7b

   # Terminal 3: Start orchestration service
   npm run dev
   ```

4. **Initialize RAG database**
   ```bash
   python3 scripts/init-rag-db.py
   ```

### Service URLs

- **Main API**: http://localhost:8001
- **Ollama API**: http://localhost:11434
- **ChromaDB**: http://localhost:8000
- **Traefik Dashboard**: http://localhost:8080
- **Grafana**: http://localhost:3000 (with monitoring profile)

## 📖 Usage Examples

### Business Query API

```bash
# Natural language business request
curl -X POST http://localhost:8001/api/business-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "request": "Show me all pending orders for customers in California",
    "context": {
      "userId": "user123",
      "sessionId": "session456"
    }
  }'
```

### Health Check

```bash
curl http://localhost:8001/health
```

## 🏗️ Development

### Project Structure

```
├── src/
│   ├── orchestration/          # Main API orchestration layer
│   ├── slm/                   # SLM integration and inference
│   ├── rag/                   # RAG implementation (ChromaDB, embeddings)
│   ├── inference/             # Sandboxed API and database operations
│   ├── security/              # RBAC and security controls
│   └── monitoring/            # Logging and metrics
├── config/                    # Configuration files
├── scripts/                   # Setup and utility scripts
├── docker/                    # Docker configurations
└── data/                      # Local data and documents
```

### Key Implementation Files

#### Orchestration Layer
- `src/orchestration/app.js` - Main orchestration service
- `src/orchestration/prompt-builder.js` - SLM prompt construction
- `src/orchestration/context-manager.js` - User context and session management

#### SLM Integration
- `src/slm/ollama-client.js` - Ollama API client and connection management
- `src/slm/inference-service.js` - SLM interaction and response processing
- `src/slm/guardrails.js` - Prompt injection protection

#### RAG Implementation
- `src/rag/chromadb-client.js` - ChromaDB client for local vector storage
- `src/rag/brd-parser.js` - Business requirements document parser
- `src/rag/vector-store.js` - Vector storage and retrieval operations

### Development Commands

```bash
# Development
npm run dev                    # Start with hot reload
npm run dev:docker            # Start with Docker Compose
npm run dev:services          # Start only infrastructure services

# Testing
npm test                      # Run tests
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage

# Code Quality
npm run lint                 # Lint code
npm run format              # Format code
npm run format:check        # Check formatting

# Docker
npm run docker:build        # Build Docker images
npm run docker:up           # Start services
npm run docker:down         # Stop services
npm run docker:logs         # View logs

# Utilities
npm run setup               # Run setup script
npm run init:rag           # Initialize RAG database
npm run health             # Check service health
npm run clean              # Clean build artifacts
```

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Core Configuration
NODE_ENV=development
PORT=8000
JWT_SECRET=your-super-secret-jwt-key

# Database
POSTGRES_URL=postgresql://app_user:app_password@localhost:5432/business_app
REDIS_URL=redis://localhost:6379

# SLM Configuration
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# Vector Database
CHROMADB_URL=http://localhost:8000
EMBEDDING_SERVICE_URL=http://localhost:8001
```

### Docker Compose Profiles

```bash
# Start core services only
docker-compose up -d

# Start with monitoring
docker-compose --profile monitoring up -d

# Start with logging (ELK Stack)
docker-compose --profile logging up -d

# Start with security testing
docker-compose --profile security-testing up -d
```

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### API Testing
```bash
# Test business request endpoint
curl -X POST http://localhost:8001/api/business-request \
  -H "Content-Type: application/json" \
  -d '{"request": "Get all users", "context": {}}'
```

### Security Testing
```bash
# Start OWASP ZAP for security testing
docker-compose --profile security-testing up -d zap
```

## 📊 Monitoring

### Metrics Collection
- **Response times**: SLM inference and API calls
- **Error rates**: Failed requests and security events
- **Resource usage**: Memory, CPU, and storage
- **Business metrics**: Request patterns and user behavior

### Logging
- **Structured logging**: JSON format with correlation IDs
- **Security events**: Authentication, authorization, and prompt injection attempts
- **Audit trails**: All business operations and data access
- **Performance logs**: Response times and resource usage

### Dashboards
- **Grafana**: Real-time metrics and alerting
- **Kibana**: Log analysis and search
- **Traefik**: API gateway metrics

## 🔒 Security

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- Session management with Redis
- API key support for service-to-service

### Input Security
- Prompt injection detection and prevention
- Input sanitization and validation
- Rate limiting and DDoS protection
- XSS and SQL injection prevention

### Data Protection
- Encryption at rest and in transit
- PII detection and masking
- Audit logging
- Data retention policies

### Security Monitoring
- Real-time threat detection
- Behavioral analysis
- Anomaly detection
- Incident response automation

## 🚨 Risk Mitigation

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

## 📈 Performance Optimization

### SLM Optimization
- Model caching and preloading
- Request batching
- Response caching
- GPU acceleration (optional)

### Database Optimization
- Connection pooling
- Query optimization
- Index management
- Caching strategies

### API Optimization
- Rate limiting
- Response compression
- CDN integration
- Load balancing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style and conventions
- Write tests for new functionality
- Update documentation as needed
- Ensure security best practices
- Test thoroughly before submitting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the `docs/` directory for detailed documentation
- **Issues**: Report bugs and feature requests in the GitHub Issues
- **Discussions**: Join discussions in GitHub Discussions
- **Security**: Report security issues privately to security@yourorg.com

## 🗺️ Roadmap

### Phase 1: Local Environment Setup ✅
- [x] Install and configure Ollama with selected SLM model
- [x] Set up ChromaDB vector database locally
- [x] Implement BRD parsing, chunking, and embedding pipeline
- [x] Create basic orchestration service
- [x] Set up Docker development environment

### Phase 2: Core Prototype Services ✅
- [x] Develop SLM business service layer with Ollama integration
- [x] Implement RAG retrieval component with local vector DB
- [x] Build inference component for action generation
- [x] Create API/Database inference layer
- [x] Integrate Traefik for local API routing

### Phase 3: Security & Monitoring ✅
- [x] Implement authentication and authorization
- [x] Deploy prompt injection protection mechanisms
- [x] Set up comprehensive logging system
- [x] Configure RBAC for prototype testing

### Phase 4: Testing & Validation 🚧
- [ ] Unit and integration testing
- [ ] Security testing for prompt injection
- [ ] Performance testing with local resources
- [ ] End-to-end workflow validation

### Future Enhancements
- [ ] Multi-modal SLM capabilities for document and image processing
- [ ] Advanced fine-tuning based on usage patterns
- [ ] Integration with business intelligence tools
- [ ] Automated BRD updates and model retraining
- [ ] Cloud deployment configurations
- [ ] Advanced security features
- [ ] Performance optimization
- [ ] Multi-tenant support

---

**Note**: This architecture represents a paradigm shift from traditional development approaches. Ensure thorough testing and gradual rollout to validate the approach in your specific business context.

## 🏆 Acknowledgments

- **Ollama**: For providing an excellent local SLM runtime
- **ChromaDB**: For the vector database capabilities
- **OpenAI**: For advancing the field of language models
- **Hugging Face**: For the embedding models and transformers library
- **Community**: For contributions, feedback, and support

---

*Generated with [Claude Code](https://claude.ai/code) 🤖*