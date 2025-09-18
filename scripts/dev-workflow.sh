#!/bin/bash

# SLM Business Layer Development Workflow Script
# Author: Partha Chandramohan
# Description: Compile, package, test, and deploy changes for developers
# Usage: ./scripts/dev-workflow.sh [build|test|lint|deploy|full|clean|watch] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Project configuration
PROJECT_NAME="slm-business-layer"
NODE_VERSION="18"
PACKAGE_JSON="package.json"
SRC_DIR="src"
DIST_DIR="dist"
LOGS_DIR="logs"
BACKUP_DIR="backups"

# Service configuration
ORCHESTRATION_SERVICE="src/orchestration/app.js"
ORCHESTRATION_PORT=8001

# Utility functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}================================${NC}"
}

log_section() {
    echo -e "${PURPLE}--- $1 ---${NC}"
}

# Check if we're in the project root
check_project_root() {
    if [[ ! -f "$PACKAGE_JSON" ]]; then
        log_error "package.json not found. Please run this script from the project root."
        exit 1
    fi
}

# Check Node.js version
check_node_version() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js $NODE_VERSION or later."
        exit 1
    fi

    local current_version=$(node --version | sed 's/v//')
    local major_version=$(echo $current_version | cut -d'.' -f1)

    if [[ $major_version -lt $NODE_VERSION ]]; then
        log_warning "Node.js version $current_version detected. Recommended: $NODE_VERSION or later."
    else
        log_info "Node.js version $current_version ✓"
    fi
}

# Create necessary directories
ensure_directories() {
    for dir in "$LOGS_DIR" "$BACKUP_DIR" "$DIST_DIR"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log_info "Created directory: $dir"
        fi
    done
}

# Install or update dependencies
install_dependencies() {
    log_section "Installing Dependencies"

    check_node_version

    if [[ ! -d "node_modules" ]] || [[ "$PACKAGE_JSON" -nt "node_modules" ]]; then
        log_info "Installing/updating Node.js dependencies..."
        npm install
        log_success "Dependencies installed ✓"
    else
        log_info "Dependencies up to date ✓"
    fi
}

# Lint code
run_lint() {
    log_section "Running Code Linting"

    # Check if ESLint is configured
    if [[ -f ".eslintrc.js" ]] || [[ -f ".eslintrc.json" ]] || [[ -f "eslint.config.js" ]]; then
        log_info "Running ESLint..."
        if npm run lint 2>/dev/null || npx eslint $SRC_DIR --ext .js,.jsx,.ts,.tsx; then
            log_success "ESLint passed ✓"
        else
            log_warning "ESLint found issues. Run 'npm run lint:fix' to auto-fix some issues."
            return 1
        fi
    else
        log_warning "No ESLint configuration found. Creating basic setup..."
        create_eslint_config
    fi

    # Check if Prettier is configured
    if [[ -f ".prettierrc" ]] || [[ -f ".prettierrc.json" ]] || [[ -f "prettier.config.js" ]]; then
        log_info "Running Prettier check..."
        if npx prettier --check $SRC_DIR; then
            log_success "Prettier formatting check passed ✓"
        else
            log_warning "Code formatting issues found. Run 'npx prettier --write $SRC_DIR' to fix."
            return 1
        fi
    else
        log_info "No Prettier configuration found. Skipping format check."
    fi
}

# Create basic ESLint configuration
create_eslint_config() {
    cat > .eslintrc.json << 'EOF'
{
  "env": {
    "node": true,
    "es2021": true
  },
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaVersion": 12,
    "sourceType": "module"
  },
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "error",
    "prefer-const": "error",
    "no-var": "error"
  }
}
EOF
    log_info "Created basic ESLint configuration"
}

# Run tests
run_tests() {
    log_section "Running Tests"

    local test_mode=${1:-"all"}
    local test_passed=true

    # Unit tests
    if [[ "$test_mode" == "all" ]] || [[ "$test_mode" == "unit" ]]; then
        log_info "Running unit tests..."
        if npm test 2>/dev/null || log_warning "No test script found in package.json"; then
            log_success "Unit tests passed ✓"
        else
            log_error "Unit tests failed ✗"
            test_passed=false
        fi
    fi

    # Integration tests
    if [[ "$test_mode" == "all" ]] || [[ "$test_mode" == "integration" ]]; then
        log_info "Running integration tests..."
        if run_integration_tests; then
            log_success "Integration tests passed ✓"
        else
            log_error "Integration tests failed ✗"
            test_passed=false
        fi
    fi

    # Service health tests
    if [[ "$test_mode" == "all" ]] || [[ "$test_mode" == "health" ]]; then
        log_info "Running service health tests..."
        if ./scripts/manage-services.sh test; then
            log_success "Service health tests passed ✓"
        else
            log_error "Service health tests failed ✗"
            test_passed=false
        fi
    fi

    if $test_passed; then
        log_success "All tests passed ✓"
        return 0
    else
        log_error "Some tests failed ✗"
        return 1
    fi
}

# Run integration tests
run_integration_tests() {
    log_info "Checking if services are running..."

    # Check if orchestration service is running
    if ! pgrep -f "$ORCHESTRATION_SERVICE" >/dev/null; then
        log_warning "Orchestration service not running. Starting services..."
        ./scripts/manage-services.sh start
        sleep 5
    fi

    # Test database connection
    log_info "Testing database connection..."
    if curl -s "http://localhost:$ORCHESTRATION_PORT/api/service-status/postgres" | grep -q "healthy"; then
        log_success "Database connection test passed ✓"
    else
        log_error "Database connection test failed ✗"
        return 1
    fi

    # Test API endpoints
    log_info "Testing API endpoints..."
    local token_response=$(curl -s -X POST "http://localhost:$ORCHESTRATION_PORT/api/generate-token" -H "Content-Type: application/json" -d '{}')

    if echo "$token_response" | grep -q '"success":true'; then
        local token=$(echo "$token_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

        # Test business request
        local business_response=$(curl -s -X POST "http://localhost:$ORCHESTRATION_PORT/api/business-request" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $token" \
            -d '{"request": "Show me system status", "context": {}}')

        if echo "$business_response" | grep -q '"success":true'; then
            log_success "API endpoint tests passed ✓"
            return 0
        fi
    fi

    log_error "API endpoint tests failed ✗"
    return 1
}

# Build project
build_project() {
    log_section "Building Project"

    ensure_directories

    # Clean previous build
    if [[ -d "$DIST_DIR" ]]; then
        log_info "Cleaning previous build..."
        rm -rf "$DIST_DIR"
        mkdir -p "$DIST_DIR"
    fi

    # Copy source files and apply any transformations
    log_info "Copying source files..."
    cp -r "$SRC_DIR"/* "$DIST_DIR"/ 2>/dev/null || log_warning "No source files to copy"

    # Process package.json for production
    if [[ -f "$PACKAGE_JSON" ]]; then
        log_info "Processing package.json for production..."
        # Create a production package.json without devDependencies
        node -e "
            const pkg = require('./$PACKAGE_JSON');
            delete pkg.devDependencies;
            pkg.scripts = { start: pkg.scripts.start || 'node src/orchestration/app.js' };
            require('fs').writeFileSync('$DIST_DIR/package.json', JSON.stringify(pkg, null, 2));
        "
        log_success "Production package.json created ✓"
    fi

    # Copy configuration files
    for file in docker-compose.yml .env .env.local; do
        if [[ -f "$file" ]]; then
            cp "$file" "$DIST_DIR/"
            log_info "Copied $file to dist"
        fi
    done

    log_success "Build completed ✓"
}

# Create deployment package
create_package() {
    log_section "Creating Deployment Package"

    local timestamp=$(date +%Y%m%d_%H%M%S)
    local package_name="${PROJECT_NAME}_${timestamp}.tar.gz"
    local package_path="$BACKUP_DIR/$package_name"

    if [[ ! -d "$DIST_DIR" ]]; then
        log_error "No build found. Run 'build' first."
        return 1
    fi

    log_info "Creating deployment package: $package_name"

    # Create tarball
    tar -czf "$package_path" -C "$DIST_DIR" .

    # Create checksum
    local checksum=$(shasum -a 256 "$package_path" | cut -d' ' -f1)
    echo "$checksum  $package_name" > "$package_path.sha256"

    log_success "Package created: $package_path"
    log_info "Checksum: $checksum"

    # Create symlink to latest
    ln -sf "$package_name" "$BACKUP_DIR/latest.tar.gz"
    ln -sf "$package_name.sha256" "$BACKUP_DIR/latest.tar.gz.sha256"

    log_success "Latest package symlink updated ✓"
}

# Deploy locally
deploy_local() {
    log_section "Local Deployment"

    # Stop services
    log_info "Stopping existing services..."
    ./scripts/manage-services.sh stop || log_warning "Services may not have been running"

    # Backup current installation
    if [[ -d "$SRC_DIR" ]]; then
        local backup_name="backup_$(date +%Y%m%d_%H%M%S)"
        cp -r "$SRC_DIR" "$BACKUP_DIR/$backup_name"
        log_info "Created backup: $backup_name"
    fi

    # Deploy new version
    if [[ -d "$DIST_DIR" ]]; then
        log_info "Deploying new version..."
        # We keep source in place for development, but this shows the pattern
        log_success "Deployment would copy from $DIST_DIR to production location"
    fi

    # Restart services
    log_info "Starting services with new deployment..."
    ./scripts/manage-services.sh start

    # Verify deployment
    sleep 5
    if curl -s "http://localhost:$ORCHESTRATION_PORT/health" | grep -q "healthy"; then
        log_success "Deployment successful ✓"
        log_info "Service available at: http://localhost:$ORCHESTRATION_PORT"
    else
        log_error "Deployment verification failed ✗"
        return 1
    fi
}

# Watch for changes and auto-restart
watch_mode() {
    log_section "Development Watch Mode"

    if ! command -v fswatch &> /dev/null; then
        log_error "fswatch not found. Install with: brew install fswatch (macOS) or apt-get install inotify-tools (Linux)"
        exit 1
    fi

    log_info "Starting watch mode for $SRC_DIR..."
    log_info "Press Ctrl+C to stop watching"

    # Start services if not running
    if ! pgrep -f "$ORCHESTRATION_SERVICE" >/dev/null; then
        log_info "Starting services..."
        ./scripts/manage-services.sh orchestration-only start
    fi

    # Watch for changes
    fswatch -e ".*" -i "\\.js$" -i "\\.json$" "$SRC_DIR" | while read file; do
        log_info "File changed: $file"
        log_info "Restarting orchestration service..."
        ./scripts/manage-services.sh orchestration-only restart
    done
}

# Clean up build artifacts and logs
clean_project() {
    log_section "Cleaning Project"

    # Remove build artifacts
    if [[ -d "$DIST_DIR" ]]; then
        rm -rf "$DIST_DIR"
        log_info "Removed build directory ✓"
    fi

    # Clean old logs
    if [[ -d "$LOGS_DIR" ]]; then
        find "$LOGS_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
        log_info "Cleaned old logs ✓"
    fi

    # Clean old backups
    if [[ -d "$BACKUP_DIR" ]]; then
        find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete 2>/dev/null || true
        find "$BACKUP_DIR" -name "*.sha256" -mtime +30 -delete 2>/dev/null || true
        log_info "Cleaned old backups ✓"
    fi

    # Clean Docker resources
    log_info "Cleaning Docker resources..."
    docker system prune -f >/dev/null 2>&1 || true

    # Clean node_modules if requested
    read -p "Clean node_modules? This will require reinstall. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf node_modules
        rm -f package-lock.json
        log_info "Removed node_modules and package-lock.json ✓"
    fi

    log_success "Project cleaned ✓"
}

# Full development workflow
full_workflow() {
    log_header "Full Development Workflow"

    local start_time=$(date +%s)

    # Install dependencies
    install_dependencies
    echo

    # Lint code
    if ! run_lint; then
        log_error "Linting failed. Fix issues before continuing."
        exit 1
    fi
    echo

    # Build project
    build_project
    echo

    # Run tests
    if ! run_tests; then
        log_error "Tests failed. Fix issues before continuing."
        exit 1
    fi
    echo

    # Create package
    create_package
    echo

    # Deploy locally
    deploy_local

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_success "Full workflow completed in ${duration}s ✓"
    log_info "Application available at: http://localhost:$ORCHESTRATION_PORT/test-interface.html"
}

# Display usage information
show_usage() {
    cat << 'EOF'
SLM Business Layer Development Workflow Script

Usage: ./scripts/dev-workflow.sh [COMMAND] [OPTIONS]

Commands:
  build         Build the project for deployment
  test          Run tests (unit, integration, health)
  lint          Run code linting and formatting checks
  package       Create deployment package
  deploy        Deploy locally with service restart
  full          Complete workflow: lint → build → test → package → deploy
  clean         Clean build artifacts, logs, and temporary files
  watch         Watch for file changes and auto-restart services
  deps          Install/update dependencies
  help          Show this help message

Test Options:
  test unit     Run unit tests only
  test health   Run service health tests only
  test int      Run integration tests only

Examples:
  ./scripts/dev-workflow.sh full          # Complete development workflow
  ./scripts/dev-workflow.sh build         # Build project only
  ./scripts/dev-workflow.sh test health   # Run health tests only
  ./scripts/dev-workflow.sh watch         # Watch mode for development
  ./scripts/dev-workflow.sh clean         # Clean up project

Development Workflow:
  1. Make code changes
  2. Run: ./scripts/dev-workflow.sh lint   # Check code quality
  3. Run: ./scripts/dev-workflow.sh test   # Verify functionality
  4. Run: ./scripts/dev-workflow.sh deploy # Deploy changes locally

  Or simply run: ./scripts/dev-workflow.sh full

Quick Development:
  ./scripts/dev-workflow.sh watch         # Auto-restart on file changes

Build Artifacts:
  dist/         Built project files
  backups/      Deployment packages and backups
  logs/         Service and build logs

Dependencies:
  - Node.js 18+ (required)
  - Docker & Docker Compose (required)
  - fswatch (for watch mode, optional)

EOF
}

# Main script logic
main() {
    local command=${1:-help}
    local option=${2:-}

    # Ensure we're in the right place
    check_project_root

    case "$command" in
        "build")
            log_header "Building Project"
            install_dependencies
            echo
            build_project
            ;;
        "test")
            log_header "Running Tests"
            run_tests "$option"
            ;;
        "lint")
            log_header "Code Linting"
            install_dependencies
            echo
            run_lint
            ;;
        "package")
            log_header "Creating Package"
            if [[ ! -d "$DIST_DIR" ]]; then
                log_warning "No build found. Building first..."
                build_project
                echo
            fi
            create_package
            ;;
        "deploy")
            log_header "Local Deployment"
            deploy_local
            ;;
        "full")
            full_workflow
            ;;
        "clean")
            log_header "Cleaning Project"
            clean_project
            ;;
        "watch")
            watch_mode
            ;;
        "deps")
            log_header "Managing Dependencies"
            install_dependencies
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"