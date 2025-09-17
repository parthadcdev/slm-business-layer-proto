# SLM Business Service Layer - Developer Guide

## Table of Contents

1. [Quick Start](#quick-start)
2. [Development Setup](#development-setup)
3. [Module Usage Examples](#module-usage-examples)
4. [Integration Patterns](#integration-patterns)
5. [Best Practices](#best-practices)
6. [Testing Guide](#testing-guide)
7. [Deployment Guide](#deployment-guide)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- Node.js 16+
- Python 3.8+
- Docker & Docker Compose
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd slm-business-layer-proto

# Install dependencies
npm install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start services
npm run dev:services

# Start the main application
npm run dev
```

### First API Call

```bash
# Generate a test token
TOKEN=$(curl -s -X POST http://localhost:8001/api/generate-token \
  -H "Content-Type: application/json" \
  -d '{"userId": "developer", "role": "admin"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Make a business request
curl -X POST http://localhost:8001/api/business-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"request": "Show me system status"}'
```

---

## Development Setup

### Environment Configuration

Create a `.env` file in the project root:

```bash
# Server Configuration
PORT=8001
NODE_ENV=development
LOG_LEVEL=debug

# Security
JWT_SECRET=your-development-secret-key

# Service URLs
OLLAMA_URL=http://localhost:11434
CHROMADB_URL=http://localhost:8000
POSTGRES_URL=postgresql://app_user:app_password@localhost:5432/business_app
REDIS_URL=redis://localhost:6379

# Model Configuration
DEFAULT_MODEL=llama3.2:3b
MAX_TOKENS=2048
TEMPERATURE=0.7

# Development Features
ENABLE_DEBUG_ROUTES=true
MOCK_EXTERNAL_APIS=false
```

### Development Scripts

```bash
# Development with hot reload
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Code quality
npm run lint
npm run format

# Database operations
npm run init:rag
npm run db:migrate
npm run db:seed

# Service management
npm run dev:services       # Start infrastructure only
npm run dev:docker         # Full Docker stack
npm run docker:logs        # View service logs
npm run docker:reset       # Clean restart
```

---

## Module Usage Examples

### 1. Basic Business Request Flow

```javascript
// src/examples/basic-flow.js
const express = require('express');
const { contextManager } = require('../orchestration/context-manager');
const { promptBuilder } = require('../orchestration/prompt-builder');
const { ollamaClient } = require('../slm/ollama-client');

async function processBusinessRequest(req, res) {
  try {
    const { request, context } = req.body;
    const user = req.user;

    // Step 1: Enrich context
    const enrichedContext = await contextManager.enrichContext(context, user);

    // Step 2: Build prompt
    const promptData = await promptBuilder.buildPrompt(request, enrichedContext);

    // Step 3: Get SLM response
    const response = await ollamaClient.generateResponse(
      promptData.prompt,
      'llama3.2:3b'
    );

    res.json({
      success: true,
      result: response.response,
      metadata: {
        processing_time: response.generation_time,
        model_used: 'llama3.2:3b',
        tokens_used: response.tokens_used
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
```

### 2. RAG Document Search

```javascript
// src/examples/rag-search.js
const { vectorStore } = require('../rag/vector-store');
const { embeddingService } = require('../rag/embedding-service');

async function searchDocuments(query, options = {}) {
  try {
    // Initialize vector store
    await vectorStore.initialize();

    // Search for relevant documents
    const results = await vectorStore.search(query, {
      limit: options.limit || 5,
      threshold: options.threshold || 0.7,
      filters: options.filters || {}
    });

    return {
      success: true,
      results: results.map(doc => ({
        title: doc.metadata.title,
        content: doc.content.substring(0, 200),
        relevance: doc.score,
        source: doc.metadata.source
      })),
      total: results.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Usage example
async function example() {
  const results = await searchDocuments('order management process', {
    limit: 3,
    filters: { department: 'sales' }
  });

  console.log('Search Results:', results);
}
```

### 3. Custom Model Integration

```javascript
// src/examples/custom-model.js
const { modelManager } = require('../slm/model-manager');
const { ollamaClient } = require('../slm/ollama-client');

class CustomModelService {
  constructor() {
    this.modelConfigs = {
      'business-analyst': {
        model: 'llama3.2:3b',
        temperature: 0.3,
        system_prompt: 'You are a business analyst assistant...'
      },
      'technical-writer': {
        model: 'codellama:7b',
        temperature: 0.1,
        system_prompt: 'You are a technical documentation expert...'
      }
    };
  }

  async processWithCustomModel(request, modelType = 'business-analyst') {
    const config = this.modelConfigs[modelType];
    if (!config) {
      throw new Error(`Unknown model type: ${modelType}`);
    }

    // Ensure model is loaded
    await modelManager.loadModel(config.model);

    // Build custom prompt
    const fullPrompt = `${config.system_prompt}\n\nUser Request: ${request}`;

    // Generate response
    const response = await ollamaClient.generateResponse(
      fullPrompt,
      config.model,
      { temperature: config.temperature }
    );

    return {
      response: response.response,
      model_used: config.model,
      model_type: modelType
    };
  }
}

// Usage
const customService = new CustomModelService();
const result = await customService.processWithCustomModel(
  'Analyze our Q4 sales performance',
  'business-analyst'
);
```

### 4. Security Integration

```javascript
// src/examples/security-integration.js
const { rbac } = require('../security/rbac');
const { promptSanitizer } = require('../security/prompt-sanitizer');

async function secureBusinessRequest(request, user, context) {
  try {
    // Step 1: Sanitize input
    const sanitized = await promptSanitizer.sanitizePrompt(request);
    if (!sanitized.safe) {
      throw new Error(`Security threat detected: ${sanitized.threats.join(', ')}`);
    }

    // Step 2: Check permissions
    const hasPermission = await rbac.checkPermission(
      user,
      context.resource || 'business_data',
      'read'
    );

    if (!hasPermission.allowed) {
      throw new Error(`Access denied: ${hasPermission.reason}`);
    }

    // Step 3: Process secure request
    return {
      sanitized_request: sanitized.sanitized,
      user_permissions: hasPermission.permissions,
      security_level: hasPermission.security_level
    };
  } catch (error) {
    throw new Error(`Security validation failed: ${error.message}`);
  }
}
```

### 5. Database Integration

```javascript
// src/examples/database-integration.js
const { dbFunctions } = require('../inference/db-functions');
const { executor } = require('../inference/executor');

class DatabaseService {
  async executeBusinessQuery(query, user) {
    try {
      // Validate query safety
      const validation = await dbFunctions.validateQuery(query);
      if (!validation.safe) {
        throw new Error(`Unsafe query: ${validation.reason}`);
      }

      // Check user permissions for affected tables
      for (const table of validation.tables) {
        const hasAccess = await rbac.checkPermission(user, table, 'read');
        if (!hasAccess.allowed) {
          throw new Error(`No access to table: ${table}`);
        }
      }

      // Execute query
      const result = await dbFunctions.queryDatabase(query, []);

      return {
        success: true,
        data: result.rows,
        row_count: result.row_count,
        execution_time: result.execution_time
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getTableInfo(tableName) {
    const schema = await dbFunctions.getTableSchema(tableName);
    return {
      table: tableName,
      columns: schema.columns,
      row_count: await this.getRowCount(tableName)
    };
  }

  async getRowCount(tableName) {
    const result = await dbFunctions.queryDatabase(
      `SELECT COUNT(*) as count FROM ${tableName}`,
      []
    );
    return result.rows[0].count;
  }
}
```

### 6. External API Integration

```javascript
// src/examples/api-integration.js
const { apiAdapter } = require('../data-adapters/api-adapter');

class ExternalAPIService {
  constructor() {
    this.endpoints = {
      crm: process.env.CRM_API_URL,
      erp: process.env.ERP_API_URL,
      notification: process.env.NOTIFICATION_API_URL
    };
  }

  async fetchCustomerData(customerId) {
    try {
      const response = await apiAdapter.makeAPICall(
        `${this.endpoints.crm}/customers/${customerId}`,
        'GET',
        null,
        {
          headers: {
            'Authorization': `Bearer ${process.env.CRM_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        customer: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch customer data: ${error.message}`
      };
    }
  }

  async sendNotification(message, recipients) {
    const payload = {
      message: message,
      recipients: recipients,
      channel: 'email',
      priority: 'normal'
    };

    return await apiAdapter.makeAPICall(
      `${this.endpoints.notification}/send`,
      'POST',
      payload
    );
  }
}
```

---

## Integration Patterns

### 1. Middleware Pattern

```javascript
// src/middleware/business-context.js
const businessContextMiddleware = async (req, res, next) => {
  try {
    // Add business context to request
    req.businessContext = {
      timestamp: new Date().toISOString(),
      request_id: generateRequestId(),
      user_department: req.user?.department,
      business_hours: isBusinessHours(),
      system_load: await getSystemLoad()
    };

    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to enrich business context' });
  }
};

// Usage in app.js
app.use('/api/business-request', businessContextMiddleware);
```

### 2. Plugin Pattern

```javascript
// src/plugins/custom-processor.js
class CustomBusinessProcessor {
  constructor(config) {
    this.config = config;
  }

  async process(request, context) {
    // Custom processing logic
    return {
      processed: true,
      result: 'Custom processing complete'
    };
  }

  getCapabilities() {
    return ['custom_analysis', 'data_transformation'];
  }
}

// Register plugin
const { pluginManager } = require('../core/plugin-manager');
pluginManager.register('custom-processor', CustomBusinessProcessor);
```

### 3. Event-Driven Pattern

```javascript
// src/events/business-events.js
const EventEmitter = require('events');

class BusinessEventEmitter extends EventEmitter {}
const businessEvents = new BusinessEventEmitter();

// Event listeners
businessEvents.on('request:processed', (data) => {
  console.log('Business request processed:', data.request_id);
  // Log to audit system
  // Update metrics
  // Send notifications
});

businessEvents.on('error:occurred', (error) => {
  console.error('Business error:', error);
  // Alert administrators
  // Log error details
});

// Emit events in processing flow
async function processRequest(request) {
  try {
    const result = await performProcessing(request);
    businessEvents.emit('request:processed', { request_id: request.id, result });
    return result;
  } catch (error) {
    businessEvents.emit('error:occurred', { request_id: request.id, error });
    throw error;
  }
}
```

---

## Best Practices

### 1. Error Handling

```javascript
// Standardized error handling
class BusinessError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Usage
try {
  await processBusinessRequest(request);
} catch (error) {
  if (error instanceof BusinessError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
}
```

### 2. Configuration Management

```javascript
// src/config/index.js
const config = {
  server: {
    port: process.env.PORT || 8001,
    environment: process.env.NODE_ENV || 'development'
  },
  models: {
    default: process.env.DEFAULT_MODEL || 'llama3.2:3b',
    temperature: parseFloat(process.env.TEMPERATURE) || 0.7,
    max_tokens: parseInt(process.env.MAX_TOKENS) || 2048
  },
  security: {
    jwt_secret: process.env.JWT_SECRET || 'default-secret',
    token_expiry: process.env.TOKEN_EXPIRY || '24h',
    rate_limit: {
      window: 15 * 60 * 1000, // 15 minutes
      max: 100
    }
  },
  services: {
    ollama: process.env.OLLAMA_URL || 'http://localhost:11434',
    chromadb: process.env.CHROMADB_URL || 'http://localhost:8000',
    postgres: process.env.POSTGRES_URL,
    redis: process.env.REDIS_URL
  }
};

module.exports = config;
```

### 3. Logging

```javascript
// src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Usage
logger.info('Business request processed', {
  request_id: 'req123',
  user_id: 'user456',
  processing_time: 1.23
});

logger.error('SLM inference failed', {
  error: error.message,
  model: 'llama3.2:3b',
  request_id: 'req123'
});
```

### 4. Performance Monitoring

```javascript
// src/middleware/metrics.js
const promClient = require('prom-client');

// Create metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const businessRequestCounter = new promClient.Counter({
  name: 'business_requests_total',
  help: 'Total number of business requests processed',
  labelNames: ['user_role', 'department', 'status']
});

// Middleware
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });

  next();
};

// Export metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(promClient.register.metrics());
});
```

---

## Testing Guide

### 1. Unit Testing

```javascript
// tests/unit/context-manager.test.js
const { contextManager } = require('../../src/orchestration/context-manager');

describe('Context Manager', () => {
  test('should enrich context with user information', async () => {
    const context = { department: 'sales' };
    const user = { id: 'user123', role: 'manager' };

    const enriched = await contextManager.enrichContext(context, user);

    expect(enriched.enriched.user.id).toBe('user123');
    expect(enriched.enriched.user.role).toBe('manager');
    expect(enriched.enriched.temporal).toBeDefined();
  });

  test('should handle invalid user gracefully', async () => {
    const context = { department: 'sales' };
    const user = null;

    await expect(contextManager.enrichContext(context, user))
      .rejects.toThrow('Invalid user');
  });
});
```

### 2. Integration Testing

```javascript
// tests/integration/business-request.test.js
const request = require('supertest');
const app = require('../../src/orchestration/app');

describe('Business Request API', () => {
  let authToken;

  beforeAll(async () => {
    // Get auth token
    const tokenResponse = await request(app)
      .post('/api/generate-token')
      .send({
        userId: 'test-user',
        role: 'admin'
      });

    authToken = tokenResponse.body.token;
  });

  test('should process business request successfully', async () => {
    const response = await request(app)
      .post('/api/business-request')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        request: 'Show me system status',
        context: { department: 'IT' }
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBeDefined();
  });

  test('should reject request without token', async () => {
    const response = await request(app)
      .post('/api/business-request')
      .send({
        request: 'Show me system status'
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
```

### 3. Load Testing

```javascript
// tests/load/load-test.js
const autocannon = require('autocannon');

async function runLoadTest() {
  // Generate auth token first
  const token = await getAuthToken();

  const result = await autocannon({
    url: 'http://localhost:8001/api/business-request',
    connections: 10,
    duration: 30,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      request: 'Show me system status',
      context: { department: 'test' }
    }),
    method: 'POST'
  });

  console.log('Load test results:', result);
}
```

---

## Deployment Guide

### 1. Production Configuration

```bash
# .env.production
NODE_ENV=production
PORT=8001
LOG_LEVEL=warn

JWT_SECRET=your-secure-production-secret
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=1000

OLLAMA_URL=http://ollama-service:11434
CHROMADB_URL=http://chromadb-service:8000
POSTGRES_URL=postgresql://user:pass@postgres-service:5432/production_db
REDIS_URL=redis://redis-service:6379

DEFAULT_MODEL=llama3.2:3b
MAX_TOKENS=2048
TEMPERATURE=0.7

ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true
```

### 2. Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY src/ ./src/
COPY config/ ./config/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 8001

CMD ["node", "src/orchestration/app.js"]
```

### 3. Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: slm-business-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: slm-business-service
  template:
    metadata:
      labels:
        app: slm-business-service
    spec:
      containers:
      - name: slm-service
        image: slm-business-service:latest
        ports:
        - containerPort: 8001
        env:
        - name: NODE_ENV
          value: "production"
        - name: POSTGRES_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: postgres-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8001
          initialDelaySeconds: 5
          periodSeconds: 5
```

---

## Troubleshooting

### 1. Common Issues

#### Model Loading Failures
```bash
# Check Ollama service
curl http://localhost:11434/api/tags

# Pull missing models
ollama pull llama3.2:3b

# Check model status
ollama list
```

#### ChromaDB Connection Issues
```bash
# Check ChromaDB service
curl http://localhost:8000/api/v2/version

# Restart ChromaDB
docker restart slm-chromadb

# Check logs
docker logs slm-chromadb
```

#### Authentication Problems
```javascript
// Debug JWT tokens
const jwt = require('jsonwebtoken');
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log('Token valid:', decoded);
} catch (error) {
  console.log('Token invalid:', error.message);
}
```

### 2. Debug Mode

```javascript
// Enable debug logging
process.env.LOG_LEVEL = 'debug';
process.env.DEBUG = 'slm:*';

// Add debug statements
const debug = require('debug')('slm:business-request');
debug('Processing request:', request);
```

### 3. Performance Issues

```javascript
// Monitor processing times
const startTime = process.hrtime.bigint();
// ... processing ...
const endTime = process.hrtime.bigint();
const duration = Number(endTime - startTime) / 1000000; // Convert to ms
console.log(`Processing took ${duration}ms`);

// Memory monitoring
console.log('Memory usage:', process.memoryUsage());
```

### 4. Health Checks

```javascript
// Comprehensive health check
app.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {}
  };

  try {
    // Check Ollama
    await axios.get(`${config.services.ollama}/api/tags`);
    health.services.ollama = 'healthy';
  } catch (error) {
    health.services.ollama = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Check ChromaDB
    await axios.get(`${config.services.chromadb}/api/v2/version`);
    health.services.chromadb = 'healthy';
  } catch (error) {
    health.services.chromadb = 'unhealthy';
    health.status = 'degraded';
  }

  res.json(health);
});
```

---

This developer guide provides comprehensive examples and patterns for working with the SLM Business Service Layer. Use these examples as starting points for your own implementations and customizations.