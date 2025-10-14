# System Architecture Specification

## Purpose
Overall system architecture, deployment, monitoring, and operational requirements for the SLM Business Layer.

## Requirements

### Requirement: Multi-Model Fallback
The system SHALL implement a fallback chain of AI models for SQL generation.

#### Scenario: Primary model success
- WHEN phi3:mini generates valid SQL
- THEN the system uses the result without fallback

#### Scenario: Primary model failure
- WHEN phi3:mini fails or produces low-quality results
- THEN the system attempts qwen2.5:1.5b

#### Scenario: Secondary model failure
- WHEN qwen2.5:1.5b fails or produces low-quality results
- THEN the system attempts llama3.2:1b

### Requirement: Error Feedback Loop
The system SHALL pass error information between model attempts.

#### Scenario: Error accumulation
- WHEN a model fails
- THEN the system includes error details in the next model's prompt

#### Scenario: Learning from failures
- WHEN multiple models fail
- THEN the system accumulates all errors for the final attempt

### Requirement: Database Statistics Integration
The system SHALL use real-time database statistics in SQL generation.

#### Scenario: Row count awareness
- WHEN generating SQL
- THEN the system includes actual table row counts to prevent assumptions

#### Scenario: Column distribution awareness
- WHEN generating WHERE clauses
- THEN the system uses actual column value distributions

### Requirement: Training System Integration
The system SHALL integrate training feedback into SQL generation.

#### Scenario: Apply learned improvements
- WHEN generating SQL for a known pattern
- THEN the system includes relevant improvement prompts

#### Scenario: Use similar examples
- WHEN generating SQL
- THEN the system includes similar successful queries as examples

### Requirement: Service Health Monitoring
The system SHALL monitor the health of all components.

#### Scenario: Database health check
- WHEN health is checked
- THEN the system verifies database connectivity and table access

#### Scenario: AI service health check
- WHEN health is checked
- THEN the system verifies Ollama service and model availability

#### Scenario: Training system health check
- WHEN health is checked
- THEN the system verifies training system initialization and database connectivity

## System Architecture

### Core Components
- **Orchestration Service**: Express.js API server (port 8001)
- **Training Manager**: Human-in-the-loop training orchestration
- **SQL Generator**: Multi-model SQL generation with error feedback
- **MCP Router**: Model Context Protocol request routing
- **Database Adapter**: NeonDB PostgreSQL integration

### External Services
- **NeonDB**: Cloud-hosted PostgreSQL database
- **Ollama**: Local AI model inference (3 models)
- **ChromaDB**: Vector database for semantic search (optional)
- **Redis**: Caching and session storage

### Data Flow
1. User submits natural language request
2. System classifies intent and extracts entities
3. Database statistics are collected and included
4. Training improvements are loaded for the pattern
5. Similar successful queries are retrieved
6. SQL is generated using multi-model fallback
7. Generated SQL is validated and executed
8. Results are returned with training metadata
9. Query is recorded for training (if enabled)

## Deployment Architecture

### Local Development
- Orchestration service runs on host
- Ollama runs on host
- ChromaDB and Redis in containers
- NeonDB in cloud

### Production Considerations
- Containerized orchestration service
- Load balancer for high availability
- Database connection pooling
- Monitoring and logging

## Performance Requirements

### Response Time
- Business queries: < 3 seconds
- Database connection: < 50ms
- Model fallback: < 2 seconds per model
- Training recording: < 100ms overhead

### Scalability
- Connection pooling for database
- Caching for frequently accessed data
- Graceful degradation when services unavailable
- Auto-scaling database (NeonDB)

## Monitoring and Observability

### Health Endpoints
- `/api/health` - Overall system health
- `/api/service-status/*` - Individual service health
- Training analytics dashboard

### Logging
- Structured logging with levels
- Request/response logging
- Error tracking and alerting
- Training system activity logs

### Metrics
- Query execution times
- Model performance metrics
- Training data collection rates
- Error rates and types

## Operational Procedures

### Startup Sequence
1. Load environment variables
2. Initialize database connections
3. Initialize training system
4. Start MCP servers
5. Start orchestration service
6. Verify all components healthy

### Shutdown Sequence
1. Stop accepting new requests
2. Complete in-flight requests
3. Close database connections
4. Stop MCP servers
5. Graceful shutdown

### Backup and Recovery
- NeonDB automatic backups
- Training data persistence
- Configuration backup
- Disaster recovery procedures
