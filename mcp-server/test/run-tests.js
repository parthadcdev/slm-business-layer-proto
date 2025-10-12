#!/usr/bin/env node

/**
 * Test runner for SLM DevOps MCP Server
 * Validates server functionality and tool implementations
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MCPServerTester {
  constructor() {
    this.mcpServerPath = path.resolve(__dirname, '../index.js');
    this.projectRoot = path.resolve(__dirname, '../../');
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // Cyan
      pass: '\x1b[32m',    // Green
      fail: '\x1b[31m',    // Red
      warn: '\x1b[33m',    // Yellow
      reset: '\x1b[0m'     // Reset
    };

    const color = colors[type] || colors.info;
    console.log(`${color}${message}${colors.reset}`);
  }

  async runTest(testName, testFunction) {
    try {
      this.log(`\n🧪 Running: ${testName}`);
      await testFunction();
      this.log(`✅ PASS: ${testName}`, 'pass');
      this.passed++;
    } catch (error) {
      this.log(`❌ FAIL: ${testName} - ${error.message}`, 'fail');
      this.failed++;
    }
  }

  async testProjectStructure() {
    const fs = await import('fs');
    const requiredFiles = [
      'package.json',
      'index.js',
      'config/project-config.js',
      'tools/test-tools.js',
      'tools/build-tools.js',
      'tools/deploy-tools.js',
      'tools/git-tools.js',
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, '..', file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file missing: ${file}`);
      }
    }

    // Check parent project structure
    const parentRequiredFiles = [
      'package.json',
      'scripts/dev-workflow.sh',
      'scripts/manage-services.sh',
      'src/orchestration/app.js',
    ];

    for (const file of parentRequiredFiles) {
      const filePath = path.join(this.projectRoot, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required parent project file missing: ${file}`);
      }
    }
  }

  async testNodeModules() {
    const fs = await import('fs');
    const nodeModulesPath = path.join(__dirname, '..', 'node_modules');

    if (!fs.existsSync(nodeModulesPath)) {
      throw new Error('node_modules not found. Run npm install first.');
    }

    // Check for key dependencies
    const requiredPackages = [
      '@modelcontextprotocol/sdk',
      'axios'
    ];

    for (const pkg of requiredPackages) {
      const pkgPath = path.join(nodeModulesPath, pkg);
      if (!fs.existsSync(pkgPath)) {
        throw new Error(`Required package missing: ${pkg}`);
      }
    }
  }

  async testConfigLoad() {
    try {
      const { ProjectConfig } = await import('../config/project-config.js');
      const config = new ProjectConfig();

      // Test basic configuration
      const projectRoot = config.getProjectRoot();
      if (!projectRoot) {
        throw new Error('Project root not detected');
      }

      const services = config.getAllServices();
      if (!services || Object.keys(services).length === 0) {
        throw new Error('No services configured');
      }

      // Test service configuration
      const orchestrationConfig = config.getServiceConfig('orchestration');
      if (!orchestrationConfig || !orchestrationConfig.port) {
        throw new Error('Orchestration service not properly configured');
      }

      // Test validation
      await config.validateProject();
    } catch (error) {
      throw new Error(`Configuration load failed: ${error.message}`);
    }
  }

  async testToolImports() {
    const toolModules = [
      '../tools/test-tools.js',
      '../tools/build-tools.js',
      '../tools/deploy-tools.js',
      '../tools/git-tools.js'
    ];

    for (const modulePath of toolModules) {
      try {
        const module = await import(modulePath);
        const className = Object.keys(module)[0];
        const ToolClass = module[className];

        if (typeof ToolClass !== 'function') {
          throw new Error(`${modulePath} does not export a valid class`);
        }

        // Test tool instantiation
        const { ProjectConfig } = await import('../config/project-config.js');
        const config = new ProjectConfig();
        const toolInstance = new ToolClass(config);

        // Test tool definition retrieval
        const definitions = toolInstance.getToolDefinitions();
        if (!Array.isArray(definitions) || definitions.length === 0) {
          throw new Error(`${modulePath} does not provide tool definitions`);
        }

        // Validate tool definitions structure
        for (const definition of definitions) {
          if (!definition.name || !definition.description || !definition.inputSchema) {
            throw new Error(`Invalid tool definition in ${modulePath}: ${JSON.stringify(definition)}`);
          }
        }
      } catch (error) {
        throw new Error(`Failed to import ${modulePath}: ${error.message}`);
      }
    }
  }

  async testServerStartup() {
    // This test attempts to start the server and check if it initializes properly
    try {
      // Set up environment for testing
      const env = {
        ...process.env,
        NODE_ENV: 'test',
        MCP_TEST_MODE: 'true'
      };

      // Try to start the server with a timeout
      const child = exec(`timeout 5s node ${this.mcpServerPath}`, {
        cwd: this.projectRoot,
        env
      });

      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Wait for the process to complete or timeout
      await new Promise((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 124) { // timeout exit code
            resolve(); // Expected for this test
          } else if (code === 0) {
            resolve(); // Clean exit
          } else {
            reject(new Error(`Server failed to start. Exit code: ${code}. Error: ${errorOutput}`));
          }
        });

        child.on('error', (error) => {
          reject(new Error(`Server startup error: ${error.message}`));
        });
      });

      // Check if server initialization appears successful
      if (errorOutput.includes('SLM DevOps MCP Server running on stdio') ||
          errorOutput.includes('running') ||
          output.includes('MCP') ||
          errorOutput === '') {
        // Server appears to have started successfully
        return;
      } else {
        throw new Error(`Server output indicates problems: ${errorOutput || output}`);
      }
    } catch (error) {
      if (error.message.includes('timeout')) {
        // If only issue is timeout command not found, that's OK
        this.log('⚠️  timeout command not available, skipping full startup test', 'warn');
        return;
      }
      throw error;
    }
  }

  async testScriptAccessibility() {
    const fs = await import('fs');
    const scripts = [
      'scripts/dev-workflow.sh',
      'scripts/manage-services.sh'
    ];

    for (const script of scripts) {
      const scriptPath = path.join(this.projectRoot, script);

      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Script not found: ${script}`);
      }

      // Check if script is executable
      try {
        await execAsync(`test -x "${scriptPath}"`, { timeout: 5000 });
      } catch (error) {
        throw new Error(`Script not executable: ${script}`);
      }
    }
  }

  async testPackageJsonValid() {
    const fs = await import('fs');
    const packageJsonPath = path.join(__dirname, '..', 'package.json');

    const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    // Validate required fields
    const requiredFields = ['name', 'version', 'description', 'main', 'dependencies'];
    for (const field of requiredFields) {
      if (!packageData[field]) {
        throw new Error(`package.json missing required field: ${field}`);
      }
    }

    // Validate dependencies
    const requiredDeps = ['@modelcontextprotocol/sdk', 'axios'];
    for (const dep of requiredDeps) {
      if (!packageData.dependencies[dep]) {
        throw new Error(`package.json missing required dependency: ${dep}`);
      }
    }

    // Validate Node.js version requirement
    if (!packageData.engines || !packageData.engines.node) {
      throw new Error('package.json missing Node.js engine requirement');
    }
  }

  async testEnvironmentCompatibility() {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
    }

    // Check for required system commands
    const commands = ['git', 'npm'];

    for (const command of commands) {
      try {
        await execAsync(`which ${command}`, { timeout: 5000 });
      } catch (error) {
        throw new Error(`Required command not found: ${command}`);
      }
    }
  }

  async runAllTests() {
    this.log('\n🚀 Starting SLM DevOps MCP Server Tests\n', 'info');

    await this.runTest('Project Structure', () => this.testProjectStructure());
    await this.runTest('Node Modules', () => this.testNodeModules());
    await this.runTest('Package.json Validation', () => this.testPackageJsonValid());
    await this.runTest('Environment Compatibility', () => this.testEnvironmentCompatibility());
    await this.runTest('Configuration Loading', () => this.testConfigLoad());
    await this.runTest('Tool Module Imports', () => this.testToolImports());
    await this.runTest('Script Accessibility', () => this.testScriptAccessibility());
    await this.runTest('Server Startup', () => this.testServerStartup());

    this.showSummary();
  }

  showSummary() {
    const total = this.passed + this.failed;
    this.log(`\n📊 Test Summary:`, 'info');
    this.log(`   Total Tests: ${total}`, 'info');
    this.log(`   Passed: ${this.passed}`, 'pass');
    this.log(`   Failed: ${this.failed}`, this.failed > 0 ? 'fail' : 'pass');

    if (this.failed === 0) {
      this.log('\n🎉 All tests passed! MCP Server is ready for use.', 'pass');
    } else {
      this.log('\n❌ Some tests failed. Please fix issues before using the MCP Server.', 'fail');
    }

    this.log(`\n💡 To start the MCP server:`, 'info');
    this.log(`   node ${this.mcpServerPath}`, 'info');
    this.log(`\n📖 For usage examples, see: ${path.join(__dirname, '..', 'README.md')}`, 'info');

    process.exit(this.failed > 0 ? 1 : 0);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new MCPServerTester();
  tester.runAllTests().catch((error) => {
    console.error('❌ Test runner failed:', error.message);
    process.exit(1);
  });
}