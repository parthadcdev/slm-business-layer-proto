/**
 * SLM Business Service Layer - Schema-Aware SQL Query Generator
 *
 * @author Partha Chandramohan
 * @description AI-powered SQL generation with validation and safety measures
 */
const LRUCache = require('../utils/lru-cache');
const securityConfig = require('../config/security-config');
const sqlValidator = require('../security/sql-validator');

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

  async generateSQL(intent, ollamaClient) {
    // Check cache first
    const cacheKey = this.generateCacheKey(intent);
    const cached = this.queryCache.get(cacheKey);

    if (cached) {
      console.log('SQL generation cache hit');
      return cached;
    }

    try {
      // Use SLM for SQL generation
      const sql = await this.generateWithSLM(intent, ollamaClient);

      // Validate the generated SQL
      const validatedSQL = this.validateSQL(sql);

      // Cache the result
      this.queryCache.set(cacheKey, validatedSQL);

      return validatedSQL;
    } catch (error) {
      console.log('SLM SQL generation failed, using template fallback');
      return this.generateWithTemplate(intent);
    }
  }

  async generateWithSLM(intent, ollamaClient) {
    const prompt = this.buildSQLGenerationPrompt(intent);

    const response = await ollamaClient.generateResponse(prompt, {
      temperature: 0.1, // Low temperature for consistent SQL
      max_tokens: 500
    });

    return this.extractSQL(response.response || response);
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

    for (const filter of intent.filters) {
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

    // Add default active filters
    if (intent.entity === 'products') {
      conditions.push("p.status = 'active'");
    }
    if (intent.entity === 'warehouses') {
      conditions.push("w.status = 'active'");
    }

    return conditions.join(' AND ');
  }

  generateCacheKey(intent) {
    return JSON.stringify({
      intent: intent.intent,
      entity: intent.entity,
      filters: intent.filters.sort(),
      limit: intent.limit,
      sort: intent.sort
    });
  }

  clearCache() {
    this.queryCache.clear();
  }

  getCacheStats() {
    return this.queryCache.getStats();
  }
}

module.exports = new SQLGenerator();