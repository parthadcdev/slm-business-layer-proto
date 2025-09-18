-- SLM Business Service Layer - Sample Data
-- Author: Partha Chandramohan
-- Description: Sample data for inventory and order management system

-- =======================
-- SAMPLE CUSTOMERS
-- =======================
INSERT INTO customers (customer_code, first_name, last_name, email, phone, customer_type, loyalty_tier, total_orders, total_spent, shipping_address, billing_address) VALUES
('CUST001', 'John', 'Smith', 'john.smith@email.com', '+1-555-0101', 'premium', 3, 15, 2500.00,
 '{"street": "123 Main St", "city": "New York", "state": "NY", "zip": "10001", "country": "USA"}',
 '{"street": "123 Main St", "city": "New York", "state": "NY", "zip": "10001", "country": "USA"}'),
('CUST002', 'Sarah', 'Johnson', 'sarah.johnson@email.com', '+1-555-0102', 'regular', 2, 8, 1200.00,
 '{"street": "456 Oak Ave", "city": "Los Angeles", "state": "CA", "zip": "90210", "country": "USA"}',
 '{"street": "456 Oak Ave", "city": "Los Angeles", "state": "CA", "zip": "90210", "country": "USA"}'),
('CUST003', 'Michael', 'Brown', 'michael.brown@email.com', '+1-555-0103', 'premium', 4, 25, 5000.00,
 '{"street": "789 Pine St", "city": "Chicago", "state": "IL", "zip": "60601", "country": "USA"}',
 '{"street": "789 Pine St", "city": "Chicago", "state": "IL", "zip": "60601", "country": "USA"}'),
('CUST004', 'Emily', 'Davis', 'emily.davis@email.com', '+1-555-0104', 'regular', 1, 3, 450.00,
 '{"street": "321 Elm St", "city": "Houston", "state": "TX", "zip": "77001", "country": "USA"}',
 '{"street": "321 Elm St", "city": "Houston", "state": "TX", "zip": "77001", "country": "USA"}'),
('CUST005', 'David', 'Wilson', 'david.wilson@email.com', '+1-555-0105', 'premium', 5, 40, 8500.00,
 '{"street": "654 Maple Dr", "city": "Phoenix", "state": "AZ", "zip": "85001", "country": "USA"}',
 '{"street": "654 Maple Dr", "city": "Phoenix", "state": "AZ", "zip": "85001", "country": "USA"}');

-- =======================
-- SAMPLE SUPPLIERS
-- =======================
INSERT INTO suppliers (supplier_code, company_name, contact_person, email, phone, rating, on_time_delivery_rate, quality_score, payment_terms, lead_time_days, address) VALUES
('SUP001', 'TechGear Inc', 'Robert Taylor', 'robert@techgear.com', '+1-555-1001', 4.8, 95.5, 4.9, 'Net 30', 5,
 '{"street": "100 Industrial Blvd", "city": "San Francisco", "state": "CA", "zip": "94107", "country": "USA"}'),
('SUP002', 'ElectroSupply Co', 'Lisa Anderson', 'lisa@electrosupply.com', '+1-555-1002', 4.6, 88.2, 4.7, 'Net 15', 7,
 '{"street": "200 Commerce St", "city": "Seattle", "state": "WA", "zip": "98101", "country": "USA"}'),
('SUP003', 'Premium Components Ltd', 'James Chen', 'james@premiumcomp.com', '+1-555-1003', 4.9, 98.1, 4.8, 'Net 45', 3,
 '{"street": "300 Innovation Way", "city": "Austin", "state": "TX", "zip": "78701", "country": "USA"}'),
('SUP004', 'Global Parts Network', 'Maria Rodriguez', 'maria@globalparts.com', '+1-555-1004', 4.2, 82.5, 4.3, 'Net 30', 10,
 '{"street": "400 Distribution Dr", "city": "Miami", "state": "FL", "zip": "33101", "country": "USA"}');

-- =======================
-- SAMPLE CATEGORIES
-- =======================
INSERT INTO categories (category_code, category_name, description) VALUES
('CAT001', 'Electronics', 'Electronic devices and components'),
('CAT002', 'Computers', 'Computer hardware and accessories'),
('CAT003', 'Mobile Devices', 'Smartphones, tablets, and mobile accessories'),
('CAT004', 'Home Appliances', 'Kitchen and household appliances'),
('CAT005', 'Office Supplies', 'Office equipment and supplies'),
('CAT006', 'Audio Equipment', 'Speakers, headphones, and audio accessories'),
('CAT007', 'Gaming', 'Gaming consoles, games, and accessories');

-- Add subcategories
INSERT INTO categories (category_code, category_name, parent_category_id, description) VALUES
('CAT002A', 'Laptops', (SELECT category_id FROM categories WHERE category_code = 'CAT002'), 'Laptop computers'),
('CAT002B', 'Desktops', (SELECT category_id FROM categories WHERE category_code = 'CAT002'), 'Desktop computers'),
('CAT003A', 'Smartphones', (SELECT category_id FROM categories WHERE category_code = 'CAT003'), 'Mobile phones'),
('CAT003B', 'Tablets', (SELECT category_id FROM categories WHERE category_code = 'CAT003'), 'Tablet devices');

-- =======================
-- SAMPLE WAREHOUSES
-- =======================
INSERT INTO warehouses (warehouse_code, warehouse_name, manager_name, capacity, operating_hours, address, contact_info) VALUES
('WH001', 'Main Distribution Center', 'Tom Wilson', 50000,
 '{"monday": "8:00-18:00", "tuesday": "8:00-18:00", "wednesday": "8:00-18:00", "thursday": "8:00-18:00", "friday": "8:00-18:00", "saturday": "9:00-14:00", "sunday": "closed"}',
 '{"street": "1000 Warehouse Blvd", "city": "Denver", "state": "CO", "zip": "80201", "country": "USA"}',
 '{"phone": "+1-555-2001", "email": "warehouse1@company.com"}'),
('WH002', 'West Coast Fulfillment', 'Jennifer Lee', 30000,
 '{"monday": "8:00-18:00", "tuesday": "8:00-18:00", "wednesday": "8:00-18:00", "thursday": "8:00-18:00", "friday": "8:00-18:00", "saturday": "9:00-14:00", "sunday": "closed"}',
 '{"street": "2000 Pacific Ave", "city": "Los Angeles", "state": "CA", "zip": "90021", "country": "USA"}',
 '{"phone": "+1-555-2002", "email": "warehouse2@company.com"}'),
('WH003', 'East Coast Hub', 'Mike Johnson', 40000,
 '{"monday": "8:00-18:00", "tuesday": "8:00-18:00", "wednesday": "8:00-18:00", "thursday": "8:00-18:00", "friday": "8:00-18:00", "saturday": "9:00-14:00", "sunday": "closed"}',
 '{"street": "3000 Atlantic Blvd", "city": "Atlanta", "state": "GA", "zip": "30301", "country": "USA"}',
 '{"phone": "+1-555-2003", "email": "warehouse3@company.com"}');

-- =======================
-- SAMPLE PRODUCTS
-- =======================
INSERT INTO products (sku, product_name, category_id, supplier_id, description, unit_price, cost_price, weight, dimensions, min_stock_level, max_stock_level, reorder_point, reorder_quantity, attributes) VALUES

-- Electronics
('SKU001', 'Wireless Bluetooth Headphones', (SELECT category_id FROM categories WHERE category_code = 'CAT006'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP001'), 'Premium wireless headphones with noise cancellation', 149.99, 75.00, 0.35, '{"length": 18, "width": 15, "height": 8, "unit": "cm"}', 20, 500, 50, 100, '{"color": "Black", "wireless": true, "battery_life": "30 hours"}'),

('SKU002', 'Gaming Mechanical Keyboard', (SELECT category_id FROM categories WHERE category_code = 'CAT007'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP001'), 'RGB mechanical gaming keyboard with Cherry MX switches', 129.99, 65.00, 1.2, '{"length": 44, "width": 13, "height": 4, "unit": "cm"}', 15, 300, 30, 75, '{"switch_type": "Cherry MX Blue", "rgb": true, "wired": true}'),

('SKU003', 'Ultrabook Laptop 15inch', (SELECT category_id FROM categories WHERE category_code = 'CAT002A'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP003'), 'High-performance ultrabook with 16GB RAM and 512GB SSD', 1299.99, 850.00, 1.8, '{"length": 36, "width": 24, "height": 2, "unit": "cm"}', 5, 100, 10, 25, '{"ram": "16GB", "storage": "512GB SSD", "processor": "Intel i7", "screen_size": "15 inch"}'),

('SKU004', 'Smartphone Pro Max', (SELECT category_id FROM categories WHERE category_code = 'CAT003A'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP003'), 'Latest flagship smartphone with advanced camera system', 999.99, 600.00, 0.24, '{"length": 16, "width": 8, "height": 0.8, "unit": "cm"}', 10, 200, 25, 50, '{"storage": "256GB", "camera": "Triple 48MP", "5g": true, "color": "Space Gray"}'),

('SKU005', 'Wireless Mouse Pro', (SELECT category_id FROM categories WHERE category_code = 'CAT002'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP002'), 'Ergonomic wireless mouse with precision tracking', 79.99, 35.00, 0.15, '{"length": 12, "width": 6, "height": 4, "unit": "cm"}', 25, 400, 50, 100, '{"wireless": true, "battery_life": "18 months", "dpi": "4000", "ergonomic": true}'),

('SKU006', 'USB-C Hub Adapter', (SELECT category_id FROM categories WHERE category_code = 'CAT002'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP002'), '7-in-1 USB-C hub with HDMI, USB 3.0, and card readers', 49.99, 22.00, 0.12, '{"length": 11, "width": 4, "height": 1.5, "unit": "cm"}', 30, 500, 60, 150, '{"ports": "7-in-1", "hdmi": "4K@60Hz", "usb_ports": 3, "card_reader": true}'),

('SKU007', 'Tablet 10inch WiFi', (SELECT category_id FROM categories WHERE category_code = 'CAT003B'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP003'), '10-inch tablet with high-resolution display', 449.99, 280.00, 0.5, '{"length": 25, "width": 17, "height": 0.7, "unit": "cm"}', 8, 150, 15, 30, '{"screen_size": "10 inch", "resolution": "2560x1600", "storage": "64GB", "wifi": true}'),

('SKU008', 'Wireless Charger Stand', (SELECT category_id FROM categories WHERE category_code = 'CAT003'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP002'), 'Fast wireless charging stand for smartphones', 39.99, 18.00, 0.25, '{"length": 10, "width": 8, "height": 12, "unit": "cm"}', 40, 600, 80, 200, '{"fast_charging": true, "angle_adjustable": true, "led_indicator": true}'),

('SKU009', 'Bluetooth Speaker Portable', (SELECT category_id FROM categories WHERE category_code = 'CAT006'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP001'), 'Waterproof portable Bluetooth speaker', 89.99, 42.00, 0.6, '{"length": 18, "width": 7, "height": 7, "unit": "cm"}', 20, 350, 40, 100, '{"waterproof": "IPX7", "battery_life": "12 hours", "bluetooth": "5.0"}'),

('SKU010', 'Desktop Computer Tower', (SELECT category_id FROM categories WHERE category_code = 'CAT002B'), (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP003'), 'High-performance desktop computer for gaming and work', 1899.99, 1200.00, 8.5, '{"length": 45, "width": 20, "height": 40, "unit": "cm"}', 3, 50, 8, 15, '{"processor": "Intel i9", "ram": "32GB", "storage": "1TB SSD + 2TB HDD", "graphics": "RTX 4070"}');

-- =======================
-- SAMPLE INVENTORY
-- =======================
INSERT INTO inventory (product_id, warehouse_id, quantity_on_hand, quantity_available, quantity_reserved, quantity_on_order, average_cost, total_value, location_code, bin_location) VALUES

-- Main Distribution Center (WH001)
((SELECT product_id FROM products WHERE sku = 'SKU001'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 150, 125, 25, 50, 75.00, 11250.00, 'A1', 'A1-001'),
((SELECT product_id FROM products WHERE sku = 'SKU002'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 85, 70, 15, 25, 65.00, 5525.00, 'A1', 'A1-002'),
((SELECT product_id FROM products WHERE sku = 'SKU003'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 45, 35, 10, 15, 850.00, 38250.00, 'B1', 'B1-001'),
((SELECT product_id FROM products WHERE sku = 'SKU004'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 75, 50, 25, 30, 600.00, 45000.00, 'B1', 'B1-002'),
((SELECT product_id FROM products WHERE sku = 'SKU005'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 200, 175, 25, 50, 35.00, 7000.00, 'A2', 'A2-001'),

-- West Coast Fulfillment (WH002)
((SELECT product_id FROM products WHERE sku = 'SKU001'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'), 100, 85, 15, 30, 75.00, 7500.00, 'W1', 'W1-001'),
((SELECT product_id FROM products WHERE sku = 'SKU002'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'), 60, 45, 15, 20, 65.00, 3900.00, 'W1', 'W1-002'),
((SELECT product_id FROM products WHERE sku = 'SKU006'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'), 180, 150, 30, 75, 22.00, 3960.00, 'W2', 'W2-001'),
((SELECT product_id FROM products WHERE sku = 'SKU008'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'), 250, 200, 50, 100, 18.00, 4500.00, 'W2', 'W2-002'),
((SELECT product_id FROM products WHERE sku = 'SKU009'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'), 120, 95, 25, 50, 42.00, 5040.00, 'W3', 'W3-001'),

-- East Coast Hub (WH003)
((SELECT product_id FROM products WHERE sku = 'SKU003'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH003'), 25, 15, 10, 20, 850.00, 21250.00, 'E1', 'E1-001'),
((SELECT product_id FROM products WHERE sku = 'SKU004'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH003'), 55, 35, 20, 25, 600.00, 33000.00, 'E1', 'E1-002'),
((SELECT product_id FROM products WHERE sku = 'SKU007'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH003'), 40, 25, 15, 20, 280.00, 11200.00, 'E2', 'E2-001'),
((SELECT product_id FROM products WHERE sku = 'SKU010'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH003'), 18, 12, 6, 10, 1200.00, 21600.00, 'E3', 'E3-001');

-- =======================
-- SAMPLE ORDERS
-- =======================
INSERT INTO orders (order_number, customer_id, status, order_type, priority, subtotal, tax_amount, shipping_amount, total_amount, payment_status, payment_method, shipping_method, warehouse_id, shipping_address, estimated_delivery_date, source_channel) VALUES

('ORD-2024-001', (SELECT customer_id FROM customers WHERE customer_code = 'CUST001'), 'shipped', 'standard', 'normal', 359.97, 28.80, 15.00, 403.77, 'paid', 'Credit Card', 'Standard Shipping', (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'),
 '{"street": "123 Main St", "city": "New York", "state": "NY", "zip": "10001", "country": "USA"}', '2024-12-20', 'online'),

('ORD-2024-002', (SELECT customer_id FROM customers WHERE customer_code = 'CUST002'), 'processing', 'express', 'high', 1299.99, 104.00, 25.00, 1428.99, 'paid', 'PayPal', 'Express Shipping', (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'),
 '{"street": "456 Oak Ave", "city": "Los Angeles", "state": "CA", "zip": "90210", "country": "USA"}', '2024-12-18', 'online'),

('ORD-2024-003', (SELECT customer_id FROM customers WHERE customer_code = 'CUST003'), 'confirmed', 'standard', 'normal', 179.98, 14.40, 12.00, 206.38, 'authorized', 'Credit Card', 'Standard Shipping', (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'),
 '{"street": "789 Pine St", "city": "Chicago", "state": "IL", "zip": "60601", "country": "USA"}', '2024-12-22', 'phone'),

('ORD-2024-004', (SELECT customer_id FROM customers WHERE customer_code = 'CUST004'), 'pending', 'standard', 'normal', 999.99, 80.00, 15.00, 1094.99, 'pending', 'Credit Card', 'Standard Shipping', (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH003'),
 '{"street": "321 Elm St", "city": "Houston", "state": "TX", "zip": "77001", "country": "USA"}', '2024-12-25', 'online'),

('ORD-2024-005', (SELECT customer_id FROM customers WHERE customer_code = 'CUST005'), 'delivered', 'express', 'urgent', 2089.96, 167.20, 30.00, 2287.16, 'paid', 'Credit Card', 'Overnight Shipping', (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'),
 '{"street": "654 Maple Dr", "city": "Phoenix", "state": "AZ", "zip": "85001", "country": "USA"}', '2024-12-15', 'online');

-- =======================
-- SAMPLE ORDER ITEMS
-- =======================
INSERT INTO order_items (order_id, product_id, sku, product_name, quantity, unit_price, line_total, warehouse_id, inventory_reserved, shipped_quantity) VALUES

-- Order 1 items
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-001'), (SELECT product_id FROM products WHERE sku = 'SKU001'), 'SKU001', 'Wireless Bluetooth Headphones', 1, 149.99, 149.99, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), true, 1),
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-001'), (SELECT product_id FROM products WHERE sku = 'SKU002'), 'SKU002', 'Gaming Mechanical Keyboard', 1, 129.99, 129.99, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), true, 1),
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-001'), (SELECT product_id FROM products WHERE sku = 'SKU005'), 'SKU005', 'Wireless Mouse Pro', 1, 79.99, 79.99, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), true, 1),

-- Order 2 items
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-002'), (SELECT product_id FROM products WHERE sku = 'SKU003'), 'SKU003', 'Ultrabook Laptop 15inch', 1, 1299.99, 1299.99, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'), true, 0),

-- Order 3 items
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-003'), (SELECT product_id FROM products WHERE sku = 'SKU008'), 'SKU008', 'Wireless Charger Stand', 2, 39.99, 79.98, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), true, 0),
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-003'), (SELECT product_id FROM products WHERE sku = 'SKU006'), 'SKU006', 'USB-C Hub Adapter', 2, 49.99, 99.98, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), true, 0),

-- Order 4 items
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-004'), (SELECT product_id FROM products WHERE sku = 'SKU004'), 'SKU004', 'Smartphone Pro Max', 1, 999.99, 999.99, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH003'), false, 0),

-- Order 5 items
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-005'), (SELECT product_id FROM products WHERE sku = 'SKU003'), 'SKU003', 'Ultrabook Laptop 15inch', 1, 1299.99, 1299.99, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), true, 1),
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-005'), (SELECT product_id FROM products WHERE sku = 'SKU009'), 'SKU009', 'Bluetooth Speaker Portable', 1, 89.99, 89.99, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), true, 1),
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-005'), (SELECT product_id FROM products WHERE sku = 'SKU007'), 'SKU007', 'Tablet 10inch WiFi', 1, 449.99, 449.99, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH003'), true, 1),
((SELECT order_id FROM orders WHERE order_number = 'ORD-2024-005'), (SELECT product_id FROM products WHERE sku = 'SKU006'), 'SKU006', 'USB-C Hub Adapter', 5, 49.99, 249.99, (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'), true, 5);

-- =======================
-- SAMPLE INVENTORY TRANSACTIONS
-- =======================
INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, reference_type, quantity_change, quantity_before, quantity_after, unit_cost, total_cost, reason_code, notes, created_at) VALUES

-- Recent stock receipts
((SELECT product_id FROM products WHERE sku = 'SKU001'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 'receipt', 'purchase_order', 50, 100, 150, 75.00, 3750.00, 'RESTOCK', 'Weekly restock delivery', CURRENT_TIMESTAMP - INTERVAL '3 days'),
((SELECT product_id FROM products WHERE sku = 'SKU002'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 'receipt', 'purchase_order', 25, 60, 85, 65.00, 1625.00, 'RESTOCK', 'Weekly restock delivery', CURRENT_TIMESTAMP - INTERVAL '3 days'),

-- Recent shipments
((SELECT product_id FROM products WHERE sku = 'SKU001'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 'shipment', 'sales_order', -1, 151, 150, 75.00, -75.00, 'SALE', 'Order ORD-2024-001', CURRENT_TIMESTAMP - INTERVAL '1 day'),
((SELECT product_id FROM products WHERE sku = 'SKU002'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 'shipment', 'sales_order', -1, 86, 85, 65.00, -65.00, 'SALE', 'Order ORD-2024-001', CURRENT_TIMESTAMP - INTERVAL '1 day'),

-- Inventory adjustments
((SELECT product_id FROM products WHERE sku = 'SKU005'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 'adjustment', 'adjustment', -5, 205, 200, 35.00, -175.00, 'DAMAGE', 'Damaged during handling', CURRENT_TIMESTAMP - INTERVAL '2 days'),

-- Stock transfers
((SELECT product_id FROM products WHERE sku = 'SKU006'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 'transfer', 'transfer_order', -50, 100, 50, 22.00, -1100.00, 'TRANSFER_OUT', 'Transfer to WH002', CURRENT_TIMESTAMP - INTERVAL '5 days'),
((SELECT product_id FROM products WHERE sku = 'SKU006'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'), 'transfer', 'transfer_order', 50, 130, 180, 22.00, 1100.00, 'TRANSFER_IN', 'Transfer from WH001', CURRENT_TIMESTAMP - INTERVAL '5 days');

-- =======================
-- SAMPLE PURCHASE ORDERS
-- =======================
INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, expected_delivery_date, subtotal, tax_amount, total_amount, payment_terms, notes, created_at) VALUES

('PO-2024-001', (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP001'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 'received', '2024-12-14', 8750.00, 700.00, 9450.00, 'Net 30', 'Weekly restock order for electronics', CURRENT_TIMESTAMP - INTERVAL '5 days'),
('PO-2024-002', (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP002'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH002'), 'shipped', '2024-12-19', 3300.00, 264.00, 3564.00, 'Net 15', 'Restock for accessories', CURRENT_TIMESTAMP - INTERVAL '2 days'),
('PO-2024-003', (SELECT supplier_id FROM suppliers WHERE supplier_code = 'SUP003'), (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH001'), 'sent', '2024-12-22', 25500.00, 2040.00, 27540.00, 'Net 45', 'High-value electronics order', CURRENT_TIMESTAMP - INTERVAL '1 day');

-- =======================
-- SAMPLE PURCHASE ORDER ITEMS
-- =======================
INSERT INTO purchase_order_items (po_id, product_id, sku, product_name, quantity_ordered, quantity_received, unit_cost, line_total) VALUES

-- PO-2024-001 items (received)
((SELECT po_id FROM purchase_orders WHERE po_number = 'PO-2024-001'), (SELECT product_id FROM products WHERE sku = 'SKU001'), 'SKU001', 'Wireless Bluetooth Headphones', 50, 50, 75.00, 3750.00),
((SELECT po_id FROM purchase_orders WHERE po_number = 'PO-2024-001'), (SELECT product_id FROM products WHERE sku = 'SKU002'), 'SKU002', 'Gaming Mechanical Keyboard', 25, 25, 65.00, 1625.00),
((SELECT po_id FROM purchase_orders WHERE po_number = 'PO-2024-001'), (SELECT product_id FROM products WHERE sku = 'SKU009'), 'SKU009', 'Bluetooth Speaker Portable', 50, 50, 42.00, 2100.00),
((SELECT po_id FROM purchase_orders WHERE po_number = 'PO-2024-001'), (SELECT product_id FROM products WHERE sku = 'SKU005'), 'SKU005', 'Wireless Mouse Pro', 40, 40, 35.00, 1400.00),

-- PO-2024-002 items (in transit)
((SELECT po_id FROM purchase_orders WHERE po_number = 'PO-2024-002'), (SELECT product_id FROM products WHERE sku = 'SKU006'), 'SKU006', 'USB-C Hub Adapter', 75, 0, 22.00, 1650.00),
((SELECT po_id FROM purchase_orders WHERE po_number = 'PO-2024-002'), (SELECT product_id FROM products WHERE sku = 'SKU008'), 'SKU008', 'Wireless Charger Stand', 100, 0, 18.00, 1800.00),

-- PO-2024-003 items (pending)
((SELECT po_id FROM purchase_orders WHERE po_number = 'PO-2024-003'), (SELECT product_id FROM products WHERE sku = 'SKU003'), 'SKU003', 'Ultrabook Laptop 15inch', 15, 0, 850.00, 12750.00),
((SELECT po_id FROM purchase_orders WHERE po_number = 'PO-2024-003'), (SELECT product_id FROM products WHERE sku = 'SKU004'), 'SKU004', 'Smartphone Pro Max', 20, 0, 600.00, 12000.00),
((SELECT po_id FROM purchase_orders WHERE po_number = 'PO-2024-003'), (SELECT product_id FROM products WHERE sku = 'SKU010'), 'SKU010', 'Desktop Computer Tower', 10, 0, 1200.00, 12000.00);

-- =======================
-- UPDATE CUSTOMER STATS
-- =======================
UPDATE customers SET
    last_order_date = CURRENT_TIMESTAMP - INTERVAL '1 day',
    total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = customers.customer_id),
    total_spent = (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE customer_id = customers.customer_id AND status != 'cancelled');

-- =======================
-- CREATE SOME LOW STOCK SCENARIOS
-- =======================
-- Make some products low stock to trigger alerts
UPDATE inventory SET
    quantity_on_hand = 8,
    quantity_available = 5,
    quantity_reserved = 3
WHERE product_id = (SELECT product_id FROM products WHERE sku = 'SKU010')
AND warehouse_id = (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH003');

UPDATE inventory SET
    quantity_on_hand = 12,
    quantity_available = 8,
    quantity_reserved = 4
WHERE product_id = (SELECT product_id FROM products WHERE sku = 'SKU007')
AND warehouse_id = (SELECT warehouse_id FROM warehouses WHERE warehouse_code = 'WH003');