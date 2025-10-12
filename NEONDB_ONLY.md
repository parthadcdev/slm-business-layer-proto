# ⚠️ CRITICAL: NeonDB Configuration Notice

**DO NOT CHANGE THIS SETUP**

---

## 🚨 This Project Uses NeonDB Cloud PostgreSQL ONLY

### What This Means

```
✅ Database is hosted in the cloud (NeonDB)
✅ Connection via POSTGRES_URL environment variable
✅ No local PostgreSQL installation needed
✅ No Docker/Podman PostgreSQL containers

❌ DO NOT use local PostgreSQL
❌ DO NOT create PostgreSQL containers
❌ DO NOT modify database configuration to use localhost
❌ DO NOT expect a local database server
```

---

## Current Architecture

### Podman Containers (Local)
```
slm-orchestration → Node.js API server
slm-chromadb     → Vector database (for RAG)
slm-redis        → Cache and sessions
```

### Cloud Services
```
NeonDB → PostgreSQL database (cloud-hosted)
  • Provider: neon.tech
  • Access: Via POSTGRES_URL environment variable
  • SSL/TLS required
  • Auto-scaling
  • Managed backups
```

### Host Services
```
Ollama → LLM inference (running on host machine)
```

---

## Why NeonDB?

This is a **design decision** that should not be changed:

1. **Serverless**: No database administration required
2. **Always Available**: Not dependent on local Docker/Podman state
3. **Auto-scaling**: Scales with application load
4. **Backups**: Point-in-time recovery included
5. **Branching**: Database branches for safe testing
6. **Free Tier**: No cost for development
7. **Production Ready**: Same setup for dev and prod

---

## Configuration Requirements

### Required Environment Variables

```bash
# .env file
POSTGRES_URL=postgresql://user:password@ep-xxx.neon.tech/database?sslmode=require
JWT_SECRET=your-secret-key-minimum-32-characters-long
```

### Optional Environment Variables

```bash
REDIS_URL=redis://redis:6379          # Optional (in-memory fallback)
CHROMA_HOST=http://chromadb:8000      # For RAG operations
OLLAMA_BASE_URL=http://localhost:11434 # LLM inference
```

---

## Setup Process

### 1. Get NeonDB Connection String

```bash
# Sign up: https://neon.tech (free)
# Create project
# Copy connection string
# Format: postgresql://user:password@host.neon.tech/db?sslmode=require
```

### 2. Configure Application

```bash
# Add to .env
echo 'POSTGRES_URL=postgresql://your-connection-string' >> .env
echo 'JWT_SECRET=your-secret-key-minimum-32-characters' >> .env
```

### 3. Load Database Schema

```bash
# Load to NeonDB (cloud), NOT local
psql 'your-neon-connection-string' -f database/schema.sql
psql 'your-neon-connection-string' -f database/sample_data.sql
```

### 4. Deploy Services

```bash
# Deploy Podman containers (NO PostgreSQL container)
podman-compose up -d chromadb redis
podman-compose --profile full up -d orchestration
```

---

## Verification

### ✅ Correct Setup

```bash
# Check containers - should show 3 containers (NO postgres)
podman ps
# Expected: slm-orchestration, slm-chromadb, slm-redis

# Check environment
echo $POSTGRES_URL
# Expected: postgresql://...@...neon.tech/...

# Test NeonDB connection
psql "$POSTGRES_URL" -c "SELECT version();"
# Expected: PostgreSQL 17.x ... (from NeonDB)
```

### ❌ Incorrect Setup

```bash
# If you see this, it's WRONG:
podman ps | grep postgres
# Should show: NOTHING or "no such container"

# If POSTGRES_URL points to localhost, it's WRONG:
echo $POSTGRES_URL | grep localhost
# Should show: NOTHING (should have neon.tech instead)
```

---

## What NOT to Do

### ❌ DO NOT Create Local PostgreSQL

```bash
# ❌ DON'T DO THIS
docker run postgres
podman run postgres
brew install postgresql
apt-get install postgresql
```

### ❌ DO NOT Add PostgreSQL to docker-compose.yml

```yaml
# ❌ DON'T ADD THIS
# postgres:
#   image: postgres:15-alpine
#   # ... this is NOT used
```

### ❌ DO NOT Change Connection Logic

```javascript
// ❌ DON'T CHANGE THIS in postgres-adapter.js
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
// This is correct - uses cloud connection string
```

---

## Troubleshooting

### "Database initialization failed"

**This is expected if POSTGRES_URL is not set.**

**Solution:**
1. Add NeonDB connection string to `.env`
2. Restart orchestration: `podman-compose restart orchestration`

### "How do I access the database?"

**Use NeonDB Console:**
- Web UI: https://console.neon.tech
- SQL Editor: Available in console
- psql: Use your connection string

**DO NOT try to access localhost:5432** - there is no local database.

### "Can I use local PostgreSQL for testing?"

**NO.** The application is designed for NeonDB only. Using local PostgreSQL would require:
- Modifying connection logic
- Changing environment handling
- Removing SSL/TLS requirements
- Defeating the cloud-first architecture

**Instead:** Use NeonDB free tier for testing.

---

## Support and Documentation

- **NeonDB Setup**: [docs/NEONDB_SETUP.md](docs/NEONDB_SETUP.md)
- **Database Architecture**: [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md)
- **Quick Start**: [QUICK_START.md](QUICK_START.md)
- **Environment Config**: [env.example](env.example)

---

## Summary

```
✅ THIS PROJECT = NeonDB cloud PostgreSQL
❌ THIS PROJECT ≠ Local PostgreSQL
❌ THIS PROJECT ≠ Docker/Podman PostgreSQL
```

**This is by design and should not be changed.**

For questions about why NeonDB, see `DATABASE_ARCHITECTURE.md`

---

**Last Verified:** October 11, 2025  
**Local PostgreSQL Container:** ❌ Removed  
**NeonDB Cloud:** ✅ Configured  
**Status:** ✅ Correct Architecture

