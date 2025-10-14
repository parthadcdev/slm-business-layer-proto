# Training System Specification

## Purpose
Human-in-the-loop training system for continuous improvement of SQL generation quality through user feedback and automated learning.

## Requirements

### Requirement: Training Mode Toggle
The system SHALL provide an admin-controlled toggle to enable/disable training mode.

#### Scenario: Enable training mode
- WHEN an admin calls the training toggle API
- THEN training mode is enabled and all queries are recorded for review

#### Scenario: Disable training mode
- WHEN an admin calls the training toggle API
- THEN training mode is disabled and queries are not recorded

### Requirement: Query Recording
The system SHALL automatically record all executed queries when training mode is enabled.

#### Scenario: Record successful query
- WHEN a query is executed successfully in training mode
- THEN the system records user_request, generated_sql, execution_result, validation_score, model_used, and training_id

#### Scenario: Record failed query
- WHEN a query fails in training mode
- THEN the system records user_request, generated_sql, execution_error, validation_score, model_used, and training_id

### Requirement: Human Rating System
The system SHALL provide a 1-10 star rating system for human feedback on query quality.

#### Scenario: Rate high-quality query
- WHEN a human rates a query 8-10 stars
- THEN the rating is stored and marked as high-quality for future reference

#### Scenario: Rate low-quality query
- WHEN a human rates a query 1-5 stars
- THEN the rating is stored and the query is flagged for improvement

### Requirement: Corrected SQL Submission
The system SHALL allow humans to provide corrected SQL for low-rated queries.

#### Scenario: Submit corrected SQL
- WHEN a human rates a query ≤5 and provides corrected SQL
- THEN the system generates improvement rules from the correction

### Requirement: Immediate Improvement Application
The system SHALL apply learned improvements immediately to subsequent queries.

#### Scenario: Apply learned improvement
- WHEN a query matches a pattern with existing improvements
- THEN the improvement prompt fragment is included in the generation context

### Requirement: Training Analytics
The system SHALL provide real-time analytics on training progress and quality trends.

#### Scenario: View training dashboard
- WHEN an admin accesses the training dashboard
- THEN they see total queries, rated queries, average rating, and quality trends

### Requirement: Semantic Search
The system SHALL find similar successful queries to guide generation.

#### Scenario: Find similar queries
- WHEN generating SQL for a new request
- THEN the system searches for similar successful queries (rating ≥8) to use as examples

## Data Storage

### Training History Table
- `query_training_history`: Stores all executed queries with ratings and feedback
- `training_improvements`: Stores learned improvement rules and patterns
- `training_metadata`: Stores system configuration and flags

### Vector Store
- ChromaDB collection for semantic search of similar queries
- Graceful fallback when ChromaDB unavailable

## API Endpoints

- `POST /api/training/toggle` - Enable/disable training mode
- `GET /api/training/status` - Get training system status
- `POST /api/training/feedback` - Submit human rating and feedback
- `GET /api/training/analytics` - Get training metrics
- `GET /api/training/similar` - Find similar queries
- `GET /api/training/history` - Get query history
