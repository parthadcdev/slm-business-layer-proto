/**
 * SLM Business Service Layer - Enhanced Database Schema Configuration
 *
 * @author Partha Chandramohan
 * @description Comprehensive database schema with business context for MCP integration
 */

class EnhancedSchemaConfig {
  constructor() {
    this.schema = this.loadEnhancedSchema();
    this.businessTerminology = this.loadBusinessTerminology();
    this.businessRules = this.loadBusinessRules();
  }

  loadEnhancedSchema() {
    return {
      database: {
        name: "business_app",
        version: "1.2",
        description: "SLM-powered business service layer database"
      },
      tables: {
        customers: {
          business_purpose: "Customer master data and relationship management",
          description: "Stores customer information, preferences, and business metrics",
          columns: {
            customer_id: {
              type: "UUID",
              primary_key: true,
              description: "Unique customer identifier",
              business_meaning: "System-generated customer reference"
            },
            customer_code: {
              type: "VARCHAR(20)",
              unique: true,
              description: "Human-readable customer code",
              business_meaning: "External customer reference for business users",
              example: "CUST-001"
            },
            first_name: {
              type: "VARCHAR(50)",
              required: true,
              description: "Customer first name",
              business_meaning: "Primary contact name for personalization"
            },
            last_name: {
              type: "VARCHAR(50)",
              required: true,
              description: "Customer last name",
              business_meaning: "Family name for formal correspondence"
            },
            email: {
              type: "VARCHAR(100)",
              unique: true,
              required: true,
              description: "Primary email address",
              business_meaning: "Main communication channel"
            },
            phone: {
              type: "VARCHAR(20)",
              description: "Contact phone number",
              business_meaning: "Secondary communication channel"
            },
            customer_type: {
              type: "ENUM",
              values: ["premium", "regular", "guest"],
              default: "regular",
              description: "Customer tier classification",
              business_meaning: "Determines service level and pricing"
            },
            status: {
              type: "ENUM",
              values: ["active", "inactive", "suspended"],
              default: "active",
              description: "Account status",
              business_meaning: "Controls customer access and transaction ability"
            },
            loyalty_tier: {
              type: "INTEGER",
              range: [1, 5],
              default: 1,
              description: "Loyalty program tier",
              business_meaning: "Higher tiers receive better discounts and benefits"
            },
            total_orders: {
              type: "INTEGER",
              default: 0,
              description: "Lifetime order count",
              business_meaning: "Customer engagement metric"
            },
            total_spent: {
              type: "DECIMAL(12,2)",
              default: 0.00,
              description: "Lifetime purchase value",
              business_meaning: "Customer value metric for segmentation"
            },
            registration_date: {
              type: "TIMESTAMP",
              description: "Account creation date",
              business_meaning: "Customer lifecycle tracking"
            },
            last_order_date: {
              type: "TIMESTAMP",
              description: "Most recent order date",
              business_meaning: "Customer activity recency"
            }
          },
          relationships: [
            {
              table: "orders",
              type: "one_to_many",
              foreign_key: "customer_id",
              description: "Customer can have multiple orders"
            }
          ],
          business_queries: [
            "most valuable customers",
            "active customers",
            "customers by tier",
            "inactive customers",
            "recent customers"
          ]
        },

        orders: {
          business_purpose: "Sales transaction management and order processing",
          description: "Complete order lifecycle from creation to fulfillment",
          columns: {
            order_id: {
              type: "UUID",
              primary_key: true,
              description: "Unique order identifier",
              business_meaning: "System-generated order reference"
            },
            order_number: {
              type: "VARCHAR(50)",
              unique: true,
              required: true,
              description: "Human-readable order number",
              business_meaning: "Customer-facing order reference",
              example: "ORD-2024-001"
            },
            customer_id: {
              type: "UUID",
              foreign_key: "customers.customer_id",
              required: true,
              description: "Customer who placed the order",
              business_meaning: "Links order to customer account"
            },
            order_date: {
              type: "TIMESTAMP",
              default: "CURRENT_TIMESTAMP",
              description: "When order was placed",
              business_meaning: "Order creation timestamp for analytics"
            },
            status: {
              type: "ENUM",
              values: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"],
              default: "pending",
              description: "Current order status",
              business_meaning: "Order lifecycle stage for fulfillment tracking"
            },
            order_type: {
              type: "ENUM",
              values: ["standard", "express", "bulk", "subscription"],
              default: "standard",
              description: "Order processing type",
              business_meaning: "Determines fulfillment priority and method"
            },
            priority: {
              type: "ENUM",
              values: ["low", "normal", "high", "urgent"],
              default: "normal",
              description: "Processing priority",
              business_meaning: "Fulfillment queue priority"
            },
            subtotal: {
              type: "DECIMAL(12,2)",
              required: true,
              description: "Pre-tax order value",
              business_meaning: "Base order value before adjustments"
            },
            tax_amount: {
              type: "DECIMAL(10,2)",
              default: 0.00,
              description: "Tax amount",
              business_meaning: "Calculated tax based on location and items"
            },
            shipping_amount: {
              type: "DECIMAL(10,2)",
              default: 0.00,
              description: "Shipping charges",
              business_meaning: "Delivery cost based on method and location"
            },
            discount_amount: {
              type: "DECIMAL(10,2)",
              default: 0.00,
              description: "Total discounts applied",
              business_meaning: "Promotional and loyalty discounts"
            },
            total_amount: {
              type: "DECIMAL(12,2)",
              required: true,
              description: "Final order total",
              business_meaning: "Amount customer pays (subtotal + tax + shipping - discount)"
            },
            payment_status: {
              type: "ENUM",
              values: ["pending", "authorized", "paid", "refunded", "failed"],
              default: "pending",
              description: "Payment processing status",
              business_meaning: "Financial transaction state"
            },
            warehouse_id: {
              type: "UUID",
              foreign_key: "warehouses.warehouse_id",
              description: "Fulfillment warehouse",
              business_meaning: "Where order will be processed and shipped from"
            }
          },
          relationships: [
            {
              table: "customers",
              type: "many_to_one",
              foreign_key: "customer_id",
              description: "Order belongs to one customer"
            },
            {
              table: "order_items",
              type: "one_to_many",
              foreign_key: "order_id",
              description: "Order contains multiple items"
            },
            {
              table: "warehouses",
              type: "many_to_one",
              foreign_key: "warehouse_id",
              description: "Order fulfilled from warehouse"
            }
          ],
          business_queries: [
            "pending orders",
            "recent orders",
            "high priority orders",
            "orders by customer",
            "orders by status",
            "large orders",
            "cancelled orders"
          ]
        },

        products: {
          business_purpose: "Product catalog and inventory management",
          description: "Master product data with pricing and supplier information",
          columns: {
            product_id: {
              type: "UUID",
              primary_key: true,
              description: "Unique product identifier",
              business_meaning: "System-generated product reference"
            },
            sku: {
              type: "VARCHAR(50)",
              unique: true,
              required: true,
              description: "Stock Keeping Unit",
              business_meaning: "Human-readable product code for inventory",
              example: "LAPTOP-DEL-XPS13"
            },
            product_name: {
              type: "VARCHAR(200)",
              required: true,
              description: "Product display name",
              business_meaning: "Customer-facing product title"
            },
            category_id: {
              type: "UUID",
              foreign_key: "categories.category_id",
              description: "Product category",
              business_meaning: "Groups products for organization and reporting"
            },
            supplier_id: {
              type: "UUID",
              foreign_key: "suppliers.supplier_id",
              description: "Primary supplier",
              business_meaning: "Main vendor for procurement"
            },
            unit_price: {
              type: "DECIMAL(10,2)",
              required: true,
              description: "Selling price per unit",
              business_meaning: "Customer price for revenue calculation"
            },
            cost_price: {
              type: "DECIMAL(10,2)",
              required: true,
              description: "Cost per unit",
              business_meaning: "Procurement cost for margin calculation"
            },
            status: {
              type: "ENUM",
              values: ["active", "inactive", "discontinued"],
              default: "active",
              description: "Product availability status",
              business_meaning: "Controls product visibility and ordering"
            },
            min_stock_level: {
              type: "INTEGER",
              default: 10,
              description: "Minimum inventory threshold",
              business_meaning: "Low stock alert trigger"
            },
            reorder_point: {
              type: "INTEGER",
              default: 20,
              description: "Reorder trigger threshold",
              business_meaning: "When to initiate purchase orders"
            },
            reorder_quantity: {
              type: "INTEGER",
              default: 100,
              description: "Standard reorder amount",
              business_meaning: "Default purchase order quantity"
            }
          },
          relationships: [
            {
              table: "categories",
              type: "many_to_one",
              foreign_key: "category_id",
              description: "Product belongs to category"
            },
            {
              table: "suppliers",
              type: "many_to_one",
              foreign_key: "supplier_id",
              description: "Product sourced from supplier"
            },
            {
              table: "inventory",
              type: "one_to_many",
              foreign_key: "product_id",
              description: "Product stored in multiple warehouses"
            },
            {
              table: "order_items",
              type: "one_to_many",
              foreign_key: "product_id",
              description: "Product appears in order items"
            }
          ],
          business_queries: [
            "active products",
            "products by category",
            "low stock products",
            "high margin products",
            "products needing reorder",
            "discontinued products"
          ]
        },

        inventory: {
          business_purpose: "Real-time stock tracking and warehouse management",
          description: "Current inventory levels across all warehouse locations",
          columns: {
            inventory_id: {
              type: "UUID",
              primary_key: true,
              description: "Unique inventory record identifier",
              business_meaning: "System-generated inventory reference"
            },
            product_id: {
              type: "UUID",
              foreign_key: "products.product_id",
              required: true,
              description: "Product being tracked",
              business_meaning: "Links inventory to product catalog"
            },
            warehouse_id: {
              type: "UUID",
              foreign_key: "warehouses.warehouse_id",
              required: true,
              description: "Storage location",
              business_meaning: "Where inventory is physically located"
            },
            quantity_on_hand: {
              type: "INTEGER",
              default: 0,
              description: "Total physical inventory",
              business_meaning: "Actual units in warehouse"
            },
            quantity_available: {
              type: "INTEGER",
              default: 0,
              description: "Available for sale",
              business_meaning: "Units that can be allocated to new orders"
            },
            quantity_reserved: {
              type: "INTEGER",
              default: 0,
              description: "Reserved for orders",
              business_meaning: "Units allocated but not yet shipped"
            },
            quantity_on_order: {
              type: "INTEGER",
              default: 0,
              description: "Units on purchase orders",
              business_meaning: "Expected inventory from suppliers"
            },
            total_value: {
              type: "DECIMAL(12,2)",
              description: "Inventory value at cost",
              business_meaning: "Asset value for financial reporting"
            },
            location_code: {
              type: "VARCHAR(50)",
              description: "Specific warehouse location",
              business_meaning: "Physical location within warehouse"
            }
          },
          relationships: [
            {
              table: "products",
              type: "many_to_one",
              foreign_key: "product_id",
              description: "Inventory tracks specific product"
            },
            {
              table: "warehouses",
              type: "many_to_one",
              foreign_key: "warehouse_id",
              description: "Inventory located in warehouse"
            }
          ],
          business_queries: [
            "low stock items",
            "inventory by warehouse",
            "inventory value",
            "available inventory",
            "reserved inventory",
            "out of stock items"
          ]
        },

        warehouses: {
          business_purpose: "Fulfillment center and storage facility management",
          description: "Physical locations for inventory storage and order processing",
          columns: {
            warehouse_id: {
              type: "UUID",
              primary_key: true,
              description: "Unique warehouse identifier",
              business_meaning: "System-generated warehouse reference"
            },
            warehouse_code: {
              type: "VARCHAR(20)",
              unique: true,
              required: true,
              description: "Human-readable warehouse code",
              business_meaning: "Short code for operational use",
              example: "WH-EAST"
            },
            warehouse_name: {
              type: "VARCHAR(100)",
              required: true,
              description: "Warehouse display name",
              business_meaning: "Human-readable warehouse identifier"
            },
            status: {
              type: "ENUM",
              values: ["active", "inactive", "maintenance"],
              default: "active",
              description: "Operational status",
              business_meaning: "Whether warehouse can process orders"
            },
            capacity: {
              type: "INTEGER",
              description: "Storage capacity",
              business_meaning: "Maximum units that can be stored"
            }
          },
          relationships: [
            {
              table: "inventory",
              type: "one_to_many",
              foreign_key: "warehouse_id",
              description: "Warehouse contains inventory"
            },
            {
              table: "orders",
              type: "one_to_many",
              foreign_key: "warehouse_id",
              description: "Warehouse fulfills orders"
            }
          ],
          business_queries: [
            "active warehouses",
            "warehouse capacity",
            "warehouse inventory levels"
          ]
        },

        suppliers: {
          business_purpose: "Vendor relationship and procurement management",
          description: "Supplier information and performance metrics",
          columns: {
            supplier_id: {
              type: "UUID",
              primary_key: true,
              description: "Unique supplier identifier",
              business_meaning: "System-generated supplier reference"
            },
            supplier_code: {
              type: "VARCHAR(20)",
              unique: true,
              required: true,
              description: "Human-readable supplier code",
              business_meaning: "Short code for procurement use",
              example: "SUP-TECH01"
            },
            company_name: {
              type: "VARCHAR(100)",
              required: true,
              description: "Supplier company name",
              business_meaning: "Legal business name"
            },
            status: {
              type: "ENUM",
              values: ["active", "inactive", "suspended"],
              default: "active",
              description: "Supplier relationship status",
              business_meaning: "Whether supplier can be used for procurement"
            },
            rating: {
              type: "DECIMAL(3,2)",
              range: [0, 5],
              default: 5.00,
              description: "Overall supplier rating",
              business_meaning: "Performance score for vendor selection"
            },
            on_time_delivery_rate: {
              type: "DECIMAL(5,2)",
              default: 100.00,
              description: "Percentage of on-time deliveries",
              business_meaning: "Reliability metric for planning"
            },
            quality_score: {
              type: "DECIMAL(3,2)",
              range: [0, 5],
              default: 5.00,
              description: "Product quality rating",
              business_meaning: "Quality assessment for vendor selection"
            },
            lead_time_days: {
              type: "INTEGER",
              default: 7,
              description: "Standard delivery time",
              business_meaning: "Expected days from order to delivery"
            }
          },
          relationships: [
            {
              table: "products",
              type: "one_to_many",
              foreign_key: "supplier_id",
              description: "Supplier provides products"
            }
          ],
          business_queries: [
            "active suppliers",
            "top rated suppliers",
            "suppliers by performance",
            "suppliers by delivery time"
          ]
        },

        order_items: {
          business_purpose: "Individual line items within customer orders",
          description: "Detailed breakdown of products ordered with quantities and pricing",
          columns: {
            order_item_id: {
              type: "UUID",
              primary_key: true,
              description: "Unique order item identifier",
              business_meaning: "System-generated line item reference"
            },
            order_id: {
              type: "UUID",
              foreign_key: "orders.order_id",
              required: true,
              description: "Parent order",
              business_meaning: "Links item to specific order"
            },
            product_id: {
              type: "UUID",
              foreign_key: "products.product_id",
              required: true,
              description: "Product being ordered",
              business_meaning: "What customer is purchasing"
            },
            quantity: {
              type: "INTEGER",
              required: true,
              min_value: 1,
              description: "Number of units ordered",
              business_meaning: "How many units customer wants"
            },
            unit_price: {
              type: "DECIMAL(10,2)",
              required: true,
              description: "Price per unit at time of order",
              business_meaning: "Locked-in price for this transaction"
            },
            line_total: {
              type: "DECIMAL(12,2)",
              required: true,
              description: "Total for this line item",
              business_meaning: "quantity × unit_price for revenue calculation"
            },
            shipped_quantity: {
              type: "INTEGER",
              default: 0,
              description: "Units actually shipped",
              business_meaning: "Fulfillment tracking"
            }
          },
          relationships: [
            {
              table: "orders",
              type: "many_to_one",
              foreign_key: "order_id",
              description: "Item belongs to order"
            },
            {
              table: "products",
              type: "many_to_one",
              foreign_key: "product_id",
              description: "Item references product"
            }
          ],
          business_queries: [
            "items in order",
            "popular products",
            "high value items",
            "partially shipped items"
          ]
        }
      },

      views: {
        inventory_summary: {
          description: "Comprehensive inventory status with stock alerts",
          business_purpose: "Quick inventory overview for operations",
          includes_tables: ["inventory", "products", "categories", "warehouses"]
        },
        order_summary: {
          description: "Complete order information with customer details",
          business_purpose: "Order management and customer service",
          includes_tables: ["orders", "customers", "warehouses", "order_items"]
        },
        low_stock_alerts: {
          description: "Products requiring immediate attention",
          business_purpose: "Proactive inventory management",
          includes_tables: ["inventory", "products", "categories", "warehouses", "suppliers"]
        }
      }
    };
  }

  loadBusinessTerminology() {
    return {
      "pending orders": "orders WHERE status = 'pending'",
      "active customers": "customers WHERE status = 'active'",
      "low stock": "products with inventory below reorder_point",
      "valuable customers": "customers ordered by total_spent DESC",
      "premium customers": "customers WHERE customer_type = 'premium'",
      "recent orders": "orders from last 30 days",
      "out of stock": "inventory WHERE quantity_available = 0",
      "available inventory": "sum of quantity_available",
      "reserved inventory": "sum of quantity_reserved",
      "high priority": "orders WHERE priority IN ('high', 'urgent')",
      "shipped orders": "orders WHERE status = 'shipped'",
      "cancelled orders": "orders WHERE status = 'cancelled'",
      "top suppliers": "suppliers ordered by rating DESC",
      "warehouse capacity": "warehouse storage limits and utilization"
    };
  }

  loadBusinessRules() {
    return {
      inventory_management: {
        low_stock_threshold: "quantity_available <= reorder_point",
        out_of_stock: "quantity_available = 0",
        overstocked: "quantity_available > max_stock_level"
      },
      customer_segmentation: {
        premium_customer: "customer_type = 'premium' OR loyalty_tier >= 4",
        valuable_customer: "total_spent > 10000",
        inactive_customer: "last_order_date < NOW() - INTERVAL '90 days'"
      },
      order_processing: {
        pending_orders: "status = 'pending'",
        urgent_orders: "priority = 'urgent' OR (priority = 'high' AND order_date < NOW() - INTERVAL '1 day')",
        large_orders: "total_amount > 5000"
      },
      financial_metrics: {
        revenue_calculation: "sum(total_amount) WHERE payment_status = 'paid'",
        profit_margin: "(unit_price - cost_price) / unit_price * 100",
        inventory_value: "sum(quantity_on_hand * cost_price)"
      }
    };
  }

  getSchema() {
    return this.schema;
  }

  getBusinessTerminology() {
    return this.businessTerminology;
  }

  getBusinessRules() {
    return this.businessRules;
  }

  getAllowedTables() {
    return Object.keys(this.schema.tables);
  }

  getTableMetadata(tableName) {
    return this.schema.tables[tableName];
  }

  getColumnMetadata(tableName, columnName) {
    const table = this.schema.tables[tableName];
    return table ? table.columns[columnName] : null;
  }

  translateBusinessTerm(term) {
    const lowerTerm = term.toLowerCase();
    return this.businessTerminology[lowerTerm] || null;
  }

  getBusinessRule(category, rule) {
    return this.businessRules[category] ? this.businessRules[category][rule] : null;
  }

  generateContextForMCP() {
    return {
      database_schema: this.schema,
      business_terminology: this.businessTerminology,
      business_rules: this.businessRules,
      schema_version: "1.2",
      last_updated: new Date().toISOString()
    };
  }
}

module.exports = new EnhancedSchemaConfig();