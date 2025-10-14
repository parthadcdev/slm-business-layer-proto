# Model Context Protocol (MCP) Specification

## Purpose
Unified interface for AI service interactions through the Model Context Protocol, enabling modular AI service management.

## Requirements

### Requirement: MCP Router
The system SHALL provide a central router for directing requests to appropriate MCP servers.

#### Scenario: Route to Ollama server
- WHEN a request requires AI inference
- THEN the router directs the request to the Ollama MCP server

#### Scenario: Route to context server
- WHEN a request requires business context
- THEN the router directs the request to the context MCP server

#### Scenario: Route to database server
- WHEN a request requires schema or statistics
- THEN the router directs the request to the database MCP server

### Requirement: Ollama MCP Server
The system SHALL provide an MCP server for Ollama AI model interactions.

#### Scenario: Generate SQL with phi3:mini
- WHEN a SQL generation request is made
- THEN the server uses phi3:mini model for fast inference

#### Scenario: Fallback to qwen2.5:1.5b
- WHEN phi3:mini fails or produces low-quality results
- THEN the server falls back to qwen2.5:1.5b model

#### Scenario: Fallback to llama3.2:1b
- WHEN qwen2.5:1.5b fails or produces low-quality results
- THEN the server falls back to llama3.2:1b model

### Requirement: Context MCP Server
The system SHALL provide an MCP server for business context and BRD information.

#### Scenario: Load BRD context
- WHEN context is requested
- THEN the server loads business requirements and functional requirements

#### Scenario: Provide query intents
- WHEN query intent context is needed
- THEN the server provides business process and query intent information

### Requirement: Database MCP Server
The system SHALL provide an MCP server for database schema and statistics.

#### Scenario: Load enhanced schema
- WHEN schema information is requested
- THEN the server loads table schemas, business terminology, and business rules

#### Scenario: Provide database statistics
- WHEN statistics are requested
- THEN the server provides real-time table counts, column cardinality, and distributions

### Requirement: Error Handling
The system SHALL handle MCP server failures gracefully.

#### Scenario: Server unavailable
- WHEN an MCP server is unavailable
- THEN the system continues operation with reduced functionality

#### Scenario: Invalid response
- WHEN an MCP server returns invalid response
- THEN the system logs the error and attempts fallback

## MCP Architecture

### Server Registry
- Central registry for all MCP servers
- Dynamic server discovery and registration
- Health monitoring for each server

### Request Routing
- Intelligent routing based on request type
- Load balancing across available servers
- Fallback mechanisms for failed requests

### Response Handling
- Standardized response format across all servers
- Error propagation and handling
- Response validation and sanitization

## MCP Servers

### Ollama MCP Server
- **Purpose**: AI model inference and SQL generation
- **Models**: phi3:mini, qwen2.5:1.5b, llama3.2:1b
- **Features**: Multi-model fallback, error feedback
- **Location**: `src/mcp/servers/ollama-mcp-server.js`

### Context MCP Server
- **Purpose**: Business context and requirements
- **Data**: BRD context, business processes, query intents
- **Features**: Context loading, business terminology
- **Location**: `src/mcp/servers/context-mcp-server.js`

### Database MCP Server
- **Purpose**: Database schema and statistics
- **Data**: Enhanced schema, real-time statistics
- **Features**: Schema loading, statistics collection
- **Location**: `src/mcp/servers/database-mcp-server.js`

## Integration Points

### SQL Generator Integration
- Uses MCP router for AI model requests
- Integrates with database MCP for schema information
- Uses context MCP for business requirements

### Training System Integration
- Uses MCP for similar query search
- Integrates with database MCP for training data
- Uses context MCP for business context in improvements

### Error Feedback Integration
- Passes errors between MCP servers
- Accumulates errors across model attempts
- Uses MCP for error context in retries
