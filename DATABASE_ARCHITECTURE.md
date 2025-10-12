# Database Architecture - NeonDB Cloud PostgreSQL

**Author:** Partha Chandramohan  
**Last Updated:** October 12, 2025  
**Status:** ⚠️ **IMPORTANT - READ THIS FIRST**  
**Version:** 2.0 (with Training System)

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
8. **Training Data Persistence**: Critical for human-in-the-loop training system
9. **Cloud Analytics**: Query history and improvements survive container restarts
10. **Multi-Environment**: Same database accessible from dev, staging, production

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SLM Business Layer                        │
│                  (Podman Containers)                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Orchestration (Node.js) - Port 8001                 │  │
│  │  • Business Logic Processing                         │  │
│  │  • Multi-Model Fallback (phi3 → qwen2.5 → llama3.2) │  │
│  │  • Training System Manager                           │  │
│  │  • Database Stats Collector                          │  │
│  │  • MCP Router (Context + Database + Training)        │  │
│  └──────┬───────────────────────────────────────────────┘  │
│         │                                                    │
│  ┌──────┴───────┐        ┌──────────────┐                  │
│  │  ChromaDB    │        │    Redis     │                  │
│  │  (Vectors)   │        │   (Cache)    │                  │
│  │  Port 8000   │        │  Port 6379   │                  │
│  │  (Optional)  │        │              │                  │
│  └──────────────┘        └──────────────┘                  │
│                                                              │
│         POSTGRES_URL env var                                │
│         (SSL/TLS Connection)                                │
└─────────┼──────────────────────────────────────────────────┘
          │
          │ Internet (Encrypted)
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    ☁️  NEONDB CLOUD                         │
│              (Cloud-Hosted PostgreSQL)                       │
│                                                              │
│  Business Data (8 tables):                                  │
│  • orders, customers, products                              │
│  • inventory, warehouses, suppliers                         │
│  • order_items, product_categories                          │
│                                                              │
│  Training System (3 tables):                                │
│  • query_training_history (all queries + ratings)           │
│  • training_improvements (learned corrections)              │
│  • training_metadata (system config)                        │
│                                                              │
│  Infrastructure:                                             │
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
# Load business schema to NeonDB (cloud)
psql 'your-neon-connection-string' -f database/schema.sql

# Load sample data
psql 'your-neon-connection-string' -f database/sample_data.sql

# Load training system schema (REQUIRED for training features)
psql 'your-neon-connection-string' -f database/training-schema.sql

# OR use the provided script
export POSTGRES_URL='your-neon-connection-string'
./scripts/load-training-schema.sh
```

### 6. Start Application
```bash
# Application will connect to NeonDB automatically
podman-compose --profile full up -d orchestration
```

---

## Database Schema Overview

### Business Data Tables (8 tables)

**Core Entities:**
- **`customers`**: Customer information (id, name, email, total_spent, loyalty_points)
- **`orders`**: Order records (id, customer_id, total_amount, status, order_date)
- **`order_items`**: Individual items in orders (order_id, product_id, quantity, price)
- **`products`**: Product catalog (id, name, category_id, price, description)
- **`product_categories`**: Product categorization
- **`inventory`**: Stock levels (product_id, warehouse_id, quantity, last_updated)
- **`warehouses`**: Warehouse locations
- **`suppliers`**: Supplier information

### Training System Tables (3 tables)

**Training Infrastructure:**

1. **`query_training_history`**
   - **Purpose:** Records every query execution with ratings and feedback
   - **Key Columns:**
     - `training_id` (UUID, primary key)
     - `user_request` (original natural language query)
     - `classified_intent` (JSONB, intent classification result)
     - `generated_sql` (the SQL that was generated)
     - `execution_result` (JSONB, query results)
     - `execution_error` (any errors that occurred)
     - `validation_score` (0-1 decimal, validation confidence)
     - `model_used` (which LLM generated the SQL)
     - `human_rating` (1-10 star rating from user)
     - `human_feedback` (optional text feedback)
     - `improved_sql` (corrected SQL from human)
     - `fallback_chain` (models attempted)
     - `created_at`, `rated_at`, `rated_by`

2. **`training_improvements`**
   - **Purpose:** Stores learned improvement rules from human corrections
   - **Key Columns:**
     - `improvement_id` (UUID, primary key)
     - `query_pattern` (pattern matcher, e.g., "pending_orders_timeframe")
     - `error_type` (category of error corrected)
     - `original_prompt_fragment` (what was tried before)
     - `improved_prompt_fragment` (the learned correction)
     - `average_rating_before` (quality before improvement)
     - `average_rating_after` (quality after improvement)
     - `application_count` (how many times applied)
     - `is_active` (boolean, whether to use this improvement)
     - `created_at`, `last_applied`

3. **`training_metadata`**
   - **Purpose:** System configuration and flags
   - **Key Columns:**
     - `key` (VARCHAR, primary key)
     - `value` (TEXT, configuration value)
     - `last_updated` (timestamp)
   - **Example Keys:**
     - `training_mode` → "true" or "false"
     - `last_stats_refresh` → timestamp
     - `total_queries_trained` → count

### Views

- **`training_analytics_summary`**: Aggregated training metrics
  - Total queries, rated queries, average rating
  - High/low quality counts, corrections provided
  - Models used, last query time

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

# 5. Verify table count (should be 11 total)
psql "$POSTGRES_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
# Should show: 11 (8 business + 3 training)

# 6. Check training system tables
psql "$POSTGRES_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'training%' OR tablename LIKE 'query%';"
# Should show:
#   query_training_history
#   training_improvements
#   training_metadata

# 7. Verify training mode status
psql "$POSTGRES_URL" -c "SELECT key, value FROM training_metadata WHERE key = 'training_mode';"
# Should show: training_mode | true (or false)

# 8. Check training data
psql "$POSTGRES_URL" -c "SELECT COUNT(*) as total_queries, COUNT(human_rating) as rated_queries, ROUND(AVG(human_rating), 2) as avg_rating FROM query_training_history;"
# Shows training system usage
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

### "Training tables do not exist"

**Cause:** Training schema not loaded into NeonDB

**Solution:**
```bash
# Load training schema
export POSTGRES_URL="your-neon-connection-string"
./scripts/load-training-schema.sh

# OR manually
psql "$POSTGRES_URL" -f database/training-schema.sql

# Verify
psql "$POSTGRES_URL" -c "\dt training*"
# Should show: training_improvements, training_metadata
```

### "training_id is null in response"

**Cause:** Training system not initialized or training mode disabled

**Solution:**
```bash
# 1. Check training mode
curl http://localhost:8001/api/training/status

# 2. Enable if needed
curl -X POST http://localhost:8001/api/training/toggle \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 3. Verify training system is ready
podman logs slm-orchestration | grep -i "training"
# Should show: "[Training-Manager] Training system initialized"
```

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
- ✅ slm-orchestration (Node.js API with training system)
- ✅ slm-chromadb (Vector database for semantic search - optional)
- ✅ slm-redis (Cache and sessions)

### What Runs in Cloud (NeonDB)
- ✅ **PostgreSQL Database** ← THE ONLY DATABASE
  - **Business Tables (8):** orders, customers, products, inventory, etc.
  - **Training Tables (3):** query_training_history, training_improvements, training_metadata
  - **Views (1+):** training_analytics_summary

### What Runs on Host
- ✅ Ollama (3 LLM models: phi3:mini, qwen2.5:1.5b, llama3.2:1b)

### What Does NOT Run
- ❌ Local PostgreSQL
- ❌ PostgreSQL containers
- ❌ Database in Docker/Podman

---

## Key Points

1. **NeonDB is THE database** - No local alternative, by design
2. **POSTGRES_URL must be set** - App will not start without it
3. **Training schema required** - Load `database/training-schema.sql` for full functionality
4. **11 total tables** - 8 business + 3 training system
5. **No PostgreSQL containers** - They are not used and should not run
6. **Cloud-only approach** - Ensures training data persists across deployments
7. **Training data permanence** - Human ratings and improvements never lost
8. **Multi-environment support** - Same database accessible from dev/staging/prod

---

## Training System Database Features

### Data Persistence
- **Query History:** Every executed query with validation scores
- **Human Ratings:** 1-10 star ratings with feedback text
- **Corrected SQL:** Human-provided improvements for low-rated queries
- **Improvement Rules:** Auto-generated prompt enhancements
- **Analytics:** Aggregate views for training metrics

### Performance
- **Indexed Queries:** Fast retrieval by rating, pattern, date
- **JSONB Storage:** Flexible storage for intent classification and results
- **Connection Pooling:** Efficient connection management
- **Auto-scaling:** Handles increased training data load

### Cloud Benefits
- **Always Available:** Training data accessible 24/7
- **Automatic Backups:** Point-in-time recovery for training data
- **Branching:** Test schema changes without affecting production
- **Monitoring:** Built-in PostgreSQL metrics and logs

---

**For Questions:** See `docs/NEONDB_SETUP.md`  
**Quick Reference:** See `QUICK_START.md`  
**Configuration:** See `env.example`  
**Training System:** See `TRAINING_SYSTEM.md`  
**Database Schema:** See `database/training-schema.sql`

