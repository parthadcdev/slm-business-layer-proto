# Human-in-the-Loop Training System

## Overview

This system implements a comprehensive training feedback loop that allows humans to rate SQL query quality and provide corrections, which immediately improve future query generation. The system learns from errors and successful patterns to eliminate assumptions and generate deterministic, accurate queries.

## ✅ Implemented Components

### 1. Database Statistics Collection
**File:** `src/mcp/database-stats-collector.js`

- Collects real-time statistics from NeonDB:
  - Table row counts
  - Column cardinality (distinct value counts)
  - Value distributions for categorical columns (status, types, etc.)
  - Min/max ranges for numeric/date columns
  - Actual values for low-cardinality columns (<20 distinct values)

- **Prevents LLM Assumptions**: System now knows actual status values, date ranges, and data distributions

### 2. Training Data Storage

**NeonDB Schema:** `database/training-schema.sql`
- `query_training_history`: Stores every query execution with metadata
- `training_improvements`: Learned patterns from human feedback
- `training_metadata`: Global training mode status
- Views for analytics and reporting

**ChromaDB Vector Store:** `src/rag/training-vector-store.js`
- Semantic search for similar successful queries
- Stores embeddings of user requests, SQL, and errors
- Enables finding highly-rated examples (rating >= 8) for learning

### 3. Training Manager
**File:** `src/ai/training-manager.js`

Core features:
- Admin-controlled training mode toggle
- Records every query execution when training mode is ON
- Applies human feedback immediately
- Extracts improvement patterns from corrections
- Maintains in-memory cache of learned improvements
- Provides similar successful queries to SQL generator

### 4. Error Feedback System
**File:** `src/ai/sql-generator.js`

Enhanced multi-model fallback with error accumulation:
- Tracks validation errors, execution errors, and generation failures
- Passes errors to next attempt within same model
- Passes accumulated errors from all models to next model in chain
- New method: `generateWithErrorFeedback()` - Uses training data and error history

Key improvements:
```javascript
// Before trying next model:
allErrors = [
  {type: 'validation', message: 'Missing customer JOIN', sql: '...'},
  {type: 'execution', message: 'Column xyz does not exist', sql: '...'}
];

// Next model gets:
- All previous errors
- Similar successful queries (rating 8+)
- Learned improvements for this pattern
```

### 5. Training UI Components

**Test Interface:** `test-interface.html`
- Training mode banner (green when active)
- Rating widget (1-10 stars)
- Feedback text area
- Corrected SQL input
- Auto-shows after each query in training mode

**Admin Dashboard:** `training-dashboard.html`
- View all training queries
- Filter by rating, model, date
- View active improvements
- Track training progress
- Analytics and metrics

### 6. Training API Endpoints

**File:** `src/orchestration/app.js`

New endpoints:
- `POST /api/training/toggle` - Enable/disable training mode (admin only)
- `GET /api/training/status` - Check if training mode is active
- `POST /api/training/feedback` - Submit rating and corrections
- `GET /api/training/analytics` - Get training metrics
- `POST /api/training/similar` - Find similar successful queries
- `GET /api/training/history` - Get training query history

### 7. Analytics Module
**File:** `src/ai/training-analytics.js`

Tracks:
- Average rating by query pattern
- Model performance by intent type
- Common error patterns
- Improvement effectiveness
- Success rate over time

## 🚀 How to Activate Training System

### Step 1: Load Training Schema into NeonDB

```bash
# Set your NeonDB connection string
export POSTGRES_URL="postgresql://user:password@your-neondb-host/dbname"

# Run the schema loader script
./scripts/load-training-schema.sh
```

Or manually:
```bash
psql "$POSTGRES_URL" -f database/training-schema.sql
```

### Step 2: Verify Database Statistics

The system should automatically collect database statistics on startup. Check logs:
```bash
podman logs slm-orchestration | grep "Database statistics loaded"
```

Expected output:
```
[Database-MCP] Database statistics loaded for 7 tables
```

### Step 3: Enable Training Mode

**Option A: Via API**
```bash
# Get admin token
TOKEN=$(curl -s -X POST http://localhost:8001/api/generate-token \
  -H "Content-Type: application/json" \
  -d '{"userId": "admin", "role": "admin"}' | jq -r '.token')

# Enable training mode
curl -X POST http://localhost:8001/api/training/toggle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**Option B: Via Training Dashboard**
1. Open `http://localhost:8001/training-dashboard.html`
2. Click "Toggle Training Mode" button
3. Banner will turn green when active

### Step 4: Make Queries and Provide Ratings

1. Open `http://localhost:8001/test-interface.html`
2. Generate a token (role: analyst or admin)
3. Submit business requests
4. **Green banner appears**: "TRAINING MODE ACTIVE"
5. **Rating widget shows** after each query
6. Rate the result (1-10)
7. Optionally provide feedback or corrected SQL
8. Submit feedback

### Step 5: Observe Improvements

**Immediate Effect:**
- Next similar query uses learned patterns
- Error feedback from previous queries
- Similar successful queries (rating 8+) as examples

**View Analytics:**
```bash
curl -X GET http://localhost:8001/api/training/analytics \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## 📊 Training Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Admin Enables Training Mode                             │
│    └─> All queries saved to training_history table          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. User Makes Query: "Show me pending orders"              │
│    └─> System tries models in priority order                │
│    └─> Accumulates errors from each attempt                 │
│    └─> Returns result + training_id                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. UI Shows Rating Widget                                   │
│    └─> User rates: 7/10                                     │
│    └─> User provides feedback: "Missing customer JOIN"      │
│    └─> User provides corrected SQL (optional)               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. System Applies Feedback IMMEDIATELY                      │
│    ├─> Stores in NeonDB (query_training_history)            │
│    ├─> Stores in ChromaDB (vector embeddings)               │
│    ├─> Extracts improvement pattern                         │
│    ├─> Stores in training_improvements table                │
│    └─> Updates in-memory improvement cache                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Next Similar Query Uses Improvements                     │
│    ├─> Searches ChromaDB for similar queries (rating 8+)    │
│    ├─> Loads learned improvements for pattern               │
│    ├─> Includes database statistics (no assumptions)        │
│    └─> Includes error history to avoid past mistakes        │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Key Features

### Prevents LLM Assumptions
**Before Training:**
```
User: "Show me pending orders"
LLM assumes: status values might be "pending", "open", "new", etc.
SQL: WHERE status IN ('pending', 'open', 'new')  -- WRONG!
```

**After Training (with DB stats):**
```
User: "Show me pending orders"
System knows: status values are exactly ["pending", "completed", "cancelled", "shipped", "processing"]
SQL: WHERE status = 'pending'  -- CORRECT!
```

### Error-Driven Improvement
**Model fallback with accumulated errors:**
```
codegemma:2b attempt 1: FAILED (empty response)
  └─> Error recorded: "Empty response"
  
codegemma:2b attempt 2: FAILED with error feedback
  └─> Errors: ["Empty response", "Missing SELECT"]
  └─> Tries next model...
  
phi3:mini attempt 1: Uses errors from codegemma
  └─> Prompt includes: "Previous model failed with: empty response, missing SELECT"
  └─> SUCCESS! (learns from previous mistakes)
```

### Immediate Learning
```
Query 1: "List pending orders"
  └─> Rating: 4/10
  └─> Corrected SQL provided
  └─> System extracts: "When listing orders, always JOIN with customers for names"
  
Query 2: "Show pending orders from last week"
  └─> Improvement applied in prompt
  └─> Rating: 9/10 ✓
```

## 📈 Success Metrics

Monitor these in the training dashboard:

1. **Average Rating**: Should increase over time (target >8.0)
2. **High Quality Count**: Queries rated 8+ should increase
3. **Model Success Rate**: First model (codegemma:2b) should succeed more often
4. **Error Reduction**: Fewer validation and execution errors
5. **Improvement Impact**: Rating after > Rating before for each improvement

## 🔧 Troubleshooting

### Training Manager Not Initialized
**Issue:** `Training manager initialized successfully` but tables don't exist

**Fix:**
```bash
export POSTGRES_URL="your-neondb-connection-string"
./scripts/load-training-schema.sh
```

### ChromaDB Collection Failed
**Issue:** `ChromaDB initialization failed`

**Fix:**
```bash
# Start ChromaDB
podman-compose up -d chromadb

# Wait for it to be ready
curl http://localhost:8000/api/v2/version
```

### Training Mode Not Saving Queries
**Issue:** Queries not appearing in training history

**Check:**
1. Training mode is enabled: `curl http://localhost:8001/api/training/status`
2. Training manager is ready: Look for `Training manager initialized successfully` in logs
3. Database tables exist: `psql $POSTGRES_URL -c "\dt training*"`

## 🎓 Best Practices

### For Training Period

1. **Enable Training Mode** before starting
2. **Rate every query** (consistency is key)
3. **Provide corrections** for low ratings (≤5)
4. **Be specific in feedback**: "Missing customer JOIN" better than "Wrong query"
5. **Aim for 50-100 rated queries** across different patterns before production

### For Production

1. **Monitor average rating** - should stay above 8.0
2. **Review improvements weekly** - disable ineffective ones
3. **Retrain periodically** - enable training mode for new query types
4. **Archive old training data** - keep last 6 months for performance

## 📁 Files Created/Modified

### New Files (7)
1. `src/mcp/database-stats-collector.js` - Collects DB statistics
2. `src/rag/training-vector-store.js` - ChromaDB storage
3. `src/ai/training-manager.js` - Core training logic
4. `src/ai/training-analytics.js` - Analytics module
5. `database/training-schema.sql` - Database schema
6. `training-dashboard.html` - Admin dashboard
7. `scripts/load-training-schema.sh` - Schema loader script

### Modified Files (4)
1. `src/mcp/servers/database-mcp-server.js` - Added statistics loading
2. `src/ai/sql-generator.js` - Error feedback + training integration
3. `src/orchestration/app.js` - Training endpoints + initialization
4. `test-interface.html` - Rating widget UI

## 🔗 Quick Links

- **Test Interface**: http://localhost:8001/test-interface.html
- **Training Dashboard**: http://localhost:8001/training-dashboard.html
- **API Docs**: http://localhost:8001/api/training/status
- **Health Check**: http://localhost:8001/health

---

**Status**: ✅ Fully Implemented  
**Next Step**: Load training schema into NeonDB with `./scripts/load-training-schema.sh`  
**Author**: Partha Chandramohan  
**Date**: October 12, 2025

