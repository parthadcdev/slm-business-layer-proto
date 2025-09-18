#!/bin/bash

# SLM Business Service Layer - Service Management Script
# Author: Partha Chandramohan
# Description: Comprehensive service management for all system components

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Service configuration
ORCHESTRATION_PROCESS="node src/orchestration/app.js"
ORCHESTRATION_PORT=8001
DOCKER_COMPOSE_FILE="docker-compose.yml"
PROJECT_NAME="slm-business-layer-proto"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}================================${NC}"
}

print_section() {
    echo -e "${BLUE}--- $1 ---${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Function to check if orchestration service is running
check_orchestration() {
    if pgrep -f "$ORCHESTRATION_PROCESS" >/dev/null; then
        return 0  # Running
    else
        return 1  # Not running
    fi
}

# Function to get orchestration service PID
get_orchestration_pid() {
    pgrep -f "$ORCHESTRATION_PROCESS" | head -1
}

# Function to check service health
check_service_health() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    print_status "Checking $service health..."

    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            print_status "$service is healthy ✓"
            return 0
        fi

        if [ $((attempt % 5)) -eq 0 ]; then
            print_warning "$service health check attempt $attempt/$max_attempts..."
        fi

        sleep 1
        attempt=$((attempt + 1))
    done

    print_warning "$service health check failed after $max_attempts attempts"
    return 1
}

# Function to stop Docker services
stop_docker_services() {
    print_section "Stopping Docker Services"

    check_docker

    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q | grep -q .; then
        print_status "Stopping Docker containers..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" down
        print_status "Docker services stopped ✓"
    else
        print_warning "No Docker services running"
    fi
}

# Function to stop orchestration service
stop_orchestration() {
    print_section "Stopping Orchestration Service"

    if check_orchestration; then
        local pid=$(get_orchestration_pid)
        print_status "Stopping orchestration service (PID: $pid)..."
        pkill -f "$ORCHESTRATION_PROCESS"

        # Wait for process to stop
        local attempts=0
        while check_orchestration && [ $attempts -lt 10 ]; do
            sleep 1
            attempts=$((attempts + 1))
        done

        if check_orchestration; then
            print_warning "Force killing orchestration service..."
            pkill -9 -f "$ORCHESTRATION_PROCESS" || true
        fi

        print_status "Orchestration service stopped ✓"
    else
        print_warning "Orchestration service not running"
    fi
}

# Function to start Docker services
start_docker_services() {
    print_section "Starting Docker Services"

    check_docker

    print_status "Starting core Docker services..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres chromadb ollama redis

    print_status "Waiting for services to initialize..."
    sleep 10

    # Check service health
    check_service_health "PostgreSQL" "http://localhost:$ORCHESTRATION_PORT/api/service-status/postgres" || true
    check_service_health "ChromaDB" "http://localhost:8000/api/v1/heartbeat" || true
    check_service_health "Ollama" "http://localhost:11434/api/tags" || true
    check_service_health "Redis" "redis://localhost:6379" || true

    print_status "Docker services started ✓"
}

# Function to start orchestration service
start_orchestration() {
    print_section "Starting Orchestration Service"

    if check_orchestration; then
        print_warning "Orchestration service already running (PID: $(get_orchestration_pid))"
        return 0
    fi

    print_status "Starting orchestration service on port $ORCHESTRATION_PORT..."

    # Check if port is available
    if lsof -Pi :$ORCHESTRATION_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_error "Port $ORCHESTRATION_PORT is already in use"
        print_status "Processes using port $ORCHESTRATION_PORT:"
        lsof -Pi :$ORCHESTRATION_PORT -sTCP:LISTEN
        return 1
    fi

    # Start in background
    nohup node src/orchestration/app.js > logs/orchestration.log 2>&1 &
    local pid=$!

    # Wait for service to start
    sleep 5

    if check_orchestration; then
        print_status "Orchestration service started ✓ (PID: $(get_orchestration_pid))"

        # Check service health
        check_service_health "Orchestration Service" "http://localhost:$ORCHESTRATION_PORT/health"
    else
        print_error "Failed to start orchestration service"
        print_status "Check logs at: logs/orchestration.log"
        return 1
    fi
}

# Function to show service status
show_status() {
    print_header "Service Status"

    # Docker services
    print_section "Docker Services"
    if docker info >/dev/null 2>&1; then
        docker-compose -f "$DOCKER_COMPOSE_FILE" ps
    else
        print_error "Docker is not running"
    fi

    echo

    # Orchestration service
    print_section "Orchestration Service"
    if check_orchestration; then
        local pid=$(get_orchestration_pid)
        print_status "Running (PID: $pid, Port: $ORCHESTRATION_PORT) ✓"

        # Show service endpoints if running
        if curl -s "http://localhost:$ORCHESTRATION_PORT/health" >/dev/null 2>&1; then
            echo -e "${GREEN}Available Endpoints:${NC}"
            echo "  • Health Check: http://localhost:$ORCHESTRATION_PORT/health"
            echo "  • Test Interface: http://localhost:$ORCHESTRATION_PORT/test-interface.html"
            echo "  • PostgreSQL Status: http://localhost:$ORCHESTRATION_PORT/api/service-status/postgres"
            echo "  • ChromaDB Status: http://localhost:$ORCHESTRATION_PORT/api/service-status/chromadb"
            echo "  • Ollama Status: http://localhost:$ORCHESTRATION_PORT/api/service-status/ollama"
        fi
    else
        print_warning "Not running ✗"
    fi

    echo

    # Port usage
    print_section "Port Usage"
    echo "Checking key ports..."
    for port in 5432 6379 8000 8001 11434; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            local process=$(lsof -Pi :$port -sTCP:LISTEN -t | head -1)
            local process_name=$(ps -p $process -o comm= 2>/dev/null || echo "unknown")
            echo -e "  Port $port: ${GREEN}OCCUPIED${NC} (PID: $process, Process: $process_name)"
        else
            echo -e "  Port $port: ${YELLOW}FREE${NC}"
        fi
    done
}

# Function to run quick tests
run_tests() {
    print_header "Running Quick Tests"

    if ! check_orchestration; then
        print_error "Orchestration service not running. Start services first."
        return 1
    fi

    print_section "Service Health Tests"

    # Test orchestration health
    print_status "Testing orchestration service health..."
    if curl -s "http://localhost:$ORCHESTRATION_PORT/health" | grep -q "healthy"; then
        print_status "Orchestration service health: PASS ✓"
    else
        print_error "Orchestration service health: FAIL ✗"
    fi

    # Test token generation
    print_status "Testing token generation..."
    local token_response=$(curl -s -X POST "http://localhost:$ORCHESTRATION_PORT/api/generate-token" \
        -H "Content-Type: application/json" -d '{}')

    if echo "$token_response" | grep -q '"success":true'; then
        print_status "Token generation: PASS ✓"

        # Test business request
        print_status "Testing business request..."
        local token=$(echo "$token_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

        local business_response=$(curl -s -X POST "http://localhost:$ORCHESTRATION_PORT/api/business-request" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $token" \
            -d '{"request": "Show me all orders", "context": {}}')

        if echo "$business_response" | grep -q '"success":true'; then
            print_status "Business request processing: PASS ✓"
        else
            print_error "Business request processing: FAIL ✗"
        fi
    else
        print_error "Token generation: FAIL ✗"
    fi
}

# Function to create logs directory
ensure_logs_directory() {
    if [ ! -d "logs" ]; then
        mkdir -p logs
        print_status "Created logs directory"
    fi
}

# Function to clean up resources
cleanup() {
    print_section "Cleaning Up Resources"

    # Remove old log files
    if [ -d "logs" ]; then
        find logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
        print_status "Cleaned old log files"
    fi

    # Clean Docker resources
    print_status "Cleaning Docker resources..."
    docker system prune -f >/dev/null 2>&1 || true
    print_status "Docker cleanup completed"
}

# Main execution
main() {
    case "${1:-}" in
        "start")
            print_header "Starting All Services"
            ensure_logs_directory
            start_docker_services
            echo
            start_orchestration
            echo
            show_status
            echo
            print_status "All services started successfully!"
            print_status "Access test interface: http://localhost:$ORCHESTRATION_PORT/test-interface.html"
            ;;
        "stop")
            print_header "Stopping All Services"
            stop_orchestration
            echo
            stop_docker_services
            echo
            print_status "All services stopped successfully!"
            ;;
        "restart")
            print_header "Restarting All Services"
            stop_orchestration
            echo
            stop_docker_services
            echo
            sleep 3
            ensure_logs_directory
            start_docker_services
            echo
            start_orchestration
            echo
            show_status
            echo
            print_status "All services restarted successfully!"
            print_status "Access test interface: http://localhost:$ORCHESTRATION_PORT/test-interface.html"
            ;;
        "status")
            show_status
            ;;
        "test")
            run_tests
            ;;
        "cleanup")
            cleanup
            ;;
        "docker-only")
            case "${2:-}" in
                "start")
                    start_docker_services
                    ;;
                "stop")
                    stop_docker_services
                    ;;
                "restart")
                    stop_docker_services
                    sleep 3
                    start_docker_services
                    ;;
                *)
                    print_error "Usage: $0 docker-only [start|stop|restart]"
                    exit 1
                    ;;
            esac
            ;;
        "orchestration-only")
            case "${2:-}" in
                "start")
                    ensure_logs_directory
                    start_orchestration
                    ;;
                "stop")
                    stop_orchestration
                    ;;
                "restart")
                    stop_orchestration
                    sleep 2
                    ensure_logs_directory
                    start_orchestration
                    ;;
                *)
                    print_error "Usage: $0 orchestration-only [start|stop|restart]"
                    exit 1
                    ;;
            esac
            ;;
        "help"|"-h"|"--help")
            cat << EOF
SLM Business Service Layer - Service Management Script

Usage: $0 [COMMAND] [OPTIONS]

Commands:
  start                 Start all services (Docker + Orchestration)
  stop                  Stop all services
  restart               Restart all services
  status                Show status of all services
  test                  Run quick health tests
  cleanup               Clean up logs and Docker resources

  docker-only [start|stop|restart]        Manage only Docker services
  orchestration-only [start|stop|restart] Manage only orchestration service

  help, -h, --help      Show this help message

Examples:
  $0 start              # Start all services
  $0 restart            # Restart everything
  $0 status             # Check service status
  $0 test               # Run health tests
  $0 docker-only start  # Start only Docker services

Service Ports:
  8001  - Orchestration Service
  5432  - PostgreSQL Database
  8000  - ChromaDB Vector Database
  11434 - Ollama SLM Service
  6379  - Redis Cache

Access Points:
  • Test Interface: http://localhost:8001/test-interface.html
  • Health Check: http://localhost:8001/health
  • Service Status: http://localhost:8001/api/service-status/*

EOF
            ;;
        *)
            print_error "Unknown command: ${1:-}"
            print_status "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"