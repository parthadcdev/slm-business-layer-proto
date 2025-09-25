# Model Evaluation Framework Documentation

**Author:** Partha Chandramohan
**Version:** 1.1
**Last Updated:** September 24, 2025

## Overview

The Model Evaluation Framework is a comprehensive system for testing, comparing, and analyzing multiple Language Model (LLM) and Small Language Model (SLM) providers within the SLM Business Service Layer project. It provides systematic evaluation capabilities with detailed performance metrics, accuracy scoring, and comparative analysis.

## Architecture

### Core Components

1. **Model Configuration System** (`src/config/model-config.js`)
   - Centralized configuration for multiple providers (Ollama, OpenAI, Anthropic)
   - Model-specific parameters and recommendations
   - Availability validation and health checks

2. **Model Evaluator Engine** (`src/evaluation/model-evaluator.js`)
   - Comprehensive evaluation orchestration
   - Multi-dimensional scoring algorithms
   - Historical data management

3. **Enhanced AI Components**
   - `src/ai/sql-generator.js` - Parameterized SQL generation
   - `src/ai/intent-classifier.js` - Multi-model intent analysis
   - `src/database/ai-database-adapter.js` - Model configuration handling

4. **API Endpoints** (`src/orchestration/app.js`)
   - `/api/evaluate-models` - Run comprehensive model evaluation
   - `/api/evaluation-history` - Retrieve evaluation history

5. **Dedicated UI** (`model-evaluation.html`)
   - Purpose-built interface for model comparison
   - Real-time metrics display
   - Preset test scenarios

## Supported Models

### Ollama (Local SLM)
| Model | Context | Temperature | Use Case |
|-------|---------|-------------|----------|
| `phi3:mini` | 4K | 0.1 | Fast SQL generation, code generation |
| `llama3.2:latest` | 8K | 0.2 | Complex reasoning, business logic |
| `qwen3:4b` | 32K | 0.1 | Large context analysis, mathematical reasoning |
| `mistral:7b` | 8K | 0.15 | Multilingual, structured output |
| `codellama:7b` | 16K | 0.05 | Complex SQL, joins, debugging |

### Cloud Providers (API Key Required)
| Provider | Models | Use Cases |
|----------|--------|-----------|
| OpenAI | gpt-3.5-turbo, gpt-4, gpt-4-turbo | Production SQL, complex analysis |
| Anthropic | claude-3-haiku, claude-3-sonnet | Fast inference, balanced performance |

## Evaluation Metrics

### 1. Latency Analysis
- **Intent Classification Time**: Time to analyze business intent
- **SQL Generation Time**: Time to generate SQL query
- **SQL Execution Time**: Database query execution time
- **Total End-to-End Latency**: Complete request processing time

### 2. Accuracy Scoring (0-100 scale)
The accuracy score is calculated using a weighted formula:

```javascript
accuracy = (validationScore * 40%) +
           (sqlGenerationSuccess * 20%) +
           (executionSuccess * 20%) +
           (resultRelevance * 10%) +
           (intentAlignment * 10%)
```

### 3. Quality Metrics
- **SQL Complexity**: Joins, subqueries, aggregations, window functions
- **Query Optimization**: LIMIT usage, indexing, performance considerations
- **Result Relevance**: Alignment with business intent
- **Error Handling**: Graceful failure management

### 4. Overall Scoring
Best model determination uses weighted scoring:
- **Accuracy**: 60% weight
- **Speed**: 25% weight (inverse of latency)
- **Complexity Handling**: 15% weight

## API Reference

### Evaluate Models
Runs comprehensive evaluation of all available models for a given business request.

```http
POST /api/evaluate-models
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "request": "Show me all pending orders",
  "context": {
    "user_preferences": {},
    "business_context": "operational"
  },
  "userRole": "admin"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "Model evaluation completed",
  "data": {
    "request": "Show me all pending orders",
    "context": {},
    "userRole": "admin",
    "timestamp": "2025-09-24T20:12:15.158Z",
    "totalEvaluationTime": 70360,
    "models": [
      {
        "provider": "ollama",
        "model": "phi3:mini",
        "displayName": "Phi-3 Mini",
        "success": true,
        "latency": 70339,
        "accuracy": 87.9,
        "sqlQuery": "SELECT ...",
        "prompt": "You are a PostgreSQL SQL expert...",
        "result": [...],
        "metrics": {
          "intentClassificationTime": 5351,
          "sqlGenerationTime": 64879,
          "sqlExecutionTime": 109,
          "totalTime": 70339,
          "method": "llm-partial",
          "sqlComplexity": 10,
          "resultRelevance": 8,
          "queryOptimization": 8
        }
      }
    ],
    "summary": {
      "averageLatency": 17585,
      "averageAccuracy": 29.1,
      "successRate": 100,
      "fastestModel": {...},
      "mostAccurate": {...},
      "totalModels": 4
    },
    "bestModel": {...}
  }
}
```

### Get Evaluation History
Retrieves historical evaluation results with optional pagination.

```http
GET /api/evaluation-history?limit=10
Authorization: Bearer <jwt-token>
```

## Usage Examples

### Command Line Testing

1. **Generate Authentication Token**
```bash
curl -X POST http://localhost:8001/api/generate-token \
  -H "Content-Type: application/json" \
  -d '{}'
```

2. **Run Model Evaluation**
```bash
curl -X POST http://localhost:8001/api/evaluate-models \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "request": "Who are our most valuable customers?",
    "context": {"business_context": "customer_analysis"}
  }'
```

3. **Get Evaluation History**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8001/api/evaluation-history?limit=5
```

### Web Interface

Access the dedicated evaluation UI at:
```
http://localhost:8001/model-evaluation.html
```

Features:
- **Preset Test Cases**: Common business scenarios
- **Custom Requests**: Free-form business query input
- **Real-time Metrics**: Live performance monitoring
- **Detailed Results**: Expandable sections for SQL, prompts, results
- **Historical Analysis**: Previous evaluation comparisons

## Configuration Management

### Model Configuration Structure
```javascript
// src/config/model-config.js
{
  providers: {
    ollama: {
      name: 'Ollama',
      endpoint: 'http://localhost:11434',
      models: {
        'phi3:mini': {
          name: 'Phi-3 Mini',
          context_length: 4096,
          recommended_temperature: 0.1,
          recommended_max_tokens: 500,
          strengths: ['Fast inference', 'Code generation'],
          use_case: 'Default for SQL generation'
        }
      }
    }
  }
}
```

### Adding New Models
1. Add model configuration to `src/config/model-config.js`
2. Update model availability validation
3. Test with evaluation framework
4. Document strengths and use cases

## Performance Benchmarks

### Sample Results
Based on actual testing with "Show me all pending orders":

| Model | Status | Latency | Accuracy | SQL Quality | Notes |
|-------|--------|---------|----------|-------------|-------|
| phi3:mini | ✅ Success | 70.3s | 87.9% | High (10/10) | Generated complex multi-table JOIN |
| llama3.2:latest | ⏱️ Timeout | ~30s | - | - | Ollama timeout issues |
| qwen3:4b | ⏱️ Timeout | ~30s | - | - | Connection timeout |
| codellama:7b | ⏱️ Timeout | ~30s | - | - | Model loading issues |

**Best Performing**: phi3:mini with overall score of 75.16

### Performance Characteristics
- **Fast Models**: phi3:mini (when working), claude-3-haiku
- **High Accuracy**: phi3:mini, gpt-4, claude-3-sonnet
- **Complex SQL**: codellama:7b, gpt-4-turbo
- **Large Context**: qwen3:4b, gpt-4-turbo, claude models

## Troubleshooting

### Common Issues

1. **Model Timeout Errors**
   ```
   Error: Failed to get response from Ollama after 3 attempts: timeout of 30000ms exceeded
   ```
   **Solution**: Check Ollama service status, increase timeout values, verify model availability

2. **SQL Validation Failures**
   ```
   SQL validation failed: Dangerous SQL pattern detected
   ```
   **Solution**: Review SQL generation prompts, enhance validation rules, use template fallbacks

3. **Authentication Errors**
   ```
   Error: JWT token required
   ```
   **Solution**: Generate fresh token using `/api/generate-token` endpoint

### Debugging Steps
1. Check service health: `http://localhost:8001/api/service-status/ollama`
2. Verify model availability: Review Ollama logs
3. Test individual components: Use dedicated test interfaces
4. Review evaluation history: Check for patterns in failures

## Integration Guide

### Adding to Existing Applications

1. **Import Model Configuration**
```javascript
const modelConfig = require('./src/config/model-config');
```

2. **Initialize Evaluator**
```javascript
const modelEvaluator = require('./src/evaluation/model-evaluator');
```

3. **Run Evaluation**
```javascript
const results = await modelEvaluator.evaluateAllModels(
  businessRequest,
  context,
  userRole,
  ollamaClient
);
```

### Custom Metrics
Extend the evaluation framework with custom metrics:

```javascript
// In model-evaluator.js
calculateCustomMetrics(sqlResult, intent, executionResult) {
  return {
    businessLogicAlignment: this.assessBusinessLogic(intent, sqlResult),
    domainSpecificAccuracy: this.calculateDomainAccuracy(executionResult),
    userExperienceScore: this.evaluateUX(sqlResult.latency, executionResult)
  };
}
```

## Security Considerations

1. **SQL Injection Prevention**: Built-in validation and sanitization
2. **Prompt Injection Protection**: Input validation and guardrails
3. **Authentication**: JWT-based API protection
4. **Model Isolation**: Sandboxed execution environment
5. **Data Privacy**: No sensitive data in evaluation logs

## Future Enhancements

1. **Advanced Analytics**: Trend analysis, performance regression detection
2. **Auto-optimization**: Automatic model selection based on query type
3. **Cost Analysis**: Token usage and cost tracking for cloud providers
4. **A/B Testing**: Split testing capabilities for model comparison
5. **Custom Scoring**: User-defined evaluation criteria
6. **Model Fine-tuning**: Performance-based model improvement

## Contributing

### Adding New Evaluation Metrics
1. Implement metric calculation in `model-evaluator.js`
2. Update UI to display new metrics
3. Add documentation and examples
4. Write unit tests

### Supporting New Providers
1. Add provider configuration to `model-config.js`
2. Implement provider-specific client if needed
3. Update availability validation
4. Test thoroughly with evaluation framework

---

For questions or support, refer to the main project documentation in `CLAUDE.md` or raise issues through the project's issue tracking system.