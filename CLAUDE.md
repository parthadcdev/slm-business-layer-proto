
# CLAUDE.md

# SLM-Powered Business Service Layer Project

**Author:** Partha Chandramohan
**Description:** Small Language Model powered business service layer replacing traditional custom-coded business logic
**Status:** ✅ Functional Baseline v1.0 (September 2025)
**Last Updated:** September 18, 2025

## Project Overview
This project implements a revolutionary web application architecture that replaces traditional custom-coded business service layers with a Small Language Model (SLM) driven system. The architecture leverages Retrieval-Augmented Generation (RAG) with business requirement documents (BRDs) to eliminate manual coding of business logic.

## ✅ Current Baseline Status (v1.0)

### What's Working
✅ **Core Orchestration Service** - Express.js app handling business requests
✅ **AI-Powered SQL Generation** - Template-based and SLM-enhanced query generation
✅ **PostgreSQL Database** - Fully functional with sample business data
✅ **Database Adapters** - AI-enhanced and standard PostgreSQL adapters
✅ **Authentication & Authorization** - JWT-based security with role-based access
✅ **Test Interface** - Browser-based testing interface at test-interface.html
✅ **Service Health Monitoring** - Real-time status for all core services
✅ **Intelligent Fallbacks** - System continues functioning when services are offline

### Active Services & Components
- **PostgreSQL Database**: 5 orders, 5 customers, 10 products, 14 inventory items, 3 warehouses, 4 suppliers
- **Orchestration Service**: Running on port 8001 with full business logic processing
- **SQL Generator**: Fixed template-based generation with proper clause ordering
- **Database Health**: All connections stable, schema properly initialized
- **Authentication**: JWT token generation and validation working
- **Business Request Processing**: End-to-end workflow functional

### Current Capabilities
1. **Business Query Processing**: Natural language business requests → SQL queries → structured responses
2. **Order Management**: List, filter, and analyze orders (pending, completed, etc.)
3. **Customer Analytics**: Customer value analysis, segmentation, engagement tracking
4. **Inventory Management**: Stock levels, reorder alerts, warehouse distribution
5. **Supplier Analysis**: Performance metrics, delivery tracking, quality scores

### Known Limitations (Future Enhancement Opportunities)
⚠️ **Ollama/SLM Integration**: Service running but models not fully operational for inference
⚠️ **ChromaDB/RAG**: Vector database service running but client integration needs refinement
⚠️ **Advanced AI Features**: Currently using intelligent fallbacks instead of full SLM processing

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

### Phase 1: Local Environment Setup ✅ COMPLETED
- [x] Install and configure Ollama with selected SLM model
- [x] Set up ChromaDB vector database locally
- [x] Implement basic orchestration service (Node.js/Express.js)
- [x] Set up Docker development environment
- [ ] Implement BRD parsing, chunking, and embedding pipeline

### Phase 2: Core Prototype Services ✅ FUNCTIONAL BASELINE
- [x] Develop SLM business service layer with Ollama integration
- [x] Build inference component for action generation
- [x] Create API/Database inference layer with Docker containers
- [x] Implement AI-powered SQL generation with intelligent fallbacks
- [ ] Complete RAG retrieval component with local vector DB
- [ ] Integrate Traefik/NGINX for local API routing

### Phase 3: Security & Monitoring ✅ BASIC IMPLEMENTATION
- [x] Implement basic authentication and authorization (JWT)
- [x] Deploy input validation and basic security measures
- [x] Set up service health monitoring and diagnostics
- [x] Configure basic RBAC for prototype testing
- [ ] Deploy advanced prompt injection protection mechanisms
- [ ] Set up comprehensive logging with ELK stack

### Phase 4: Testing & Validation ✅ CORE FEATURES TESTED
- [x] Integration testing for database and business logic
- [x] End-to-end workflow validation via test interface
- [x] Performance testing with local resources
- [ ] Unit testing for all components
- [ ] Advanced security testing for prompt injection

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

## Database Configuration

### PostgreSQL Setup (Docker)
The project uses PostgreSQL running in Docker with the following configuration:

**Database Credentials:**
- Database: `business_app`
- User: `app_user`
- Password: `app_password`
- Host: `localhost`
- Port: `5432`

**Important Notes:**
- If you have local PostgreSQL (Homebrew) running on port 5432, stop it: `brew services stop postgresql@15`
- The Docker container automatically creates the database and user
- Use `./scripts/troubleshoot-services.sh postgres-fix` to resolve user/database issues
- Use `./scripts/troubleshoot-services.sh postgres-diag` for comprehensive diagnostics

**Connection String:**
```
postgresql://app_user:app_password@localhost:5432/business_app
```

### Database File Organization
All database-related files are organized in the `/database/` directory:

```
database/
├── schema.sql      # Main database schema with UUID-based tables
├── sample_data.sql # Production-ready sample data for development and testing
└── README.md       # Database documentation and guidelines
```

**File Loading Order (via docker-entrypoint-initdb.d):**
1. `01-schema.sql` - Creates tables, indexes, and constraints
2. `02-sample_data.sql` - Loads realistic sample data with comprehensive business entities

**Current Database State:**
- 5 orders (including 1 pending order: ORD-2024-004)
- 5 customers with realistic profiles and purchase history
- 10 products across multiple categories
- 14 inventory items with stock levels and warehouse distribution
- 3 warehouses (East Coast Hub, West Coast Hub, Central Warehouse)
- 4 suppliers with performance metrics

**Important:** Always use the `database/` directory for any SQL files. Do not place database files in `scripts/` to avoid confusion.

## Getting Started (Local Prototype)

### Prerequisites
```bash
# Install required tools
curl -fsSL https://ollama.com/install.sh | sh
docker --version && docker-compose --version
python3 --version && pip --version
node --version && npm --version
```

### Quick Start (Current Working Setup)
```bash
# 1. Start core services (PostgreSQL, ChromaDB, Ollama, Redis)
docker-compose up -d

# 2. Install Node.js dependencies (if not done)
npm install

# 3. Start the orchestration service
node src/orchestration/app.js

# 4. Access test interface
open test-interface.html
# or navigate to: http://localhost:8001/test-interface.html
```

### Current Working URLs
- **Orchestration Service**: http://localhost:8001
- **Test Interface**: http://localhost:8001/test-interface.html
- **PostgreSQL**: localhost:5432 (Docker)
- **Ollama API**: http://localhost:11434
- **ChromaDB**: http://localhost:8000
- **Redis**: localhost:6379

### Service Health Check URLs
- **PostgreSQL Status**: http://localhost:8001/api/service-status/postgres
- **ChromaDB Status**: http://localhost:8001/api/service-status/chromadb
- **Ollama Status**: http://localhost:8001/api/service-status/ollama

### Authentication
Generate test token: `curl -X POST http://localhost:8001/api/generate-token -H "Content-Type: application/json" -d '{}'`

## 🔧 Troubleshooting & Maintenance

### Common Issues & Solutions

**PostgreSQL Connection Issues:**
```bash
# Check if local PostgreSQL conflicts with Docker
brew services list | grep postgres
# If running, stop it: brew services stop postgresql@15

# Recreate database with fresh data
docker-compose down postgres
docker volume rm slm-business-layer-proto_postgres_data
docker-compose up -d postgres
```

**Service Health Diagnostics:**
```bash
# Use the comprehensive troubleshooting script
./scripts/troubleshoot-services.sh postgres-diag  # PostgreSQL diagnostics
./scripts/troubleshoot-services.sh postgres-fix   # Fix common issues
./scripts/troubleshoot-services.sh postgres-connection  # Test connection
```

**Orchestration Service Issues:**
```bash
# Check service logs
node src/orchestration/app.js
# Service runs on port 8001, logs show initialization status

# Test business request functionality
curl -X POST http://localhost:8001/api/business-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:8001/api/generate-token -H "Content-Type: application/json" -d '{}' | jq -r '.token')" \
  -d '{"request": "Show me all pending orders", "context": {}}'
```

### Key Files for Maintenance
- **Main Configuration**: `CLAUDE.md` (this file)
- **Database Schema**: `database/schema.sql`
- **Sample Data**: `database/sample_data.sql`
- **Database Docs**: `database/README.md`
- **Service Management**: `scripts/manage-services.sh`
- **Development Workflow**: `scripts/dev-workflow.sh`
- **Troubleshooting**: `scripts/troubleshoot-services.sh`
- **Core Service**: `src/orchestration/app.js`
- **SQL Generator**: `src/ai/sql-generator.js`

## 🔧 Developer Scripts & Workflow

### Service Management Script (`scripts/manage-services.sh`)
Comprehensive service management for all system components:

**Usage:**
```bash
# Service lifecycle management
./scripts/manage-services.sh start              # Start all services
./scripts/manage-services.sh stop               # Stop all services
./scripts/manage-services.sh restart            # Restart all services
./scripts/manage-services.sh status             # Show service status

# Individual service management
./scripts/manage-services.sh docker-only start     # Docker services only
./scripts/manage-services.sh orchestration-only start  # Node.js service only

# Monitoring and diagnostics
./scripts/manage-services.sh health             # Health checks
./scripts/manage-services.sh test               # Run service tests
./scripts/manage-services.sh cleanup            # Clean resources
```

**Key Features:**
- ✅ Manages Docker services (PostgreSQL, ChromaDB, Ollama, Redis)
- ✅ Handles Node.js orchestration service with PID tracking
- ✅ Health checks for all services with proper URL testing
- ✅ Intelligent service startup with dependency checking
- ✅ Comprehensive status reporting with port usage
- ✅ Integrated testing and diagnostics
- ✅ Resource cleanup and log management

### Development Workflow Script (`scripts/dev-workflow.sh`)
Complete development lifecycle automation for building, testing, and deploying changes:

**Usage:**
```bash
# Full development workflow
./scripts/dev-workflow.sh full                 # Complete: lint → build → test → package → deploy

# Individual workflow steps
./scripts/dev-workflow.sh lint                 # Code linting and formatting
./scripts/dev-workflow.sh build                # Build project for deployment
./scripts/dev-workflow.sh test                 # Run all tests
./scripts/dev-workflow.sh package              # Create deployment package
./scripts/dev-workflow.sh deploy               # Deploy locally with restart

# Development productivity
./scripts/dev-workflow.sh watch                # Auto-restart on file changes
./scripts/dev-workflow.sh clean                # Clean build artifacts
./scripts/dev-workflow.sh deps                 # Install/update dependencies

# Targeted testing
./scripts/dev-workflow.sh test unit            # Unit tests only
./scripts/dev-workflow.sh test health          # Service health tests only
./scripts/dev-workflow.sh test int             # Integration tests only
```

**Key Features:**
- ✅ **Automated Linting**: ESLint and Prettier integration with auto-configuration
- ✅ **Smart Building**: Production-ready build with dependency optimization
- ✅ **Comprehensive Testing**: Unit, integration, and health test automation
- ✅ **Package Management**: Versioned deployment packages with checksums
- ✅ **Local Deployment**: Safe deployment with automatic backup and rollback
- ✅ **Watch Mode**: Real-time development with auto-restart on file changes
- ✅ **Clean Operations**: Intelligent cleanup of artifacts, logs, and resources
- ✅ **Dependency Management**: Node.js version checking and package installation

### Developer Workflow Best Practices

**Daily Development Cycle:**
```bash
# 1. Start your development session
./scripts/manage-services.sh start

# 2. Enable watch mode for real-time feedback
./scripts/dev-workflow.sh watch
# (Runs in background, auto-restarts on file changes)

# 3. Make your code changes
# Edit files in src/

# 4. Before committing - run quality checks
./scripts/dev-workflow.sh lint
./scripts/dev-workflow.sh test

# 5. Create deployable build when ready
./scripts/dev-workflow.sh full
```

**Quick Development Commands:**
```bash
# Start fresh development environment
./scripts/manage-services.sh restart && ./scripts/dev-workflow.sh watch

# Check everything is working
./scripts/manage-services.sh health && ./scripts/dev-workflow.sh test health

# Complete build and deployment
./scripts/dev-workflow.sh full

# Clean slate (when things go wrong)
./scripts/dev-workflow.sh clean && ./scripts/manage-services.sh restart
```

**CI/CD Pipeline Simulation:**
```bash
# Simulate continuous integration locally
./scripts/dev-workflow.sh lint     # ← CI: Code quality
./scripts/dev-workflow.sh test     # ← CI: Testing
./scripts/dev-workflow.sh build    # ← CI: Build
./scripts/dev-workflow.sh package  # ← CD: Package
./scripts/dev-workflow.sh deploy   # ← CD: Deploy
```

### Script Dependencies

**Required Tools:**
- **Node.js 18+**: JavaScript runtime
- **Docker & Docker Compose**: Container orchestration
- **curl**: HTTP testing (usually pre-installed)
- **jq**: JSON processing (optional, for advanced testing)

**Optional Tools (Enhanced Features):**
- **fswatch**: File watching for auto-restart (macOS: `brew install fswatch`)
- **ESLint/Prettier**: Code quality (auto-installed via npm)

### Troubleshooting Scripts

**Common Issues:**
```bash
# Services won't start
./scripts/manage-services.sh status           # Check what's running
./scripts/troubleshoot-services.sh postgres-diag  # Database diagnostics

# Port conflicts
./scripts/manage-services.sh status           # Shows port usage
lsof -i :8001                                # Check specific port

# Build/test failures
./scripts/dev-workflow.sh clean              # Clean and retry
rm -rf node_modules && npm install           # Reset dependencies

# Performance issues
./scripts/manage-services.sh cleanup         # Clean Docker resources
./scripts/dev-workflow.sh clean              # Clean build artifacts
```

### Script Maintenance

**File Locations:**
- **Service Management**: `scripts/manage-services.sh` (already existed, comprehensive)
- **Development Workflow**: `scripts/dev-workflow.sh` (newly created)
- **Troubleshooting**: `scripts/troubleshoot-services.sh` (existing diagnostic tool)

**Customization:**
Both scripts are designed to be self-documenting and easily customizable. Key configuration variables are at the top of each script for easy modification.

### System Reset Procedure
```bash
# Complete system reset (nuclear option)
./scripts/manage-services.sh stop
./scripts/dev-workflow.sh clean
docker-compose down
docker volume prune -f
docker-compose up -d
./scripts/manage-services.sh start
```

## 🚀 Future Enhancement Roadmap

### Priority 1: Enhanced AI Integration
- [ ] Complete Ollama model integration for full SLM inference
- [ ] Implement RAG document retrieval with ChromaDB
- [ ] Add support for business requirements document (BRD) ingestion
- [ ] Advanced prompt engineering for business domain specificity

### Priority 2: Advanced Features
- [ ] Real-time inventory tracking and alerts
- [ ] Customer behavior prediction and recommendations
- [ ] Automated business report generation
- [ ] Multi-language support for international business operations

### Priority 3: Production Readiness
- [ ] Comprehensive unit and integration test suite
- [ ] Advanced security hardening and prompt injection protection
- [ ] Horizontal scaling and load balancing capabilities
- [ ] Monitoring and alerting with Grafana/Prometheus integration

## Future Enhancements
- Multi-modal SLM capabilities for document and image processing
- Advanced fine-tuning based on usage patterns
- Integration with business intelligence tools
- Automated BRD updates and model retraining

---

**Note**: This architecture represents a paradigm shift from traditional development approaches. Ensure thorough testing and gradual rollout to validate the approach in your specific business context.
- to memorize