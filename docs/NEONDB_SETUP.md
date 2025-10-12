# NeonDB Setup Guide

**Author:** Partha Chandramohan  
**Last Updated:** October 11, 2025

This guide explains how to set up and connect to NeonDB, the cloud-hosted PostgreSQL database for this project.

## What is NeonDB?

NeonDB is a serverless PostgreSQL platform that provides:
- **Serverless Architecture**: Pay only for what you use
- **Auto-scaling**: Automatically scales based on workload
- **Instant Branching**: Create database branches like git
- **Connection Pooling**: Built-in connection management
- **Point-in-Time Recovery**: Backup and restore capabilities
- **SSL/TLS**: Encrypted connections by default

## Getting Started

### 1. Create a NeonDB Account

1. Visit [https://neon.tech](https://neon.tech)
2. Sign up for a free account (no credit card required for free tier)
3. Verify your email address

### 2. Create a New Project

1. Click "Create Project" in the Neon console
2. Give your project a name (e.g., "slm-business-layer")
3. Select a region close to your application (e.g., US East, EU West)
4. Choose PostgreSQL version (17.x recommended)
5. Click "Create Project"

### 3. Get Your Connection String

After creating the project, you'll see your connection string in the format:

```
postgresql://[user]:[password]@[host]/[database]?sslmode=require
```

Example:
```
postgresql://myuser:AbCdEf123456@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Important:** Save this connection string securely. You'll need it to configure your application.

### 4. Configure Your Application

1. Copy the example environment file:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and add your connection string:
   ```bash
   POSTGRES_URL=postgresql://user:password@your-host.neon.tech/database?sslmode=require
   ```

3. Also set your JWT secret:
   ```bash
   JWT_SECRET=your-random-secret-minimum-32-characters-long
   ```

### 5. Load Database Schema and Data

```bash
# Load the schema (creates tables, indexes, etc.)
psql 'your-neon-connection-string' -f database/schema.sql

# Load sample data (optional, for testing)
psql 'your-neon-connection-string' -f database/sample_data.sql
```

## Connection Configuration

The application automatically uses NeonDB when the `POSTGRES_URL` or `DATABASE_URL` environment variable is set.

### Connection Parameters

```javascript
// Configured in src/database/postgres-adapter.js
{
  connectionString: process.env.POSTGRES_URL,
  max: 20,                          // Maximum pool size
  idleTimeoutMillis: 30000,         // Close idle connections after 30s
  connectionTimeoutMillis: 5000,    // Timeout for new connections
}
```

### SSL/TLS

NeonDB requires SSL/TLS for all connections. The connection string includes `?sslmode=require` to enforce this.

## Testing Your Connection

### Method 1: Using psql

```bash
# Test connection with psql
psql 'your-neon-connection-string' -c "SELECT version();"

# Should output PostgreSQL version
```

### Method 2: Using the Application

```bash
# Start the application
export POSTGRES_URL="your-connection-string"
export JWT_SECRET="your-secret-key"
npm start

# Check database health
curl http://localhost:8001/api/service-status/postgres
```

## Database Schema

The database includes the following tables:

- **customers**: Customer information and profiles
- **products**: Product catalog with categories
- **categories**: Product category hierarchy
- **suppliers**: Supplier information
- **warehouses**: Warehouse locations
- **inventory**: Product inventory levels by warehouse
- **orders**: Customer orders
- **order_items**: Line items for each order

See `database/schema.sql` for complete schema definition.

## Best Practices

### 1. Connection Pooling
NeonDB includes built-in connection pooling. The application uses a connection pool with max 20 connections.

### 2. Security
- Never commit your `.env` file (it's in `.gitignore`)
- Use environment variables for connection strings
- Rotate credentials regularly
- Use IP allowlisting in Neon console if possible

### 3. Performance
- Use prepared statements (parameterized queries)
- Add indexes for frequently queried columns
- Monitor query performance in Neon console

### 4. Backups
NeonDB automatically:
- Backs up your data continuously
- Provides point-in-time recovery
- Stores 7 days of history (free tier)

## Troubleshooting

### Connection Timeout
```
Error: connect ETIMEDOUT
```

**Solution:** Check your internet connection and firewall settings. Ensure port 5432 is not blocked.

### SSL Required Error
```
Error: no pg_hba.conf entry for host
```

**Solution:** Ensure your connection string includes `?sslmode=require`

### Password Authentication Failed
```
Error: password authentication failed
```

**Solution:** Verify your connection string is correct. You can reset the password in the Neon console.

### Too Many Connections
```
Error: sorry, too many clients already
```

**Solution:** 
- Reduce the pool size in `postgres-adapter.js`
- Check for connection leaks in your code
- Upgrade your Neon plan for more connections

## Monitoring and Maintenance

### Neon Console Features

1. **Metrics Dashboard**
   - Active connections
   - Query performance
   - Storage usage
   - CPU and memory usage

2. **Query Statistics**
   - Slow query log
   - Most frequent queries
   - Query execution plans

3. **Branches**
   - Create development branches
   - Test schema changes safely
   - Merge changes when ready

## Migration from Local PostgreSQL

If you're migrating from local PostgreSQL:

```bash
# 1. Export your local data
pg_dump -h localhost -U postgres your_db > backup.sql

# 2. Import to NeonDB
psql 'your-neon-connection-string' -f backup.sql

# 3. Update your environment variables
export POSTGRES_URL="your-neon-connection-string"

# 4. Test the connection
npm start
```

## Cost Optimization

### Free Tier Includes:
- 0.5 GB storage
- 10 GB data transfer
- 100 compute hours/month
- Unlimited projects

### Tips to Stay in Free Tier:
- Use auto-suspend (database sleeps after inactivity)
- Monitor your usage in Neon console
- Clean up unused data regularly
- Use appropriate pool sizes

## Additional Resources

- **Neon Documentation**: https://neon.tech/docs
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/
- **Connection Pooling Guide**: https://neon.tech/docs/connect/connection-pooling
- **Security Best Practices**: https://neon.tech/docs/security

## Support

- **Neon Support**: support@neon.tech
- **Community Discord**: https://discord.gg/neon
- **Project Issues**: [GitHub Issues]

---

**Next Steps:**
1. [Return to main README](../README.md)
2. [Read API Documentation](./API_REFERENCE.md)
3. [Setup ChromaDB for RAG](./DEVELOPER_GUIDE.md)

