# Training System Activation Guide

## 🚨 Critical: Load Training Schema into NeonDB

The training system requires 3 tables in your NeonDB database. Currently they don't exist, which is causing errors.

### Option 1: Using psql (Recommended)

```bash
# Set your NeonDB connection string
export POSTGRES_URL="postgresql://your-user:your-password@your-neondb-host/your-database"

# Verify connection
psql "$POSTGRES_URL" -c "SELECT version();"

# Load the training schema
psql "$POSTGRES_URL" -f database/training-schema.sql

# Verify tables were created
psql "$POSTGRES_URL" -c "\dt training*"
```

Expected output:
```
                      List of relations
 Schema |           Name           | Type  |  Owner  
--------+--------------------------+-------+---------
 public | query_training_history   | table | user
 public | training_improvements    | table | user
 public | training_metadata        | table | user
```

### Option 2: Using the provided script

```bash
export POSTGRES_URL="your-neondb-connection-string"
./scripts/load-training-schema.sh
```

### Option 3: Via NeonDB Console

1. Go to https://console.neon.tech/
2. Select your project and database
3. Go to SQL Editor
4. Copy and paste the contents of `database/training-schema.sql`
5. Click "Run"

## After Loading Schema

1. **Rebuild orchestration service:**
   ```bash
   cd /Users/partha/AxonSphere/slm-business-layer-proto
   podman-compose --profile full build orchestration
   ```

2. **Restart services:**
   ```bash
   podman restart slm-chromadb
   podman restart slm-orchestration
   ```

3. **Verify training system is ready:**
   ```bash
   podman logs slm-orchestration 2>&1 | grep "Training manager initialized"
   ```
   
   Expected: `[Training-Manager] Training manager initialized successfully`

4. **Check there are no errors:**
   ```bash
   podman logs slm-orchestration 2>&1 | grep "does not exist"
   ```
   
   Expected: No output (no missing table errors)

## Enable Training Mode

Once schema is loaded and service restarted:

```bash
# Get admin token
TOKEN=$(curl -s -X POST http://localhost:8001/api/generate-token \
  -H "Content-Type: application/json" \
  -d '{"userId": "admin", "role": "admin"}' | jq -r '.token')

# Enable training mode
curl -X POST http://localhost:8001/api/training/toggle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq .

# Expected response:
# {
#   "success": true,
#   "training_mode": true,
#   "toggled_by": "admin",
#   "timestamp": "..."
# }
```

## Access Training UIs

- **Test Interface**: http://localhost:8001/test-interface.html
  - Green banner will appear: "🎓 TRAINING MODE ACTIVE"
  - Rating widget appears after each query

- **Training Dashboard**: http://localhost:8001/training-dashboard.html
  - View all training queries
  - See analytics and improvements
  - Monitor progress

## Quick Test

1. Open test interface: http://localhost:8001/test-interface.html
2. Generate token (role: admin)
3. Submit query: "Show me all pending orders"
4. **Green banner appears** ✓
5. **Rating widget appears** ✓
6. Rate the result (1-10)
7. Submit feedback

## Troubleshooting

### ChromaDB 422 Error
If you see `Failed to fetch http://chromadb:8000/api/v2/tenants/default_tenant/databases/default_database/collections with status 422`, this is usually transient. The training system will work even if ChromaDB has issues (it will just skip similar query search).

### Training Not Recording Queries
Check:
```bash
# 1. Training mode is ON
curl http://localhost:8001/api/training/status -H "Authorization: Bearer $TOKEN" | jq .

# 2. Tables exist
psql "$POSTGRES_URL" -c "SELECT COUNT(*) FROM training_metadata;"

# 3. Service logs show no errors
podman logs slm-orchestration 2>&1 | tail -50
```

## What Gets Fixed

Once training schema is loaded:

✅ Database statistics will work (prevents LLM assumptions)  
✅ Training queries will be recorded  
✅ Human feedback will be stored  
✅ Improvements will be learned and applied immediately  
✅ Error feedback will work in multi-model fallback  

---

**Next Step**: Load the training schema into NeonDB using one of the options above.

