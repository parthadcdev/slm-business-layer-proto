# Database Directory

This directory contains all database-related SQL files for the SLM Business Service Layer project using Neon DB cloud PostgreSQL.

## File Organization

### Core Database Files

| File | Purpose | Load Order | Description |
|------|---------|------------|-------------|
| `schema.sql` | Database Structure | 1st | Main database schema with UUID-based tables, indexes, and constraints |
| `sample_data.sql` | Sample Data | 2nd | Realistic sample data suitable for development and testing |

## Database Configuration

- **Database**: `business_app`
- **Provider**: Neon DB (Cloud PostgreSQL)
- **Version**: PostgreSQL 17.5
- **Connection**: Via `POSTGRES_URL` environment variable
- **Security**: SSL/TLS required for all connections
- **Features**: Automatic scaling, connection pooling, backups

## File Loading

These files are executed directly against Neon DB using the PostgreSQL client:

1. **schema.sql** → Creates all tables, views, functions
2. **sample_data.sql** → Loads realistic business data for development and testing

### Manual Loading
```bash
# Load schema
psql 'your-neon-connection-string' -f database/schema.sql

# Load sample data
psql 'your-neon-connection-string' -f database/sample_data.sql
```

## Key Features

### Schema Design
- **UUID Primary Keys**: All tables use UUID for better scalability
- **JSON Columns**: Flexible address and configuration storage
- **Constraints**: Comprehensive data validation
- **Indexes**: Optimized for common queries

### Sample Data
- 5 customers with realistic profiles
- 10 products across multiple categories
- 5 orders with order items (including 1 pending order)
- 3 warehouses and 4 suppliers
- 14 inventory items with stock levels
- Product categories and hierarchies

## Usage Guidelines

### ✅ Do
- Place all SQL files in this `database/` directory
- Use meaningful file names with `.sql` extension
- Follow the naming convention: `##-descriptive-name.sql` for load order
- Test SQL files before adding to Docker volumes
- Document any new tables or major schema changes

### ❌ Don't
- Put database files in `scripts/` directory
- Use conflicting load order numbers
- Create files without proper documentation
- Modify schema.sql directly (use migrations instead)

## Cloud Integration

Neon DB provides:

- **Connection Pooling**: Automatic connection management
- **Backups**: Automated daily backups with point-in-time recovery
- **Scaling**: Automatic scaling based on workload
- **Monitoring**: Built-in performance monitoring and alerts
- **Security**: SSL/TLS encryption and IP allowlisting

## Troubleshooting

Test Neon DB connectivity:

```bash
# Test connection
psql 'your-neon-connection-string' -c "SELECT version();"

# Check SSL status
psql 'your-neon-connection-string' -c "SHOW ssl;"

# Verify environment variable
echo $POSTGRES_URL

# Test application database health
curl http://localhost:8001/api/service-status/postgres
```

## Adding New Files

To add new database files:

1. Create file in `database/` directory
2. Use descriptive names (e.g., `migration-001-add-analytics.sql`)
3. Execute directly against Neon DB: `psql 'connection-string' -f database/new-file.sql`
4. Test with application to ensure compatibility
5. Update this README

---

**Author:** Partha Chandramohan
**Last Updated:** September 27, 2025 (v1.2 - Neon DB Migration)
**Status:** ✅ Cloud-Ready with Neon DB Integration and Sample Data