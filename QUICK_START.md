# Quick Start Guide - Podman Deployment

**Author:** Partha Chandramohan  
**Last Updated:** October 11, 2025

## 🚨 IMPORTANT: This Project Uses NeonDB

```
✅ Database: NeonDB Cloud PostgreSQL (neon.tech)
❌ NOT using: Local PostgreSQL or Docker/Podman PostgreSQL
📋 Required: POSTGRES_URL environment variable
```

## ✅ Services Deployed and Running

```
✅ slm-orchestration  (Port 8001) - Main API
✅ slm-chromadb       (Port 8000) - Vector DB  
✅ slm-redis          (Port 6379) - Cache
✅ Ollama (host)      (Port 11434) - LLM
☁️  NeonDB (cloud)    (SSL/TLS)     - PostgreSQL Database
```

## 🚀 Access Points

- **Test Interface**: http://localhost:8001/test-interface.html
- **Health Check**: http://localhost:8001/health
- **API Endpoint**: http://localhost:8001/api/business-request

## 🔧 Common Commands

### Check Status
```bash
podman-compose ps
curl http://localhost:8001/health
```

### View Logs
```bash
podman logs slm-orchestration -f     # Main app logs
podman logs slm-chromadb -f          # Vector DB logs
podman logs slm-redis -f             # Cache logs
```

### Restart Services
```bash
podman-compose restart               # Restart all
podman-compose restart orchestration # Restart just API
```

### After Code Changes
```bash
# Rebuild and redeploy orchestration
podman-compose --profile full build orchestration
podman-compose --profile full up -d orchestration
```

### Stop Everything
```bash
podman-compose down
```

## ⚠️ NeonDB Configuration Required

For full database functionality, configure NeonDB:

```bash
# 1. Edit .env file
nano .env

# 2. Add your connection string
POSTGRES_URL=postgresql://user:password@your-host.neon.tech/database?sslmode=require
JWT_SECRET=your-secret-key-minimum-32-characters

# 3. Restart orchestration
podman-compose restart orchestration
```

**See:** `docs/NEONDB_SETUP.md` for complete instructions

## 🧪 Test the Deployment

### 1. Generate a Token
```bash
curl -X POST http://localhost:8001/api/generate-token \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","role":"admin","email":"test@test.com"}'
```

### 2. Test a Business Query
```bash
# Save token from step 1
TOKEN="your-token-here"

# Make a request
curl -X POST http://localhost:8001/api/business-request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"request":"List pending orders","context":{}}'
```

### 3. Use Test Interface
1. Open http://localhost:8001/test-interface.html in your browser
2. Click "Check API Health" (should show healthy)
3. Click "Generate Token" 
4. Enter query: "List pending orders"
5. Click "Send Request"

## 📊 Service Health

Check individual services:

```bash
# Orchestration
curl http://localhost:8001/health

# ChromaDB  
curl http://localhost:8000/api/v2/version

# Redis
podman exec slm-redis redis-cli ping

# Ollama
curl http://localhost:11434/api/tags
```

## 🔍 Troubleshooting

### Containers not starting
```bash
podman ps -a                    # Check container status
podman logs slm-orchestration   # Check logs for errors
```

### Port conflicts
```bash
lsof -ti:8001 | xargs kill -9   # Kill process on 8001
lsof -ti:8000 | xargs kill -9   # Kill process on 8000
lsof -ti:6379 | xargs kill -9   # Kill process on 6379
```

### Podman machine issues
```bash
podman machine list             # Check machine status
podman machine restart          # Restart if needed
```

### Database connection issues
```bash
# Verify .env has POSTGRES_URL
grep POSTGRES_URL .env

# Test NeonDB connection
psql "$POSTGRES_URL" -c "SELECT version();"

# Check orchestration logs for DB errors
podman logs slm-orchestration | grep -i "database\|postgres"
```

## 📖 Documentation

- **Full Setup**: See `README.md`
- **NeonDB Guide**: See `docs/NEONDB_SETUP.md`
- **Environment Config**: See `env.example`
- **Deployment Status**: See `DEPLOYMENT_STATUS.md`
- **API Reference**: See `docs/API_REFERENCE.md`

## 🎯 Current Status

**What's Working:**
- ✅ All containers deployed and healthy
- ✅ API responding to requests
- ✅ Token generation functional
- ✅ CORS configured for test interface
- ✅ SQL prompts fixed (no comments)
- ✅ Redis with in-memory fallback
- ✅ Test interface accessible

**What Needs Configuration:**
- ⚠️ NeonDB connection string in `.env`
- ⚠️ Database schema loaded to NeonDB

**Once NeonDB is configured:**
- ✅ Full database query execution
- ✅ Business request processing
- ✅ SQL generation and execution
- ✅ Complete end-to-end functionality

---

**Ready to test!** Open http://localhost:8001/test-interface.html

