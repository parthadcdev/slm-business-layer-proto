/**
 * Project Configuration for SLM Business Layer MCP Server
 * Centralized configuration management for all DevOps operations
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProjectConfig {
  constructor() {
    // Project root directory (go up from mcp-server/config/)
    this.projectRoot = path.resolve(__dirname, '../../');

    // Project metadata
    this.projectName = 'slm-business-layer-proto';
    this.version = '1.0.0';
    this.nodeVersion = '18';

    // Directory paths
    this.paths = {
      src: path.join(this.projectRoot, 'src'),
      scripts: path.join(this.projectRoot, 'scripts'),
      logs: path.join(this.projectRoot, 'logs'),
      dist: path.join(this.projectRoot, 'dist'),
      backups: path.join(this.projectRoot, 'backups'),
      database: path.join(this.projectRoot, 'database'),
      mcpServer: path.join(this.projectRoot, 'mcp-server'),
    };

    // Service configuration
    this.services = {
      orchestration: {
        process: 'node src/orchestration/app.js',
        port: 8001,
        healthEndpoint: 'http://localhost:8001/health',
        testInterface: 'http://localhost:8001/test-interface.html',
      },
      postgres: {
        port: 5432,
        database: 'business_app',
        user: 'app_user',
        password: 'app_password',
        host: 'localhost',
        healthEndpoint: 'http://localhost:8001/api/service-status/postgres',
      },
      chromadb: {
        port: 8000,
        healthEndpoint: 'http://localhost:8000/api/v1/heartbeat',
      },
      ollama: {
        port: 11434,
        healthEndpoint: 'http://localhost:11434/api/tags',
      },
      redis: {
        port: 6379,
        connectionString: 'redis://localhost:6379',
      },
    };

    // Script paths
    this.scripts = {
      devWorkflow: path.join(this.paths.scripts, 'dev-workflow.sh'),
      manageServices: path.join(this.paths.scripts, 'manage-services.sh'),
      troubleshoot: path.join(this.paths.scripts, 'troubleshoot-services.sh'),
    };

    // Docker/Podman configuration
    this.containerConfig = {
      composeFile: path.join(this.projectRoot, 'docker-compose.yml'),
      usesPodman: true, // Project uses Podman instead of Docker
    };

    // Git configuration
    this.git = {
      mainBranch: 'main',
      developBranch: 'develop',
      defaultRemote: 'origin',
    };

    // Test configuration
    this.testing = {
      unitTestCommand: 'npm test',
      integrationTestScript: path.join(this.paths.scripts, 'manage-services.sh test'),
      healthCheckRetries: 30,
      healthCheckInterval: 1000, // ms
    };

    // Build configuration
    this.build = {
      lintCommand: 'npm run lint',
      formatCommand: 'npm run format',
      buildDir: this.paths.dist,
      packageFormats: ['tar.gz'],
      checksumAlgorithm: 'sha256',
    };

    // Deployment configuration
    this.deployment = {
      environment: 'local',
      backupBeforeDeploy: true,
      verifyAfterDeploy: true,
      rollbackOnFailure: true,
    };
  }

  /**
   * Get the project root directory
   */
  getProjectRoot() {
    return this.projectRoot;
  }

  /**
   * Get service configuration by name
   */
  getServiceConfig(serviceName) {
    return this.services[serviceName];
  }

  /**
   * Get all service configurations
   */
  getAllServices() {
    return this.services;
  }

  /**
   * Get script path by name
   */
  getScriptPath(scriptName) {
    return this.scripts[scriptName];
  }

  /**
   * Get path configuration
   */
  getPaths() {
    return this.paths;
  }

  /**
   * Get testing configuration
   */
  getTestConfig() {
    return this.testing;
  }

  /**
   * Get build configuration
   */
  getBuildConfig() {
    return this.build;
  }

  /**
   * Get deployment configuration
   */
  getDeploymentConfig() {
    return this.deployment;
  }

  /**
   * Get Git configuration
   */
  getGitConfig() {
    return this.git;
  }

  /**
   * Check if project uses Podman instead of Docker
   */
  usesPodman() {
    return this.containerConfig.usesPodman;
  }

  /**
   * Get container compose file path
   */
  getComposeFile() {
    return this.containerConfig.composeFile;
  }

  /**
   * Validate project structure
   */
  async validateProject() {
    const fs = await import('fs');
    const requiredPaths = [
      this.paths.src,
      this.paths.scripts,
      path.join(this.projectRoot, 'package.json'),
      this.scripts.devWorkflow,
      this.scripts.manageServices,
    ];

    const missing = [];
    for (const reqPath of requiredPaths) {
      if (!fs.existsSync(reqPath)) {
        missing.push(reqPath);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required project files/directories: ${missing.join(', ')}`);
    }

    return true;
  }
}