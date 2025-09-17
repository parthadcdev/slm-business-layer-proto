# Quick Setup Guide

This guide helps you get the SLM Business Service Layer running quickly.

## Prerequisites

- Python 3.8+
- Node.js 16+
- Docker & Docker Compose (optional)

## Quick Start

### Option 1: Automated Setup (Recommended)

```bash
# Run the automated setup script
./scripts/setup-local.sh
```

### Option 2: Manual Setup

1. **Setup Python Environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Setup Node.js Dependencies**
   ```bash
   npm install
   ```

3. **Initialize RAG Database**
   ```bash
   # Make sure virtual environment is activated
   source venv/bin/activate
   python3 scripts/init-rag-db.py
   ```

4. **Start Infrastructure Services**
   ```bash
   # Start core services with Docker
   npm run dev:services

   # Or manually install and start:
   # - Ollama: curl -fsSL https://ollama.com/install.sh | sh
   # - ChromaDB: pip install chromadb
   # - PostgreSQL: brew install postgresql (macOS)
   # - Redis: brew install redis (macOS)
   ```

5. **Start the Application**
   ```bash
   npm run dev
   ```

## Troubleshooting

### Python Import Errors
```bash
# Ensure virtual environment is activated
source venv/bin/activate

# Check if dependencies are installed
pip list | grep chromadb
pip list | grep sentence-transformers

# Reinstall if needed
pip install -r requirements.txt
```

### Docker Network Issues
```bash
# Clean up Docker networks
npm run docker:reset

# Or manually
docker network prune -f
```

### Module Not Found Errors
```bash
# Ensure you're in the project root
pwd  # Should show /path/to/slm-business-layer-proto

# Activate virtual environment
source venv/bin/activate

# Run the script
python3 scripts/init-rag-db.py
```

## Service URLs

After successful setup:

- **Main API**: http://localhost:8001
- **ChromaDB**: http://localhost:8000
- **Ollama**: http://localhost:11434
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Testing the Setup

```bash
# Test health endpoints
curl http://localhost:8001/health      # Your API
curl http://localhost:11434/api/tags   # Ollama
curl http://localhost:8000/api/v1/heartbeat  # ChromaDB

# Test RAG database
ls -la chroma_data/  # Should contain database files
```

## Next Steps

1. **Load Ollama Models**
   ```bash
   ollama pull llama3.2:3b
   ollama pull mistral:7b
   ```

2. **Test Business API**
   ```bash
   curl -X POST http://localhost:8001/api/business-request \
     -H "Content-Type: application/json" \
     -d '{"request": "Show me all pending orders"}'
   ```

3. **Explore the Documentation**
   - Check `README.md` for full documentation
   - Review `CLAUDE.md` for architecture details

## Common Issues

1. **Port Conflicts**: Change ports in `.env` file
2. **Permission Issues**: Ensure scripts are executable (`chmod +x scripts/*.sh`)
3. **Docker Issues**: Run `docker system prune -f` to clean up
4. **Python Path Issues**: Always run from project root directory

For more help, check the detailed documentation in `README.md`.