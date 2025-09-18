#!/bin/bash

# Test script for SLM Business Service Layer
TOKEN=$(curl -s -X POST http://localhost:8001/api/generate-token -H "Content-Type: application/json" -d '{"userId": "test-user", "role": "admin"}' | jq -r '.token')

echo "Testing business request with database connectivity..."
curl -s -X POST http://localhost:8001/api/business-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"request": "Show me all pending orders", "context": {"limit": 5}}' | jq '.data.database_result'