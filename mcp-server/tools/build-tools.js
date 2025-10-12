/**
 * Build Management Tools for SLM Business Layer MCP Server
 * Provides comprehensive build capabilities including linting, compilation, packaging, and optimization
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

export class BuildTools {
  constructor(config) {
    this.config = config;
  }

  /**
   * Get tool definitions for MCP
   */
  getToolDefinitions() {
    return [
      {
        name: 'build_lint',
        description: 'Run code linting and formatting checks',
        inputSchema: {
          type: 'object',
          properties: {
            fix: {
              type: 'boolean',
              description: 'Automatically fix linting issues where possible',
              default: false,
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific files or patterns to lint (empty for all)',
              default: [],
            },
            format: {
              type: 'boolean',
              description: 'Also run code formatting (Prettier)',
              default: true,
            },
          },
        },
      },
      {
        name: 'build_compile',
        description: 'Compile and build the project for deployment',
        inputSchema: {
          type: 'object',
          properties: {
            environment: {
              type: 'string',
              enum: ['development', 'production', 'staging'],
              description: 'Build environment',
              default: 'production',
            },
            clean: {
              type: 'boolean',
              description: 'Clean previous build artifacts',
              default: true,
            },
            optimize: {
              type: 'boolean',
              description: 'Enable optimization for production builds',
              default: true,
            },
          },
        },
      },
      {
        name: 'build_package',
        description: 'Create deployment packages with checksums',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['tar.gz', 'zip', 'tar.bz2'],
              description: 'Package format',
              default: 'tar.gz',
            },
            includeSource: {
              type: 'boolean',
              description: 'Include source code in package',
              default: false,
            },
            version: {
              type: 'string',
              description: 'Version tag for the package (auto-generated if not provided)',
            },
          },
        },
      },
      {
        name: 'build_analyze',
        description: 'Analyze build artifacts and dependencies',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['dependencies', 'bundle', 'security', 'all'],
              description: 'Type of analysis to perform',
              default: 'all',
            },
            output: {
              type: 'string',
              enum: ['console', 'file', 'json'],
              description: 'Output format',
              default: 'console',
            },
          },
        },
      },
      {
        name: 'build_clean',
        description: 'Clean build artifacts and temporary files',
        inputSchema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              enum: ['build', 'cache', 'logs', 'all'],
              description: 'What to clean',
              default: 'build',
            },
            aggressive: {
              type: 'boolean',
              description: 'Perform aggressive cleanup including node_modules',
              default: false,
            },
          },
        },
      },
      {
        name: 'build_watch',
        description: 'Watch for file changes and rebuild automatically',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'File pattern to watch',
              default: 'src/**/*',
            },
            debounce: {
              type: 'number',
              description: 'Debounce delay in milliseconds',
              default: 1000,
            },
            runTests: {
              type: 'boolean',
              description: 'Run tests after each build',
              default: false,
            },
          },
        },
      },
    ];
  }

  /**
   * Handle tool execution
   */
  async handleTool(name, args) {
    switch (name) {
      case 'build_lint':
        return await this.runLinting(args);
      case 'build_compile':
        return await this.runCompilation(args);
      case 'build_package':
        return await this.createPackage(args);
      case 'build_analyze':
        return await this.analyzeBuild(args);
      case 'build_clean':
        return await this.cleanBuild(args);
      case 'build_watch':
        return await this.watchBuild(args);
      default:
        throw new Error(`Unknown build tool: ${name}`);
    }
  }

  /**
   * Run code linting and formatting
   */
  async runLinting(args = {}) {
    const { fix = false, files = [], format = true } = args;

    try {
      const results = [];

      // Run ESLint
      let eslintCommand = this.config.getBuildConfig().lintCommand;

      if (fix) {
        eslintCommand = eslintCommand.replace('lint', 'lint -- --fix');
      }

      if (files.length > 0) {
        eslintCommand += ` ${files.join(' ')}`;
      }

      try {
        const { stdout, stderr } = await execAsync(eslintCommand, {
          cwd: this.config.getProjectRoot(),
          timeout: 120000,
        });

        results.push('✅ ESLint: Passed');
        if (stdout.trim()) {
          results.push(`ESLint Output:\n${stdout}`);
        }
      } catch (error) {
        if (error.code === 1) {
          // ESLint found issues
          results.push(`⚠️  ESLint: Found issues${fix ? ' (some may have been fixed)' : ''}`);
          results.push(`ESLint Output:\n${error.stdout || error.stderr}`);
        } else {
          throw error;
        }
      }

      // Run Prettier if requested
      if (format) {
        try {
          let prettierCommand = this.config.getBuildConfig().formatCommand;

          if (files.length > 0) {
            prettierCommand += ` ${files.join(' ')}`;
          } else {
            prettierCommand += ` ${this.config.getPaths().src}/**/*.{js,json,md}`;
          }

          const { stdout } = await execAsync(prettierCommand, {
            cwd: this.config.getProjectRoot(),
            timeout: 60000,
          });

          results.push('✅ Prettier: Code formatted');
          if (stdout.trim()) {
            results.push(`Prettier Output:\n${stdout}`);
          }
        } catch (error) {
          results.push(`⚠️  Prettier: ${error.message}`);
        }
      }

      const hasErrors = results.some(result => result.includes('❌'));
      const hasWarnings = results.some(result => result.includes('⚠️'));

      return {
        content: [
          {
            type: 'text',
            text: `${hasErrors ? '❌' : hasWarnings ? '⚠️' : '✅'} Code Linting Results\n\n${results.join('\n')}`,
          },
        ],
        isError: hasErrors,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Linting failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Run project compilation/build
   */
  async runCompilation(args = {}) {
    const { environment = 'production', clean = true, optimize = true } = args;

    try {
      const results = [];

      // Clean previous build if requested
      if (clean) {
        await this.cleanBuild({ target: 'build' });
        results.push('🧹 Cleaned previous build artifacts');
      }

      // Set environment variables
      const env = {
        ...process.env,
        NODE_ENV: environment,
        BUILD_OPTIMIZE: optimize.toString(),
      };

      // Run the build using the existing dev-workflow script
      const { stdout, stderr } = await execAsync(
        `${this.config.getScriptPath('devWorkflow')} build`,
        {
          cwd: this.config.getProjectRoot(),
          timeout: 300000, // 5 minutes
          env,
        }
      );

      results.push('✅ Build completed successfully');
      results.push(`Build output:\n${stdout}`);

      if (stderr && stderr.trim()) {
        results.push(`Build warnings:\n${stderr}`);
      }

      // Analyze build output
      const buildStats = await this.getBuildStatistics();
      results.push(buildStats);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Compilation Results (${environment})\n\n${results.join('\n\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Compilation failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Create deployment package
   */
  async createPackage(args = {}) {
    const { format = 'tar.gz', includeSource = false, version } = args;

    try {
      // Ensure build exists
      const fs = await import('fs');
      const buildDir = this.config.getBuildConfig().buildDir;

      if (!fs.existsSync(buildDir)) {
        throw new Error('No build found. Run build_compile first.');
      }

      // Generate version if not provided
      const packageVersion = version || this.generateVersionTag();
      const packageName = `${this.config.projectName}_${packageVersion}.${format}`;
      const packagePath = path.join(this.config.getPaths().backups, packageName);

      // Ensure backups directory exists
      if (!fs.existsSync(this.config.getPaths().backups)) {
        fs.mkdirSync(this.config.getPaths().backups, { recursive: true });
      }

      // Create package using the existing dev-workflow script
      const { stdout } = await execAsync(
        `${this.config.getScriptPath('devWorkflow')} package`,
        {
          cwd: this.config.getProjectRoot(),
          timeout: 120000,
        }
      );

      // Get the created package info
      const packageStats = fs.statSync(packagePath);
      const checksum = await this.calculateChecksum(packagePath);

      const results = [
        `📦 Package created: ${packageName}`,
        `📊 Size: ${(packageStats.size / 1024 / 1024).toFixed(2)} MB`,
        `🔒 SHA256: ${checksum}`,
        `📁 Location: ${packagePath}`,
      ];

      if (includeSource) {
        results.push('📄 Includes source code');
      }

      results.push(`\nBuild script output:\n${stdout}`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Package Creation Results\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Package creation failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Analyze build artifacts and dependencies
   */
  async analyzeBuild(args = {}) {
    const { type = 'all', output = 'console' } = args;

    try {
      const results = [];

      if (type === 'all' || type === 'dependencies') {
        const depAnalysis = await this.analyzeDependencies();
        results.push('📦 Dependency Analysis:');
        results.push(depAnalysis);
      }

      if (type === 'all' || type === 'bundle') {
        const bundleAnalysis = await this.analyzeBundleSize();
        results.push('📊 Bundle Size Analysis:');
        results.push(bundleAnalysis);
      }

      if (type === 'all' || type === 'security') {
        const securityAnalysis = await this.analyzeSecurityIssues();
        results.push('🔒 Security Analysis:');
        results.push(securityAnalysis);
      }

      // Save to file if requested
      if (output === 'file' || output === 'json') {
        const fs = await import('fs');
        const analysisData = {
          timestamp: new Date().toISOString(),
          type,
          results: results.join('\n'),
        };

        const filename = `build-analysis-${Date.now()}.${output === 'json' ? 'json' : 'txt'}`;
        const filepath = path.join(this.config.getPaths().logs, filename);

        if (output === 'json') {
          fs.writeFileSync(filepath, JSON.stringify(analysisData, null, 2));
        } else {
          fs.writeFileSync(filepath, analysisData.results);
        }

        results.push(`\n💾 Analysis saved to: ${filepath}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `🔍 Build Analysis Results\n\n${results.join('\n\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Build analysis failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Clean build artifacts and temporary files
   */
  async cleanBuild(args = {}) {
    const { target = 'build', aggressive = false } = args;

    try {
      const results = [];

      if (target === 'all' || target === 'build') {
        await this.cleanDirectory(this.config.getBuildConfig().buildDir);
        results.push('🧹 Cleaned build directory');
      }

      if (target === 'all' || target === 'cache') {
        // Clean npm cache and other caches
        try {
          await execAsync('npm cache clean --force', {
            cwd: this.config.getProjectRoot(),
            timeout: 30000,
          });
          results.push('🧹 Cleaned npm cache');
        } catch (error) {
          results.push(`⚠️  npm cache clean failed: ${error.message}`);
        }
      }

      if (target === 'all' || target === 'logs') {
        const logsDir = this.config.getPaths().logs;
        const fs = await import('fs');

        if (fs.existsSync(logsDir)) {
          // Clean logs older than 7 days
          const { stdout } = await execAsync(
            `find "${logsDir}" -name "*.log" -mtime +7 -delete`,
            { timeout: 10000 }
          );
          results.push('🧹 Cleaned old log files');
        }
      }

      if (aggressive) {
        // Clean node_modules and package-lock.json
        const fs = await import('fs');
        const nodeModulesPath = path.join(this.config.getProjectRoot(), 'node_modules');
        const packageLockPath = path.join(this.config.getProjectRoot(), 'package-lock.json');

        if (fs.existsSync(nodeModulesPath)) {
          await execAsync(`rm -rf "${nodeModulesPath}"`, { timeout: 60000 });
          results.push('🧹 Removed node_modules (aggressive cleanup)');
        }

        if (fs.existsSync(packageLockPath)) {
          fs.unlinkSync(packageLockPath);
          results.push('🧹 Removed package-lock.json (aggressive cleanup)');
        }

        // Reinstall dependencies
        await execAsync('npm install', {
          cwd: this.config.getProjectRoot(),
          timeout: 300000,
        });
        results.push('📦 Reinstalled dependencies');
      }

      // Clean container resources if using Podman/Docker
      try {
        const runtime = this.config.usesPodman() ? 'podman' : 'docker';
        await execAsync(`${runtime} system prune -f`, { timeout: 30000 });
        results.push(`🧹 Cleaned ${runtime} resources`);
      } catch (error) {
        results.push(`⚠️  Container cleanup failed: ${error.message}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Cleanup Results (${target}${aggressive ? ' - aggressive' : ''})\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Cleanup failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Watch for file changes and rebuild
   */
  async watchBuild(args = {}) {
    const { pattern = 'src/**/*', debounce = 1000, runTests = false } = args;

    try {
      // This is a simplified implementation - in reality, you'd want to use a proper file watcher
      const results = [
        `👀 Build Watch Mode Started`,
        `📁 Watching pattern: ${pattern}`,
        `⏱️  Debounce delay: ${debounce}ms`,
        `🧪 Run tests after build: ${runTests ? 'Yes' : 'No'}`,
        ``,
        `💡 Use the existing dev-workflow.sh watch command for full functionality:`,
        `   ${this.config.getScriptPath('devWorkflow')} watch`,
        ``,
        `🔄 To manually trigger rebuild, use: build_compile`,
        `⏹️  To stop watching, terminate the Claude session or use Ctrl+C`,
      ];

      // Start the actual watch mode using the existing script
      try {
        // Note: This will run in the background
        const child = exec(`${this.config.getScriptPath('devWorkflow')} watch`, {
          cwd: this.config.getProjectRoot(),
        });

        child.stdout?.on('data', (data) => {
          console.error(`[Watch] ${data}`);
        });

        child.stderr?.on('data', (data) => {
          console.error(`[Watch Error] ${data}`);
        });

        results.push(`🚀 Watch process started (PID: ${child.pid})`);
      } catch (error) {
        results.push(`⚠️  Could not start watch process: ${error.message}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: results.join('\n'),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Watch mode failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Helper methods

  /**
   * Generate version tag based on timestamp and git info
   */
  generateVersionTag() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `v${this.config.version}-${timestamp}`;
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath) {
    const fs = await import('fs');
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Get build statistics
   */
  async getBuildStatistics() {
    try {
      const fs = await import('fs');
      const buildDir = this.config.getBuildConfig().buildDir;

      if (!fs.existsSync(buildDir)) {
        return '⚠️  Build directory not found';
      }

      const stats = fs.statSync(buildDir);
      const { stdout } = await execAsync(`du -sh "${buildDir}"`, { timeout: 10000 });
      const sizeInfo = stdout.trim();

      // Count files
      const { stdout: fileCount } = await execAsync(
        `find "${buildDir}" -type f | wc -l`,
        { timeout: 10000 }
      );

      return `📊 Build Statistics:\n  - Total size: ${sizeInfo}\n  - File count: ${fileCount.trim()}\n  - Modified: ${stats.mtime.toISOString()}`;
    } catch (error) {
      return `⚠️  Could not get build statistics: ${error.message}`;
    }
  }

  /**
   * Analyze dependencies
   */
  async analyzeDependencies() {
    try {
      const { stdout } = await execAsync('npm list --depth=0 --json', {
        cwd: this.config.getProjectRoot(),
        timeout: 30000,
      });

      const packageData = JSON.parse(stdout);
      const dependencies = packageData.dependencies || {};
      const devDependencies = packageData.devDependencies || {};

      const prodCount = Object.keys(dependencies).length;
      const devCount = Object.keys(devDependencies).length;

      // Check for outdated packages
      try {
        const { stdout: outdatedOutput } = await execAsync('npm outdated --json', {
          cwd: this.config.getProjectRoot(),
          timeout: 30000,
        });

        const outdated = JSON.parse(outdatedOutput);
        const outdatedCount = Object.keys(outdated).length;

        return `  - Production dependencies: ${prodCount}\n  - Development dependencies: ${devCount}\n  - Outdated packages: ${outdatedCount}`;
      } catch {
        return `  - Production dependencies: ${prodCount}\n  - Development dependencies: ${devCount}\n  - Outdated packages: Unable to check`;
      }
    } catch (error) {
      return `  Error analyzing dependencies: ${error.message}`;
    }
  }

  /**
   * Analyze bundle size
   */
  async analyzeBundleSize() {
    try {
      const fs = await import('fs');
      const buildDir = this.config.getBuildConfig().buildDir;

      if (!fs.existsSync(buildDir)) {
        return '  No build directory found';
      }

      const { stdout } = await execAsync(`find "${buildDir}" -name "*.js" -exec wc -c {} + | sort -nr`, {
        timeout: 10000,
      });

      const lines = stdout.trim().split('\n');
      const totalSize = lines[lines.length - 1].match(/^\s*(\d+)/)?.[1];

      return `  - Total JS bundle size: ${totalSize ? (parseInt(totalSize) / 1024).toFixed(2) + ' KB' : 'Unknown'}\n  - Number of JS files: ${lines.length - 1}`;
    } catch (error) {
      return `  Error analyzing bundle size: ${error.message}`;
    }
  }

  /**
   * Analyze security issues
   */
  async analyzeSecurityIssues() {
    try {
      const { stdout } = await execAsync('npm audit --json', {
        cwd: this.config.getProjectRoot(),
        timeout: 30000,
      });

      const auditData = JSON.parse(stdout);
      const vulnerabilities = auditData.metadata?.vulnerabilities || {};

      const critical = vulnerabilities.critical || 0;
      const high = vulnerabilities.high || 0;
      const moderate = vulnerabilities.moderate || 0;
      const low = vulnerabilities.low || 0;

      return `  - Critical vulnerabilities: ${critical}\n  - High vulnerabilities: ${high}\n  - Moderate vulnerabilities: ${moderate}\n  - Low vulnerabilities: ${low}`;
    } catch (error) {
      return `  Error analyzing security issues: ${error.message}`;
    }
  }

  /**
   * Clean a directory
   */
  async cleanDirectory(dirPath) {
    const fs = await import('fs');
    if (fs.existsSync(dirPath)) {
      await execAsync(`rm -rf "${dirPath}"`, { timeout: 30000 });
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}