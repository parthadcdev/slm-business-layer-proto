/**
 * SLM Business Service Layer - Database Schema MCP Server
 *
 * @author Partha Chandramohan
 * @description MCP server implementation for database schema access and SQL validation
 */

const MCPClient = require("../mcp-client");
const enhancedSchema = require("../../config/enhanced-schema-config");
const mcpConfig = require("../config/mcp-config");
const DatabaseStatsCollector = require("../database-stats-collector");

class DatabaseMCPServer extends MCPClient {
  constructor(serverConfig) {
    super(serverConfig);

    this.serverType = "database";
    this.schemaData = null;
    this.schemaCache = new Map();
    this.lastSchemaLoad = 0;
    this.schemaLoadInterval = 600000; // 10 minutes
    
    // Initialize statistics collector
    this.statsCollector = null;
    this.databaseStats = null;

    console.log("[Database-MCP] Database MCP server instance created");
  }

  /**
   * Handle internal MCP requests for database schema
   */
  async handleInternalRequest(request) {
    const { method, params, id } = request;

    console.log(`[Database-MCP] Handling request: ${method}`);

    try {
      let result;

      switch (method) {
        case "initialize":
          result = await this.handleInitialize(params);
          break;

        case "health/check":
          result = await this.handleHealthCheck(params);
          break;

        case "database/schema":
          result = await this.handleGetSchema(params);
          break;

        case "database/tables":
          result = await this.handleGetTables(params);
          break;

        case "database/table-info":
          result = await this.handleGetTableInfo(params);
          break;

        case "database/stats":
          result = await this.handleGetStats(params);
          break;

        case "database/table-stats":
          result = await this.handleGetTableStats(params);
          break;

        case "database/refresh-stats":
          result = await this.handleRefreshStats(params);
          break;

        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      return {
        jsonrpc: "2.0",
        id: id,
        result: result,
      };
    } catch (error) {
      console.error(`[Database-MCP] Request failed:`, error.message);
      return {
        jsonrpc: "2.0",
        id: id,
        error: {
          code: -32603,
          message: error.message,
        },
      };
    }
  }

  /**
   * Handle MCP initialization
   */
  async handleInitialize(params) {
    console.log("[Database-MCP] Initializing Database MCP server...");

    try {
      // Load enhanced schema
      await this.loadDatabaseSchema();
      
      // Initialize statistics collector if POSTGRES_URL is available
      await this.loadDatabaseStatistics();

      const serverInfo = {
        name: "Database Schema MCP Server",
        version: "1.0.0",
        provider: "internal",
        endpoint: this.serverConfig.endpoint,
      };

      const tableCount = this.schemaData?.schema?.tables ? Object.keys(this.schemaData.schema.tables).length : 0;
      
      const capabilities = {
        schema: {
          supports_introspection: true,
          supports_relationships: true,
          supports_validation: true,
        },
        query: {
          supports_sql_validation: true,
          supports_query_optimization: true,
        },
        data: {
          tables: tableCount,
          business_rules: this.schemaData ? Object.keys(this.schemaData.businessRules || {}).length : 0,
          business_terminology: this.schemaData ? Object.keys(this.schemaData.businessTerminology || {}).length : 0,
        },
        health: {
          check_supported: true,
          detailed_status: true,
        },
      };

      console.log(
        `[Database-MCP] Loaded schema with ${tableCount} tables`,
      );

      return {
        protocolVersion: mcpConfig.protocolVersion,
        serverInfo: serverInfo,
        capabilities: capabilities,
      };
    } catch (error) {
      console.error("[Database-MCP] Initialization failed:", error.message);
      throw error;
    }
  }

  /**
   * Load database schema from configuration
   */
  async loadDatabaseSchema() {
    try {
      // Load enhanced schema from the actual config structure
      this.schemaData = {
        schema: enhancedSchema.schema || {},
        businessTerminology: enhancedSchema.businessTerminology || {},
        businessRules: enhancedSchema.businessRules || {},
      };

      this.lastSchemaLoad = Date.now();

      // Count tables from the schema.tables object
      const tableCount = this.schemaData.schema.tables ? Object.keys(this.schemaData.schema.tables).length : 0;
      const termCount = Object.keys(this.schemaData.businessTerminology).length;
      const rulesCount = Object.keys(this.schemaData.businessRules).length;

      console.log("[Database-MCP] Enhanced schema loaded:", {
        tables: tableCount,
        businessTerminology: termCount,
        businessRules: rulesCount,
      });

      return this.schemaData;
    } catch (error) {
      console.error("[Database-MCP] Failed to load schema:", error.message);
      console.error("[Database-MCP] Error stack:", error.stack);
      this.schemaData = {
        schema: { tables: {} },
        businessTerminology: {},
        businessRules: {},
      };
      return this.schemaData;
    }
  }

  /**
   * Handle health check
   */
  async handleHealthCheck(params) {
    const tableCount = this.schemaData?.schema?.tables ? Object.keys(this.schemaData.schema.tables).length : 0;
    const isHealthy = this.schemaData !== null && tableCount > 0;

    return {
      healthy: isHealthy,
      status: isHealthy ? "operational" : "degraded",
      schema_loaded: !!this.schemaData,
      tables_count: tableCount,
      business_terminology_count: this.schemaData ? Object.keys(this.schemaData.businessTerminology || {}).length : 0,
      business_rules_count: this.schemaData ? Object.keys(this.schemaData.businessRules || {}).length : 0,
      last_update: new Date(this.lastSchemaLoad).toISOString(),
    };
  }

  /**
   * Handle get full schema
   */
  async handleGetSchema(params) {
    if (!this.schemaData) {
      await this.loadDatabaseSchema();
    }

    return {
      success: true,
      schema: this.schemaData,
    };
  }

  /**
   * Handle get tables list
   */
  async handleGetTables(params) {
    if (!this.schemaData) {
      await this.loadDatabaseSchema();
    }

    const tablesObj = this.schemaData.schema?.tables || {};
    const tables = Object.keys(tablesObj).map((tableName) => {
      const table = tablesObj[tableName];
      return {
        name: tableName,
        description: table.description || table.business_purpose,
        columns: Object.keys(table.columns || {}).length,
      };
    });

    return {
      success: true,
      tables: tables,
      total: tables.length,
    };
  }

  /**
   * Handle get specific table info
   */
  async handleGetTableInfo(params) {
    const { table_name } = params;

    if (!this.schemaData) {
      await this.loadDatabaseSchema();
    }

    const table = this.schemaData.schema?.tables?.[table_name];

    if (!table) {
      throw new Error(`Table '${table_name}' not found in schema`);
    }

    return {
      success: true,
      table: {
        name: table_name,
        ...table,
      },
    };
  }

  /**
   * Load database statistics
   */
  async loadDatabaseStatistics() {
    try {
      const postgresUrl = process.env.POSTGRES_URL;
      
      if (!postgresUrl) {
        console.warn("[Database-MCP] POSTGRES_URL not set, statistics collection disabled");
        this.databaseStats = null;
        return;
      }

      if (!this.statsCollector) {
        this.statsCollector = new DatabaseStatsCollector(postgresUrl);
      }

      console.log("[Database-MCP] Collecting database statistics...");
      this.databaseStats = await this.statsCollector.collectStatistics();
      
      const tableCount = this.databaseStats ? Object.keys(this.databaseStats.tables).length : 0;
      console.log(`[Database-MCP] Database statistics loaded for ${tableCount} tables`);
      
      return this.databaseStats;
    } catch (error) {
      console.error("[Database-MCP] Failed to load statistics:", error.message);
      this.databaseStats = null;
    }
  }

  /**
   * Handle get all statistics
   */
  async handleGetStats(params) {
    if (!this.databaseStats) {
      await this.loadDatabaseStatistics();
    }

    return {
      success: true,
      stats: this.databaseStats,
      has_stats: !!this.databaseStats,
    };
  }

  /**
   * Handle get table-specific statistics
   */
  async handleGetTableStats(params) {
    const { table_name } = params;

    if (!this.databaseStats) {
      await this.loadDatabaseStatistics();
    }

    if (!this.statsCollector) {
      return {
        success: false,
        error: "Statistics collector not initialized (POSTGRES_URL not set)",
      };
    }

    const tableStats = this.statsCollector.getTableStats(table_name);
    const formatted = this.statsCollector.formatStatsForPrompt(table_name);

    return {
      success: true,
      table: table_name,
      stats: tableStats,
      formatted: formatted,
    };
  }

  /**
   * Handle refresh statistics
   */
  async handleRefreshStats(params) {
    if (!this.statsCollector) {
      return {
        success: false,
        error: "Statistics collector not initialized",
      };
    }

    console.log("[Database-MCP] Forcing statistics refresh...");
    this.databaseStats = await this.statsCollector.forceRefresh();

    return {
      success: true,
      refreshed_at: new Date().toISOString(),
      table_count: this.databaseStats ? Object.keys(this.databaseStats.tables).length : 0,
    };
  }

  /**
   * Refresh schema if needed
   */
  async refreshSchemaIfNeeded() {
    const now = Date.now();
    if (now - this.lastSchemaLoad > this.schemaLoadInterval) {
      console.log("[Database-MCP] Refreshing schema...");
      await this.loadDatabaseSchema();
    }
  }

  /**
   * Refresh statistics if needed
   */
  async refreshStatisticsIfNeeded() {
    if (this.statsCollector) {
      await this.statsCollector.refreshIfNeeded();
    }
  }
}

module.exports = DatabaseMCPServer;

