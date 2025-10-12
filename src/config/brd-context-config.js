/**
 * SLM Business Service Layer - BRD Context Configuration
 *
 * @author Partha Chandramohan
 * @description Business Requirements Document context for enhanced SQL generation
 */

// const fs = require('fs');
const path = require('path');

class BRDContextConfig {
  constructor() {
    this.brdPath = path.join(__dirname, '../../docs/sample-brds');
    this.businessRequirements = this.loadBusinessRequirements();
    this.functionalRequirements = this.loadFunctionalRequirements();
    this.businessProcesses = this.loadBusinessProcesses();
    this.queryIntents = this.loadQueryIntents();
  }

  loadBusinessRequirements() {
    return {
      inventory_management: {
        BR_001: {
          title: "Real-Time Inventory Tracking",
          description: "System provides real-time visibility into inventory levels across all warehouse locations",
          sql_implications: [
            "JOIN inventory with warehouses for location-based queries",
            "Use quantity_available for current stock levels",
            "Include quantity_reserved for complete inventory picture"
          ],
          business_terms: ["stock levels", "inventory levels", "warehouse inventory", "available stock"]
        },
        BR_003: {
          title: "Inventory Optimization",
          description: "System provides inventory optimization recommendations based on demand forecasting",
          sql_implications: [
            "Compare quantity_available with min_stock_level for low stock alerts",
            "Use reorder_point for replenishment triggers",
            "Calculate inventory turnover using cost_price and sales data"
          ],
          business_terms: ["low stock", "reorder alerts", "optimization", "stock replenishment"]
        }
      },
      order_management: {
        BR_002: {
          title: "Automated Order Processing",
          description: "System automatically processes orders from multiple channels",
          sql_implications: [
            "Track order status progression through workflow",
            "JOIN orders with customers for complete order context",
            "Monitor payment_status for financial tracking"
          ],
          business_terms: ["order processing", "order status", "order workflow", "pending orders"]
        }
      },
      supplier_management: {
        BR_005: {
          title: "Supplier Management",
          description: "System manages supplier relationships, purchase orders, and delivery schedules",
          sql_implications: [
            "JOIN suppliers with products for sourcing information",
            "Use lead_time_days for delivery planning",
            "Track supplier performance metrics"
          ],
          business_terms: ["supplier performance", "delivery times", "vendor management", "procurement"]
        }
      }
    };
  }

  loadFunctionalRequirements() {
    return {
      inventory_tracking: {
        REQ_001: {
          title: "Inventory Management",
          functional_areas: [
            "Product identification and categorization",
            "Current stock levels by location",
            "Reserved inventory for pending orders",
            "Available-to-promise quantities"
          ],
          sql_patterns: [
            "SELECT i.*, p.product_name, w.warehouse_name FROM inventory i JOIN products p ON i.product_id = p.product_id JOIN warehouses w ON i.warehouse_id = w.warehouse_id",
            "WHERE i.quantity_available > 0 -- Available inventory",
            "WHERE i.quantity_reserved > 0 -- Reserved inventory",
            "WHERE i.quantity_available <= p.reorder_point -- Low stock"
          ]
        }
      },
      order_processing: {
        REQ_002: {
          title: "Order Processing Workflow",
          workflow_stages: [
            "Order receipt and validation",
            "Inventory allocation and reservation",
            "Payment processing integration",
            "Fulfillment center assignment",
            "Shipping and tracking coordination"
          ],
          sql_patterns: [
            "SELECT o.*, c.first_name, c.last_name FROM orders o JOIN customers c ON o.customer_id = c.customer_id",
            "WHERE o.status = 'pending' -- New orders",
            "WHERE o.status IN ('processing', 'shipped') -- Active fulfillment",
            "WHERE o.payment_status = 'paid' AND o.status = 'confirmed' -- Ready to ship"
          ]
        }
      },
      replenishment: {
        REQ_003: {
          title: "Inventory Replenishment",
          automation_rules: [
            "Automatic replenishment triggers when inventory falls below thresholds",
            "Purchase order generation based on lead times and demand forecasts"
          ],
          sql_patterns: [
            "SELECT p.*, i.quantity_available, s.lead_time_days FROM products p JOIN inventory i ON p.product_id = i.product_id JOIN suppliers s ON p.supplier_id = s.supplier_id WHERE i.quantity_available <= p.reorder_point"
          ]
        }
      }
    };
  }

  loadBusinessProcesses() {
    return {
      order_fulfillment: {
        process_name: "Order to Cash",
        stages: [
          {
            stage: "Order Placement",
            sql_context: "INSERT INTO orders, validate customer and inventory",
            business_rules: ["Customer must be active", "Products must be available"]
          },
          {
            stage: "Order Processing",
            sql_context: "UPDATE orders SET status = 'processing', reserve inventory",
            business_rules: ["Inventory allocation", "Payment authorization"]
          },
          {
            stage: "Fulfillment",
            sql_context: "UPDATE orders SET status = 'shipped', reduce inventory",
            business_rules: ["Pick, pack, ship from assigned warehouse"]
          },
          {
            stage: "Delivery",
            sql_context: "UPDATE orders SET status = 'delivered', update customer metrics",
            business_rules: ["Customer notification", "Update loyalty metrics"]
          }
        ]
      },
      inventory_management: {
        process_name: "Inventory Control",
        stages: [
          {
            stage: "Stock Monitoring",
            sql_context: "SELECT from inventory_summary view for stock levels",
            business_rules: ["Monitor against min_stock_level", "Alert on low stock"]
          },
          {
            stage: "Replenishment",
            sql_context: "Generate purchase orders when quantity <= reorder_point",
            business_rules: ["Consider lead_time_days", "Use reorder_quantity"]
          },
          {
            stage: "Receiving",
            sql_context: "UPDATE inventory quantities on goods receipt",
            business_rules: ["Quality inspection", "Update total_value"]
          }
        ]
      },
      customer_management: {
        process_name: "Customer Lifecycle",
        stages: [
          {
            stage: "Customer Acquisition",
            sql_context: "INSERT INTO customers with initial tier and status",
            business_rules: ["Default loyalty_tier = 1", "Status = 'active'"]
          },
          {
            stage: "Order History Tracking",
            sql_context: "UPDATE customer total_orders and total_spent on each order",
            business_rules: ["Calculate lifetime value", "Update loyalty tier"]
          },
          {
            stage: "Customer Segmentation",
            sql_context: "Analyze customers by total_spent and loyalty_tier",
            business_rules: ["Premium customers get benefits", "Tier progression rules"]
          }
        ]
      }
    };
  }

  loadQueryIntents() {
    return {
      inventory_queries: {
        "show inventory": {
          intent: "Display current inventory levels",
          tables: ["inventory", "products", "warehouses"],
          typical_sql: "SELECT p.product_name, i.quantity_available, w.warehouse_name FROM inventory i JOIN products p ON i.product_id = p.product_id JOIN warehouses w ON i.warehouse_id = w.warehouse_id"
        },
        "low stock items": {
          intent: "Find products needing replenishment",
          tables: ["inventory", "products"],
          typical_sql: "SELECT p.product_name, i.quantity_available, p.reorder_point FROM inventory i JOIN products p ON i.product_id = p.product_id WHERE i.quantity_available <= p.reorder_point"
        },
        "out of stock": {
          intent: "Find products with zero availability",
          tables: ["inventory", "products"],
          typical_sql: "SELECT p.product_name, p.sku FROM inventory i JOIN products p ON i.product_id = p.product_id WHERE i.quantity_available = 0"
        },
        "inventory value": {
          intent: "Calculate total inventory asset value",
          tables: ["inventory", "products"],
          typical_sql: "SELECT SUM(i.quantity_on_hand * p.cost_price) as total_inventory_value FROM inventory i JOIN products p ON i.product_id = p.product_id"
        }
      },
      order_queries: {
        "pending orders": {
          intent: "Show orders awaiting processing",
          tables: ["orders", "customers"],
          typical_sql: "SELECT o.order_number, c.first_name, c.last_name, o.total_amount, o.order_date FROM orders o JOIN customers c ON o.customer_id = c.customer_id WHERE o.status = 'pending'"
        },
        "recent orders": {
          intent: "Show recent order activity",
          tables: ["orders", "customers"],
          typical_sql: "SELECT o.order_number, c.first_name, c.last_name, o.total_amount, o.order_date FROM orders o JOIN customers c ON o.customer_id = c.customer_id WHERE o.order_date >= NOW() - INTERVAL '30 days' ORDER BY o.order_date DESC"
        },
        "high value orders": {
          intent: "Find large orders above threshold",
          tables: ["orders", "customers"],
          typical_sql: "SELECT o.order_number, c.first_name, c.last_name, o.total_amount FROM orders o JOIN customers c ON o.customer_id = c.customer_id WHERE o.total_amount > 1000 ORDER BY o.total_amount DESC"
        },
        "order status": {
          intent: "Track order fulfillment progress",
          tables: ["orders", "customers"],
          typical_sql: "SELECT o.order_number, o.status, o.payment_status, c.first_name, c.last_name FROM orders o JOIN customers c ON o.customer_id = c.customer_id"
        }
      },
      customer_queries: {
        "valuable customers": {
          intent: "Find high-value customers",
          tables: ["customers"],
          typical_sql: "SELECT customer_code, first_name, last_name, total_spent, loyalty_tier FROM customers WHERE total_spent > 5000 ORDER BY total_spent DESC"
        },
        "premium customers": {
          intent: "Show premium tier customers",
          tables: ["customers"],
          typical_sql: "SELECT customer_code, first_name, last_name, customer_type, loyalty_tier FROM customers WHERE customer_type = 'premium' OR loyalty_tier >= 4"
        },
        "inactive customers": {
          intent: "Find customers needing re-engagement",
          tables: ["customers"],
          typical_sql: "SELECT customer_code, first_name, last_name, last_order_date FROM customers WHERE last_order_date < NOW() - INTERVAL '90 days' OR last_order_date IS NULL"
        },
        "customer analytics": {
          intent: "Customer segmentation and metrics",
          tables: ["customers"],
          typical_sql: "SELECT customer_type, COUNT(*) as count, AVG(total_spent) as avg_spent, AVG(loyalty_tier) as avg_tier FROM customers GROUP BY customer_type"
        }
      },
      product_queries: {
        "product catalog": {
          intent: "Browse available products",
          tables: ["products", "categories"],
          typical_sql: "SELECT p.sku, p.product_name, p.unit_price, c.category_name FROM products p LEFT JOIN categories c ON p.category_id = c.category_id WHERE p.status = 'active'"
        },
        "product performance": {
          intent: "Analyze product sales and margins",
          tables: ["products", "order_items"],
          typical_sql: "SELECT p.product_name, COUNT(oi.order_item_id) as orders, SUM(oi.quantity) as units_sold, SUM(oi.line_total) as revenue FROM products p JOIN order_items oi ON p.product_id = oi.product_id GROUP BY p.product_id, p.product_name ORDER BY revenue DESC"
        }
      },
      supplier_queries: {
        "supplier performance": {
          intent: "Evaluate supplier metrics",
          tables: ["suppliers"],
          typical_sql: "SELECT company_name, rating, on_time_delivery_rate, quality_score, lead_time_days FROM suppliers WHERE status = 'active' ORDER BY rating DESC"
        },
        "supplier products": {
          intent: "Show products by supplier",
          tables: ["suppliers", "products"],
          typical_sql: "SELECT s.company_name, p.product_name, p.sku, p.unit_price FROM suppliers s JOIN products p ON s.supplier_id = p.supplier_id WHERE s.status = 'active' AND p.status = 'active'"
        }
      },
      operational_queries: {
        "warehouse utilization": {
          intent: "Monitor warehouse capacity and usage",
          tables: ["warehouses", "inventory"],
          typical_sql: "SELECT w.warehouse_name, COUNT(i.inventory_id) as products_stored, SUM(i.quantity_on_hand) as total_units FROM warehouses w LEFT JOIN inventory i ON w.warehouse_id = i.warehouse_id GROUP BY w.warehouse_id, w.warehouse_name"
        },
        "fulfillment status": {
          intent: "Track order fulfillment across warehouses",
          tables: ["orders", "warehouses"],
          typical_sql: "SELECT w.warehouse_name, o.status, COUNT(*) as order_count FROM orders o JOIN warehouses w ON o.warehouse_id = w.warehouse_id GROUP BY w.warehouse_name, o.status"
        }
      }
    };
  }

  getBusinessRequirements() {
    return this.businessRequirements;
  }

  getFunctionalRequirements() {
    return this.functionalRequirements;
  }

  getBusinessProcesses() {
    return this.businessProcesses;
  }

  getQueryIntents() {
    return this.queryIntents;
  }

  findRelevantBRD(query) {
    const queryLower = query.toLowerCase();
    const matches = [];

    // Search through business requirements
    for (const [category, requirements] of Object.entries(this.businessRequirements)) {
      for (const [brId, br] of Object.entries(requirements)) {
        if (br.business_terms.some(term => queryLower.includes(term.toLowerCase()))) {
          matches.push({
            type: 'business_requirement',
            category,
            id: brId,
            title: br.title,
            relevance: br.sql_implications,
            business_terms: br.business_terms
          });
        }
      }
    }

    // Search through query intents
    for (const [category, intents] of Object.entries(this.queryIntents)) {
      for (const [intent, details] of Object.entries(intents)) {
        if (queryLower.includes(intent) ||
            details.intent.toLowerCase().includes(queryLower.split(' ')[0])) {
          matches.push({
            type: 'query_intent',
            category,
            intent,
            description: details.intent,
            tables: details.tables,
            example_sql: details.typical_sql
          });
        }
      }
    }

    return matches;
  }

  generateSQLContext(query) {
    const relevantBRDs = this.findRelevantBRD(query);

    return {
      query_analysis: {
        original_query: query,
        matched_patterns: relevantBRDs
      },
      business_context: {
        requirements: relevantBRDs.filter(r => r.type === 'business_requirement'),
        intents: relevantBRDs.filter(r => r.type === 'query_intent')
      },
      sql_guidance: {
        recommended_tables: [...new Set(relevantBRDs.flatMap(r => r.tables || []))],
        business_rules: relevantBRDs.flatMap(r => r.relevance || []),
        example_patterns: relevantBRDs.map(r => r.example_sql).filter(Boolean)
      }
    };
  }

  generateMCPContext() {
    return {
      business_requirements: this.businessRequirements,
      functional_requirements: this.functionalRequirements,
      business_processes: this.businessProcesses,
      query_intents: this.queryIntents,
      context_version: "1.0",
      last_updated: new Date().toISOString()
    };
  }

  enhancePromptWithBRD(prompt, query) {
    const sqlContext = this.generateSQLContext(query);

    if (sqlContext.business_context.intents.length === 0 &&
        sqlContext.business_context.requirements.length === 0) {
      return prompt; // No relevant BRD context found
    }

    const brdEnhancement = `

BUSINESS CONTEXT:
${sqlContext.business_context.intents.map(intent =>
  `- ${intent.intent}: ${intent.description}`
).join('\n')}

${sqlContext.business_context.requirements.map(req =>
  `- ${req.title}: ${req.business_terms.join(', ')}`
).join('\n')}

RECOMMENDED APPROACH:
- Tables to consider: ${sqlContext.sql_guidance.recommended_tables.join(', ')}
- Business rules: ${sqlContext.sql_guidance.business_rules.slice(0, 3).join('; ')}

EXAMPLE SQL PATTERNS:
${sqlContext.sql_guidance.example_patterns.slice(0, 2).join('\n\n')}
`;

    return prompt + brdEnhancement;
  }
}

module.exports = new BRDContextConfig();