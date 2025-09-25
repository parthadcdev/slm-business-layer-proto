# SLM Business Service Layer - Documentation

**Author:** Partha Chandramohan
**Project Status:** Enhanced Baseline v1.1 with Model Evaluation Framework
**Last Updated:** September 24, 2025

## Documentation Index

### Core Documentation
- **[CLAUDE.md](../CLAUDE.md)** - Main project configuration and setup guide
- **[FUNCTIONAL_DOCUMENTATION.md](FUNCTIONAL_DOCUMENTATION.md)** - System functionality and architecture
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** - Development setup and workflows
- **[API_REFERENCE.md](API_REFERENCE.md)** - Complete API specifications

### Specialized Guides
- **[MODEL_EVALUATION_FRAMEWORK.md](MODEL_EVALUATION_FRAMEWORK.md)** - Model testing and comparison system
- **[SLM_TRAINING_GUIDE.md](SLM_TRAINING_GUIDE.md)** - SLM training and optimization

### Sample Business Requirements
- **[sample-brds/](sample-brds/)** - Business Requirements Documents for testing

## Quick Start

1. **Setup**: Follow `CLAUDE.md` for complete environment setup
2. **Development**: Use `DEVELOPER_GUIDE.md` for development workflows
3. **API Integration**: Reference `API_REFERENCE.md` for endpoint specifications
4. **Model Testing**: Use `MODEL_EVALUATION_FRAMEWORK.md` for model comparison

## Key Features (v1.1)

### ✅ Working Components
- **Core Orchestration Service** - Express.js app with business logic processing
- **AI-Powered SQL Generation** - Multi-provider model support with fallbacks
- **Model Evaluation Framework** - Comprehensive testing and comparison system
- **PostgreSQL Database** - Sample business data with 5 orders, 5 customers, 10 products
- **Authentication & Security** - JWT-based API protection
- **Test Interfaces** - Both basic and advanced model comparison UIs

### 🆕 Recent Additions (v1.1)
- **Parameterized Model Configuration** - Support for Ollama, OpenAI, Anthropic
- **Comprehensive Evaluation Metrics** - Latency, accuracy, SQL complexity scoring
- **Dedicated Model Comparison UI** - Real-time testing interface
- **Enhanced API Endpoints** - `/api/evaluate-models`, `/api/evaluation-history`
- **Historical Analysis** - Evaluation trend tracking and performance analytics

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Test UIs      │    │  Orchestration   │    │ Model Evaluation│
│                 │───▶│     Service      │───▶│   Framework     │
│ - Basic Testing │    │  (Express.js)    │    │                 │
│ - Model Compare │    │                  │    │ - Multi-provider│
└─────────────────┘    └──────────────────┘    │ - Metrics       │
                                ▼               │ - Comparison    │
┌─────────────────┐    ┌──────────────────┐    └─────────────────┘
│   AI Services   │    │    Database      │
│                 │    │                  │
│ - SQL Generator │◀───│ - PostgreSQL     │
│ - Intent Class. │    │ - Sample Data    │
│ - Model Config  │    │ - Health Checks  │
└─────────────────┘    └──────────────────┘
```

## Supported Models

| Provider | Models | Status | Use Cases |
|----------|---------|---------|-----------|
| **Ollama (Local)** | phi3:mini, llama3.2:latest, qwen3:4b, mistral:7b, codellama:7b | ✅ Active | Fast SQL generation, complex reasoning |
| **OpenAI** | gpt-3.5-turbo, gpt-4, gpt-4-turbo | 🔧 Configured | Production SQL, enterprise analysis |
| **Anthropic** | claude-3-haiku, claude-3-sonnet | 🔧 Configured | Balanced performance, large context |

## Access Points

### Web Interfaces
- **Main Service**: http://localhost:8001
- **Basic Test Interface**: http://localhost:8001/test-interface.html
- **Model Evaluation UI**: http://localhost:8001/model-evaluation.html

### API Endpoints
- **Business Requests**: `POST /api/business-request`
- **Model Evaluation**: `POST /api/evaluate-models`
- **Evaluation History**: `GET /api/evaluation-history`
- **Token Generation**: `POST /api/generate-token`

### Service Health
- **PostgreSQL**: http://localhost:8001/api/service-status/postgres
- **ChromaDB**: http://localhost:8001/api/service-status/chromadb
- **Ollama**: http://localhost:8001/api/service-status/ollama

## Development Commands

```bash
# Start all services
./scripts/manage-services.sh start

# Development workflow (lint, test, build, deploy)
./scripts/dev-workflow.sh full

# Service diagnostics
./scripts/troubleshoot-services.sh postgres-diag

# Access model evaluation UI
open http://localhost:8001/model-evaluation.html
```

## Documentation Maintenance

This documentation is actively maintained. When making changes:

1. **Update CLAUDE.md** for configuration changes
2. **Update API_REFERENCE.md** for new endpoints
3. **Update MODEL_EVALUATION_FRAMEWORK.md** for evaluation changes
4. **Update this README.md** for structural changes
5. **Version all changes** with dates and descriptions

---

For detailed implementation guidance, refer to the specific documentation files listed above. Each document provides comprehensive coverage of its respective domain within the SLM Business Service Layer project.