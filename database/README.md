# Database Directory

This directory contains all database-related SQL files for the SLM Business Service Layer project.

## File Organization

### Core Database Files

| File | Purpose | Load Order | Description |
|------|---------|------------|-------------|
| `schema.sql` | Database Structure | 1st | Main database schema with UUID-based tables, indexes, and constraints |
| `sample_data.sql` | Sample Data | 2nd | Realistic sample data suitable for development and testing |

## Database Configuration

- **Database**: `business_app`
- **User**: `app_user`
- **Password**: `app_password`
- **Host**: `localhost` (Docker container)
- **Port**: `5432`

## File Loading

These files are automatically loaded by PostgreSQL when the Docker container starts via the `docker-entrypoint-initdb.d` mechanism:

1. **01-schema.sql** → Creates all tables, views, functions
2. **02-sample_data.sql** → Loads realistic business data for development and testing

## Key Features

### Schema Design
- **UUID Primary Keys**: All tables use UUID for better scalability
- **JSON Columns**: Flexible address and configuration storage
- **Constraints**: Comprehensive data validation
- **Indexes**: Optimized for common queries

### Sample Data
- 20+ customers with realistic profiles
- 50+ products across multiple categories
- 30+ orders with order items
- Multiple warehouses and suppliers
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

## Docker Integration

Both `docker-compose.yml` and `docker-compose.simple.yml` mount these files:

```yaml
volumes:
  - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
  - ./database/sample_data.sql:/docker-entrypoint-initdb.d/02-sample_data.sql
```

## Troubleshooting

Use the project's troubleshooting script for database issues:

```bash
# Check PostgreSQL status
./scripts/troubleshoot-services.sh postgres-connection

# Run comprehensive diagnostics
./scripts/troubleshoot-services.sh postgres-diag

# Fix common database issues
./scripts/troubleshoot-services.sh postgres-fix
```

## Adding New Files

To add new database files:

1. Create file in `database/` directory
2. Use appropriate load order prefix (03-, 04-, etc.)
3. Add to docker-compose volume mounts
4. Test with fresh container: `docker-compose down -v && docker-compose up -d postgres`
5. Update this README

---

**Author:** Partha Chandramohan
**Last Updated:** September 18, 2025 (Baseline v1.0)
**Status:** ✅ Functional Baseline with Clean Schema and Sample Data