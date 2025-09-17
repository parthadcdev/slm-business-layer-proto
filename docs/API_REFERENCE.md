# SLM Business Service Layer - API Reference

## Overview

This document provides detailed API specifications for all modules in the SLM Business Service Layer.

---

## Orchestration API

### Main Application Server (`app.js`)

#### Business Request Processing

```http
POST /api/business-request
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
```

**Request Body:**
```json
{
  "request": "string",     // Natural language business request
  "context": {             // Optional context object
    "department": "string",
    "user_role": "string",
    "filters": {},
    "metadata": {}
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "result": "Processed result data",
    "actions_taken": [],
    "processing_time": 1234,
    "model_used": "llama3.2:3b"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error description",
  "code": "BUSINESS_REQUEST_ERROR",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### Service Status Monitoring

```http
GET /api/service-status/chromadb
```

**Response:**
```json
{
  "status": "online|offline",
  "version": "1.0.0",
  "url": "http://localhost:8000",
  "response_time": 123,
  "last_check": "2024-01-01T00:00:00Z"
}
```

```http
GET /api/service-status/ollama
```

**Response:**
```json
{
  "status": "online|offline",
  "models": 3,
  "url": "http://localhost:11434",
  "available_models": ["llama3.2:3b", "mistral:7b"],
  "memory_usage": "2.1GB"
}
```

#### Token Management

```http
POST /api/generate-token
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "string",
  "role": "admin|manager|user|guest",
  "email": "string",
  "expiresIn": "24h"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "24h",
  "user": {
    "id": "string",
    "role": "string",
    "email": "string"
  }
}
```

#### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 123456,
  "version": "1.0.0"
}
```

---

## Context Manager API (`context-manager.js`)

### Context Enrichment

```javascript
const contextManager = require('./context-manager');

// Enrich context with user and system information
async function enrichContext(context, user) {
  return await contextManager.enrichContext(context, user);
}
```

**Input:**
```javascript
{
  context: {
    department: "sales",
    filters: {},
    metadata: {}
  },
  user: {
    id: "user123",
    role: "manager",
    permissions: ["read:orders", "write:reports"]
  }
}
```

**Output:**
```javascript
{
  original: { /* original context */ },
  enriched: {
    user: {
      id: "user123",
      role: "manager",
      department: "sales",
      permissions: ["read:orders", "write:reports"]
    },
    temporal: {
      current_time: "2024-01-01T00:00:00Z",
      business_hours: true,
      fiscal_quarter: "Q1-2024"
    },
    business: {
      active_campaigns: [],
      system_alerts: [],
      data_freshness: "2024-01-01T00:00:00Z"
    },
    security: {
      access_level: "department",
      audit_enabled: true,
      data_classification: "internal"
    }
  }
}
```

---

## Prompt Builder API (`prompt-builder.js`)

### Dynamic Prompt Construction

```javascript
const promptBuilder = require('./prompt-builder');

// Build context-aware prompt
async function buildPrompt(request, enrichedContext) {
  return await promptBuilder.buildPrompt(request, enrichedContext);
}
```

**Input:**
```javascript
{
  request: "Show me all pending orders",
  enrichedContext: { /* context from context-manager */ }
}
```

**Output:**
```javascript
{
  prompt: "SYSTEM: You are a business intelligence assistant...\nCONTEXT: ...\nUSER REQUEST: Show me all pending orders",
  metadata: {
    template_used: "business_query",
    documents_retrieved: 5,
    context_tokens: 512,
    total_tokens: 1024
  },
  retrieved_documents: [
    {
      id: "doc1",
      title: "Order Management SOP",
      relevance_score: 0.95,
      chunk: "Pending orders are defined as..."
    }
  ]
}
```

---

## SLM Integration API

### Ollama Client (`ollama-client.js`)

```javascript
const ollamaClient = require('../slm/ollama-client');

// Generate response from model
async function generateResponse(prompt, modelName = 'llama3.2:3b') {
  return await ollamaClient.generateResponse(prompt, modelName);
}

// List available models
async function listModels() {
  return await ollamaClient.listAvailableModels();
}
```

**generateResponse Output:**
```javascript
{
  response: "Based on the current data, there are 23 pending orders...",
  model: "llama3.2:3b",
  tokens_used: 1024,
  generation_time: 2.3,
  finish_reason: "stop"
}
```

**listModels Output:**
```javascript
{
  models: [
    {
      name: "llama3.2:3b",
      size: "1.9GB",
      modified: "2024-01-01T00:00:00Z",
      status: "loaded"
    },
    {
      name: "mistral:7b",
      size: "4.1GB",
      modified: "2024-01-01T00:00:00Z",
      status: "available"
    }
  ]
}
```

### Model Manager (`model-manager.js`)

```javascript
const modelManager = require('../slm/model-manager');

// Load model
async function loadModel(modelName) {
  return await modelManager.loadModel(modelName);
}

// Get model metrics
async function getModelMetrics() {
  return await modelManager.getModelMetrics();
}
```

**Model Metrics Output:**
```javascript
{
  loaded_models: ["llama3.2:3b"],
  memory_usage: {
    total: "8GB",
    used: "3.2GB",
    available: "4.8GB"
  },
  performance: {
    avg_response_time: 2.1,
    requests_per_minute: 45,
    cache_hit_rate: 0.78
  }
}
```

### Action Parser (`action-parser.js`)

```javascript
const actionParser = require('../slm/action-parser');

// Parse SLM response into actions
async function parseResponse(rawResponse) {
  return await actionParser.parseResponse(rawResponse);
}
```

**Input:**
```javascript
{
  response: "I found 23 pending orders. Here's the SQL query: SELECT * FROM orders WHERE status = 'pending';"
}
```

**Output:**
```javascript
{
  parsed_actions: [
    {
      type: "database_query",
      action: "SELECT",
      sql: "SELECT * FROM orders WHERE status = 'pending'",
      parameters: {},
      validation: {
        safe: true,
        read_only: true,
        estimated_rows: 23
      }
    }
  ],
  text_response: "I found 23 pending orders in the system.",
  confidence: 0.95,
  requires_approval: false
}
```

---

## RAG Layer API

### Vector Store (`vector-store.js`)

```javascript
const vectorStore = require('../rag/vector-store');

// Search for relevant documents
async function search(query, options = {}) {
  return await vectorStore.search(query, options);
}

// Add documents to vector store
async function addDocuments(documents) {
  return await vectorStore.addDocuments(documents);
}
```

**Search Input:**
```javascript
{
  query: "order management process",
  options: {
    limit: 5,
    threshold: 0.7,
    filters: {
      document_type: "SOP",
      department: "sales"
    }
  }
}
```

**Search Output:**
```javascript
{
  results: [
    {
      id: "doc1",
      title: "Order Management Standard Operating Procedure",
      content: "The order management process begins...",
      score: 0.95,
      metadata: {
        document_type: "SOP",
        department: "sales",
        last_updated: "2024-01-01",
        version: "2.1"
      }
    }
  ],
  total_results: 12,
  search_time: 0.045,
  query_embedding: [0.1, 0.2, ...]
}
```

### ChromaDB Client (`chromadb-client.js`)

```javascript
const chromaClient = require('../rag/chromadb-client');

// Create collection
async function createCollection(name, metadata) {
  return await chromaClient.createCollection(name, metadata);
}

// Query collection
async function queryCollection(collectionName, queryEmbedding, nResults) {
  return await chromaClient.queryCollection(collectionName, queryEmbedding, nResults);
}
```

### Embedding Service (`embedding-service.js`)

```javascript
const embeddingService = require('../rag/embedding-service');

// Generate embedding for text
async function generateEmbedding(text) {
  return await embeddingService.generateEmbedding(text);
}

// Batch generate embeddings
async function batchEmbeddings(texts) {
  return await embeddingService.batchEmbeddings(texts);
}
```

**Output:**
```javascript
{
  embedding: [0.1, -0.2, 0.3, ...], // 384-dimensional vector
  model: "all-MiniLM-L6-v2",
  processing_time: 0.012,
  tokens: 15
}
```

---

## Security API

### RBAC (`rbac.js`)

```javascript
const rbac = require('../security/rbac');

// Check permission
async function checkPermission(user, resource, action) {
  return await rbac.checkPermission(user, resource, action);
}

// Get user roles
async function getUserRoles(userId) {
  return await rbac.getUserRoles(userId);
}
```

**Permission Check:**
```javascript
// Input
{
  user: { id: "user123", role: "manager" },
  resource: "orders",
  action: "read"
}

// Output
{
  allowed: true,
  reason: "User has manager role with read access to orders",
  conditions: {
    department_only: true,
    time_restricted: false
  }
}
```

### Prompt Sanitizer (`prompt-sanitizer.js`)

```javascript
const sanitizer = require('../security/prompt-sanitizer');

// Sanitize prompt input
async function sanitizePrompt(input) {
  return await sanitizer.sanitizePrompt(input);
}
```

**Output:**
```javascript
{
  sanitized: "Show me all pending orders",
  original: "Show me all pending orders; DROP TABLE users;",
  threats_detected: ["sql_injection"],
  safety_score: 0.95,
  blocked_content: ["DROP TABLE users"]
}
```

---

## Inference Layer API

### Executor (`executor.js`)

```javascript
const executor = require('../inference/executor');

// Execute parsed action
async function executeAction(action, context) {
  return await executor.executeAction(action, context);
}
```

**Input:**
```javascript
{
  action: {
    type: "database_query",
    sql: "SELECT * FROM orders WHERE status = 'pending'",
    parameters: {}
  },
  context: {
    user: { id: "user123", role: "manager" },
    request_id: "req123",
    timestamp: "2024-01-01T00:00:00Z"
  }
}
```

**Output:**
```javascript
{
  success: true,
  result: {
    rows: [
      { id: 1, customer: "ABC Corp", amount: 1500.00, status: "pending" },
      { id: 2, customer: "XYZ Ltd", amount: 2300.00, status: "pending" }
    ],
    row_count: 23,
    execution_time: 0.045
  },
  action_id: "action123",
  audit_trail: {
    user: "user123",
    timestamp: "2024-01-01T00:00:00Z",
    action_type: "database_query"
  }
}
```

### Database Functions (`db-functions.js`)

```javascript
const dbFunctions = require('../inference/db-functions');

// Execute database query
async function queryDatabase(sql, params) {
  return await dbFunctions.queryDatabase(sql, params);
}

// Get table schema
async function getTableSchema(tableName) {
  return await dbFunctions.getTableSchema(tableName);
}
```

---

## Data Adapters API

### Database Adapter (`database-adapter.js`)

```javascript
const dbAdapter = require('../data-adapters/database-adapter');

// Execute query with connection pooling
async function executeQuery(query, params) {
  return await dbAdapter.executeQuery(query, params);
}

// Get connection status
async function getConnectionStatus() {
  return await dbAdapter.getConnectionStatus();
}
```

### API Adapter (`api-adapter.js`)

```javascript
const apiAdapter = require('../data-adapters/api-adapter');

// Make external API call
async function makeAPICall(endpoint, method, data) {
  return await apiAdapter.makeAPICall(endpoint, method, data);
}
```

---

## Error Codes and Status Codes

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error
- `503` - Service Unavailable

### Custom Error Codes

- `AUTH_TOKEN_EXPIRED` - JWT token has expired
- `AUTH_TOKEN_INVALID` - JWT token is malformed or invalid
- `BUSINESS_REQUEST_ERROR` - Error processing business request
- `SLM_MODEL_ERROR` - Error with SLM model inference
- `RAG_RETRIEVAL_ERROR` - Error retrieving documents
- `PERMISSION_DENIED` - User lacks required permissions
- `PROMPT_INJECTION_DETECTED` - Potential prompt injection attack
- `RATE_LIMIT_EXCEEDED` - API rate limit exceeded
- `SERVICE_UNAVAILABLE` - External service unavailable

---

## Testing APIs

### Test Interface Endpoints

```http
GET /test-interface.html
```
Interactive browser-based testing interface.

### Development Utilities

```javascript
// Generate test token
const testToken = await fetch('/api/generate-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'test-user',
    role: 'admin',
    email: 'test@example.com'
  })
});

// Test business request
const response = await fetch('/api/business-request', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    request: 'Show me all pending orders',
    context: { department: 'sales' }
  })
});
```

---

This API reference provides complete specifications for all modules in the SLM Business Service Layer. Use this documentation for integration, testing, and development purposes.