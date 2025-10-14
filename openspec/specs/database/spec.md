# Database Specification

## Purpose
NeonDB cloud-hosted PostgreSQL database providing persistent storage for business data and training system.

## Requirements

### Requirement: Cloud Database Only
The system SHALL use NeonDB cloud PostgreSQL exclusively, with no local database alternatives.

#### Scenario: Connect to NeonDB
- WHEN the application starts
- THEN it connects to NeonDB using POSTGRES_URL environment variable

#### Scenario: No local PostgreSQL
- WHEN the application runs
- THEN it does NOT attempt to connect to localhost:5432 or Docker PostgreSQL

### Requirement: Business Data Tables
The system SHALL maintain 8 core business tables for order management and inventory.

#### Scenario: Query business data
- WHEN a business request is made
- THEN the system queries the appropriate business tables (orders, customers, products, etc.)

### Requirement: Training Data Persistence
The system SHALL persist all training data in dedicated tables.

#### Scenario: Store training query
- WHEN a query is executed in training mode
- THEN the system stores the query details in query_training_history table

#### Scenario: Store improvement rules
- WHEN human feedback generates improvements
- THEN the system stores the improvement rules in training_improvements table

### Requirement: Database Statistics Collection
The system SHALL collect real-time statistics about table contents and column distributions.

#### Scenario: Collect row counts
- WHEN statistics are refreshed (every 10 minutes)
- THEN the system updates row counts for all tables

#### Scenario: Collect column statistics
- WHEN statistics are refreshed
- THEN the system updates column cardinality, value distributions, and date ranges

### Requirement: Schema Validation
The system SHALL validate all generated SQL against the database schema.

#### Scenario: Validate SQL syntax
- WHEN SQL is generated
- THEN the system validates it against the current schema before execution

## Database Schema

### Business Tables (8)
- `customers`: Customer information and loyalty data
- `orders`: Order records with status and amounts
- `order_items`: Individual items within orders
- `products`: Product catalog with pricing
- `product_categories`: Product categorization
- `inventory`: Stock levels by warehouse
- `warehouses`: Warehouse locations and capacity
- `suppliers`: Supplier information and ratings

### Training Tables (3)
- `query_training_history`: All executed queries with ratings
- `training_improvements`: Learned improvement rules
- `training_metadata`: System configuration flags

### Views
- `training_analytics_summary`: Aggregated training metrics

## Connection Configuration

### Environment Variables
- `POSTGRES_URL`: NeonDB connection string (required)
- `JWT_SECRET`: Authentication secret (required)

### Connection Pool
- Maximum 20 connections
- 30-second idle timeout
- 5-second connection timeout

## Data Integrity

### Constraints
- UUID primary keys for all tables
- Foreign key relationships maintained
- Check constraints for rating values (1-10)
- NOT NULL constraints on critical fields

### Indexes
- Performance indexes on frequently queried columns
- Training-specific indexes on rating and pattern fields
