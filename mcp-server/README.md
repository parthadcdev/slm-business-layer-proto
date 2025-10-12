# SLM DevOps MCP Server

A unified Model Context Protocol (MCP) server for the SLM Business Layer project that provides comprehensive DevOps tools for Testing, Building, Deployment, and Git Operations.

## Overview

This MCP server consolidates all DevOps operations into a single, unified interface that can be used by Claude Code or any MCP-compatible client. It provides 40+ tools organized into four main categories:

### 🧪 Test Tools (6 tools)
- **test_run_unit**: Run unit tests with Jest or configured test runner
- **test_run_integration**: Run integration tests with service validation
- **test_health_check**: Comprehensive health checks for all services
- **test_smoke**: Basic functionality verification tests
- **test_performance**: Performance testing and benchmarking
- **test_validate_environment**: Development environment validation

### 🔨 Build Tools (6 tools)
- **build_lint**: Code linting and formatting with ESLint/Prettier
- **build_compile**: Project compilation and building
- **build_package**: Create deployment packages with checksums
- **build_analyze**: Analyze dependencies, bundle size, and security
- **build_clean**: Clean build artifacts and temporary files
- **build_watch**: Watch for changes and auto-rebuild

### 🚀 Deploy Tools (8 tools)
- **deploy_local**: Full local deployment with backup and verification
- **deploy_services_start**: Start all or specific services
- **deploy_services_stop**: Stop services gracefully with cleanup
- **deploy_services_restart**: Restart services with health checks
- **deploy_status**: Comprehensive deployment status reporting
- **deploy_rollback**: Rollback to previous deployment
- **deploy_scale**: Scale services (conceptual for local environment)
- **deploy_logs**: Retrieve service logs with filtering

### 🔄 Git Tools (10 tools)
- **git_status**: Repository status with detailed information
- **git_commit**: Create commits with file staging
- **git_branch**: Branch management (list, create, switch, delete, merge)
- **git_push**: Push changes with upstream tracking
- **git_pull**: Pull changes with merge/rebase strategies
- **git_create_pr**: Create GitHub pull requests via CLI
- **git_log**: View commit history with filtering
- **git_diff**: Show differences between commits/branches
- **git_tag**: Tag management operations
- **git_stash**: Stash management for temporary changes

## Installation

### Prerequisites
- Node.js 18.0.0 or later
- Git
- Docker/Podman (for containerized services)
- GitHub CLI (optional, for PR creation)

### Setup

1. **Install dependencies:**
   ```bash
   cd mcp-server
   npm install
   ```

2. **Configure MCP Client:**
   Add this server to your MCP client configuration. For Claude Code, add to your config:

   ```json
   {
     "mcpServers": {
       "slm-devops": {
         "command": "node",
         "args": ["/path/to/slm-business-layer-proto/mcp-server/index.js"],
         "cwd": "/path/to/slm-business-layer-proto"
       }
     }
   }
   ```

3. **Verify installation:**
   ```bash
   npm test
   ```

## Configuration

The MCP server automatically detects your project configuration from the parent directory structure. Key configuration files:

- **Project Root**: Auto-detected as parent directory of mcp-server
- **Scripts**: Uses existing `scripts/dev-workflow.sh` and `scripts/manage-services.sh`
- **Services**: Configured for PostgreSQL, ChromaDB, Ollama, Redis, and Orchestration service
- **Ports**: Orchestration (8001), PostgreSQL (5432), ChromaDB (8000), Ollama (11434), Redis (6379)

### Environment Variables
- `NODE_ENV`: Environment (development/production/staging)
- `BUILD_OPTIMIZE`: Enable build optimization (true/false)
- `JWT_SECRET`: JWT secret for authentication (if using auth features)

## Usage Examples

### Testing Operations
```typescript
// Run all tests
await client.callTool('test_run_unit', { coverage: true });

// Health check with details
await client.callTool('test_health_check', { detailed: true });

// Performance testing
await client.callTool('test_performance', { duration: 60, concurrency: 10 });
```

### Build Operations
```typescript
// Lint and fix code
await client.callTool('build_lint', { fix: true, format: true });

// Build for production
await client.callTool('build_compile', { environment: 'production', optimize: true });

// Create deployment package
await client.callTool('build_package', { format: 'tar.gz', includeSource: false });
```

### Deployment Operations
```typescript
// Deploy with backup and verification
await client.callTool('deploy_local', { backup: true, verify: true });

// Restart specific service
await client.callTool('deploy_services_restart', { services: ['orchestration'] });

// Get deployment status
await client.callTool('deploy_status', { detailed: true, format: 'json' });
```

### Git Operations
```typescript
// Create commit with all changes
await client.callTool('git_commit', {
  message: 'Add new feature',
  addAll: true
});

// Create and push feature branch
await client.callTool('git_branch', { action: 'create', name: 'feature/new-feature' });
await client.callTool('git_push', { setUpstream: true });

// Create pull request
await client.callTool('git_create_pr', {
  title: 'Add new feature',
  body: 'Description of changes',
  labels: ['enhancement']
});
```

## Architecture

```
mcp-server/
├── index.js                 # Main MCP server entry point
├── config/
│   └── project-config.js    # Centralized project configuration
├── tools/
│   ├── test-tools.js        # Testing tools implementation
│   ├── build-tools.js       # Build tools implementation
│   ├── deploy-tools.js      # Deployment tools implementation
│   └── git-tools.js         # Git tools implementation
├── test/
│   └── run-tests.js         # Server testing utilities
├── package.json             # NPM configuration
└── README.md               # This file
```

### Key Design Principles

1. **Unified Interface**: Single MCP server for all DevOps operations
2. **Existing Scripts Integration**: Leverages your current automation scripts
3. **Comprehensive Coverage**: Tools for entire development lifecycle
4. **Error Handling**: Robust error handling with detailed feedback
5. **Configuration Management**: Centralized configuration with auto-detection
6. **Extensibility**: Easy to add new tools and capabilities

## Integration with Existing Scripts

The MCP server integrates seamlessly with your existing automation:

- **dev-workflow.sh**: Used for build, test, and deployment operations
- **manage-services.sh**: Used for service lifecycle management
- **troubleshoot-services.sh**: Used for diagnostics and troubleshooting

This ensures consistency with your current development workflow while providing enhanced capabilities through the MCP interface.

## Tool Categories Detail

### Test Tools Features
- ✅ Unit test execution with coverage
- ✅ Integration test orchestration
- ✅ Service health monitoring
- ✅ Performance benchmarking
- ✅ Environment validation
- ✅ Smoke testing for critical paths

### Build Tools Features
- ✅ Code quality enforcement (ESLint/Prettier)
- ✅ Production-ready compilation
- ✅ Deployment package creation
- ✅ Dependency and security analysis
- ✅ Intelligent cleanup operations
- ✅ Development watch mode

### Deploy Tools Features
- ✅ Safe deployment with rollback
- ✅ Service lifecycle management
- ✅ Health verification
- ✅ Status monitoring
- ✅ Log aggregation
- ✅ Scaling operations (conceptual for local)

### Git Tools Features
- ✅ Complete repository management
- ✅ Branch workflow support
- ✅ Pull request automation
- ✅ Tag and release management
- ✅ Stash operations
- ✅ Diff and history analysis

## Error Handling

All tools provide comprehensive error handling with:
- Detailed error messages
- Command output capture
- Timeout protection
- Graceful degradation
- Recovery suggestions

## Performance

- **Fast Tool Execution**: Direct script invocation without overhead
- **Parallel Operations**: Where safe and beneficial
- **Resource Management**: Automatic cleanup and resource optimization
- **Caching**: Intelligent use of existing build artifacts

## Security

- **Input Validation**: All parameters validated before execution
- **Command Injection Protection**: Safe command construction
- **File System Access**: Limited to project directory
- **Process Isolation**: Safe execution of external commands

## Troubleshooting

### Common Issues

1. **MCP Server Not Starting**
   ```bash
   # Check Node.js version
   node --version  # Should be 18+

   # Check dependencies
   npm install

   # Test directly
   node index.js
   ```

2. **Tools Failing**
   ```bash
   # Validate environment
   npm run test

   # Check project structure
   test_validate_environment fix=true
   ```

3. **Service Integration Issues**
   ```bash
   # Check existing scripts
   ls -la scripts/

   # Test script execution
   ./scripts/manage-services.sh status
   ```

### Debugging

Enable verbose logging by setting environment variable:
```bash
DEBUG=1 node index.js
```

### Support

- Check existing project documentation in `CLAUDE.md`
- Review script logs in `logs/` directory
- Use `test_validate_environment` tool for diagnostics

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Make changes in the `mcp-server/` directory
4. Test your changes (`npm test`)
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open pull request

## License

MIT License - see LICENSE file for details.

## Changelog

### v1.0.0 (Initial Release)
- ✅ Complete MCP server implementation
- ✅ 30+ DevOps tools across 4 categories
- ✅ Integration with existing project scripts
- ✅ Comprehensive error handling and validation
- ✅ Full documentation and examples