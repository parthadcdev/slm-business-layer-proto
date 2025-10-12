# Database Architecture - NeonDB Cloud PostgreSQL

**Author:** Partha Chandramohan  
**Last Updated:** October 11, 2025  
**Status:** ⚠️ **IMPORTANT - READ THIS FIRST**

---

## 🚨 CRITICAL: Database Configuration

### **THIS PROJECT USES NEONDB (CLOUD-HOSTED POSTGRESQL)**

```
❌ DO NOT use local PostgreSQL
❌ DO NOT use Docker/Podman PostgreSQL containers  
❌ DO NOT expect a local database

✅ USE NeonDB cloud PostgreSQL ONLY
✅ Connection via POSTGRES_URL environment variable
✅ Cloud-hosted, auto-scaling, managed database
```

---

## Why NeonDB?

This project is **explicitly designed** to use NeonDB as its PostgreSQL database provider. 

### Reasons:
1. **Serverless**: No local database management required
2. **Auto-scaling**: Scales automatically with workload
3. **Backups**: Automatic point-in-time recovery
4. **Branching**: Git-like database branches for testing
5. **Always Available**: Not dependent on local Docker/Podman
6. **SSL/TLS**: Secure connections by default
7. **Free Tier**: Available for development and testing

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SLM Business Layer                        │
│                  (Podman Containers)                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Orchestration │  │  ChromaDB    │  │    Redis     │     │
│  │  (Node.js)   │  │  (Vectors)   │  │   (Cache)    │     │
│  │  Port 8001   │  │  Port 8000   │  │  Port 6379   │     │
│  └──────┬───────┘  └──────────────┘  └──────────────┘     │
│         │                                                    │
│         │ POSTGRES_URL env var                             │
│         │ (SSL/TLS Connection)                             │
└─────────┼──────────────────────────────────────────────────┘
          │
          │ Internet
          │ (Encrypted)
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    ☁️  NEONDB CLOUD                         │
│              (Cloud-Hosted PostgreSQL)                       │
│                                                              │
│  • Managed PostgreSQL 17.x                                  │
│  • Auto-scaling & backups                                   │
│  • SSL/TLS required                                         │
│  • Point-in-time recovery                                   │
│  • Connection pooling included                              │
│                                                              │
│  Access: https://console.neon.tech                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Environment Variable (REQUIRED)

```bash
# .env file
POSTGRES_URL=postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require
```

### How the App Connects

From `src/database/postgres-adapter.js`:

```javascript
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (connectionString) {
  // Use NeonDB cloud connection string
  this.pool = new Pool({
    connectionString: connectionString,  // ← NeonDB connection
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}
```

**The app ONLY uses cloud database via connection string.**

---

## ❌ What NOT to Do

### DO NOT Start Local PostgreSQL

```bash
# ❌ DON'T DO THIS
docker run postgres
podman run postgres
brew services start postgresql
```

### DO NOT Use docker-compose postgres Service

The old docker-compose configurations may reference a postgres service - **this is NOT used and should be ignored/removed**.

```yaml
# ❌ THIS SERVICE IS NOT USED
# postgres:
#   image: postgres:15-alpine
#   # ... DO NOT START THIS
```

### DO NOT Expect Local Database

The application will **fail to start** if POSTGRES_URL is not set, which is correct behavior. It will NOT fall back to a local database.

---

## ✅ Correct Setup Process

### 1. Sign Up for NeonDB (Free)
```
Visit: https://neon.tech
Create free account
No credit card required
```

### 2. Create a Project
```
1. Click "Create Project"
2. Name: "slm-business-layer"
3. Region: Choose closest to you
4. PostgreSQL version: 17.x
```

### 3. Get Connection String
```
Format: postgresql://user:password@host.neon.tech/db?sslmode=require

Example:
postgresql://myuser:secret@ep-cool-cloud-123.us-east-1.aws.neon.tech/mydb?sslmode=require
```

### 4. Configure Application
```bash
# Add to .env file
POSTGRES_URL=postgresql://your-actual-connection-string
JWT_SECRET=your-secret-key-minimum-32-characters
```

### 5. Load Database Schema
```bash
# Load schema to NeonDB (cloud)
psql 'your-neon-connection-string' -f database/schema.sql

# Load sample data
psql 'your-neon-connection-string' -f database/sample_data.sql
```

### 6. Start Application
```bash
# Application will connect to NeonDB automatically
podman-compose --profile full up -d orchestration
```

---

## Verification

### Check What Database is Being Used

```bash
# 1. Check environment variable
echo $POSTGRES_URL
# Should show: postgresql://...@...neon.tech/...

# 2. Check container logs
podman logs slm-orchestration | grep -i "postgres\|database"
# Should NOT show "localhost:5432"
# Should show connection to NeonDB or initialization

# 3. Verify no local postgres
podman ps | grep postgres
# Should show: nothing or "slm-postgres Exited"

# 4. Test database connection
psql "$POSTGRES_URL" -c "SELECT version();"
# Should show PostgreSQL version from NeonDB
```

---

## Troubleshooting

### "Database initialization failed"

**Cause:** POSTGRES_URL not set or invalid

**Solution:**
```bash
# 1. Verify environment variable
echo $POSTGRES_URL

# 2. If empty, add to .env
nano .env
# Add: POSTGRES_URL=postgresql://...@...neon.tech/...?sslmode=require

# 3. Restart orchestration
podman-compose restart orchestration
```

### "Connection refused to localhost:5432"

**Cause:** App is trying to connect to local PostgreSQL (wrong config)

**Solution:**
```bash
# 1. Ensure POSTGRES_URL is set correctly
grep POSTGRES_URL .env

# 2. Make sure it points to neon.tech, not localhost
# Correct: postgresql://...@ep-xxx.neon.tech/...
# Wrong: postgresql://...@localhost:5432/...

# 3. Restart with correct config
podman-compose restart orchestration
```

### "Cannot find postgres container"

**This is CORRECT!** There should be NO PostgreSQL container. The app uses NeonDB cloud database.

---

## Migration Notes

### If You See Local PostgreSQL Container

```bash
# Stop and remove it - it's not used
podman stop slm-postgres
podman rm slm-postgres

# Remove from docker-compose if present
# (The current config already excludes it)
```

### If Coming From Local PostgreSQL Setup

```bash
# 1. Export your data (if any)
pg_dump -h localhost -U postgres your_db > backup.sql

# 2. Import to NeonDB
psql 'your-neon-connection-string' -f backup.sql

# 3. Update environment
export POSTGRES_URL="your-neon-connection-string"

# 4. Remove local PostgreSQL
brew services stop postgresql  # macOS
# or
podman stop slm-postgres && podman rm slm-postgres
```

---

## Summary

### What Runs Locally (Podman)
- ✅ slm-orchestration (Node.js API)
- ✅ slm-chromadb (Vector database for RAG)
- ✅ slm-redis (Cache and sessions)

### What Runs in Cloud
- ✅ **NeonDB PostgreSQL** ← THE DATABASE

### What Runs on Host
- ✅ Ollama (LLM inference)

### What Does NOT Run
- ❌ Local PostgreSQL
- ❌ PostgreSQL containers
- ❌ Database in Docker/Podman

---

## Key Points

1. **NeonDB is THE database** - No local alternative
2. **POSTGRES_URL must be set** - App will not start without it
3. **No PostgreSQL containers** - They are not used
4. **Cloud-only approach** - By design, not optional
5. **See setup guide** - `docs/NEONDB_SETUP.md` for complete instructions

---

**For Questions:** See `docs/NEONDB_SETUP.md`  
**Quick Reference:** See `QUICK_START.md`  
**Configuration:** See `env.example`

