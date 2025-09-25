/**
 * SLM Business Service Layer - PostgreSQL Database Adapter
 *
 * @author Partha Chandramohan
 * @description Database adapter for PostgreSQL with dynamic query generation based on business requests
 */
const { Pool } = require('pg');

class PostgreSQLAdapter {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      this.pool = new Pool({
        user: process.env.POSTGRES_USER || 'app_user',
        host: process.env.POSTGRES_HOST || 'localhost',
        database: process.env.POSTGRES_DB || 'business_app',
        password: process.env.POSTGRES_PASSWORD || 'app_password',
        port: process.env.POSTGRES_PORT || 5432,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      await this.pool.query('SELECT NOW()');
      this.initialized = true;
      console.log('PostgreSQL adapter initialized successfully');
    } catch (error) {
      console.error('Failed to initialize PostgreSQL adapter:', error);
      throw new Error('PostgreSQL initialization failed');
    }
  }

  async query(sql, params = []) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const result = await this.pool.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Database query error:', error);
      throw new Error(`Database query failed: ${error.message}`);
    }
  }

  // Dynamic query generator based on business request intent
  async processBusinessRequest(request, user) {
    const requestLower = request.toLowerCase();
    let queryResult = null;

    // Extract limit/quantity from request
    const numberWords = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
      'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20
    };

    // Match numeric digits
    let limitMatch = requestLower.match(/(?:top|first|show me)\s+(\d+)|(\d+)\s+(?:records?|items?|entries?|orders?|alerts?|customers?|products?)/);
    let limit = limitMatch ? parseInt(limitMatch[1] || limitMatch[2]) : null;

    // If no numeric match, try written numbers
    if (!limit) {
      const wordPattern = Object.keys(numberWords).join('|');
      const wordMatch = requestLower.match(new RegExp(`(?:top|first|show me)\\s+(${wordPattern})|(${wordPattern})\\s+(?:records?|items?|entries?|orders?|alerts?|customers?|products?)`));
      if (wordMatch) {
        const wordNumber = wordMatch[1] || wordMatch[2];
        limit = numberWords[wordNumber];
      }
    }

    try {
      // Order-related queries
      if ((requestLower.includes('order') || requestLower.includes('stock order')) && (requestLower.includes('list') || requestLower.includes('show'))) {
        queryResult = await this.getOrderSummary(limit);
      }
      else if ((requestLower.includes('order') || requestLower.includes('stock order')) && requestLower.includes('pending')) {
        queryResult = await this.getPendingOrders(limit);
      }
      else if ((requestLower.includes('order') || requestLower.includes('stock order')) && requestLower.includes('status')) {
        queryResult = await this.getOrdersByStatus(limit);
      }
      // Catch general "stock orders" without specific list/show keywords
      else if (requestLower.includes('stock order') && !requestLower.includes('low') && !requestLower.includes('alert')) {
        queryResult = await this.getOrderSummary(limit);
      }

      // Inventory-related queries
      else if (requestLower.includes('inventory') && (requestLower.includes('list') || requestLower.includes('show'))) {
        queryResult = await this.getInventorySummary(limit);
      }
      else if (requestLower.includes('low stock') || requestLower.includes('stock alert')) {
        queryResult = await this.getLowStockAlerts(limit);
      }
      else if (requestLower.includes('stock level')) {
        queryResult = await this.getStockLevels(limit);
      }

      // Customer-related queries
      else if (requestLower.includes('customer') && (requestLower.includes('list') || requestLower.includes('show'))) {
        queryResult = await this.getCustomerSummary(limit);
      }
      else if (requestLower.includes('customer') && requestLower.includes('premium')) {
        queryResult = await this.getPremiumCustomers(limit);
      }
      // Customer value analysis queries
      else if ((requestLower.includes('who') || requestLower.includes('which customer')) &&
               (requestLower.includes('spent') || requestLower.includes('spend')) &&
               (requestLower.includes('most') || requestLower.includes('highest') || requestLower.includes('value'))) {
        queryResult = await this.getCustomerSummary(limit || 10);
      }

      // Product-related queries
      else if (requestLower.includes('product') && (requestLower.includes('list') || requestLower.includes('show'))) {
        queryResult = await this.getProductCatalog(limit);
      }

      // Supplier-related queries
      else if (requestLower.includes('supplier') && (requestLower.includes('list') || requestLower.includes('show'))) {
        queryResult = await this.getSupplierSummary(limit);
      }

      // Warehouse-related queries
      else if (requestLower.includes('warehouse') && (requestLower.includes('list') || requestLower.includes('show'))) {
        queryResult = await this.getWarehouseSummary(limit);
      }

      // Financial queries
      else if (requestLower.includes('sales') && requestLower.includes('summary')) {
        queryResult = await this.getSalesSummary(limit);
      }

      if (queryResult) {
        return {
          success: true,
          data: queryResult.data,
          summary: queryResult.summary,
          query_type: queryResult.type,
          record_count: queryResult.data.length
        };
      } else {
        return {
          success: false,
          message: 'Unable to process this business request with available data queries',
          suggestions: [
            'Try asking about orders, inventory, customers, products, suppliers, or warehouses',
            'Use keywords like "list", "show", "pending", "low stock", "premium customers"'
          ]
        };
      }
    } catch (error) {
      console.error('Error processing business request:', error);
      return {
        success: false,
        error: error.message,
        message: 'Database query failed'
      };
    }
  }

  async getOrderSummary(limit = 20) {
    const sql = `
      SELECT
        o.order_number,
        o.order_date,
        o.status,
        o.priority,
        CONCAT(c.first_name, ' ', c.last_name) as customer_name,
        c.customer_type,
        o.total_amount
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      ORDER BY o.order_date DESC
      LIMIT $1
    `;

    const data = await this.query(sql, [limit]);
    return {
      type: 'order_summary',
      summary: `Found ${data.length} recent orders`,
      data: data
    };
  }

  async getPendingOrders(limit = null) {
    const sql = `
      SELECT
        o.order_number,
        o.order_date,
        o.status,
        CONCAT(c.first_name, ' ', c.last_name) as customer_name,
        o.total_amount,
        o.priority
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE o.status IN ('pending', 'confirmed', 'processing')
      ORDER BY o.order_date ASC
    `;

    const data = await this.query(sql);
    return {
      type: 'pending_orders',
      summary: `Found ${data.length} pending orders requiring attention`,
      data: data
    };
  }

  async getOrdersByStatus(limit = null) {
    const sql = `
      SELECT
        status,
        COUNT(*) as order_count,
        SUM(total_amount) as total_value
      FROM orders
      GROUP BY status
      ORDER BY order_count DESC
    `;

    const data = await this.query(sql);
    return {
      type: 'order_status_summary',
      summary: `Order status breakdown across all orders`,
      data: data
    };
  }

  async getInventorySummary(limit = 25) {
    const sql = `
      SELECT
        p.sku,
        p.product_name,
        c.category_name,
        w.warehouse_name,
        i.quantity_on_hand,
        i.quantity_available,
        i.quantity_reserved,
        p.min_stock_level,
        CASE
          WHEN i.quantity_available <= p.min_stock_level THEN 'Low Stock'
          WHEN i.quantity_available <= p.reorder_point THEN 'Reorder Soon'
          ELSE 'In Stock'
        END as stock_status,
        i.total_value
      FROM inventory i
      JOIN products p ON i.product_id = p.product_id
      JOIN categories c ON p.category_id = c.category_id
      JOIN warehouses w ON i.warehouse_id = w.warehouse_id
      WHERE p.status = 'active' AND w.status = 'active'
      ORDER BY i.quantity_available ASC
      LIMIT $1
    `;

    const data = await this.query(sql, [limit]);
    return {
      type: 'inventory_summary',
      summary: `Current inventory levels for ${data.length} products`,
      data: data
    };
  }

  async getLowStockAlerts(limit = null) {
    let sql = `
      SELECT
        p.sku,
        p.product_name,
        c.category_name,
        w.warehouse_name,
        i.quantity_available,
        p.min_stock_level,
        p.reorder_point,
        p.reorder_quantity,
        s.company_name as supplier_name,
        s.lead_time_days
      FROM inventory i
      JOIN products p ON i.product_id = p.product_id
      JOIN categories c ON p.category_id = c.category_id
      JOIN warehouses w ON i.warehouse_id = w.warehouse_id
      LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
      WHERE i.quantity_available <= p.reorder_point
      AND p.status = 'active'
      AND w.status = 'active'
      ORDER BY i.quantity_available ASC
    `;

    const params = [];
    if (limit) {
      sql += ` LIMIT $1`;
      params.push(limit);
    }

    const data = await this.query(sql, params);
    return {
      type: 'low_stock_alerts',
      summary: `${data.length} products require immediate attention due to low stock`,
      data: data
    };
  }

  async getStockLevels(limit = null) {
    const sql = `
      SELECT
        w.warehouse_name,
        COUNT(i.inventory_id) as product_count,
        SUM(i.quantity_available) as total_units,
        SUM(i.total_value) as total_value,
        COUNT(CASE WHEN i.quantity_available <= p.min_stock_level THEN 1 END) as low_stock_count
      FROM inventory i
      JOIN warehouses w ON i.warehouse_id = w.warehouse_id
      JOIN products p ON i.product_id = p.product_id
      WHERE w.status = 'active'
      GROUP BY w.warehouse_id, w.warehouse_name
      ORDER BY total_value DESC
    `;

    const data = await this.query(sql);
    return {
      type: 'stock_levels_by_warehouse',
      summary: `Stock levels across ${data.length} active warehouses`,
      data: data
    };
  }

  async getCustomerSummary(limit = 20) {
    const sql = `
      SELECT
        customer_code,
        CONCAT(first_name, ' ', last_name) as customer_name,
        email,
        customer_type,
        loyalty_tier,
        total_orders,
        total_spent,
        last_order_date,
        status
      FROM customers
      WHERE status = 'active'
      ORDER BY total_spent DESC
      LIMIT $1
    `;

    const data = await this.query(sql, [limit]);
    return {
      type: 'customer_summary',
      summary: `Top ${data.length} customers by total spending`,
      data: data
    };
  }

  async getPremiumCustomers(limit = null) {
    const sql = `
      SELECT
        customer_code,
        CONCAT(c.first_name, ' ', c.last_name) as customer_name,
        email,
        customer_type,
        loyalty_tier,
        total_orders,
        total_spent,
        last_order_date
      FROM customers
      WHERE customer_type = 'premium' AND status = 'active'
      ORDER BY total_spent DESC
    `;

    const data = await this.query(sql);
    return {
      type: 'premium_customers',
      summary: `${data.length} premium customers in the system`,
      data: data
    };
  }

  async getProductCatalog(limit = 25) {
    const sql = `
      SELECT
        p.sku,
        p.product_name,
        c.category_name,
        s.company_name as supplier_name,
        p.unit_price,
        p.cost_price,
        p.status,
        p.min_stock_level
      FROM products p
      JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
      WHERE p.status = 'active'
      ORDER BY p.product_name
      LIMIT 25
    `;

    const data = await this.query(sql);
    return {
      type: 'product_catalog',
      summary: `Active product catalog with ${data.length} products`,
      data: data
    };
  }

  async getSupplierSummary(limit = null) {
    const sql = `
      SELECT
        supplier_code,
        company_name,
        contact_person,
        email,
        phone,
        rating,
        on_time_delivery_rate,
        quality_score,
        lead_time_days,
        status
      FROM suppliers
      WHERE status = 'active'
      ORDER BY rating DESC, on_time_delivery_rate DESC
    `;

    const data = await this.query(sql);
    return {
      type: 'supplier_summary',
      summary: `${data.length} active suppliers ranked by performance`,
      data: data
    };
  }

  async getWarehouseSummary(limit = null) {
    const sql = `
      SELECT
        w.warehouse_code,
        w.warehouse_name,
        w.manager_name,
        w.capacity,
        w.status,
        COUNT(i.inventory_id) as product_count,
        SUM(i.quantity_available) as total_units
      FROM warehouses w
      LEFT JOIN inventory i ON w.warehouse_id = i.warehouse_id
      GROUP BY w.warehouse_id, w.warehouse_code, w.warehouse_name, w.manager_name, w.capacity, w.status
      ORDER BY total_units DESC
    `;

    const data = await this.query(sql);
    return {
      type: 'warehouse_summary',
      summary: `${data.length} warehouses with inventory distribution`,
      data: data
    };
  }

  async getSalesSummary(limit = 30) {
    const sql = `
      SELECT
        DATE(order_date) as order_date,
        COUNT(*) as order_count,
        SUM(total_amount) as daily_revenue,
        AVG(total_amount) as avg_order_value
      FROM orders
      WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
      AND status NOT IN ('cancelled', 'returned')
      GROUP BY DATE(order_date)
      ORDER BY order_date DESC
      LIMIT 30
    `;

    const data = await this.query(sql);
    return {
      type: 'sales_summary',
      summary: `Sales performance over the last ${data.length} days`,
      data: data
    };
  }

  async checkHealth() {
    try {
      if (!this.initialized) {
        return { healthy: false, error: 'Not initialized' };
      }

      const result = await this.query('SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = $1', ['public']);
      return {
        healthy: true,
        connection: 'active',
        tables: result[0].table_count
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.initialized = false;
      console.log('PostgreSQL connection pool closed');
    }
  }
}

module.exports = new PostgreSQLAdapter();