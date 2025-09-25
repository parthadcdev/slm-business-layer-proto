/**
 * SLM Business Service Layer - Schema-Aware SQL Query Generator
 *
 * @author Partha Chandramohan
 * @description AI-powered SQL generation with validation and safety measures
 */
const LRUCache = require('../utils/lru-cache');
const securityConfig = require('../config/security-config');
const sqlValidator = require('../security/sql-validator');
const sqlIntentValidator = require('./sql-intent-validator');
const modelConfig = require('../config/model-config');

class SQLGenerator {
  constructor() {
    this.schema = this.loadDatabaseSchema();
    const cacheConfig = securityConfig.get('cache');
    this.queryCache = new LRUCache(
      cacheConfig.maxSize || 500,
      cacheConfig.defaultTTL || 10 * 60 * 1000 // 10 minutes for SQL queries
    );
    this.allowedOperations = ['SELECT']; // Only read operations for safety

    // Configure SQL validator with allowed tables
    sqlValidator.setAllowedTables(Object.keys(this.schema.tables));

    // Initialize model configuration
    this.modelConfig = modelConfig;
    this.lastUsedPrompt = null;
    this.lastUsedModel = null;
  }

  loadDatabaseSchema() {
    return {
      tables: {
        orders: {
          columns: ['order_id', 'order_number', 'customer_id', 'order_date', 'status', 'priority', 'total_amount', 'payment_status', 'warehouse_id'],
          joins: {
            customers: 'customer_id',
            warehouses: 'warehouse_id',
            order_items: 'order_id'
          }
        },
        customers: {
          columns: ['customer_id', 'customer_code', 'first_name', 'last_name', 'email', 'customer_type', 'loyalty_tier', 'total_orders', 'total_spent', 'status'],
          joins: {
            orders: 'customer_id'
          }
        },
        products: {
          columns: ['product_id', 'sku', 'product_name', 'category_id', 'supplier_id', 'unit_price', 'cost_price', 'status', 'min_stock_level', 'reorder_point'],
          joins: {
            categories: 'category_id',
            suppliers: 'supplier_id',
            inventory: 'product_id',
            order_items: 'product_id'
          }
        },
        inventory: {
          columns: ['inventory_id', 'product_id', 'warehouse_id', 'quantity_on_hand', 'quantity_available', 'quantity_reserved', 'total_value', 'location_code'],
          joins: {
            products: 'product_id',
            warehouses: 'warehouse_id'
          }
        },
        suppliers: {
          columns: ['supplier_id', 'supplier_code', 'company_name', 'rating', 'on_time_delivery_rate', 'quality_score', 'lead_time_days', 'status'],
          joins: {
            products: 'supplier_id'
          }
        },
        warehouses: {
          columns: ['warehouse_id', 'warehouse_code', 'warehouse_name', 'manager_name', 'capacity', 'status'],
          joins: {
            orders: 'warehouse_id',
            inventory: 'warehouse_id'
          }
        },
        categories: {
          columns: ['category_id', 'category_code', 'category_name', 'parent_category_id', 'is_active'],
          joins: {
            products: 'category_id'
          }
        },
        order_items: {
          columns: ['order_item_id', 'order_id', 'product_id', 'sku', 'product_name', 'quantity', 'unit_price', 'line_total'],
          joins: {
            orders: 'order_id',
            products: 'product_id'
          }
        }
      },
      views: {
        order_summary: {
          description: 'Complete order information with customer and warehouse details',
          base_tables: ['orders', 'customers', 'warehouses', 'order_items']
        },
        inventory_summary: {
          description: 'Inventory levels with product and warehouse information',
          base_tables: ['inventory', 'products', 'categories', 'warehouses']
        },
        low_stock_alerts: {
          description: 'Products below reorder point with supplier information',
          base_tables: ['inventory', 'products', 'categories', 'warehouses', 'suppliers']
        }
      }
    };
  }

  async generateSQL(intent, schemaContext, userRole, ollamaClient, modelOverride = null) {
    // Check cache first
    const cacheKey = this.generateCacheKey(intent, schemaContext, userRole);
    const cached = this.queryCache.get(cacheKey);

    if (cached) {
      console.log('SQL generation cache hit');
      return cached;
    }

    try {
      // Apply model override if provided
      if (modelOverride) {
        this.modelConfig.setModelConfig(modelOverride.provider, modelOverride.model, modelOverride.options);
      }

      // Use verified SQL generation with regeneration loop
      const result = await this.generateVerifiedSQL(intent, schemaContext, userRole, ollamaClient);

      // Cache the result
      this.queryCache.set(cacheKey, result.sql);

      return result;
    } catch (error) {
      console.log('Verified SQL generation failed, using template fallback:', error.message);
      const fallbackSql = this.generateWithTemplate(intent);
      return {
        sql: fallbackSql,
        prompt: 'Template-based fallback (no LM prompt used)',
        model: 'template-fallback',
        method: 'template'
      };
    }
  }

  async generateVerifiedSQL(intent, schemaContext, userRole, ollamaClient) {
    const maxAttempts = 3;
    let bestSQL = null;
    let bestScore = 0;
    let lastValidationResult = null;
    let usedPrompt = null;
    let usedModel = null;

    console.log(`[SQL-Verification] Starting verified SQL generation for intent: ${intent.intent} ${intent.entity}`);
    const currentConfig = this.modelConfig.getCurrentConfig();
    console.log(`[SQL-Verification] Using model: ${currentConfig.provider}/${currentConfig.model}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[SQL-Verification] Attempt ${attempt}/${maxAttempts}`);

      try {
        // Generate SQL using appropriate method
        let sql;
        let prompt;
        if (attempt === 1) {
          // First attempt: try SLM generation
          const result = schemaContext && schemaContext.results && schemaContext.results.length > 0 ?
            await this.generateWithSchemaContext(intent, schemaContext, userRole, ollamaClient) :
            await this.generateWithSLM(intent, ollamaClient);
          sql = result.sql || result;
          prompt = result.prompt;
          usedPrompt = prompt;
          usedModel = this.modelConfig.getDisplayConfig();
        } else {
          // Subsequent attempts: improve based on validation feedback
          const result = await this.generateImprovedSQL(intent, bestSQL, lastValidationResult, ollamaClient);
          sql = result.sql || result;
          prompt = result.prompt;
        }

        // Validate basic SQL structure
        const validatedSQL = this.validateSQL(sql);

        // Verify SQL matches intent
        console.log(`[SQL-Verification] Validating SQL-intent alignment for attempt ${attempt}`);
        const intentValidation = await sqlIntentValidator.validateSQLMatchesIntent(
          intent, validatedSQL, ollamaClient, this.schema, intent.originalRequest
        );

        console.log(`[SQL-Verification] Attempt ${attempt} validation score: ${intentValidation.score.toFixed(2)}`);

        if (intentValidation.issues.length > 0) {
          console.log(`[SQL-Verification] Issues found:`, intentValidation.issues);
        }

        // Keep track of best attempt
        if (intentValidation.score > bestScore) {
          bestSQL = validatedSQL;
          bestScore = intentValidation.score;
          lastValidationResult = intentValidation;
        }

        // If validation passes, return this SQL with metadata
        if (intentValidation.isValid) {
          console.log(`[SQL-Verification] SQL validated successfully on attempt ${attempt}`);
          this.lastUsedPrompt = usedPrompt;
          this.lastUsedModel = usedModel;
          return {
            sql: validatedSQL,
            prompt: usedPrompt,
            model: usedModel,
            method: 'llm-verified',
            attempts: attempt,
            validationScore: intentValidation.score
          };
        }

      } catch (error) {
        console.log(`[SQL-Verification] Attempt ${attempt} failed:`, error.message);
        lastValidationResult = {
          isValid: false,
          score: 0,
          issues: [error.message],
          recommendations: ['Try template fallback']
        };
      }
    }

    // If no attempt fully succeeded, use best attempt or fallback
    if (bestSQL && bestScore >= 0.5) {
      console.log(`[SQL-Verification] Using best attempt with score ${bestScore.toFixed(2)}`);
      this.lastUsedPrompt = usedPrompt;
      this.lastUsedModel = usedModel;
      return {
        sql: bestSQL,
        prompt: usedPrompt,
        model: usedModel,
        method: 'llm-partial',
        attempts: maxAttempts,
        validationScore: bestScore
      };
    } else {
      console.log(`[SQL-Verification] All attempts failed, falling back to template generation`);
      throw new Error('SQL verification failed after maximum attempts');
    }
  }

  async generateImprovedSQL(intent, previousSQL, validationResult, ollamaClient) {
    const improvementPrompt = sqlIntentValidator.generateSQLImprovementPrompt(
      intent, previousSQL, validationResult
    );

    console.log(`[SQL-Verification] Generating improved SQL based on validation feedback`);

    const response = await this.generateLLMResponse(improvementPrompt, ollamaClient);
    const sql = this.extractSQL(response.response || response);

    return {
      sql: sql,
      prompt: improvementPrompt
    };
  }

  async generateWithSLM(intent, ollamaClient) {
    const prompt = this.buildSQLGenerationPrompt(intent);

    const response = await this.generateLLMResponse(prompt, ollamaClient);
    const sql = this.extractSQL(response.response || response);

    return {
      sql: sql,
      prompt: prompt
    };
  }

  async generateWithSchemaContext(intent, schemaContext, userRole, ollamaClient) {
    try {
      // Extract table and column information from schema context
      const tableInfo = this.parseSchemaContext(schemaContext);

      // Apply RBAC column filtering
      const allowedColumns = this.filterColumnsByRole(tableInfo.columns, userRole);

      // Generate dynamic SQL using schema intelligence
      const sql = this.buildDynamicSQL(intent, tableInfo, allowedColumns, userRole);

      console.log(`[SQLGenerator] Schema-context generation for ${intent.entity}: ${tableInfo.table}`);
      return {
        sql: sql,
        prompt: 'Schema-context based generation (no LM prompt used)'
      };
    } catch (error) {
      console.log('[SQLGenerator] Schema-context generation failed, falling back to SLM');
      return await this.generateWithSLM(intent, ollamaClient);
    }
  }

  parseSchemaContext(schemaContext) {
    if (!schemaContext.results || schemaContext.results.length === 0) {
      throw new Error('No schema context available');
    }

    const topResult = schemaContext.results[0];
    const metadata = topResult.metadata || {};

    // Extract table name
    let tableName = metadata.table;
    if (!tableName) {
      const tableMatch = topResult.document.match(/CREATE TABLE (\w+)/i);
      tableName = tableMatch ? tableMatch[1] : null;
    }

    if (!tableName) {
      throw new Error('Could not extract table name from schema context');
    }

    // Extract columns from schema document
    const columns = this.extractColumnsFromSchema(topResult.document, tableName);

    // Get join information from hardcoded schema (for now)
    const schemaTable = this.schema.tables[tableName];
    const joins = schemaTable ? schemaTable.joins : {};

    return {
      table: tableName,
      columns: columns,
      joins: joins,
      access: metadata.access || 'public',
      description: metadata.description || ''
    };
  }

  extractColumnsFromSchema(schemaDocument, tableName) {
    // Extract column definitions from CREATE TABLE statement
    const lines = schemaDocument.split('\n');
    const columns = [];
    let inTableDef = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.toUpperCase().includes(`CREATE TABLE ${tableName.toUpperCase()}`)) {
        inTableDef = true;
        continue;
      }

      if (inTableDef) {
        if (trimmed === ');' || trimmed === ')') {
          break;
        }

        // Extract column name (first word after whitespace)
        const columnMatch = trimmed.match(/^(\w+)\s+/);
        if (columnMatch && !trimmed.toUpperCase().includes('CONSTRAINT')) {
          columns.push(columnMatch[1]);
        }
      }
    }

    // Fallback to hardcoded schema if extraction fails
    if (columns.length === 0) {
      const schemaTable = this.schema.tables[tableName];
      return schemaTable ? schemaTable.columns : [];
    }

    return columns;
  }

  filterColumnsByRole(columns, userRole) {
    // Define sensitive columns that require higher access levels
    const sensitiveColumns = {
      'customers': ['email', 'phone', 'address'],
      'orders': ['payment_details', 'credit_card_info'],
      'suppliers': ['contact_details', 'pricing_terms']
    };

    switch (userRole) {
      case 'admin':
        return columns; // Admin can see everything
      case 'manager':
        return columns.filter(col => {
          // Managers can see most columns except highly sensitive ones
          return !['credit_card_info', 'ssn', 'tax_id'].includes(col.toLowerCase());
        });
      case 'employee':
      default:
        return columns.filter(col => {
          const colLower = col.toLowerCase();
          return !['email', 'phone', 'address', 'payment_details', 'credit_card_info',
                   'contact_details', 'pricing_terms', 'cost_price', 'ssn', 'tax_id'].includes(colLower);
        });
    }
  }

  buildDynamicSQL(intent, tableInfo, allowedColumns, userRole) {
    const { table, joins } = tableInfo;

    // Build SELECT clause with allowed columns
    const selectColumns = this.buildSelectClause(table, allowedColumns, intent);

    // Build FROM clause with alias for orders table when customer filtering
    let fromClause = table;
    if (table === 'orders' && intent.queryParams?.customer_name) {
      fromClause = `${table} o`;
    }

    // Build JOIN clauses if needed
    const joinClauses = this.buildJoinClauses(table, joins, intent, userRole);
    if (joinClauses.length > 0) {
      fromClause += ' ' + joinClauses.join(' ');
    }

    // Build WHERE clause
    const whereClause = this.buildDynamicWhereClause(intent, table, userRole);

    // Build ORDER BY clause
    const orderClause = this.buildOrderClause(intent, table);

    // Build LIMIT clause
    const limitClause = intent.queryParams?.limit || intent.limit ?
      `LIMIT ${intent.queryParams?.limit || intent.limit}` : '';

    // Assemble the query
    let sql = `SELECT ${selectColumns} FROM ${fromClause}`;

    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }

    if (orderClause) {
      sql += ` ORDER BY ${orderClause}`;
    }

    if (limitClause) {
      sql += ` ${limitClause}`;
    }

    return sql + ';';
  }

  buildSelectClause(table, allowedColumns, intent) {
    if (intent.intent === 'count') {
      return 'COUNT(*) as total';
    }

    // For orders table with customer name filtering, include customer name
    if (table === 'orders' && intent.queryParams?.customer_name) {
      const orderColumns = ['o.order_number', 'o.order_date', 'o.status', 'o.total_amount'];
      const customerName = "CONCAT(c.first_name, ' ', c.last_name) AS customer_name";
      return `${orderColumns.join(', ')}, ${customerName}`;
    }

    // For categories, show user-friendly columns
    if (table === 'categories') {
      const categoryColumns = allowedColumns.filter(col =>
        ['category_name', 'category_code', 'is_active'].includes(col)
      );
      return categoryColumns.length > 0 ? categoryColumns.join(', ') : 'category_name, category_code';
    }

    // For other tables, select appropriate columns based on intent
    if (allowedColumns.length <= 5) {
      return allowedColumns.join(', ');
    }

    // Select key columns for larger tables
    const keyColumns = allowedColumns.filter(col => {
      const colLower = col.toLowerCase();
      return colLower.includes('name') || colLower.includes('code') ||
             colLower.includes('status') || colLower.includes('id');
    }).slice(0, 5);

    return keyColumns.length > 0 ? keyColumns.join(', ') : allowedColumns.slice(0, 5).join(', ');
  }

  buildJoinClauses(table, joins, intent, userRole) {
    const joinClauses = [];

    // Check if we need to join customers table for customer_name filtering
    const needsCustomerJoin = intent.queryParams?.customer_name && table === 'orders';

    if (needsCustomerJoin) {
      const tableAlias = table === 'orders' ? 'o' : table;
      joinClauses.push(`JOIN customers c ON ${tableAlias}.customer_id = c.customer_id`);
    }

    // Add joins based on intent and available relationships
    if (intent.intent === 'analyze' || intent.intent === 'list') {
      for (const [joinTable, joinColumn] of Object.entries(joins)) {
        // Skip customer join if we already added it above
        if (joinTable === 'customers' && needsCustomerJoin) {
          continue;
        }

        // Only add joins for accessible tables
        if (this.isTableAccessible(joinTable, userRole)) {
          const alias = joinTable === 'customers' ? 'c' : joinTable.charAt(0);
          joinClauses.push(`LEFT JOIN ${joinTable} ${alias} ON ${table}.${joinColumn} = ${alias}.${joinColumn}`);
        }
      }
    }

    return joinClauses;
  }

  buildDynamicWhereClause(intent, table, userRole) {
    const conditions = [];

    // Apply query parameters from intent
    if (intent.queryParams) {
      for (const [key, value] of Object.entries(intent.queryParams)) {
        if (key === 'status' && typeof value === 'string') {
          conditions.push(`${table}.status = '${value}'`);
        } else if (key === 'is_active' && typeof value === 'boolean') {
          conditions.push(`${table}.is_active = ${value}`);
        } else if (key === 'customer_name' && typeof value === 'string') {
          // Handle customer name filtering - need to join with customers table
          if (table === 'orders') {
            conditions.push(`(c.first_name ILIKE '%${value}%' OR c.last_name ILIKE '%${value}%' OR CONCAT(c.first_name, ' ', c.last_name) ILIKE '%${value}%')`);
          } else if (table === 'customers') {
            conditions.push(`(first_name ILIKE '%${value}%' OR last_name ILIKE '%${value}%' OR CONCAT(first_name, ' ', last_name) ILIKE '%${value}%')`);
          }
        } else if (key === 'customer_type' && typeof value === 'string') {
          if (table === 'customers') {
            conditions.push(`customer_type = '${value}'`);
          } else if (table === 'orders') {
            conditions.push(`c.customer_type = '${value}'`);
          }
        } else if (key === 'product_name' && typeof value === 'string') {
          if (table === 'products') {
            conditions.push(`product_name ILIKE '%${value}%'`);
          }
        }
      }
    }

    // Apply role-based filtering
    if (userRole === 'employee' && table === 'customers') {
      conditions.push("status = 'active'"); // Employees only see active customers
    }

    // Add default active filters
    if (['products', 'categories', 'warehouses'].includes(table) &&
        !conditions.some(c => c.includes('status') || c.includes('is_active'))) {
      if (table === 'categories') {
        conditions.push('is_active = true');
      } else {
        conditions.push("status = 'active'");
      }
    }

    return conditions.join(' AND ');
  }

  buildOrderClause(intent, table) {
    // Use query parameters if available
    if (intent.queryParams?.sortOrder) {
      if (table === 'categories') {
        return `category_name ${intent.queryParams.sortOrder}`;
      }
      return `created_at ${intent.queryParams.sortOrder}`;
    }

    // Default sorting
    if (table === 'categories') {
      return 'category_name ASC';
    }

    return null;
  }

  isTableAccessible(tableName, userRole) {
    const restrictedTables = {
      'employee': ['financial_data', 'salary_info'],
      'manager': ['admin_logs']
    };

    const userRestricted = restrictedTables[userRole] || [];
    return !userRestricted.includes(tableName);
  }

  buildSQLGenerationPrompt(intent) {
    const schemaInfo = this.getSchemaInfo(intent.entity);
    const secondarySchemas = intent.secondary_entities ?
      intent.secondary_entities.map(entity => this.getSchemaInfo(entity)).join('\n') : '';

    return `You are a PostgreSQL SQL expert specializing in business intelligence queries. Generate a safe, optimized SELECT query based on the user's business intent.

BUSINESS INTENT ANALYSIS:
Primary Intent: ${intent.intent}
Entity: ${intent.entity}
Business Logic: ${intent.business_logic}
Business Context: ${intent.business_context}
Query Complexity: ${intent.query_complexity}
Requires Joins: ${intent.requires_joins}
Time Scope: ${intent.time_scope || 'not specified'}

FULL INTENT OBJECT: ${JSON.stringify(intent)}

PRIMARY SCHEMA:
${schemaInfo}

${secondarySchemas ? `RELATED SCHEMAS:\n${secondarySchemas}` : ''}

ADVANCED SQL GENERATION RULES:
1. SECURITY: Only SELECT statements (no INSERT, UPDATE, DELETE, DROP, CREATE)
2. PERFORMANCE: Use appropriate indexes, limit results, optimize joins
3. BUSINESS LOGIC: Apply domain-specific business rules and calculations
4. JOINS: Use proper JOIN types based on business relationships
5. AGGREGATIONS: Include business-relevant grouping and calculations
6. SORTING: Apply meaningful business sorting (consider sort_direction field)
7. FILTERING: Translate business filters into precise WHERE conditions
8. COLUMNS: Select columns that provide business value and context

INTELLIGENT FILTER MAPPINGS (context-aware):
Stock Management:
- "low_stock": quantity_available <= reorder_point OR quantity_available <= min_stock_level
- "high_stock": quantity_available > reorder_point * 2
- "out_of_stock": quantity_available = 0 OR quantity_available IS NULL
- "overstocked": quantity_available > reorder_point * 3
- "critical_stock": quantity_available <= min_stock_level

Customer Analysis:
- "premium": customer_type = 'premium' OR loyalty_tier >= 4
- "valuable": total_spent > (SELECT AVG(total_spent) * 2 FROM customers)
- "inactive": last_order_date < CURRENT_DATE - INTERVAL '6 months'
- "loyal": total_orders > 10 AND customer_type = 'premium'

Order Management:
- "pending": status IN ('pending', 'confirmed', 'processing')
- "urgent": priority = 'urgent' OR order_date < CURRENT_DATE - INTERVAL '2 days'
- "overdue": estimated_delivery_date < CURRENT_DATE AND status NOT IN ('delivered', 'cancelled')
- "recent": order_date >= CURRENT_DATE - INTERVAL '30 days'

Business Intelligence Patterns:
- For "analyze" intent: Include aggregations, rankings, trends
- For "compare" intent: Use CASE statements, ratios, percentages
- For "trend" intent: Include time-based grouping and calculations
- For "alert" intent: Focus on exception conditions and thresholds

ENHANCED EXAMPLES:

Simple List Query:
Intent: {"intent":"list","entity":"orders","filters":["pending"],"limit":5,"business_context":"operational order management"}
SQL: SELECT o.order_number, o.order_date, o.status, o.priority, CONCAT(c.first_name, ' ', c.last_name) as customer_name, o.total_amount, o.estimated_delivery_date FROM orders o JOIN customers c ON o.customer_id = c.customer_id WHERE o.status IN ('pending', 'confirmed', 'processing') ORDER BY o.order_date DESC LIMIT 5;

Business Intelligence Query:
Intent: {"intent":"analyze","entity":"customers","business_logic":"rank customers by total purchase value","sort_direction":"DESC","business_context":"customer value analysis"}
SQL: SELECT customer_code, CONCAT(first_name, ' ', last_name) as customer_name, customer_type, loyalty_tier, total_orders, total_spent, ROUND((total_spent / NULLIF(total_orders, 0))::numeric, 2) as avg_order_value, CASE WHEN total_spent > (SELECT AVG(total_spent) * 2 FROM customers) THEN 'High Value' WHEN total_spent > (SELECT AVG(total_spent) FROM customers) THEN 'Medium Value' ELSE 'Standard Value' END as value_tier FROM customers WHERE status = 'active' ORDER BY total_spent DESC;

Complex Multi-Entity Analysis:
Intent: {"intent":"analyze","entity":"inventory","secondary_entities":["products","warehouses"],"business_logic":"identify products with low turnover consuming storage","query_complexity":"complex"}
SQL: SELECT p.sku, p.product_name, c.category_name, w.warehouse_name, i.quantity_available, i.total_value, p.reorder_point, ROUND((i.quantity_available::float / NULLIF(p.reorder_point, 0)), 2) as stock_ratio, CASE WHEN i.quantity_available > p.reorder_point * 3 THEN 'Overstocked' WHEN i.quantity_available > p.reorder_point * 2 THEN 'High Stock' WHEN i.quantity_available <= p.reorder_point THEN 'Low Stock' ELSE 'Normal' END as stock_status FROM inventory i JOIN products p ON i.product_id = p.product_id JOIN categories c ON p.category_id = c.category_id JOIN warehouses w ON i.warehouse_id = w.warehouse_id WHERE p.status = 'active' AND w.status = 'active' ORDER BY stock_ratio DESC, i.total_value DESC;

Generate ONLY the SQL query that best fulfills the business intent (no explanations):`;
  }

  getSchemaInfo(entity) {
    const table = this.schema.tables[entity];
    if (!table) {
      return `No schema found for entity: ${entity}`;
    }

    let schemaInfo = `Table: ${entity}\nColumns: ${table.columns.join(', ')}\n`;

    if (table.joins && Object.keys(table.joins).length > 0) {
      schemaInfo += `Available Joins:\n`;
      for (const [joinTable, joinColumn] of Object.entries(table.joins)) {
        const joinTableInfo = this.schema.tables[joinTable];
        if (joinTableInfo) {
          schemaInfo += `- ${joinTable}: ${entity}.${joinColumn} = ${joinTable}.${joinColumn}\n`;
        }
      }
    }

    return schemaInfo;
  }

  extractSQL(response) {
    // Remove any explanatory text and extract just the SQL
    const lines = response.split('\n');
    const sqlLines = lines.filter(line => {
      const trimmed = line.trim().toUpperCase();
      return trimmed.startsWith('SELECT') ||
             trimmed.includes('FROM') ||
             trimmed.includes('JOIN') ||
             trimmed.includes('WHERE') ||
             trimmed.includes('ORDER BY') ||
             trimmed.includes('LIMIT') ||
             trimmed.includes('GROUP BY') ||
             (trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('--'));
    });

    let sql = sqlLines.join(' ').trim();

    // Clean up the SQL
    sql = sql.replace(/\s+/g, ' ');
    if (!sql.endsWith(';')) {
      sql += ';';
    }

    return sql;
  }

  validateSQL(sql) {
    // Use the advanced SQL validator
    const validationResult = sqlValidator.validate(sql, {
      source: 'ai-generated',
      allowedTables: Object.keys(this.schema.tables)
    });

    if (!validationResult.valid) {
      const errorMessage = validationResult.errors.join('; ');
      console.error('SQL validation failed:', errorMessage);
      throw new Error(`SQL validation failed: ${errorMessage}`);
    }

    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      console.warn('SQL validation warnings:', validationResult.warnings.join('; '));
    }

    // Log query complexity for monitoring
    if (validationResult.metadata.complexity !== 'simple') {
      console.log(`Generated ${validationResult.metadata.complexity} SQL query with ${validationResult.metadata.joinCount} joins`);
    }

    return validationResult.sql;
  }

  validateTableNames(sql) {
    const tablePattern = /FROM\s+(\w+)|JOIN\s+(\w+)/gi;
    const matches = [...sql.matchAll(tablePattern)];

    for (const match of matches) {
      const tableName = match[1] || match[2];
      if (tableName && !this.schema.tables[tableName] && !this.schema.views[tableName]) {
        throw new Error(`Unknown table or view: ${tableName}`);
      }
    }
  }

  generateWithTemplate(intent) {
    // Fallback template-based SQL generation
    const templates = {
      orders: {
        list: `SELECT o.order_number, o.order_date, o.status, o.priority, CONCAT(c.first_name, ' ', c.last_name) as customer_name, c.customer_type, o.total_amount, o.payment_status, w.warehouse_name, COUNT(oi.order_item_id) as item_count
                FROM orders o
                JOIN customers c ON o.customer_id = c.customer_id
                LEFT JOIN warehouses w ON o.warehouse_id = w.warehouse_id
                LEFT JOIN order_items oi ON o.order_id = oi.order_id`,
        count: `SELECT COUNT(*) as total_orders FROM orders o`
      },
      inventory: {
        list: `SELECT p.sku, p.product_name, c.category_name, w.warehouse_name, i.quantity_on_hand, i.quantity_available, i.quantity_reserved, i.total_value
                FROM inventory i
                JOIN products p ON i.product_id = p.product_id
                JOIN categories c ON p.category_id = c.category_id
                JOIN warehouses w ON i.warehouse_id = w.warehouse_id`,
        count: `SELECT COUNT(*) as total_items FROM inventory i`
      },
      customers: {
        list: `SELECT customer_code, CONCAT(first_name, ' ', last_name) as customer_name, email, customer_type, loyalty_tier, total_orders, total_spent, status FROM customers`,
        count: `SELECT COUNT(*) as total_customers FROM customers`,
        analyze: `SELECT
                 customer_code,
                 CONCAT(first_name, ' ', last_name) as customer_name,
                 email,
                 customer_type,
                 loyalty_tier,
                 total_orders,
                 total_spent,
                 ROUND((total_spent / NULLIF(total_orders, 0))::numeric, 2) as avg_order_value,
                 CASE
                   WHEN last_order_date IS NULL THEN 'Never Ordered'
                   WHEN last_order_date < CURRENT_DATE - INTERVAL '6 months' THEN 'Inactive (6+ months)'
                   WHEN last_order_date < CURRENT_DATE - INTERVAL '3 months' THEN 'At Risk (3-6 months)'
                   WHEN last_order_date < CURRENT_DATE - INTERVAL '1 month' THEN 'Declining (1-3 months)'
                   ELSE 'Active'
                 END as engagement_status,
                 CASE
                   WHEN total_spent > 2000 THEN 'High Value (Retain)'
                   WHEN total_spent > 1000 THEN 'Medium Value (Upsell)'
                   WHEN total_spent > 500 THEN 'Low Value (Nurture)'
                   ELSE 'Minimal Value (Reactivate)'
                 END as value_segment,
                 CASE
                   WHEN customer_type = 'premium' AND total_spent < 500 THEN 'Premium Underperformer'
                   WHEN loyalty_tier >= 3 AND total_orders = 1 THEN 'One-Time Buyer'
                   WHEN total_spent < 300 THEN 'Low Spender'
                   ELSE 'Standard'
                 END as marketing_priority,
                 EXTRACT(DAYS FROM (CURRENT_DATE - last_order_date)) as days_since_last_order,
                 status
                 FROM customers`
      },
      products: {
        list: `SELECT p.sku, p.product_name, c.category_name, s.company_name as supplier_name, p.unit_price, p.cost_price, p.status, p.min_stock_level
               FROM products p
               JOIN categories c ON p.category_id = c.category_id
               LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id`,
        count: `SELECT COUNT(*) as total_products FROM products p`,
        aggregate: `SELECT COUNT(*) as product_count
                   FROM products p
                   JOIN categories c ON p.category_id = c.category_id`,
        analyze: `SELECT p.sku, p.product_name, c.category_name, w.warehouse_name, i.quantity_available, i.total_value, p.reorder_point,
                 ROUND((i.quantity_available::float / NULLIF(p.reorder_point, 0)), 2) as stock_ratio,
                 CASE
                   WHEN i.quantity_available > p.reorder_point * 3 THEN 'Overstocked'
                   WHEN i.quantity_available > p.reorder_point * 2 THEN 'High Stock'
                   WHEN i.quantity_available <= p.reorder_point THEN 'Low Stock'
                   ELSE 'Normal'
                 END as stock_status,
                 CASE
                   WHEN i.quantity_available > p.reorder_point * 2 THEN 'Slow Moving'
                   ELSE 'Normal Turnover'
                 END as turnover_status
                 FROM products p
                 JOIN inventory i ON p.product_id = i.product_id
                 JOIN categories c ON p.category_id = c.category_id
                 JOIN warehouses w ON i.warehouse_id = w.warehouse_id`
      },
      categories: {
        list: `SELECT category_code, category_name,
               CASE WHEN parent_category_id IS NULL THEN 'Top Level' ELSE 'Sub Category' END as category_type,
               is_active
               FROM categories`,
        count: `SELECT COUNT(*) as total_categories FROM categories`,
        analyze: `SELECT category_code, category_name,
                 CASE WHEN parent_category_id IS NULL THEN 'Top Level' ELSE 'Sub Category' END as category_type,
                 is_active,
                 (SELECT COUNT(*) FROM products p WHERE p.category_id = categories.category_id) as product_count
                 FROM categories`
      },
      suppliers: {
        list: `SELECT supplier_code, company_name, rating, on_time_delivery_rate, quality_score, lead_time_days, status FROM suppliers`,
        count: `SELECT COUNT(*) as total_suppliers FROM suppliers`,
        analyze: `SELECT supplier_code, company_name, rating, on_time_delivery_rate, quality_score, lead_time_days, status,
                 (SELECT COUNT(*) FROM products p WHERE p.supplier_id = suppliers.supplier_id) as product_count
                 FROM suppliers`
      },
      warehouses: {
        list: `SELECT warehouse_code, warehouse_name, manager_name, capacity, status FROM warehouses`,
        count: `SELECT COUNT(*) as total_warehouses FROM warehouses`,
        analyze: `SELECT warehouse_code, warehouse_name, manager_name, capacity, status,
                 (SELECT COUNT(*) FROM inventory i WHERE i.warehouse_id = warehouses.warehouse_id) as inventory_items
                 FROM warehouses`
      },
      order_items: {
        list: `SELECT oi.order_item_id, o.order_number, o.order_date, oi.product_name, oi.sku, oi.quantity, oi.unit_price, oi.line_total, CONCAT(c.first_name, ' ', c.last_name) as customer_name
               FROM order_items oi
               JOIN orders o ON oi.order_id = o.order_id
               JOIN customers c ON o.customer_id = c.customer_id`,
        count: `SELECT COUNT(*) as total_order_items FROM order_items oi`,
        analyze: `SELECT oi.product_name, oi.sku, SUM(oi.quantity) as total_quantity, SUM(oi.line_total) as total_value, COUNT(*) as order_count
                 FROM order_items oi
                 JOIN orders o ON oi.order_id = o.order_id
                 GROUP BY oi.product_name, oi.sku`
      }
    };

    const entityTemplates = templates[intent.entity];
    if (!entityTemplates) {
      throw new Error(`No template available for entity: ${intent.entity}`);
    }

    let sql = entityTemplates[intent.intent] || entityTemplates.list;

    // Add filters
    const whereClause = this.buildWhereClause(intent);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }

    // Add GROUP BY clause for queries that need aggregation
    if (intent.entity === 'orders' && (intent.intent === 'list' || !intent.intent)) {
      sql += ` GROUP BY o.order_id, c.first_name, c.last_name, c.customer_type, w.warehouse_name`;
    }

    // Add sorting with intelligent direction
    if (intent.sort) {
      sql += ` ORDER BY ${intent.sort}`;

      // Use explicit sort_direction if provided by SLM
      if (intent.sort_direction) {
        sql += ` ${intent.sort_direction}`;
      } else {
        // Fallback to legacy logic
        if (intent.entity === 'inventory' && intent.filters.includes('low_stock')) {
          sql += ' ASC'; // Show lowest stock first
        } else if (intent.entity === 'inventory' && intent.filters.includes('high_stock')) {
          sql += ' DESC'; // Show highest stock first
        } else if (intent.intent === 'analyze' && intent.entity === 'customers' && intent.isLeastQuery) {
          sql += ' ASC'; // Show least/lowest values first for analytical queries
        } else {
          sql += ' DESC'; // Most recent/highest first
        }
      }
    }

    // Add limit
    if (intent.limit) {
      sql += ` LIMIT ${intent.limit}`;
    }

    return sql + ';';
  }

  buildWhereClause(intent) {
    const conditions = [];

    // Handle both legacy format (intent.filters array) and new format (queryParams)
    const filters = intent.filters || [];
    const queryParams = intent.queryParams || {};

    for (const filter of filters) {
      switch (filter) {
        case 'low_stock':
          conditions.push('i.quantity_available <= p.reorder_point');
          break;
        case 'high_stock':
          conditions.push('i.quantity_available > p.reorder_point * 2');
          break;
        case 'out_of_stock':
          conditions.push('i.quantity_available = 0');
          break;
        case 'slow_moving':
          conditions.push('i.quantity_available > p.reorder_point * 2');
          break;
        case 'pending':
          if (intent.entity === 'orders') {
            conditions.push("o.status = 'pending'");
          } else {
            conditions.push("status = 'pending'");
          }
          break;
        case 'premium':
          conditions.push("customer_type = 'premium'");
          break;
        case 'urgent':
          conditions.push("priority = 'urgent'");
          break;
        case 'active':
          conditions.push("status = 'active'");
          break;
      }
    }

    // Handle queryParams for dynamic filtering
    if (queryParams.category) {
      // Category filtering for products
      if (intent.entity === 'products') {
        conditions.push(`c.category_name ILIKE '%${queryParams.category}%'`);
      }
    }

    // Handle customer_name filtering for order_items
    if (queryParams.customer_name && intent.entity === 'order_items') {
      const customerName = queryParams.customer_name.trim();
      const nameParts = customerName.split(/\s+/);

      if (nameParts.length >= 2) {
        // Full name provided (e.g., "Sarah Johnson")
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' '); // Handle cases like "Van Der Berg"
        conditions.push(`(c.first_name ILIKE '${firstName}' AND c.last_name ILIKE '${lastName}')`);
      } else {
        // Single name provided - search in both first and last name
        conditions.push(`(c.first_name ILIKE '%${customerName}%' OR c.last_name ILIKE '%${customerName}%')`);
      }
    }

    // Extract category from user request text as fallback
    if (intent.entity === 'products' && intent.userRequest) {
      const categoryMatch = intent.userRequest.toLowerCase().match(/in the (\w+) category|(\w+) category|for (\w+)/);
      if (categoryMatch) {
        const category = categoryMatch[1] || categoryMatch[2] || categoryMatch[3];
        if (category && !queryParams.category) {
          conditions.push(`c.category_name ILIKE '%${category}%'`);
        }
      }
    }

    // Add default active filters
    if (intent.entity === 'products') {
      conditions.push("p.status = 'active'");
    }
    if (intent.entity === 'warehouses') {
      conditions.push("w.status = 'active'");
    }

    return conditions.join(' AND ');
  }

  /**
   * Generate LLM response using current model configuration
   */
  async generateLLMResponse(prompt, ollamaClient) {
    const config = this.modelConfig.getCurrentConfig();

    if (config.provider === 'ollama') {
      return await ollamaClient.generateResponse(prompt, config.model, {
        temperature: config.temperature,
        max_tokens: config.max_tokens
      });
    } else if (config.provider === 'openai') {
      // TODO: Implement OpenAI client
      throw new Error('OpenAI provider not yet implemented');
    } else if (config.provider === 'anthropic') {
      // TODO: Implement Anthropic client
      throw new Error('Anthropic provider not yet implemented');
    } else {
      throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  /**
   * Get last used prompt and model information
   */
  getLastGenerationInfo() {
    return {
      prompt: this.lastUsedPrompt,
      model: this.lastUsedModel,
      config: this.modelConfig.getCurrentConfig()
    };
  }

  /**
   * Set model configuration for next generation
   */
  setModelConfig(provider, model, options = {}) {
    return this.modelConfig.setModelConfig(provider, model, options);
  }

  /**
   * Get available models for testing
   */
  getAvailableModels() {
    return this.modelConfig.getProviders().map(provider => ({
      provider: provider,
      models: this.modelConfig.getModelsForProvider(provider.id)
    }));
  }

  generateCacheKey(intent, schemaContext, userRole) {
    const config = this.modelConfig.getCurrentConfig();
    return JSON.stringify({
      intent: intent.intent,
      entity: intent.entity,
      filters: (intent.filters || []).sort(),
      limit: intent.limit,
      sort: intent.sort,
      userRole: userRole,
      schemaHash: schemaContext ? this.hashSchemaContext(schemaContext) : null,
      model: `${config.provider}/${config.model}`,
      temperature: config.temperature
    });
  }

  hashSchemaContext(schemaContext) {
    if (!schemaContext.results || schemaContext.results.length === 0) {
      return null;
    }
    // Create a simple hash of the schema context for caching
    const contextStr = schemaContext.results.map(r => r.metadata?.table || '').join(',');
    return Buffer.from(contextStr).toString('base64').slice(0, 16);
  }

  clearCache() {
    this.queryCache.clear();
  }

  getCacheStats() {
    return this.queryCache.getStats();
  }
}

module.exports = new SQLGenerator();