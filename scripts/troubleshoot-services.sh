#!/usr/bin/env bash

# SLM Business Service Layer - Troubleshooting and Service Restart Script
# Author: Generated for SLM Business Service Layer Project
# Description: Comprehensive script for diagnosing issues and restarting services

# Check for bash 4+ for associative arrays, fallback gracefully
if [ "${BASH_VERSION%%.*}" -lt 4 ]; then
    echo "Warning: This script works best with bash 4+. Detected bash ${BASH_VERSION}." >&2
    echo "Some features may be limited. Consider using: brew install bash" >&2
fi

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="SLM Business Service Layer"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$PROJECT_DIR/logs/troubleshoot_$TIMESTAMP.log"

# Service configuration (compatible with bash 3.2+)
SERVICES="ollama:11434 chromadb:8000 postgres:5432 redis:6379 orchestration:8001 embedding-service:8002 traefik:80 prometheus:9090 grafana:3000 elasticsearch:9200 kibana:5601"

DOCKER_CONTAINERS="ollama:slm-ollama chromadb:slm-chromadb postgres:slm-postgres redis:slm-redis orchestration:slm-orchestration embedding-service:slm-embedding traefik:slm-traefik nginx:slm-nginx prometheus:slm-prometheus grafana:slm-grafana elasticsearch:slm-elasticsearch logstash:slm-logstash kibana:slm-kibana"

# Helper functions to get service info
get_service_port() {
    local service=$1
    echo "$SERVICES" | tr ' ' '\n' | grep "^$service:" | cut -d: -f2
}

get_service_container() {
    local service=$1
    echo "$DOCKER_CONTAINERS" | tr ' ' '\n' | grep "^$service:" | cut -d: -f2
}

get_all_services() {
    echo "$SERVICES" | tr ' ' '\n' | cut -d: -f1
}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

print_debug() {
    echo -e "${PURPLE}[DEBUG]${NC} $1" | tee -a "$LOG_FILE"
}

print_header() {
    echo -e "${CYAN}========================================${NC}" | tee -a "$LOG_FILE"
    echo -e "${CYAN}  $1${NC}" | tee -a "$LOG_FILE"
    echo -e "${CYAN}========================================${NC}" | tee -a "$LOG_FILE"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if port is in use
check_port() {
    local port=$1
    if command_exists lsof; then
        lsof -i :$port >/dev/null 2>&1
    elif command_exists netstat; then
        netstat -ln | grep ":$port " >/dev/null 2>&1
    else
        return 1
    fi
}

# Function to get process using port
get_port_process() {
    local port=$1
    if command_exists lsof; then
        lsof -ti :$port 2>/dev/null | head -1
    elif command_exists netstat; then
        netstat -tlpn 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1
    else
        echo "unknown"
    fi
}

# Function to check Docker status
check_docker_status() {
    print_header "Docker System Status"

    if ! command_exists docker; then
        print_error "Docker is not installed or not in PATH"
        return 1
    fi

    # Check Docker daemon
    if ! docker version >/dev/null 2>&1; then
        print_error "Docker daemon is not running"
        print_status "Attempting to start Docker daemon..."

        # Try to start Docker (macOS/Linux)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            open -a Docker 2>/dev/null || print_warning "Could not start Docker Desktop"
        else
            sudo systemctl start docker 2>/dev/null || print_warning "Could not start Docker service"
        fi

        # Wait for Docker to start
        local retries=10
        while [ $retries -gt 0 ] && ! docker version >/dev/null 2>&1; do
            print_status "Waiting for Docker to start... ($retries attempts remaining)"
            sleep 3
            ((retries--))
        done

        if ! docker version >/dev/null 2>&1; then
            print_error "Failed to start Docker daemon"
            return 1
        fi
    fi

    print_success "Docker daemon is running"

    # Show Docker info
    echo "Docker version:" | tee -a "$LOG_FILE"
    docker version --format "Client: {{.Client.Version}}, Server: {{.Server.Version}}" | tee -a "$LOG_FILE"

    echo "Docker system info:" | tee -a "$LOG_FILE"
    docker system df | tee -a "$LOG_FILE"

    return 0
}

# Function to check container health
check_container_health() {
    local container_name=$1
    local service_name=$2

    if ! docker ps --format "table {{.Names}}" | grep -q "^$container_name$"; then
        print_error "Container $container_name is not running"
        return 1
    fi

    # Check container status
    local status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null)
    if [ "$status" != "running" ]; then
        print_error "Container $container_name status: $status"
        return 1
    fi

    # Check health status if available
    local health=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null)
    if [ "$health" != "" ] && [ "$health" != "<no value>" ]; then
        if [ "$health" != "healthy" ]; then
            print_warning "Container $container_name health: $health"

            # Show health check logs
            print_debug "Health check logs for $container_name:"
            docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' "$container_name" | tail -5 | tee -a "$LOG_FILE"
            return 1
        else
            print_success "Container $container_name is healthy"
        fi
    else
        print_success "Container $container_name is running"
    fi

    return 0
}

# Function to check service connectivity
check_service_connectivity() {
    local service_name=$1
    local port=$2

    if check_port "$port"; then
        print_success "Service $service_name is listening on port $port"

        # Additional connectivity tests
        case $service_name in
            "ollama")
                if command_exists curl; then
                    if curl -s -f "http://localhost:$port/api/tags" >/dev/null 2>&1; then
                        print_success "Ollama API is responding"
                    else
                        print_warning "Ollama service is running but API not responding"
                    fi
                fi
                ;;
            "chromadb")
                if command_exists curl; then
                    if curl -s -f "http://localhost:$port/api/v1/heartbeat" >/dev/null 2>&1; then
                        print_success "ChromaDB API is responding"
                    else
                        print_warning "ChromaDB service is running but API not responding"
                    fi
                fi
                ;;
            "orchestration")
                if command_exists curl; then
                    if curl -s -f "http://localhost:$port/health" >/dev/null 2>&1; then
                        print_success "Orchestration service health check passed"
                    else
                        print_warning "Orchestration service is running but health check failed"
                    fi
                fi
                ;;
            "postgres")
                if command_exists pg_isready; then
                    if pg_isready -h localhost -p "$port" -U app_user >/dev/null 2>&1; then
                        print_success "PostgreSQL is accepting connections"
                    else
                        print_warning "PostgreSQL is running but not accepting connections"
                    fi
                fi
                ;;
            "redis")
                if command_exists redis-cli; then
                    if redis-cli -p "$port" ping >/dev/null 2>&1; then
                        print_success "Redis is responding to ping"
                    else
                        print_warning "Redis is running but not responding to ping"
                    fi
                fi
                ;;
        esac

        return 0
    else
        print_error "Service $service_name is not listening on port $port"
        local pid=$(get_port_process "$port")
        if [ "$pid" != "unknown" ] && [ "$pid" != "" ]; then
            print_debug "Port $port is used by process PID: $pid"
            print_debug "Process details: $(ps -p $pid -o comm= 2>/dev/null || echo 'unknown')"
        fi
        return 1
    fi
}

# Function to show container logs
show_container_logs() {
    local container_name=$1
    local lines=${2:-50}

    print_header "Last $lines lines of logs for $container_name"

    if docker ps -a --format "table {{.Names}}" | grep -q "^$container_name$"; then
        docker logs --tail "$lines" "$container_name" 2>&1 | tee -a "$LOG_FILE"
    else
        print_error "Container $container_name not found"
    fi
}

# PostgreSQL configuration detection
detect_postgres_config() {
    # Default to Docker configuration
    POSTGRES_TYPE="docker"
    POSTGRES_CONTAINER="slm-postgres"
    POSTGRES_HOST="localhost"
    POSTGRES_PORT="5432"
    POSTGRES_DB="business_app"
    POSTGRES_USER="app_user"
    POSTGRES_PASSWORD="app_password"

    # Check if Docker container exists and is running
    local docker_available=false
    if docker ps --format "table {{.Names}}" 2>/dev/null | grep -q "^$POSTGRES_CONTAINER$"; then
        docker_available=true
        print_debug "Found running Docker PostgreSQL container: $POSTGRES_CONTAINER"
    elif docker ps -a --format "table {{.Names}}" 2>/dev/null | grep -q "^$POSTGRES_CONTAINER$"; then
        print_debug "Found stopped Docker PostgreSQL container: $POSTGRES_CONTAINER"
        docker_available=true
    fi

    # Check for local PostgreSQL installations
    local local_pg_available=false
    local local_pg_version=""
    local local_pg_port=""

    # Check Homebrew PostgreSQL
    if command_exists brew; then
        for version in 15 14 13 12 11; do
            if brew list postgresql@$version 2>/dev/null >/dev/null; then
                local_pg_available=true
                local_pg_version="@$version"
                # Default to standard PostgreSQL port
                local_pg_port="5432"
                print_debug "Found Homebrew PostgreSQL$local_pg_version"
                break
            fi
        done

        # Check for non-versioned postgresql
        if [ "$local_pg_available" = false ] && brew list postgresql 2>/dev/null >/dev/null; then
            local_pg_available=true
            local_pg_version=""
            local_pg_port="5432"
            print_debug "Found Homebrew PostgreSQL (non-versioned)"
        fi
    fi

    # Check for system PostgreSQL
    if [ "$local_pg_available" = false ] && command_exists psql; then
        local_pg_available=true
        local_pg_version=""
        local_pg_port="5432"
        print_debug "Found system PostgreSQL installation"
    fi

    # Determine which PostgreSQL to use
    if [ "$FORCE_POSTGRES_TYPE" = "docker" ] && [ "$docker_available" = true ]; then
        POSTGRES_TYPE="docker"
        print_status "Using Docker PostgreSQL (forced)"
    elif [ "$FORCE_POSTGRES_TYPE" = "local" ] && [ "$local_pg_available" = true ]; then
        POSTGRES_TYPE="local"
        POSTGRES_PORT="${local_pg_port:-5432}"
        POSTGRES_DB="postgres"  # Default database for local installations
        POSTGRES_USER="${USER:-postgres}"  # Use current user or postgres
        POSTGRES_PASSWORD=""  # Usually no password for local connections
        print_status "Using local PostgreSQL (forced)"
    elif [ "$docker_available" = true ]; then
        POSTGRES_TYPE="docker"
        print_status "Using Docker PostgreSQL (auto-detected)"
    elif [ "$local_pg_available" = true ]; then
        POSTGRES_TYPE="local"
        POSTGRES_PORT="${local_pg_port:-5432}"
        POSTGRES_DB="postgres"  # Default database for local installations
        POSTGRES_USER="${USER:-postgres}"  # Use current user or postgres
        POSTGRES_PASSWORD=""  # Usually no password for local connections
        print_status "Using local PostgreSQL$local_pg_version (auto-detected)"
    else
        print_error "No PostgreSQL installation found (Docker or local)"
        return 1
    fi

    print_debug "PostgreSQL config: type=$POSTGRES_TYPE, host=$POSTGRES_HOST, port=$POSTGRES_PORT, db=$POSTGRES_DB, user=$POSTGRES_USER"
    return 0
}

# PostgreSQL-specific troubleshooting functions
check_postgres_connection() {
    print_header "PostgreSQL Connection Test"

    # Detect PostgreSQL configuration
    if ! detect_postgres_config; then
        return 1
    fi

    # Test basic connectivity
    if [ "$POSTGRES_TYPE" = "docker" ]; then
        # Test Docker container connectivity
        print_status "Testing Docker PostgreSQL connectivity..."
        if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
            print_success "Docker PostgreSQL is accepting connections"
        else
            print_error "Docker PostgreSQL is not accepting connections"
            return 1
        fi

        # Test SQL query execution via Docker
        print_status "Testing SQL query execution via Docker..."
        local test_query="SELECT version();"
        local query_result=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$test_query" -t 2>/dev/null)

        if [ $? -eq 0 ] && [ -n "$query_result" ]; then
            print_success "SQL query execution successful"
            print_debug "PostgreSQL version: $(echo "$query_result" | tr -d '\n' | xargs)"
        else
            print_error "SQL query execution failed"
            return 1
        fi

    else
        # Test local PostgreSQL connectivity
        if command_exists pg_isready; then
            print_status "Testing local PostgreSQL connectivity with pg_isready..."
            if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" >/dev/null 2>&1; then
                print_success "Local PostgreSQL server is accepting connections"
            else
                print_error "Local PostgreSQL server is not accepting connections"
                return 1
            fi
        else
            print_warning "pg_isready not found, skipping pg_isready test"
        fi

        # Test SQL query execution for local PostgreSQL
        if command_exists psql; then
            print_status "Testing SQL query execution on local PostgreSQL..."
            local test_query="SELECT version();"
            local query_result

            # Try different connection methods for local PostgreSQL
            if [ -n "$POSTGRES_PASSWORD" ]; then
                query_result=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$test_query" -t 2>/dev/null)
            else
                query_result=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$test_query" -t 2>/dev/null)
            fi

            if [ $? -eq 0 ] && [ -n "$query_result" ]; then
                print_success "SQL query execution successful"
                print_debug "PostgreSQL version: $(echo "$query_result" | tr -d '\n' | xargs)"
            else
                print_error "SQL query execution failed"
                return 1
            fi
        else
            print_warning "psql not found, skipping SQL query test"
        fi
    fi

    return 0
}

# Helper function to execute PostgreSQL commands
execute_postgres_query() {
    local query="$1"
    local output_format="${2:--t}"  # Default to tuples-only format

    if [ "$POSTGRES_TYPE" = "docker" ]; then
        docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$query" $output_format 2>/dev/null
    else
        if [ -n "$POSTGRES_PASSWORD" ]; then
            PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$query" $output_format 2>/dev/null
        else
            psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$query" $output_format 2>/dev/null
        fi
    fi
}

check_postgres_performance() {
    print_header "PostgreSQL Performance Diagnostics"

    # Detect PostgreSQL configuration
    if ! detect_postgres_config; then
        return 1
    fi

    # Check database size
    print_status "Checking database size..."
    local db_size=$(execute_postgres_query "\l+" | grep "$POSTGRES_DB" | awk '{print $7}')
    if [ -n "$db_size" ]; then
        echo "Database size: $db_size" | tee -a "$LOG_FILE"
    fi

    # Check table sizes
    print_status "Checking table sizes..."
    execute_postgres_query "
        SELECT
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    " | tee -a "$LOG_FILE"

    # Check active connections
    print_status "Checking active connections..."
    execute_postgres_query "
        SELECT
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections,
            count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity;
    " | tee -a "$LOG_FILE"

    # Check long running queries
    print_status "Checking for long-running queries..."
    execute_postgres_query "
        SELECT
            pid,
            now() - pg_stat_activity.query_start AS duration,
            query,
            state
        FROM pg_stat_activity
        WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
        AND state = 'active';
    " | tee -a "$LOG_FILE"

    # Check database configuration
    print_status "Checking key PostgreSQL settings..."
    execute_postgres_query "
        SELECT name, setting, unit, context, short_desc
        FROM pg_settings
        WHERE name IN (
            'max_connections',
            'shared_buffers',
            'effective_cache_size',
            'maintenance_work_mem',
            'work_mem',
            'wal_buffers',
            'checkpoint_completion_target',
            'random_page_cost'
        );
    " | tee -a "$LOG_FILE"
}

check_postgres_logs() {
    print_header "PostgreSQL Log Analysis"

    # Detect PostgreSQL configuration
    if ! detect_postgres_config; then
        return 1
    fi

    if [ "$POSTGRES_TYPE" = "docker" ]; then
        # Show recent error logs from Docker container
        print_status "Recent PostgreSQL errors and warnings..."
        docker logs "$POSTGRES_CONTAINER" 2>&1 | grep -E "(ERROR|WARNING|FATAL)" | tail -20 | tee -a "$LOG_FILE"

        # Show connection logs
        print_status "Recent connection activity..."
        docker logs "$POSTGRES_CONTAINER" 2>&1 | grep -E "(connection|authentication)" | tail -10 | tee -a "$LOG_FILE"

        # Show startup messages
        print_status "PostgreSQL startup messages..."
        docker logs "$POSTGRES_CONTAINER" 2>&1 | grep -E "(database system|ready to accept)" | tail -5 | tee -a "$LOG_FILE"
    else
        # For local PostgreSQL, try to find log files
        print_status "Searching for local PostgreSQL log files..."

        # Common PostgreSQL log locations
        local log_locations=(
            "/opt/homebrew/var/log/postgresql@15.log"
            "/opt/homebrew/var/log/postgresql@14.log"
            "/opt/homebrew/var/log/postgresql@13.log"
            "/opt/homebrew/var/log/postgresql.log"
            "/usr/local/var/log/postgresql@15.log"
            "/usr/local/var/log/postgresql@14.log"
            "/usr/local/var/log/postgresql.log"
            "/var/log/postgresql/postgresql-*.log"
            "/Library/Logs/PostgreSQL.log"
        )

        local found_logs=false
        for log_file in "${log_locations[@]}"; do
            if [ -f "$log_file" ]; then
                found_logs=true
                print_status "Found log file: $log_file"

                print_status "Recent errors and warnings from $log_file..."
                tail -100 "$log_file" | grep -E "(ERROR|WARNING|FATAL)" | tail -10 | tee -a "$LOG_FILE"

                print_status "Recent connection activity from $log_file..."
                tail -100 "$log_file" | grep -E "(connection|authentication)" | tail -5 | tee -a "$LOG_FILE"
                break
            elif ls $log_file 2>/dev/null >/dev/null; then
                # Handle wildcard patterns
                for actual_log in $log_file; do
                    if [ -f "$actual_log" ]; then
                        found_logs=true
                        print_status "Found log file: $actual_log"

                        print_status "Recent errors and warnings from $actual_log..."
                        tail -100 "$actual_log" | grep -E "(ERROR|WARNING|FATAL)" | tail -10 | tee -a "$LOG_FILE"

                        print_status "Recent connection activity from $actual_log..."
                        tail -100 "$actual_log" | grep -E "(connection|authentication)" | tail -5 | tee -a "$LOG_FILE"
                        break 2
                    fi
                done
            fi
        done

        if [ "$found_logs" = false ]; then
            print_warning "No PostgreSQL log files found in common locations"
            print_status "Try checking: brew services list | grep postgresql"
        fi
    fi
}

check_postgres_disk_space() {
    print_header "PostgreSQL Disk Space Analysis"

    local postgres_container="slm-postgres"

    # Check container disk usage
    print_status "Container disk usage..."
    docker exec "$postgres_container" df -h 2>/dev/null | tee -a "$LOG_FILE"

    # Check PostgreSQL data directory size
    print_status "PostgreSQL data directory size..."
    docker exec "$postgres_container" du -sh /var/lib/postgresql/data 2>/dev/null | tee -a "$LOG_FILE"

    # Check individual database sizes
    print_status "Individual database sizes..."
    docker exec "$postgres_container" psql -U postgres -c "
        SELECT
            datname as database_name,
            pg_size_pretty(pg_database_size(datname)) as size
        FROM pg_database
        WHERE datistemplate = false
        ORDER BY pg_database_size(datname) DESC;
    " 2>/dev/null | tee -a "$LOG_FILE"
}

fix_postgres_issues() {
    print_header "Fixing Common PostgreSQL Issues"

    local postgres_container="slm-postgres"
    local db_name="business_app"
    local db_user="app_user"

    # Check if container is running
    if ! docker ps --format "table {{.Names}}" | grep -q "^$postgres_container$"; then
        print_status "PostgreSQL container is not running, attempting to start..."
        docker-compose up -d postgres
        sleep 10
    fi

    # Wait for PostgreSQL to be ready
    print_status "Waiting for PostgreSQL to be ready..."
    local retries=30
    while [ $retries -gt 0 ] && ! docker exec "$postgres_container" pg_isready -U "$db_user" >/dev/null 2>&1; do
        print_status "PostgreSQL not ready, waiting... ($retries attempts remaining)"
        sleep 2
        ((retries--))
    done

    if [ $retries -eq 0 ]; then
        print_error "PostgreSQL failed to become ready"
        return 1
    fi

    # Check and create database if it doesn't exist
    print_status "Verifying database exists..."
    if ! docker exec "$postgres_container" psql -U postgres -lqt | cut -d \| -f 1 | grep -qw "$db_name"; then
        print_status "Creating database $db_name..."
        docker exec "$postgres_container" psql -U postgres -c "CREATE DATABASE $db_name;" 2>/dev/null || true
    fi

    # Check and create user if it doesn't exist
    print_status "Verifying database user exists..."
    if ! docker exec "$postgres_container" psql -U postgres -c "\du" | grep -q "$db_user"; then
        print_status "Creating database user $db_user..."
        docker exec "$postgres_container" psql -U postgres -c "CREATE USER $db_user WITH PASSWORD 'app_password';" 2>/dev/null || true
        docker exec "$postgres_container" psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;" 2>/dev/null || true
    fi

    # Run database maintenance
    print_status "Running database maintenance..."
    docker exec "$postgres_container" psql -U "$db_user" -d "$db_name" -c "VACUUM ANALYZE;" 2>/dev/null || true

    # Check for corrupted indexes
    print_status "Checking for corrupted indexes..."
    docker exec "$postgres_container" psql -U "$db_user" -d "$db_name" -c "REINDEX DATABASE $db_name;" 2>/dev/null || true

    # Update statistics
    print_status "Updating table statistics..."
    docker exec "$postgres_container" psql -U "$db_user" -d "$db_name" -c "ANALYZE;" 2>/dev/null || true

    print_success "PostgreSQL maintenance completed"
}

run_postgres_diagnostics() {
    print_header "PostgreSQL Comprehensive Diagnostics"

    local postgres_container="slm-postgres"

    # Check if PostgreSQL container exists and is running
    if ! docker ps -a --format "table {{.Names}}" | grep -q "^$postgres_container$"; then
        print_error "PostgreSQL container not found"
        return 1
    fi

    if ! docker ps --format "table {{.Names}}" | grep -q "^$postgres_container$"; then
        print_error "PostgreSQL container is not running"
        print_status "Attempting to start PostgreSQL container..."
        docker-compose up -d postgres
        sleep 10
    fi

    # Run all PostgreSQL checks
    check_postgres_connection || print_warning "PostgreSQL connection test failed"
    check_postgres_performance
    check_postgres_logs
    check_postgres_disk_space

    # Show container resource usage
    print_status "PostgreSQL container resource usage..."
    docker stats "$postgres_container" --no-stream | tee -a "$LOG_FILE"

    print_success "PostgreSQL diagnostics completed"
}

backup_postgres() {
    print_header "PostgreSQL Backup"

    local postgres_container="slm-postgres"
    local db_name="business_app"
    local db_user="app_user"
    local backup_dir="$PROJECT_DIR/backups"
    local backup_file="$backup_dir/postgres_backup_$TIMESTAMP.sql"

    # Create backup directory
    mkdir -p "$backup_dir"

    print_status "Creating PostgreSQL backup..."
    print_status "Backup file: $backup_file"

    if docker exec "$postgres_container" pg_dump -U "$db_user" -d "$db_name" > "$backup_file" 2>/dev/null; then
        print_success "PostgreSQL backup completed successfully"
        print_status "Backup size: $(du -h "$backup_file" | cut -f1)"
    else
        print_error "PostgreSQL backup failed"
        rm -f "$backup_file" 2>/dev/null
        return 1
    fi
}

restore_postgres() {
    local backup_file=$1

    if [ -z "$backup_file" ]; then
        print_error "Please specify backup file path"
        print_status "Usage: restore_postgres /path/to/backup.sql"
        return 1
    fi

    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        return 1
    fi

    print_header "PostgreSQL Restore"

    local postgres_container="slm-postgres"
    local db_name="business_app"
    local db_user="app_user"

    print_warning "This will overwrite the current database!"
    read -p "Are you sure you want to proceed? (y/N): " confirm

    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_status "Restore cancelled"
        return 0
    fi

    print_status "Restoring PostgreSQL from: $backup_file"

    # Drop and recreate database
    docker exec "$postgres_container" psql -U postgres -c "DROP DATABASE IF EXISTS $db_name;" 2>/dev/null
    docker exec "$postgres_container" psql -U postgres -c "CREATE DATABASE $db_name;" 2>/dev/null
    docker exec "$postgres_container" psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;" 2>/dev/null

    # Restore from backup
    if docker exec -i "$postgres_container" psql -U "$db_user" -d "$db_name" < "$backup_file" 2>/dev/null; then
        print_success "PostgreSQL restore completed successfully"
    else
        print_error "PostgreSQL restore failed"
        return 1
    fi
}

# Function to check system resources
check_system_resources() {
    print_header "System Resources"

    echo "CPU and Memory usage:" | tee -a "$LOG_FILE"
    if command_exists top; then
        top -l 1 -n 0 | head -10 | tee -a "$LOG_FILE"
    elif command_exists htop; then
        htop -n 1 | head -10 | tee -a "$LOG_FILE"
    fi

    echo "Disk usage:" | tee -a "$LOG_FILE"
    df -h | tee -a "$LOG_FILE"

    echo "Memory usage:" | tee -a "$LOG_FILE"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        vm_stat | tee -a "$LOG_FILE"
    else
        free -h | tee -a "$LOG_FILE"
    fi

    echo "Docker resource usage:" | tee -a "$LOG_FILE"
    if command_exists docker; then
        docker stats --no-stream | tee -a "$LOG_FILE"
    fi
}

# Function to check network connectivity
check_network() {
    print_header "Network Connectivity"

    # Check Docker network
    if docker network ls | grep -q "slm-network"; then
        print_success "Docker network 'slm-network' exists"
        docker network inspect slm-network --format='{{.IPAM.Config}}' | tee -a "$LOG_FILE"
    else
        print_error "Docker network 'slm-network' not found"
    fi

    # Check external connectivity
    if ping -c 1 google.com >/dev/null 2>&1; then
        print_success "External network connectivity OK"
    else
        print_warning "External network connectivity issues"
    fi

    # Check localhost connectivity
    if ping -c 1 localhost >/dev/null 2>&1; then
        print_success "Localhost connectivity OK"
    else
        print_error "Localhost connectivity issues"
    fi
}

# Function to run comprehensive diagnostics
run_diagnostics() {
    print_header "Running Comprehensive Diagnostics"

    # Create logs directory if it doesn't exist
    mkdir -p "$PROJECT_DIR/logs"

    print_status "Diagnostics log: $LOG_FILE"

    # System checks
    check_system_resources
    check_network
    check_docker_status || return 1

    # Service checks
    print_header "Service Status Check"
    local failed_services=()

    for service in $(get_all_services); do
        local port=$(get_service_port "$service")
        local container=$(get_service_container "$service")

        print_status "Checking $service service..."

        if [ -n "$container" ]; then
            if ! check_container_health "$container" "$service"; then
                failed_services+=("$service")
                continue
            fi
        fi

        if ! check_service_connectivity "$service" "$port"; then
            failed_services+=("$service")
        fi
    done

    # Summary
    print_header "Diagnostic Summary"

    if [ ${#failed_services[@]} -eq 0 ]; then
        print_success "All services are running correctly!"
        return 0
    else
        print_error "Failed services: ${failed_services[*]}"

        for service in "${failed_services[@]}"; do
            local container=${DOCKER_CONTAINERS[$service]}
            if [ -n "$container" ]; then
                show_container_logs "$container" 20
            fi
        done

        return 1
    fi
}

# Function to restart a specific service
restart_service() {
    local service_name=$1
    local container_name=$(get_service_container "$service_name")

    if [ -z "$container_name" ]; then
        print_error "Unknown service: $service_name"
        return 1
    fi

    print_status "Restarting $service_name service..."

    # Stop the container
    if docker ps --format "table {{.Names}}" | grep -q "^$container_name$"; then
        print_status "Stopping container $container_name..."
        docker stop "$container_name" || print_warning "Failed to stop $container_name gracefully"
    fi

    # Start the container
    print_status "Starting container $container_name..."
    if docker-compose up -d "$service_name" 2>/dev/null; then
        print_success "Successfully restarted $service_name"

        # Wait for service to be ready
        local port=$(get_service_port "$service_name")
        local retries=30
        while [ $retries -gt 0 ] && ! check_port "$port"; do
            print_status "Waiting for $service_name to be ready... ($retries attempts remaining)"
            sleep 2
            ((retries--))
        done

        if check_service_connectivity "$service_name" "$port"; then
            print_success "$service_name is now running and responding"
            return 0
        else
            print_error "$service_name started but not responding properly"
            show_container_logs "$container_name" 10
            return 1
        fi
    else
        print_error "Failed to start $service_name"
        return 1
    fi
}

# Function to restart all services
restart_all_services() {
    print_header "Restarting All Services"

    cd "$PROJECT_DIR"

    # Stop all services
    print_status "Stopping all services..."
    docker-compose down 2>/dev/null || print_warning "Some containers may have failed to stop"

    # Wait a moment
    sleep 5

    # Start core services first
    print_status "Starting core services..."
    local core_services=("postgres" "redis" "chromadb" "ollama")

    for service in "${core_services[@]}"; do
        print_status "Starting $service..."
        docker-compose up -d "$service"
        sleep 3
    done

    # Start application services
    print_status "Starting application services..."
    docker-compose up -d

    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 10

    # Verify all services
    run_diagnostics
}

# Function to fix common issues
fix_common_issues() {
    print_header "Fixing Common Issues"

    # Fix Docker network issues
    if ! docker network ls | grep -q "slm-network"; then
        print_status "Creating Docker network..."
        docker network create slm-network --driver bridge --subnet=172.25.0.0/16 2>/dev/null || true
    fi

    # Clean up orphaned containers
    print_status "Cleaning up orphaned containers..."
    docker system prune -f 2>/dev/null || true

    # Fix permission issues
    print_status "Fixing permission issues..."
    cd "$PROJECT_DIR"

    # Create directories if they don't exist
    mkdir -p logs data models chroma_data config certs

    # Fix ownership (if running as root)
    if [ "$EUID" -eq 0 ]; then
        chown -R $SUDO_USER:$SUDO_USER logs data models chroma_data 2>/dev/null || true
    fi

    # Make sure scripts are executable
    chmod +x scripts/*.sh 2>/dev/null || true

    print_success "Common issues fixed"
}

# Function to show service status
show_service_status() {
    print_header "Service Status Overview"

    printf "%-20s %-15s %-10s %-30s\n" "SERVICE" "PORT" "STATUS" "CONTAINER" | tee -a "$LOG_FILE"
    printf "%-20s %-15s %-10s %-30s\n" "-------" "----" "------" "---------" | tee -a "$LOG_FILE"

    for service in $(get_all_services); do
        local port=$(get_service_port "$service")
        local container=$(get_service_container "$service")
        local status="DOWN"
        local container_status="NOT FOUND"

        if check_port "$port"; then
            status="UP"
        fi

        if [ -n "$container" ] && docker ps --format "table {{.Names}}" | grep -q "^$container$"; then
            container_status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
        fi

        printf "%-20s %-15s %-10s %-30s\n" "$service" "$port" "$status" "$container_status" | tee -a "$LOG_FILE"
    done
}

# Function to show help
show_help() {
    echo "SLM Business Service Layer - Troubleshooting Script"
    echo
    echo "Usage: $0 [OPTIONS] [COMMAND] [ARGS]"
    echo
    echo "Options:"
    echo "  --postgres-docker      Force use of Docker PostgreSQL"
    echo "  --postgres-local       Force use of local PostgreSQL (Homebrew/system)"
    echo "  --postgres-type=TYPE   Force PostgreSQL type (docker|local)"
    echo
    echo "Commands:"
    echo "  diagnose, diag          Run comprehensive diagnostics"
    echo "  status                  Show service status overview"
    echo "  restart [SERVICE]       Restart specific service or all services"
    echo "  logs [SERVICE] [LINES]  Show logs for specific service"
    echo "  fix                     Fix common issues"
    echo "  resources              Show system resources"
    echo "  network                Check network connectivity"
    echo "  help                   Show this help message"
    echo
    echo "PostgreSQL-specific commands:"
    echo "  postgres-diag          Run PostgreSQL comprehensive diagnostics"
    echo "  postgres-fix           Fix common PostgreSQL issues"
    echo "  postgres-backup        Create PostgreSQL database backup"
    echo "  postgres-restore FILE  Restore PostgreSQL from backup file"
    echo "  postgres-connection    Test PostgreSQL connection"
    echo "  postgres-performance   Check PostgreSQL performance metrics"
    echo "  postgres-logs          Analyze PostgreSQL logs"
    echo "  postgres-diskspace     Check PostgreSQL disk usage"
    echo
    echo "Available services:"
    echo "  $(get_all_services | tr '\n' ' ')"
    echo
    echo "Examples:"
    echo "  $0 diagnose            # Run full diagnostics (auto-detect PostgreSQL)"
    echo "  $0 restart ollama      # Restart only Ollama service"
    echo "  $0 restart             # Restart all services"
    echo "  $0 logs chromadb 100   # Show last 100 lines of ChromaDB logs"
    echo "  $0 status              # Show status of all services"
    echo "  $0 postgres-diag       # Run PostgreSQL diagnostics (auto-detect)"
    echo "  $0 --postgres-docker postgres-diag  # Force Docker PostgreSQL diagnostics"
    echo "  $0 --postgres-local postgres-backup # Create backup from local PostgreSQL"
    echo "  $0 postgres-restore /path/to/backup.sql  # Restore from backup"
    echo
}

# Main execution
main() {
    # Parse options first
    while [[ $# -gt 0 ]]; do
        case $1 in
            --postgres-type=*)
                FORCE_POSTGRES_TYPE="${1#*=}"
                shift
                ;;
            --postgres-docker)
                FORCE_POSTGRES_TYPE="docker"
                shift
                ;;
            --postgres-local)
                FORCE_POSTGRES_TYPE="local"
                shift
                ;;
            *)
                break
                ;;
        esac
    done

    local command=${1:-"help"}

    case $command in
        "diagnose"|"diag")
            run_diagnostics
            ;;
        "status")
            show_service_status
            ;;
        "restart")
            if [ -n "$2" ]; then
                restart_service "$2"
            else
                restart_all_services
            fi
            ;;
        "logs")
            local service=$2
            local lines=${3:-50}
            if [ -n "$service" ]; then
                local container=$(get_service_container "$service")
                if [ -n "$container" ]; then
                    show_container_logs "$container" "$lines"
                else
                    print_error "Unknown service: $service"
                    exit 1
                fi
            else
                print_error "Please specify a service name"
                echo "Available services: $(get_all_services | tr '\n' ' ')"
                exit 1
            fi
            ;;
        "fix")
            fix_common_issues
            ;;
        "resources")
            check_system_resources
            ;;
        "network")
            check_network
            ;;
        "postgres-diag")
            run_postgres_diagnostics
            ;;
        "postgres-fix")
            fix_postgres_issues
            ;;
        "postgres-backup")
            backup_postgres
            ;;
        "postgres-restore")
            if [ -n "$2" ]; then
                restore_postgres "$2"
            else
                print_error "Please specify backup file path"
                print_status "Usage: $0 postgres-restore /path/to/backup.sql"
                exit 1
            fi
            ;;
        "postgres-connection")
            check_postgres_connection
            ;;
        "postgres-performance")
            check_postgres_performance
            ;;
        "postgres-logs")
            check_postgres_logs
            ;;
        "postgres-diskspace")
            check_postgres_disk_space
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Handle script interruption
trap 'print_error "Script interrupted by user"; exit 1' INT TERM

# Run main function
main "$@"