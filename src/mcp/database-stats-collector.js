/**
 * SLM Business Service Layer - Database Statistics Collector
 *
 * @author Partha Chandramohan
 * @description Collects comprehensive database statistics to avoid LLM assumptions
 */

const { Pool } = require("pg");

class DatabaseStatsCollector {
  constructor(postgresUrl) {
    this.pool = new Pool({
      connectionString: postgresUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    
    this.stats = null;
    this.lastCollectionTime = 0;
    this.collectionInterval = 600000; // 10 minutes
    
    console.log("[DB-Stats] Database statistics collector initialized");
  }

  /**
   * Collect all database statistics
   */
  async collectStatistics() {
    console.log("[DB-Stats] Collecting comprehensive database statistics...");
    const startTime = Date.now();

    try {
      const stats = {
        collection_time: new Date().toISOString(),
        tables: {},
      };

      // Get list of tables
      const tables = await this.getTables();
      
      // Collect stats for each table
      for (const tableName of tables) {
        console.log(`[DB-Stats] Collecting stats for table: ${tableName}`);
        stats.tables[tableName] = await this.collectTableStats(tableName);
      }

      this.stats = stats;
      this.lastCollectionTime = Date.now();
      
      const duration = Date.now() - startTime;
      console.log(`[DB-Stats] Statistics collection completed in ${duration}ms for ${tables.length} tables`);
      
      return stats;
    } catch (error) {
      console.error("[DB-Stats] Failed to collect statistics:", error.message);
      return this.stats || { tables: {}, error: error.message };
    }
  }

  /**
   * Get list of all tables in the database
   */
  async getTables() {
    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    const result = await this.pool.query(query);
    return result.rows.map((row) => row.table_name);
  }

  /**
   * Collect statistics for a specific table
   */
  async collectTableStats(tableName) {
    const stats = {
      row_count: 0,
      columns: {},
      date_range: null,
    };

    try {
      // Get row count
      const countResult = await this.pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      stats.row_count = parseInt(countResult.rows[0].count);

      // Get column information
      const columnsQuery = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position;
      `;
      const columnsResult = await this.pool.query(columnsQuery, [tableName]);

      // Collect stats for each column
      for (const col of columnsResult.rows) {
        const columnName = col.column_name;
        const dataType = col.data_type;

        stats.columns[columnName] = {
          type: dataType,
          nullable: col.is_nullable === 'YES',
        };

        // Skip stats for very large tables
        if (stats.row_count > 100000) continue;

        // Get distinct count for categorical columns
        if (
          dataType.includes('char') ||
          dataType.includes('text') ||
          dataType === 'boolean' ||
          columnName.includes('status') ||
          columnName.includes('type') ||
          columnName.includes('tier')
        ) {
          try {
            const distinctResult = await this.pool.query(
              `SELECT COUNT(DISTINCT ${columnName}) as distinct_count FROM ${tableName}`
            );
            const distinctCount = parseInt(distinctResult.rows[0].distinct_count);
            stats.columns[columnName].distinct_count = distinctCount;

            // If low cardinality, get actual values
            if (distinctCount <= 20 && distinctCount > 0) {
              const valuesResult = await this.pool.query(
                `SELECT DISTINCT ${columnName} as value 
                 FROM ${tableName} 
                 WHERE ${columnName} IS NOT NULL 
                 ORDER BY ${columnName} 
                 LIMIT 20`
              );
              stats.columns[columnName].values = valuesResult.rows.map((r) => r.value);
            }
          } catch (error) {
            console.warn(`[DB-Stats] Failed to get distinct values for ${tableName}.${columnName}:`, error.message);
          }
        }

        // Get min/max for numeric and date columns
        if (
          dataType.includes('int') ||
          dataType.includes('numeric') ||
          dataType.includes('decimal') ||
          dataType.includes('money') ||
          dataType.includes('timestamp') ||
          dataType.includes('date')
        ) {
          try {
            const rangeResult = await this.pool.query(
              `SELECT 
                MIN(${columnName}) as min_value,
                MAX(${columnName}) as max_value
               FROM ${tableName}
               WHERE ${columnName} IS NOT NULL`
            );
            
            if (rangeResult.rows[0].min_value !== null) {
              stats.columns[columnName].min = rangeResult.rows[0].min_value;
              stats.columns[columnName].max = rangeResult.rows[0].max_value;
            }
          } catch (error) {
            console.warn(`[DB-Stats] Failed to get range for ${tableName}.${columnName}:`, error.message);
          }
        }
      }

      // Get date range for tables with date columns
      const dateColumns = ['created_at', 'updated_at', 'order_date', 'date'];
      for (const dateCol of dateColumns) {
        if (stats.columns[dateCol]) {
          stats.date_range = {
            column: dateCol,
            min: stats.columns[dateCol].min,
            max: stats.columns[dateCol].max,
          };
          break;
        }
      }

      return stats;
    } catch (error) {
      console.error(`[DB-Stats] Error collecting stats for ${tableName}:`, error.message);
      return { row_count: 0, columns: {}, error: error.message };
    }
  }

  /**
   * Get formatted statistics for a specific table
   */
  getTableStats(tableName) {
    if (!this.stats || !this.stats.tables[tableName]) {
      return null;
    }
    return this.stats.tables[tableName];
  }

  /**
   * Format statistics for LLM prompt
   */
  formatStatsForPrompt(tableName) {
    const tableStats = this.getTableStats(tableName);
    if (!tableStats) {
      return `Table ${tableName}: No statistics available`;
    }

    const lines = [`Table ${tableName}: ${tableStats.row_count} rows`];

    // Add categorical column values
    for (const [colName, colStats] of Object.entries(tableStats.columns)) {
      if (colStats.values && colStats.values.length > 0) {
        lines.push(`  - ${colName}: ${colStats.values.join(', ')}`);
      } else if (colStats.min !== undefined && colStats.max !== undefined) {
        lines.push(`  - ${colName} range: ${colStats.min} to ${colStats.max}`);
      }
    }

    if (tableStats.date_range) {
      lines.push(`  - Data spans: ${tableStats.date_range.min} to ${tableStats.date_range.max}`);
    }

    return lines.join('\n');
  }

  /**
   * Get all statistics
   */
  getAllStats() {
    return this.stats;
  }

  /**
   * Refresh statistics if needed
   */
  async refreshIfNeeded() {
    const now = Date.now();
    if (!this.stats || (now - this.lastCollectionTime) > this.collectionInterval) {
      console.log("[DB-Stats] Refreshing statistics (cache expired)...");
      await this.collectStatistics();
    }
    return this.stats;
  }

  /**
   * Force refresh statistics
   */
  async forceRefresh() {
    console.log("[DB-Stats] Forcing statistics refresh...");
    return await this.collectStatistics();
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
    console.log("[DB-Stats] Database statistics collector closed");
  }
}

module.exports = DatabaseStatsCollector;

