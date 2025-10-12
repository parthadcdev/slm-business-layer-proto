#!/bin/bash
# Load training schema into NeonDB
# Author: Partha Chandramohan

echo "Loading training schema into NeonDB..."

if [ -z "$POSTGRES_URL" ]; then
    echo "❌ ERROR: POSTGRES_URL environment variable not set"
    echo "Please set your NeonDB connection string:"
    echo "  export POSTGRES_URL='postgresql://user:pass@host/dbname'"
    exit 1
fi

# Load the training schema
psql "$POSTGRES_URL" -f database/training-schema.sql

if [ $? -eq 0 ]; then
    echo "✅ Training schema loaded successfully"
    echo ""
    echo "Schema includes:"
    echo "  - query_training_history table"
    echo "  - training_improvements table"
    echo "  - training_metadata table"
    echo "  - Views for analytics"
    echo ""
    echo "Next steps:"
    echo "  1. Rebuild and restart orchestration service"
    echo "  2. Enable training mode from test interface or dashboard"
    echo "  3. Start rating queries to build training data"
else
    echo "❌ Failed to load schema"
    exit 1
fi

