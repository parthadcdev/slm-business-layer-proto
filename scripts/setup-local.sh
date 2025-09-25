#!/bin/bash

# SLM Business Service Layer - Local Setup Script
# This script sets up the complete local development environment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="SLM Business Service Layer"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS_DIR="$PROJECT_DIR/models"
DATA_DIR="$PROJECT_DIR/data"
LOGS_DIR="$PROJECT_DIR/logs"
CHROMA_DATA_DIR="$PROJECT_DIR/chroma_data"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check system requirements
check_requirements() {
    print_status "Checking system requirements..."

    local errors=0

    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        print_success "Node.js found: v$NODE_VERSION"
    else
        print_error "Node.js is required but not installed"
        errors=$((errors + 1))
    fi

    # Check npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        print_success "npm found: v$NPM_VERSION"
    else
        print_error "npm is required but not installed"
        errors=$((errors + 1))
    fi

    # Check Python
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
        print_success "Python found: v$PYTHON_VERSION"
    else
        print_error "Python 3 is required but not installed"
        errors=$((errors + 1))
    fi

    # Check pip
    if command_exists pip3; then
        PIP_VERSION=$(pip3 --version | cut -d' ' -f2)
        print_success "pip found: v$PIP_VERSION"
    else
        print_error "pip3 is required but not installed"
        errors=$((errors + 1))
    fi

    # Check Docker
    if command_exists podman; then
        DOCKER_VERSION=$(podman --version | cut -d' ' -f3 | cut -d',' -f1)
        print_success "Docker found: v$DOCKER_VERSION"
    else
        print_warning "Docker not found. Some features may not work without Docker."
    fi

    # Check Docker Compose
    if command_exists podman-compose; then
        COMPOSE_VERSION=$(podman-compose --version | cut -d' ' -f3 | cut -d',' -f1)
        print_success "Docker Compose found: v$COMPOSE_VERSION"
    else
        print_warning "Docker Compose not found. Some features may not work without Docker Compose."
    fi

    # Check curl
    if command_exists curl; then
        print_success "curl found"
    else
        print_error "curl is required but not installed"
        errors=$((errors + 1))
    fi

    if [ $errors -gt 0 ]; then
        print_error "Please install the missing requirements and run this script again."
        exit 1
    fi

    print_success "All requirements satisfied!"
}

# Function to create directory structure
create_directories() {
    print_status "Creating directory structure..."

    # Create main directories
    mkdir -p "$MODELS_DIR/embeddings"
    mkdir -p "$DATA_DIR"
    mkdir -p "$LOGS_DIR"
    mkdir -p "$CHROMA_DATA_DIR"
    mkdir -p "$PROJECT_DIR/backups"
    mkdir -p "$PROJECT_DIR/certs"
    mkdir -p "$PROJECT_DIR/config/nginx"
    mkdir -p "$PROJECT_DIR/config/traefik"
    mkdir -p "$PROJECT_DIR/config/prometheus"
    mkdir -p "$PROJECT_DIR/config/grafana/provisioning"
    mkdir -p "$PROJECT_DIR/config/logstash/pipeline"

    print_success "Directory structure created!"
}

# Function to install Node.js dependencies
install_node_dependencies() {
    print_status "Installing Node.js dependencies..."

    cd "$PROJECT_DIR"

    # Create package.json if it doesn't exist
    if [ ! -f "package.json" ]; then
        cat > package.json << 'EOF'
{
  "name": "slm-business-layer",
  "version": "1.0.0",
  "description": "SLM-Powered Business Service Layer",
  "main": "src/orchestration/app.js",
  "scripts": {
    "start": "node src/orchestration/app.js",
    "dev": "nodemon src/orchestration/app.js",
    "test": "jest",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.8.1",
    "jsonwebtoken": "^9.0.1",
    "bcryptjs": "^2.4.3",
    "validator": "^13.9.0",
    "xss": "^1.0.14",
    "axios": "^1.4.0",
    "redis": "^4.6.7",
    "pg": "^8.11.1",
    "sqlite3": "^5.1.6",
    "chromadb": "^1.5.0",
    "mammoth": "^1.5.1",
    "pdf-parse": "^1.1.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.1",
    "eslint": "^8.44.0",
    "prettier": "^3.0.0"
  }
}
EOF
    fi

    npm install

    print_success "Node.js dependencies installed!"
}

# Function to install Python dependencies
install_python_dependencies() {
    print_status "Installing Python dependencies..."

    cd "$PROJECT_DIR"

    # Create requirements.txt if it doesn't exist
    if [ ! -f "requirements.txt" ]; then
        cat > requirements.txt << 'EOF'
# Core dependencies
fastapi==0.101.0
uvicorn==0.23.0
pydantic==2.0.0
python-multipart==0.0.6

# SLM and AI
sentence-transformers==2.2.2
transformers==4.31.0
torch==2.0.1
numpy==1.24.3

# Vector database
chromadb==0.4.0
qdrant-client==1.4.0

# Data processing
pandas==2.0.3
python-docx==0.8.11
PyPDF2==3.0.1
openpyxl==3.1.2

# Database
psycopg2-binary==2.9.7
sqlalchemy==2.0.19
alembic==1.11.1

# Authentication and security
python-jose==3.3.0
passlib==1.7.4
bcrypt==4.0.1

# HTTP and API
httpx==0.24.1
requests==2.31.0

# Configuration and logging
pyyaml==6.0.1
python-dotenv==1.0.0
structlog==23.1.0

# Testing
pytest==7.4.0
pytest-asyncio==0.21.1
httpx==0.24.1

# Development
black==23.7.0
flake8==6.0.0
mypy==1.4.1
EOF
    fi

    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        print_status "Creating Python virtual environment..."
        python3 -m venv venv
    fi

    # Activate virtual environment and install dependencies
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt

    print_success "Python dependencies installed!"
}

# Function to install Ollama
install_ollama() {
    print_status "Installing Ollama..."

    if command_exists ollama; then
        print_success "Ollama is already installed"
        return
    fi

    # Install Ollama
    curl -fsSL https://ollama.com/install.sh | sh

    # Wait a moment for installation to complete
    sleep 2

    if command_exists ollama; then
        print_success "Ollama installed successfully!"
    else
        print_error "Ollama installation failed"
        return 1
    fi
}

# Function to download and setup SLM models
setup_models() {
    print_status "Setting up SLM models..."

    # Start Ollama service in background if not running
    if ! pgrep -x "ollama" > /dev/null; then
        print_status "Starting Ollama service..."
        ollama serve &
        sleep 5
    fi

    # Download models
    print_status "Downloading Llama 3.2 3B model (this may take a while)..."
    ollama pull llama3.2:3b

    print_status "Downloading Mistral 7B model (this may take a while)..."
    ollama pull mistral:7b

    print_status "Downloading CodeLlama 7B model (this may take a while)..."
    ollama pull codellama:7b

    print_success "SLM models downloaded successfully!"
}

# Function to setup environment variables
setup_environment() {
    print_status "Setting up environment variables..."

    cd "$PROJECT_DIR"

    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        cat > .env << 'EOF'
# Application Configuration
NODE_ENV=development
PORT=8000
LOG_LEVEL=info
LOG_DIR=./logs

# Security
JWT_SECRET=your-super-secret-jwt-key-change-in-production-please
ENCRYPTION_KEY=your-32-character-encryption-key

# Database Configuration
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=business_app
DB_USER=app_user
DB_PASSWORD=app_password
POSTGRES_URL=postgresql://app_user:app_password@localhost:5432/business_app

# Alternative SQLite for development
SQLITE_PATH=./data/app.db

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Ollama Configuration
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# ChromaDB Configuration
CHROMADB_URL=http://localhost:8000
CHROMA_PERSIST_DIRECTORY=./chroma_data

# Embedding Service Configuration
EMBEDDING_SERVICE_URL=http://localhost:8001
EMBEDDING_MODEL=all-MiniLM-L6-v2

# API Configuration
API_TIMEOUT=30000
MAX_REQUEST_SIZE=10mb

# Monitoring Configuration
PROMETHEUS_URL=http://localhost:9090
GRAFANA_URL=http://localhost:3000

# External Services (configure as needed)
OPENAI_API_KEY=
HUGGINGFACE_API_KEY=

# OAuth Configuration (if using)
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
OAUTH_REDIRECT_URI=http://localhost:8000/auth/callback
EOF
    fi

    # Create .env.local for local overrides
    if [ ! -f ".env.local" ]; then
        cat > .env.local << 'EOF'
# Local development overrides
NODE_ENV=development
LOG_LEVEL=debug
DB_TYPE=sqlite
SQLITE_PATH=./data/app.db
EOF
    fi

    print_success "Environment variables configured!"
}

# Function to initialize databases
initialize_databases() {
    print_status "Initializing databases..."

    cd "$PROJECT_DIR"

    # Create SQLite database for development
    mkdir -p "$DATA_DIR"

    # Create a simple initialization script for SQLite
    cat > "$DATA_DIR/init.sql" << 'EOF'
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    department TEXT,
    active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    total_amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    user_id TEXT,
    changes TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT OR IGNORE INTO users (id, username, email, password_hash, role, department) VALUES
('1', 'admin', 'admin@company.com', '$2a$10$example_hash_admin', 'admin', 'IT'),
('2', 'manager', 'manager@company.com', '$2a$10$example_hash_manager', 'manager', 'Business'),
('3', 'employee', 'employee@company.com', '$2a$10$example_hash_employee', 'employee', 'Operations');

INSERT OR IGNORE INTO products (id, name, description, price, stock_quantity) VALUES
('1', 'Sample Product A', 'A sample product for testing', 29.99, 100),
('2', 'Sample Product B', 'Another sample product', 49.99, 50),
('3', 'Sample Service', 'A sample service offering', 99.99, 999);
EOF

    # Initialize SQLite database
    if command_exists sqlite3; then
        sqlite3 "$DATA_DIR/app.db" < "$DATA_DIR/init.sql"
        print_success "SQLite database initialized!"
    else
        print_warning "SQLite3 not found. Database initialization skipped."
    fi

    print_success "Database initialization completed!"
}

# Function to create sample business requirements
create_sample_documents() {
    print_status "Creating sample business requirements documents..."

    mkdir -p "$DATA_DIR/documents"

    # Create sample BRD
    cat > "$DATA_DIR/documents/sample_brd.md" << 'EOF'
# Sample Business Requirements Document

## Overview
This document outlines the business requirements for the SLM-powered business service layer.

## Business Rules

### User Management
- BR-001: Users must authenticate before accessing the system
- BR-002: User roles determine access permissions
- BR-003: User sessions expire after 24 hours of inactivity

### Order Processing
- BR-004: Orders must have at least one item
- BR-005: Order total must be greater than zero
- BR-006: Orders can only be cancelled if status is 'pending'
- BR-007: Payment must be processed before order confirmation

### Product Management
- BR-008: Products must have a valid price
- BR-009: Stock quantity cannot be negative
- BR-010: Discontinued products cannot be ordered

## Functional Requirements

### User Stories
- As a customer, I want to place orders so that I can purchase products
- As a manager, I want to view order reports so that I can track business performance
- As an admin, I want to manage user accounts so that I can control access

### API Requirements
- REQ-001: System shall provide REST API for order management
- REQ-002: System shall validate all input data
- REQ-003: System shall log all business transactions
- REQ-004: System shall provide real-time order status updates

## Acceptance Criteria

### Order Creation
- Given a valid user and product selection
- When the user submits an order
- Then the system creates an order with pending status
- And the system reduces product inventory
- And the system sends confirmation notification

### Payment Processing
- Given a pending order with valid payment information
- When payment is processed successfully
- Then order status is updated to confirmed
- And customer receives payment confirmation
- And inventory is committed
EOF

    # Create sample API documentation
    cat > "$DATA_DIR/documents/api_docs.md" << 'EOF'
# API Documentation

## Authentication Endpoints

### POST /auth/login
Authenticate user and return JWT token.

**Request:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "string",
  "user": {
    "id": "string",
    "username": "string",
    "role": "string"
  }
}
```

## Business Endpoints

### POST /api/business-request
Process business logic request using SLM.

**Request:**
```json
{
  "request": "string",
  "context": {
    "userId": "string",
    "sessionId": "string"
  }
}
```

### GET /api/orders
Retrieve user orders.

**Parameters:**
- `status`: Filter by order status
- `limit`: Maximum number of results
- `offset`: Pagination offset

### POST /api/orders
Create a new order.

**Request:**
```json
{
  "items": [
    {
      "productId": "string",
      "quantity": "number",
      "price": "number"
    }
  ],
  "totalAmount": "number"
}
```
EOF

    print_success "Sample documents created!"
}

# Function to test the setup
test_setup() {
    print_status "Testing the setup..."

    local errors=0

    # Test Ollama
    if command_exists ollama; then
        if ollama list > /dev/null 2>&1; then
            print_success "Ollama is working correctly"
        else
            print_error "Ollama is not responding"
            errors=$((errors + 1))
        fi
    fi

    # Test Node.js setup
    cd "$PROJECT_DIR"
    if [ -f "package.json" ] && [ -d "node_modules" ]; then
        print_success "Node.js setup is complete"
    else
        print_error "Node.js setup is incomplete"
        errors=$((errors + 1))
    fi

    # Test Python setup
    if [ -d "venv" ] && [ -f "requirements.txt" ]; then
        print_success "Python setup is complete"
    else
        print_error "Python setup is incomplete"
        errors=$((errors + 1))
    fi

    # Test database
    if [ -f "$DATA_DIR/app.db" ]; then
        print_success "Database is initialized"
    else
        print_warning "Database may not be properly initialized"
    fi

    if [ $errors -eq 0 ]; then
        print_success "Setup test completed successfully!"
    else
        print_warning "Setup test found $errors issues. Please review the output above."
    fi
}

# Function to display next steps
show_next_steps() {
    echo
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Setup Complete! Next Steps:${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo
    echo -e "${BLUE}1. Start the services:${NC}"
    echo "   # Option A: Using Docker Compose (recommended)"
    echo "   podman-compose up -d"
    echo
    echo "   # Option B: Start services individually"
    echo "   ollama serve                     # Terminal 1"
    echo "   npm run dev                      # Terminal 2"
    echo
    echo -e "${BLUE}2. Initialize ChromaDB and load documents:${NC}"
    echo "   python scripts/init-rag-db.py"
    echo
    echo -e "${BLUE}3. Test the API:${NC}"
    echo "   curl http://localhost:8000/health"
    echo
    echo -e "${BLUE}4. Access the services:${NC}"
    echo "   - Main API: http://localhost:8000"
    echo "   - Ollama: http://localhost:11434"
    echo "   - ChromaDB: http://localhost:8000"
    echo "   - Traefik Dashboard: http://localhost:8080 (when using Docker)"
    echo "   - Grafana: http://localhost:3000 (when using monitoring)"
    echo
    echo -e "${BLUE}5. View logs:${NC}"
    echo "   tail -f logs/main-$(date +%Y-%m-%d).log"
    echo
    echo -e "${YELLOW}Note: Modify .env file with your specific configuration${NC}"
    echo -e "${YELLOW}before starting in production.${NC}"
    echo
}

# Main execution
main() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  $PROJECT_NAME${NC}"
    echo -e "${GREEN}  Local Setup Script${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo

    check_requirements
    create_directories
    install_node_dependencies
    install_python_dependencies
    install_ollama
    setup_environment
    initialize_databases
    create_sample_documents
    setup_models
    test_setup
    show_next_steps

    print_success "Local setup completed successfully!"
}

# Handle script interruption
trap 'print_error "Setup interrupted by user"; exit 1' INT TERM

# Run main function
main "$@"