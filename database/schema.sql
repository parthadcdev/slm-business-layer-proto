-- SLM Business Service Layer - PostgreSQL Database Schema
-- Author: Partha Chandramohan
-- Description: Database schema for inventory and order management system

-- Create database (run this separately if needed)
-- CREATE DATABASE business_app;

-- Use the database
-- \c business_app;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =======================
-- CUSTOMERS TABLE
-- =======================
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_code VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    customer_type VARCHAR(20) DEFAULT 'regular' CHECK (customer_type IN ('premium', 'regular', 'guest')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    loyalty_tier INTEGER DEFAULT 1 CHECK (loyalty_tier BETWEEN 1 AND 5),
    total_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(12,2) DEFAULT 0.00,
    last_order_date TIMESTAMP,
    shipping_address JSONB,
    billing_address JSONB,
    preferences JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- SUPPLIERS TABLE
-- =======================
CREATE TABLE suppliers (
    supplier_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_code VARCHAR(20) UNIQUE NOT NULL,
    company_name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address JSONB,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    rating DECIMAL(3,2) DEFAULT 5.00 CHECK (rating BETWEEN 0 AND 5),
    on_time_delivery_rate DECIMAL(5,2) DEFAULT 100.00,
    quality_score DECIMAL(3,2) DEFAULT 5.00,
    payment_terms VARCHAR(50),
    lead_time_days INTEGER DEFAULT 7,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- CATEGORIES TABLE
-- =======================
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_code VARCHAR(20) UNIQUE NOT NULL,
    category_name VARCHAR(50) NOT NULL,
    parent_category_id UUID REFERENCES categories(category_id),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- PRODUCTS TABLE
-- =======================
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    category_id UUID REFERENCES categories(category_id),
    supplier_id UUID REFERENCES suppliers(supplier_id),
    description TEXT,
    unit_price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) NOT NULL,
    weight DECIMAL(8,3),
    dimensions JSONB, -- {length, width, height, unit}
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
    is_serialized BOOLEAN DEFAULT false,
    min_stock_level INTEGER DEFAULT 10,
    max_stock_level INTEGER DEFAULT 1000,
    reorder_point INTEGER DEFAULT 20,
    reorder_quantity INTEGER DEFAULT 100,
    lead_time_days INTEGER DEFAULT 7,
    attributes JSONB, -- Color, Size, Material, etc.
    images JSONB, -- Array of image URLs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- WAREHOUSES TABLE
-- =======================
CREATE TABLE warehouses (
    warehouse_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_code VARCHAR(20) UNIQUE NOT NULL,
    warehouse_name VARCHAR(100) NOT NULL,
    address JSONB,
    manager_name VARCHAR(100),
    contact_info JSONB,
    capacity INTEGER,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    operating_hours JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- INVENTORY TABLE
-- =======================
CREATE TABLE inventory (
    inventory_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(product_id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(warehouse_id),
    quantity_on_hand INTEGER NOT NULL DEFAULT 0,
    quantity_available INTEGER NOT NULL DEFAULT 0,
    quantity_reserved INTEGER NOT NULL DEFAULT 0,
    quantity_on_order INTEGER NOT NULL DEFAULT 0,
    last_counted_date TIMESTAMP,
    last_counted_quantity INTEGER,
    average_cost DECIMAL(10,2),
    total_value DECIMAL(12,2),
    location_code VARCHAR(50),
    bin_location VARCHAR(50),
    expiry_date DATE,
    batch_number VARCHAR(50),
    serial_numbers JSONB, -- Array for serialized products
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, warehouse_id, batch_number)
);

-- =======================
-- ORDERS TABLE
-- =======================
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(customer_id),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
    order_type VARCHAR(20) DEFAULT 'standard' CHECK (order_type IN ('standard', 'express', 'bulk', 'subscription')),
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    subtotal DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    shipping_amount DECIMAL(10,2) DEFAULT 0.00,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'authorized', 'paid', 'refunded', 'failed')),
    payment_method VARCHAR(50),
    shipping_method VARCHAR(50),
    tracking_number VARCHAR(100),
    warehouse_id UUID REFERENCES warehouses(warehouse_id),
    shipping_address JSONB,
    billing_address JSONB,
    special_instructions TEXT,
    source_channel VARCHAR(50) DEFAULT 'online',
    sales_rep_id UUID,
    estimated_delivery_date DATE,
    actual_delivery_date DATE,
    cancelled_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- ORDER ITEMS TABLE
-- =======================
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    sku VARCHAR(50) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    line_total DECIMAL(12,2) NOT NULL,
    warehouse_id UUID REFERENCES warehouses(warehouse_id),
    inventory_reserved BOOLEAN DEFAULT false,
    shipped_quantity INTEGER DEFAULT 0,
    returned_quantity INTEGER DEFAULT 0,
    serial_numbers JSONB, -- For serialized products
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- INVENTORY TRANSACTIONS TABLE
-- =======================
CREATE TABLE inventory_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(product_id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(warehouse_id),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('receipt', 'shipment', 'adjustment', 'transfer', 'return', 'cycle_count')),
    reference_type VARCHAR(20) CHECK (reference_type IN ('purchase_order', 'sales_order', 'transfer_order', 'adjustment', 'return')),
    reference_id UUID,
    quantity_change INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    unit_cost DECIMAL(10,2),
    total_cost DECIMAL(12,2),
    reason_code VARCHAR(50),
    notes TEXT,
    user_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- PURCHASE ORDERS TABLE
-- =======================
CREATE TABLE purchase_orders (
    po_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(warehouse_id),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'acknowledged', 'shipped', 'received', 'cancelled')),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    subtotal DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    shipping_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_terms VARCHAR(100),
    shipping_terms VARCHAR(100),
    notes TEXT,
    created_by UUID,
    approved_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- PURCHASE ORDER ITEMS TABLE
-- =======================
CREATE TABLE purchase_order_items (
    po_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id UUID NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    sku VARCHAR(50) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
    quantity_received INTEGER DEFAULT 0,
    unit_cost DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- INDEXES FOR PERFORMANCE
-- =======================

-- Customer indexes
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_customer_code ON customers(customer_code);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_loyalty_tier ON customers(loyalty_tier);

-- Product indexes
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_status ON products(status);

-- Inventory indexes
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX idx_inventory_product_warehouse ON inventory(product_id, warehouse_id);

-- Order indexes
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_date ON orders(order_date);
CREATE INDEX idx_orders_order_number ON orders(order_number);

-- Order items indexes
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- Transaction indexes
CREATE INDEX idx_inventory_transactions_product ON inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_warehouse ON inventory_transactions(warehouse_id);
CREATE INDEX idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_inventory_transactions_date ON inventory_transactions(created_at);

-- =======================
-- TRIGGERS FOR AUTOMATION
-- =======================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to relevant tables
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_order_items_updated_at BEFORE UPDATE ON purchase_order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =======================
-- VIEWS FOR COMMON QUERIES
-- =======================

-- Inventory summary view
CREATE VIEW inventory_summary AS
SELECT
    p.sku,
    p.product_name,
    c.category_name,
    w.warehouse_name,
    i.quantity_on_hand,
    i.quantity_available,
    i.quantity_reserved,
    i.quantity_on_order,
    p.min_stock_level,
    p.reorder_point,
    CASE
        WHEN i.quantity_available <= p.min_stock_level THEN 'Low Stock'
        WHEN i.quantity_available <= p.reorder_point THEN 'Reorder Soon'
        ELSE 'In Stock'
    END as stock_status,
    i.total_value,
    i.updated_at as last_updated
FROM inventory i
JOIN products p ON i.product_id = p.product_id
JOIN categories c ON p.category_id = c.category_id
JOIN warehouses w ON i.warehouse_id = w.warehouse_id
WHERE p.status = 'active' AND w.status = 'active';

-- Order summary view
CREATE VIEW order_summary AS
SELECT
    o.order_number,
    o.order_date,
    o.status,
    o.priority,
    CONCAT(c.first_name, ' ', c.last_name) as customer_name,
    c.customer_code,
    c.customer_type,
    o.total_amount,
    o.payment_status,
    w.warehouse_name,
    COUNT(oi.order_item_id) as item_count,
    o.estimated_delivery_date,
    o.actual_delivery_date
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN warehouses w ON o.warehouse_id = w.warehouse_id
LEFT JOIN order_items oi ON o.order_id = oi.order_id
GROUP BY o.order_id, c.first_name, c.last_name, c.customer_code, c.customer_type, w.warehouse_name;

-- Low stock alert view
CREATE VIEW low_stock_alerts AS
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
    s.lead_time_days,
    i.updated_at as last_updated
FROM inventory i
JOIN products p ON i.product_id = p.product_id
JOIN categories c ON p.category_id = c.category_id
JOIN warehouses w ON i.warehouse_id = w.warehouse_id
LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
WHERE i.quantity_available <= p.reorder_point
AND p.status = 'active'
AND w.status = 'active'
ORDER BY i.quantity_available ASC;