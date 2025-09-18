#!/bin/bash

# SLM Business Service Layer - Local Teardown Script
# This script tears down the complete local development environment

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

# Function to confirm teardown
confirm_teardown() {
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}  WARNING: TEARDOWN OPERATION${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo
    echo -e "${RED}This will completely remove:${NC}"
    echo "  • All Docker containers and volumes"
    echo "  • All Ollama models and data"
    echo "  • All Node.js processes and dependencies"
    echo "  • Python virtual environment"
    echo "  • All databases and data files"
    echo "  • All logs and temporary files"
    echo "  • All configuration files"
    echo
    echo -e "${YELLOW}This action cannot be undone!${NC}"
    echo
    read -p "Are you sure you want to proceed? (type 'yes' to confirm): " confirmation

    if [ "$confirmation" != "yes" ]; then
        print_status "Teardown cancelled by user"
        exit 0
    fi

    echo
    print_status "Proceeding with teardown..."
}

# Function to stop and remove Docker containers
teardown_docker() {
    print_status "Stopping and removing Docker containers..."

    cd "$PROJECT_DIR"

    # Stop all running containers
    if [ -f "docker-compose.yml" ]; then
        print_status "Stopping Docker Compose services..."
        docker-compose down --volumes --remove-orphans 2>/dev/null || true

        # Remove specific project containers if they exist
        docker-compose down --volumes --rmi all 2>/dev/null || true
    fi

    # Stop specific containers by name
    CONTAINERS=("slm-postgres" "slm-chromadb" "slm-ollama" "slm-redis" "slm-orchestration" "slm-embedding" "slm-traefik" "slm-nginx" "slm-prometheus" "slm-grafana" "slm-elasticsearch" "slm-logstash" "slm-kibana" "slm-zap")

    for container in "${CONTAINERS[@]}"; do
        if docker ps -a --format "table {{.Names}}" | grep -q "^$container$"; then
            print_status "Stopping and removing container: $container"
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
        fi
    done

    # Remove project-specific volumes
    VOLUMES=("postgres_data" "redis_data" "prometheus_data" "grafana_data" "elasticsearch_data" "embedding_models" "embedding_cache")

    for volume in "${VOLUMES[@]}"; do
        if docker volume ls --format "table {{.Name}}" | grep -q "^.*$volume$"; then
            print_status "Removing volume: $volume"
            docker volume rm "$(docker volume ls --format "table {{.Name}}" | grep "$volume")" 2>/dev/null || true
        fi
    done

    # Remove project network
    if docker network ls --format "table {{.Name}}" | grep -q "slm-network"; then
        print_status "Removing Docker network: slm-network"
        docker network rm slm-network 2>/dev/null || true
    fi

    # Clean up unused Docker resources
    print_status "Cleaning up unused Docker resources..."
    docker system prune -f --volumes 2>/dev/null || true

    print_success "Docker teardown completed!"
}

# Function to stop Node.js processes
stop_node_processes() {
    print_status "Stopping Node.js processes..."

    # Stop Node.js processes by name
    pkill -f "node.*orchestration" 2>/dev/null || true
    pkill -f "node.*app.js" 2>/dev/null || true
    pkill -f "nodemon" 2>/dev/null || true
    pkill -f "npm.*dev" 2>/dev/null || true
    pkill -f "npm.*start" 2>/dev/null || true

    # Wait a moment for processes to stop
    sleep 2

    # Force kill if any are still running
    pkill -9 -f "node.*orchestration" 2>/dev/null || true
    pkill -9 -f "nodemon" 2>/dev/null || true

    print_success "Node.js processes stopped!"
}

# Function to stop and remove Ollama
teardown_ollama() {
    print_status "Stopping Ollama service and removing models..."

    # Stop Ollama service
    pkill -f "ollama serve" 2>/dev/null || true
    pkill -f "ollama" 2>/dev/null || true

    # Wait for processes to stop
    sleep 3

    if command_exists ollama; then
        # Remove downloaded models
        print_status "Removing Ollama models..."
        ollama rm llama3.2:3b 2>/dev/null || true
        ollama rm mistral:7b 2>/dev/null || true
        ollama rm codellama:7b 2>/dev/null || true

        # List and remove any other models
        if ollama list 2>/dev/null | grep -v "NAME" | awk '{print $1}' | grep -v "^$"; then
            ollama list 2>/dev/null | grep -v "NAME" | awk '{print $1}' | grep -v "^$" | xargs -I {} ollama rm {} 2>/dev/null || true
        fi
    fi

    # Remove Ollama data directory (if exists)
    if [ -d "$HOME/.ollama" ]; then
        print_status "Removing Ollama data directory..."
        rm -rf "$HOME/.ollama"
    fi

    print_success "Ollama teardown completed!"
}

# Function to remove Python environment
teardown_python() {
    print_status "Removing Python virtual environment..."

    cd "$PROJECT_DIR"

    # Deactivate virtual environment if active
    if [ -n "$VIRTUAL_ENV" ]; then
        deactivate 2>/dev/null || true
    fi

    # Remove virtual environment directory
    if [ -d "venv" ]; then
        print_status "Removing Python virtual environment..."
        rm -rf venv
    fi

    # Remove Python cache directories
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
    find . -name "*.pyc" -delete 2>/dev/null || true

    print_success "Python environment teardown completed!"
}

# Function to remove Node.js dependencies
teardown_node() {
    print_status "Removing Node.js dependencies..."

    cd "$PROJECT_DIR"

    # Remove node_modules
    if [ -d "node_modules" ]; then
        print_status "Removing node_modules directory..."
        rm -rf node_modules
    fi

    # Remove package-lock.json
    if [ -f "package-lock.json" ]; then
        rm -f package-lock.json
    fi

    # Remove npm cache (optional)
    if command_exists npm; then
        npm cache clean --force 2>/dev/null || true
    fi

    print_success "Node.js teardown completed!"
}

# Function to remove databases and data
remove_databases() {
    print_status "Removing databases and data files..."

    cd "$PROJECT_DIR"

    # Remove SQLite database
    if [ -f "$DATA_DIR/app.db" ]; then
        print_status "Removing SQLite database..."
        rm -f "$DATA_DIR/app.db"
    fi

    # Remove database initialization files
    if [ -f "$DATA_DIR/init.sql" ]; then
        rm -f "$DATA_DIR/init.sql"
    fi

    # Remove ChromaDB data
    if [ -d "$CHROMA_DATA_DIR" ]; then
        print_status "Removing ChromaDB data..."
        rm -rf "$CHROMA_DATA_DIR"
    fi

    print_success "Database teardown completed!"
}

# Function to remove project directories and files
remove_project_files() {
    print_status "Removing project directories and files..."

    cd "$PROJECT_DIR"

    # Remove created directories
    DIRECTORIES=("$MODELS_DIR" "$DATA_DIR" "$LOGS_DIR" "$CHROMA_DATA_DIR" "backups" "certs")

    for dir in "${DIRECTORIES[@]}"; do
        if [ -d "$dir" ]; then
            print_status "Removing directory: $(basename "$dir")"
            rm -rf "$dir"
        fi
    done

    # Remove configuration directories
    CONFIG_DIRS=("config/nginx" "config/traefik" "config/prometheus" "config/grafana" "config/logstash")

    for config_dir in "${CONFIG_DIRS[@]}"; do
        if [ -d "$config_dir" ]; then
            print_status "Removing config directory: $config_dir"
            rm -rf "$config_dir"
        fi
    done

    # Remove config directory if empty
    if [ -d "config" ] && [ -z "$(ls -A config)" ]; then
        rmdir config
    fi

    print_success "Project files removed!"
}

# Function to remove configuration files
remove_config_files() {
    print_status "Removing configuration files..."

    cd "$PROJECT_DIR"

    # Remove environment files
    CONFIG_FILES=(".env" ".env.local" "requirements.txt")

    for file in "${CONFIG_FILES[@]}"; do
        if [ -f "$file" ]; then
            print_status "Removing file: $file"
            rm -f "$file"
        fi
    done

    # Ask about package.json (since it might be manually created)
    if [ -f "package.json" ]; then
        read -p "Remove package.json? (y/N): " remove_pkg
        if [ "$remove_pkg" = "y" ] || [ "$remove_pkg" = "Y" ]; then
            rm -f package.json
            print_status "Removed package.json"
        fi
    fi

    print_success "Configuration files removed!"
}

# Function to stop background processes
stop_background_processes() {
    print_status "Stopping background processes..."

    # Stop any Python processes related to the project
    pkill -f "uvicorn" 2>/dev/null || true
    pkill -f "fastapi" 2>/dev/null || true
    pkill -f "embedding" 2>/dev/null || true

    # Stop any remaining processes on common ports
    PORTS=(8000 8001 8002 8003 8004 8005 8006 8007 11434 5432 6379 9090 3000 9200 5601 8080 8090)

    for port in "${PORTS[@]}"; do
        PID=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$PID" ]; then
            print_status "Stopping process on port $port (PID: $PID)"
            kill -TERM $PID 2>/dev/null || true
            sleep 1
            kill -KILL $PID 2>/dev/null || true
        fi
    done

    print_success "Background processes stopped!"
}

# Function to display completion message
show_completion_message() {
    echo
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Teardown Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo
    echo -e "${BLUE}What was removed:${NC}"
    echo "  ✓ All Docker containers, volumes, and networks"
    echo "  ✓ All Ollama models and service"
    echo "  ✓ Node.js processes and dependencies"
    echo "  ✓ Python virtual environment"
    echo "  ✓ All databases and data files"
    echo "  ✓ Project directories and logs"
    echo "  ✓ Configuration files"
    echo "  ✓ Background processes"
    echo
    echo -e "${BLUE}To reinstall:${NC}"
    echo "  Run: ./scripts/setup-local.sh"
    echo
    echo -e "${YELLOW}Note: Some system-level dependencies (Node.js, Python, Docker)${NC}"
    echo -e "${YELLOW}were not removed and can be reused for future setups.${NC}"
    echo
}

# Function to handle errors
handle_error() {
    print_error "An error occurred during teardown!"
    print_warning "Some components may not have been properly removed."
    print_status "You may need to manually clean up remaining resources."
    exit 1
}

# Main execution
main() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  $PROJECT_NAME${NC}"
    echo -e "${GREEN}  Local Teardown Script${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo

    confirm_teardown

    # Execute teardown functions
    stop_background_processes
    stop_node_processes
    teardown_docker
    teardown_ollama
    teardown_python
    teardown_node
    remove_databases
    remove_project_files
    remove_config_files

    show_completion_message

    print_success "Local teardown completed successfully!"
}

# Handle script interruption
trap 'print_error "Teardown interrupted by user"; exit 1' INT TERM

# Handle errors
trap 'handle_error' ERR

# Run main function
main "$@"