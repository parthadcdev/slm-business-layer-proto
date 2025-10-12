// Sandboxed database operations
const { Pool } = require("pg");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

class DatabaseFunctions {
  constructor() {
    this.allowedOperations = [
      "select",
      "insert",
      "update",
      "delete",
      "count",
      "exists",
      "aggregate",
    ];

    this.allowedTables = {
      users: {
        operations: ["select", "update", "insert"],
        columns: ["id", "name", "email", "status", "created_at", "updated_at"],
        readOnly: ["id", "created_at"],
        required: ["name", "email"],
      },
      orders: {
        operations: ["select", "insert", "update"],
        columns: [
          "id",
          "user_id",
          "status",
          "total_amount",
          "created_at",
          "updated_at",
        ],
        readOnly: ["id", "created_at"],
        required: ["user_id", "total_amount"],
      },
      order_items: {
        operations: ["select", "insert", "update", "delete"],
        columns: [
          "id",
          "order_id",
          "product_id",
          "quantity",
          "price",
          "created_at",
        ],
        readOnly: ["id", "created_at"],
        required: ["order_id", "product_id", "quantity", "price"],
      },
      products: {
        operations: ["select"],
        columns: [
          "id",
          "name",
          "description",
          "price",
          "stock_quantity",
          "status",
        ],
        readOnly: [
          "id",
          "name",
          "description",
          "price",
          "stock_quantity",
          "status",
        ],
      },
      audit_log: {
        operations: ["select", "insert"],
        columns: [
          "id",
          "table_name",
          "operation",
          "user_id",
          "changes",
          "timestamp",
        ],
        readOnly: ["id", "timestamp"],
        required: ["table_name", "operation", "user_id"],
      },
    };

    this.maxResults = 1000;
    this.queryTimeout = 10000; // 10 seconds

    this.dbConfig = {
      type: process.env.DB_TYPE || "sqlite",
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || "business_app",
      username: process.env.DB_USER || "app_user",
      password: process.env.DB_PASSWORD || "",
      sqlitePath:
        process.env.SQLITE_PATH || path.join(__dirname, "../../data/app.db"),
    };

    this.connection = null;
  }

  async initialize() {
    try {
      if (this.dbConfig.type === "postgresql") {
        this.connection = new Pool({
          host: this.dbConfig.host,
          port: this.dbConfig.port,
          database: this.dbConfig.database,
          user: this.dbConfig.username,
          password: this.dbConfig.password,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        });
      } else if (this.dbConfig.type === "sqlite") {
        this.connection = new sqlite3.Database(this.dbConfig.sqlitePath);
      }

      console.log(`Database connection initialized: ${this.dbConfig.type}`);
    } catch (error) {
      console.error("Failed to initialize database connection:", error);
      throw new Error("Database initialization failed");
    }
  }

  async executeQuery(operation, table, parameters = {}, context = {}) {
    try {
      // Validate operation and table
      this.validateOperation(operation, table);

      // Validate parameters
      const validatedParams = this.validateParameters(
        operation,
        table,
        parameters,
      );

      // Build and execute query
      const query = this.buildQuery(operation, table, validatedParams, context);
      const result = await this.performQuery(query, context);

      // Log the operation
      await this.logDatabaseOperation(
        operation,
        table,
        validatedParams,
        result,
        context,
      );

      return {
        success: true,
        operation,
        table,
        data: result.rows || result,
        rowCount: result.rowCount || result.length,
        metadata: {
          executionTime: result.executionTime,
          queryId: result.queryId,
        },
      };
    } catch (error) {
      console.error(
        `Database operation failed: ${operation} on ${table}`,
        error.message,
      );
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  validateOperation(operation, table) {
    if (!this.allowedOperations.includes(operation)) {
      throw new Error(`Operation '${operation}' is not allowed`);
    }

    if (!this.allowedTables[table]) {
      throw new Error(`Table '${table}' is not accessible`);
    }

    if (!this.allowedTables[table].operations.includes(operation)) {
      throw new Error(
        `Operation '${operation}' is not allowed on table '${table}'`,
      );
    }
  }

  validateParameters(operation, table, parameters) {
    const tableConfig = this.allowedTables[table];
    const validatedParams = {};

    // Validate columns
    if (parameters.columns) {
      const invalidColumns = parameters.columns.filter(
        (col) => !tableConfig.columns.includes(col),
      );
      if (invalidColumns.length > 0) {
        throw new Error(`Invalid columns: ${invalidColumns.join(", ")}`);
      }
      validatedParams.columns = parameters.columns;
    }

    // Validate data for insert/update operations
    if (parameters.data && ["insert", "update"].includes(operation)) {
      validatedParams.data = this.validateRowData(
        operation,
        table,
        parameters.data,
      );
    }

    // Validate conditions for select/update/delete operations
    if (parameters.where) {
      validatedParams.where = this.validateWhereClause(table, parameters.where);
    }

    // Validate other parameters
    if (parameters.limit) {
      const limit = parseInt(parameters.limit);
      if (isNaN(limit) || limit <= 0 || limit > this.maxResults) {
        throw new Error(
          `Invalid limit. Must be between 1 and ${this.maxResults}`,
        );
      }
      validatedParams.limit = limit;
    }

    if (parameters.offset) {
      const offset = parseInt(parameters.offset);
      if (isNaN(offset) || offset < 0) {
        throw new Error("Invalid offset. Must be non-negative");
      }
      validatedParams.offset = offset;
    }

    if (parameters.orderBy) {
      validatedParams.orderBy = this.validateOrderBy(table, parameters.orderBy);
    }

    return validatedParams;
  }

  validateRowData(operation, table, data) {
    const tableConfig = this.allowedTables[table];
    const validatedData = {};

    for (const [column, value] of Object.entries(data)) {
      // Check if column is allowed
      if (!tableConfig.columns.includes(column)) {
        throw new Error(
          `Column '${column}' is not allowed for table '${table}'`,
        );
      }

      // Check if column is read-only for updates
      if (operation === "update" && tableConfig.readOnly.includes(column)) {
        throw new Error(`Column '${column}' is read-only`);
      }

      validatedData[column] = this.sanitizeValue(value);
    }

    // Check required fields for insert operations
    if (operation === "insert") {
      const missingRequired = tableConfig.required.filter(
        (col) => !(col in validatedData),
      );
      if (missingRequired.length > 0) {
        throw new Error(
          `Missing required columns: ${missingRequired.join(", ")}`,
        );
      }
    }

    return validatedData;
  }

  validateWhereClause(table, whereClause) {
    const tableConfig = this.allowedTables[table];

    if (typeof whereClause === "object") {
      const validatedWhere = {};

      for (const [column, condition] of Object.entries(whereClause)) {
        if (!tableConfig.columns.includes(column)) {
          throw new Error(`Column '${column}' is not allowed in WHERE clause`);
        }

        validatedWhere[column] = this.sanitizeValue(condition);
      }

      return validatedWhere;
    }

    throw new Error("WHERE clause must be an object");
  }

  validateOrderBy(table, orderBy) {
    const tableConfig = this.allowedTables[table];

    if (typeof orderBy === "string") {
      const column = orderBy.replace(/\s+(asc|desc)$/i, "");
      if (!tableConfig.columns.includes(column)) {
        throw new Error(`Column '${column}' is not allowed in ORDER BY`);
      }
      return orderBy;
    }

    if (Array.isArray(orderBy)) {
      return orderBy.map((item) => this.validateOrderBy(table, item));
    }

    throw new Error("ORDER BY must be a string or array of strings");
  }

  sanitizeValue(value) {
    if (typeof value === "string") {
      // Basic SQL injection prevention
      return value.replace(/['";\\]/g, "");
    }
    return value;
  }

  buildQuery(operation, table, parameters, context) {
    const queryId = this.generateQueryId();

    switch (operation) {
      case "select":
        return this.buildSelectQuery(table, parameters, queryId);
      case "insert":
        return this.buildInsertQuery(table, parameters, queryId);
      case "update":
        return this.buildUpdateQuery(table, parameters, queryId);
      case "delete":
        return this.buildDeleteQuery(table, parameters, queryId);
      case "count":
        return this.buildCountQuery(table, parameters, queryId);
      default:
        throw new Error(
          `Query builder not implemented for operation: ${operation}`,
        );
    }
  }

  buildSelectQuery(table, parameters, queryId) {
    const columns = parameters.columns ? parameters.columns.join(", ") : "*";
    let query = `SELECT ${columns} FROM ${table}`;
    const values = [];

    if (parameters.where) {
      const whereClause = this.buildWhereClause(parameters.where, values);
      query += ` WHERE ${whereClause}`;
    }

    if (parameters.orderBy) {
      query += ` ORDER BY ${parameters.orderBy}`;
    }

    if (parameters.limit) {
      query += ` LIMIT ${parameters.limit}`;
    }

    if (parameters.offset) {
      query += ` OFFSET ${parameters.offset}`;
    }

    return { text: query, values, queryId };
  }

  buildInsertQuery(table, parameters, queryId) {
    const columns = Object.keys(parameters.data);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const values = Object.values(parameters.data);

    const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;

    return { text: query, values, queryId };
  }

  buildUpdateQuery(table, parameters, queryId) {
    const columns = Object.keys(parameters.data);
    const setClause = columns
      .map((col, index) => `${col} = $${index + 1}`)
      .join(", ");
    const values = Object.values(parameters.data);

    let query = `UPDATE ${table} SET ${setClause}`;

    if (parameters.where) {
      const whereClause = this.buildWhereClause(parameters.where, values);
      query += ` WHERE ${whereClause}`;
    }

    query += " RETURNING *";

    return { text: query, values, queryId };
  }

  buildDeleteQuery(table, parameters, queryId) {
    let query = `DELETE FROM ${table}`;
    const values = [];

    if (parameters.where) {
      const whereClause = this.buildWhereClause(parameters.where, values);
      query += ` WHERE ${whereClause}`;
    } else {
      throw new Error("DELETE operations require a WHERE clause");
    }

    return { text: query, values, queryId };
  }

  buildCountQuery(table, parameters, queryId) {
    let query = `SELECT COUNT(*) as count FROM ${table}`;
    const values = [];

    if (parameters.where) {
      const whereClause = this.buildWhereClause(parameters.where, values);
      query += ` WHERE ${whereClause}`;
    }

    return { text: query, values, queryId };
  }

  buildWhereClause(whereObj, values) {
    const conditions = [];

    for (const [column, value] of Object.entries(whereObj)) {
      values.push(value);
      conditions.push(`${column} = $${values.length}`);
    }

    return conditions.join(" AND ");
  }

  async performQuery(query, context) {
    const startTime = Date.now();

    try {
      let result;

      if (this.dbConfig.type === "postgresql") {
        result = await this.connection.query(query.text, query.values);
      } else if (this.dbConfig.type === "sqlite") {
        result = await this.performSQLiteQuery(query);
      }

      return {
        ...result,
        executionTime: Date.now() - startTime,
        queryId: query.queryId,
      };
    } catch (error) {
      console.error("Query execution failed:", error);
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async performSQLiteQuery(query) {
    return new Promise((resolve, reject) => {
      if (
        query.text.toUpperCase().startsWith("SELECT") ||
        query.text.toUpperCase().startsWith("COUNT")
      ) {
        this.connection.all(query.text, query.values, (err, rows) => {
          if (err) reject(err);
          else resolve({ rows, rowCount: rows.length });
        });
      } else {
        this.connection.run(query.text, query.values, function (err) {
          if (err) reject(err);
          else resolve({ rowCount: this.changes, lastID: this.lastID });
        });
      }
    });
  }

  async logDatabaseOperation(operation, table, parameters, result, context) {
    try {
      // Only log to audit_log table if it exists and operation is not on audit_log itself
      if (table !== "audit_log" && this.allowedTables["audit_log"]) {
        const auditData = {
          table_name: table,
          operation: operation,
          user_id: context.userId || "system",
          changes: JSON.stringify({ parameters, rowCount: result.rowCount }),
          timestamp: new Date().toISOString(),
        };

        await this.executeQuery(
          "insert",
          "audit_log",
          { data: auditData },
          { ...context, skipAudit: true },
        );
      }
    } catch (error) {
      console.error("Failed to log database operation:", error);
      // Don't throw here as it shouldn't fail the main operation
    }
  }

  generateQueryId() {
    return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async checkConnection() {
    try {
      if (this.dbConfig.type === "postgresql") {
        const result = await this.connection.query("SELECT 1 as test");
        return { healthy: true, type: "postgresql" };
      } else if (this.dbConfig.type === "sqlite") {
        return new Promise((resolve) => {
          this.connection.get("SELECT 1 as test", (err, row) => {
            resolve({ healthy: !err, type: "sqlite", error: err?.message });
          });
        });
      }
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  getAvailableTables() {
    const tables = {};

    for (const [tableName, config] of Object.entries(this.allowedTables)) {
      tables[tableName] = {
        operations: config.operations,
        columns: config.columns,
        readOnlyColumns: config.readOnly,
        requiredColumns: config.required,
      };
    }

    return tables;
  }

  async close() {
    try {
      if (this.connection) {
        if (this.dbConfig.type === "postgresql") {
          await this.connection.end();
        } else if (this.dbConfig.type === "sqlite") {
          this.connection.close();
        }
      }
      console.log("Database connection closed");
    } catch (error) {
      console.error("Error closing database connection:", error);
    }
  }
}

module.exports = new DatabaseFunctions();
