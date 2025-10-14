# API Specification

## Purpose
RESTful API endpoints for business request processing, training system management, and system monitoring.

## Requirements

### Requirement: Business Request Processing
The system SHALL provide an endpoint for processing natural language business requests.

#### Scenario: Process valid business request
- WHEN a POST request is made to `/api/business-request-v2` with valid JSON
- THEN the system returns generated SQL, execution results, and training metadata

#### Scenario: Handle authentication
- WHEN a request is made without valid JWT token
- THEN the system returns 401 Unauthorized

### Requirement: Training System Endpoints
The system SHALL provide endpoints for training system management.

#### Scenario: Toggle training mode
- WHEN a POST request is made to `/api/training/toggle`
- THEN the system enables or disables training mode

#### Scenario: Get training status
- WHEN a GET request is made to `/api/training/status`
- THEN the system returns current training mode and statistics

#### Scenario: Submit feedback
- WHEN a POST request is made to `/api/training/feedback`
- THEN the system records human rating and feedback

### Requirement: Analytics Endpoints
The system SHALL provide endpoints for training analytics and monitoring.

#### Scenario: Get training analytics
- WHEN a GET request is made to `/api/training/analytics`
- THEN the system returns aggregated training metrics

#### Scenario: Find similar queries
- WHEN a GET request is made to `/api/training/similar`
- THEN the system returns semantically similar successful queries

### Requirement: Health Monitoring
The system SHALL provide health check endpoints for all services.

#### Scenario: Check system health
- WHEN a GET request is made to `/api/health`
- THEN the system returns status of all components

#### Scenario: Check database health
- WHEN a GET request is made to `/api/service-status/postgres`
- THEN the system returns database connection status

## API Endpoints

### Business Processing
- `POST /api/business-request-v2` - Process natural language business requests
- `POST /api/business-request` - Legacy business request endpoint

### Training System
- `POST /api/training/toggle` - Enable/disable training mode
- `GET /api/training/status` - Get training system status
- `POST /api/training/feedback` - Submit human rating and feedback
- `GET /api/training/analytics` - Get training metrics and trends
- `GET /api/training/similar` - Find similar successful queries
- `GET /api/training/history` - Get query execution history

### Health & Monitoring
- `GET /api/health` - Overall system health
- `GET /api/service-status/postgres` - Database health
- `GET /api/service-status/ollama` - Ollama service health
- `GET /api/service-status/chromadb` - ChromaDB service health

## Request/Response Format

### Business Request
```json
{
  "request": "Show me all pending orders from the last 30 days"
}
```

### Business Response
```json
{
  "success": true,
  "data": {
    "sql": "SELECT ...",
    "results": [...],
    "execution_time": 1.23
  },
  "training_id": "uuid",
  "training_mode": true,
  "validation_score": 0.85,
  "model_used": "phi3:mini"
}
```

### Training Feedback
```json
{
  "training_id": "uuid",
  "rating": 8,
  "feedback": "Good SQL, but could include more columns",
  "corrected_sql": "SELECT o.*, c.name FROM orders o JOIN customers c..."
}
```

## Authentication

### JWT Token Required
All endpoints except health checks require valid JWT token in Authorization header:
```
Authorization: Bearer <jwt-token>
```

### Token Format
- Issued by system on successful authentication
- Contains userId and role information
- Expires after configured time period

## Error Handling

### Standard Error Response
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes
- `UNAUTHORIZED` - Missing or invalid JWT token
- `VALIDATION_ERROR` - Invalid request format
- `DATABASE_ERROR` - Database connection or query error
- `TRAINING_ERROR` - Training system error
