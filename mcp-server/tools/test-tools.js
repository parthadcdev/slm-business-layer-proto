/**
 * Test Orchestration Tools for SLM Business Layer MCP Server
 * Provides comprehensive testing capabilities including unit tests, integration tests, and health checks
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);

export class TestTools {
  constructor(config) {
    this.config = config;
  }

  /**
   * Get tool definitions for MCP
   */
  getToolDefinitions() {
    return [
      {
        name: 'test_run_unit',
        description: 'Run unit tests using Jest or configured test runner',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Test file pattern to run (optional)',
            },
            coverage: {
              type: 'boolean',
              description: 'Generate coverage report',
              default: false,
            },
            watch: {
              type: 'boolean',
              description: 'Run tests in watch mode',
              default: false,
            },
          },
        },
      },
      {
        name: 'test_run_integration',
        description: 'Run integration tests that validate service interactions',
        inputSchema: {
          type: 'object',
          properties: {
            startServices: {
              type: 'boolean',
              description: 'Automatically start services if not running',
              default: true,
            },
            timeout: {
              type: 'number',
              description: 'Test timeout in seconds',
              default: 300,
            },
          },
        },
      },
      {
        name: 'test_health_check',
        description: 'Perform comprehensive health checks on all services',
        inputSchema: {
          type: 'object',
          properties: {
            services: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific services to check (empty for all)',
              default: [],
            },
            detailed: {
              type: 'boolean',
              description: 'Include detailed health information',
              default: false,
            },
          },
        },
      },
      {
        name: 'test_smoke',
        description: 'Run smoke tests to verify basic system functionality',
        inputSchema: {
          type: 'object',
          properties: {
            endpoint: {
              type: 'string',
              description: 'Specific endpoint to test (optional)',
            },
          },
        },
      },
      {
        name: 'test_performance',
        description: 'Run performance tests and benchmarks',
        inputSchema: {
          type: 'object',
          properties: {
            duration: {
              type: 'number',
              description: 'Test duration in seconds',
              default: 60,
            },
            concurrency: {
              type: 'number',
              description: 'Number of concurrent requests',
              default: 10,
            },
          },
        },
      },
      {
        name: 'test_validate_environment',
        description: 'Validate that the development environment is properly configured',
        inputSchema: {
          type: 'object',
          properties: {
            fix: {
              type: 'boolean',
              description: 'Attempt to fix issues automatically',
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
      case 'test_run_unit':
        return await this.runUnitTests(args);
      case 'test_run_integration':
        return await this.runIntegrationTests(args);
      case 'test_health_check':
        return await this.runHealthCheck(args);
      case 'test_smoke':
        return await this.runSmokeTests(args);
      case 'test_performance':
        return await this.runPerformanceTests(args);
      case 'test_validate_environment':
        return await this.validateEnvironment(args);
      default:
        throw new Error(`Unknown test tool: ${name}`);
    }
  }

  /**
   * Run unit tests
   */
  async runUnitTests(args = {}) {
    const { pattern, coverage, watch } = args;

    try {
      let command = this.config.getTestConfig().unitTestCommand;

      // Add options based on arguments
      if (pattern) {
        command += ` --testPathPattern="${pattern}"`;
      }
      if (coverage) {
        command += ' --coverage';
      }
      if (watch) {
        command += ' --watch';
      }

      // Change to project root before running tests
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.config.getProjectRoot(),
        timeout: 300000, // 5 minutes
      });

      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');

      return {
        content: [
          {
            type: 'text',
            text: `✅ Unit tests completed successfully\n\n${output}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Unit tests failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Run integration tests
   */
  async runIntegrationTests(args = {}) {
    const { startServices = true, timeout = 300 } = args;

    try {
      // Start services if requested and not running
      if (startServices) {
        const healthCheck = await this.runHealthCheck({ services: [], detailed: false });
        if (healthCheck.isError) {
          await this.startServicesForTesting();
        }
      }

      // Run integration tests using the existing script
      const { stdout, stderr } = await execAsync(
        `${this.config.getScriptPath('devWorkflow')} test integration`,
        {
          cwd: this.config.getProjectRoot(),
          timeout: timeout * 1000,
        }
      );

      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');

      return {
        content: [
          {
            type: 'text',
            text: `✅ Integration tests completed successfully\n\n${output}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Integration tests failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Run comprehensive health checks
   */
  async runHealthCheck(args = {}) {
    const { services = [], detailed = false } = args;

    try {
      const results = [];
      const servicesToCheck = services.length > 0 ? services : Object.keys(this.config.getAllServices());

      for (const serviceName of servicesToCheck) {
        const serviceConfig = this.config.getServiceConfig(serviceName);
        if (!serviceConfig) {
          results.push(`⚠️  Unknown service: ${serviceName}`);
          continue;
        }

        const healthResult = await this.checkServiceHealth(serviceName, serviceConfig, detailed);
        results.push(healthResult);
      }

      // Also run the system health check script
      try {
        const { stdout } = await execAsync(
          `${this.config.getScriptPath('manageServices')} test`,
          {
            cwd: this.config.getProjectRoot(),
            timeout: 60000,
          }
        );
        results.push('\n🔍 System Health Check:\n' + stdout);
      } catch (error) {
        results.push(`⚠️  System health check failed: ${error.message}`);
      }

      const hasErrors = results.some(result => result.includes('❌') || result.includes('⚠️'));

      return {
        content: [
          {
            type: 'text',
            text: `${hasErrors ? '⚠️' : '✅'} Health Check Results\n\n${results.join('\n')}`,
          },
        ],
        isError: hasErrors,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Health check failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Check individual service health
   */
  async checkServiceHealth(serviceName, serviceConfig, detailed = false) {
    try {
      if (serviceConfig.healthEndpoint) {
        const response = await axios.get(serviceConfig.healthEndpoint, {
          timeout: 5000,
          validateStatus: () => true, // Don't throw on non-2xx status
        });

        const isHealthy = response.status >= 200 && response.status < 300;
        let result = `${isHealthy ? '✅' : '❌'} ${serviceName}: ${isHealthy ? 'Healthy' : 'Unhealthy'} (${response.status})`;

        if (detailed && isHealthy) {
          result += `\n  - Endpoint: ${serviceConfig.healthEndpoint}`;
          if (serviceConfig.port) {
            result += `\n  - Port: ${serviceConfig.port}`;
          }
          if (response.data && typeof response.data === 'object') {
            result += `\n  - Details: ${JSON.stringify(response.data, null, 2)}`;
          }
        }

        return result;
      } else {
        // For services without health endpoints, check if port is listening
        if (serviceConfig.port) {
          try {
            await axios.get(`http://localhost:${serviceConfig.port}`, { timeout: 2000 });
            return `✅ ${serviceName}: Port ${serviceConfig.port} is accessible`;
          } catch {
            return `❌ ${serviceName}: Port ${serviceConfig.port} is not accessible`;
          }
        }
        return `⚠️  ${serviceName}: No health check available`;
      }
    } catch (error) {
      return `❌ ${serviceName}: Health check failed - ${error.message}`;
    }
  }

  /**
   * Run smoke tests
   */
  async runSmokeTests(args = {}) {
    const { endpoint } = args;

    try {
      const results = [];

      if (endpoint) {
        // Test specific endpoint
        const result = await this.testEndpoint(endpoint);
        results.push(result);
      } else {
        // Test key system endpoints
        const keyEndpoints = [
          'http://localhost:8001/health',
          'http://localhost:8001/api/generate-token',
          'http://localhost:8001/test-interface.html',
        ];

        for (const url of keyEndpoints) {
          const result = await this.testEndpoint(url);
          results.push(result);
        }

        // Test business logic with a simple request
        try {
          const tokenResponse = await axios.post('http://localhost:8001/api/generate-token', {}, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
          });

          if (tokenResponse.data.success && tokenResponse.data.token) {
            const businessResponse = await axios.post(
              'http://localhost:8001/api/business-request',
              {
                request: 'Show me system status',
                context: {},
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${tokenResponse.data.token}`,
                },
                timeout: 15000,
              }
            );

            const success = businessResponse.data.success;
            results.push(`${success ? '✅' : '❌'} Business Logic Test: ${success ? 'Passed' : 'Failed'}`);
          } else {
            results.push('❌ Business Logic Test: Token generation failed');
          }
        } catch (error) {
          results.push(`❌ Business Logic Test: ${error.message}`);
        }
      }

      const hasErrors = results.some(result => result.includes('❌'));

      return {
        content: [
          {
            type: 'text',
            text: `${hasErrors ? '⚠️' : '✅'} Smoke Test Results\n\n${results.join('\n')}`,
          },
        ],
        isError: hasErrors,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Smoke tests failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Test a specific endpoint
   */
  async testEndpoint(url) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: () => true,
      });

      const isSuccess = response.status >= 200 && response.status < 300;
      return `${isSuccess ? '✅' : '❌'} ${url}: ${response.status} ${response.statusText}`;
    } catch (error) {
      return `❌ ${url}: ${error.message}`;
    }
  }

  /**
   * Run performance tests
   */
  async runPerformanceTests(args = {}) {
    const { duration = 60, concurrency = 10 } = args;

    try {
      // Simple performance test implementation
      const testUrl = 'http://localhost:8001/health';
      const startTime = Date.now();
      const endTime = startTime + (duration * 1000);
      const results = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        responseTimes: [],
      };

      const runTest = async () => {
        while (Date.now() < endTime) {
          const promises = [];

          for (let i = 0; i < concurrency; i++) {
            promises.push(this.measureRequest(testUrl));
          }

          const batchResults = await Promise.allSettled(promises);

          for (const result of batchResults) {
            results.totalRequests++;

            if (result.status === 'fulfilled') {
              results.successfulRequests++;
              const responseTime = result.value;
              results.responseTimes.push(responseTime);
              results.minResponseTime = Math.min(results.minResponseTime, responseTime);
              results.maxResponseTime = Math.max(results.maxResponseTime, responseTime);
            } else {
              results.failedRequests++;
            }
          }

          // Small delay to prevent overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };

      await runTest();

      // Calculate statistics
      if (results.responseTimes.length > 0) {
        results.averageResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;
      }

      const throughput = results.successfulRequests / duration;
      const errorRate = (results.failedRequests / results.totalRequests) * 100;

      return {
        content: [
          {
            type: 'text',
            text: `✅ Performance Test Results (${duration}s)\n\n` +
                  `📊 Request Statistics:\n` +
                  `  - Total Requests: ${results.totalRequests}\n` +
                  `  - Successful: ${results.successfulRequests}\n` +
                  `  - Failed: ${results.failedRequests}\n` +
                  `  - Error Rate: ${errorRate.toFixed(2)}%\n\n` +
                  `⚡ Performance Metrics:\n` +
                  `  - Throughput: ${throughput.toFixed(2)} req/s\n` +
                  `  - Average Response Time: ${results.averageResponseTime.toFixed(2)}ms\n` +
                  `  - Min Response Time: ${results.minResponseTime}ms\n` +
                  `  - Max Response Time: ${results.maxResponseTime}ms\n\n` +
                  `🎯 Concurrency: ${concurrency} simultaneous requests`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Performance tests failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Measure response time for a single request
   */
  async measureRequest(url) {
    const startTime = Date.now();
    await axios.get(url, { timeout: 10000 });
    return Date.now() - startTime;
  }

  /**
   * Validate development environment
   */
  async validateEnvironment(args = {}) {
    const { fix = false } = args;

    try {
      const results = [];

      // Check project structure
      try {
        await this.config.validateProject();
        results.push('✅ Project structure: Valid');
      } catch (error) {
        results.push(`❌ Project structure: ${error.message}`);
      }

      // Check Node.js version
      try {
        const { stdout } = await execAsync('node --version');
        const version = stdout.trim().replace('v', '');
        const majorVersion = parseInt(version.split('.')[0]);

        if (majorVersion >= parseInt(this.config.nodeVersion)) {
          results.push(`✅ Node.js version: ${version} (required: ${this.config.nodeVersion}+)`);
        } else {
          results.push(`❌ Node.js version: ${version} (required: ${this.config.nodeVersion}+)`);
        }
      } catch (error) {
        results.push(`❌ Node.js: Not found or inaccessible`);
      }

      // Check npm dependencies
      try {
        const { stdout } = await execAsync('npm list --depth=0', {
          cwd: this.config.getProjectRoot(),
        });
        results.push('✅ NPM dependencies: Installed');
      } catch (error) {
        results.push('⚠️  NPM dependencies: Issues detected');
        if (fix) {
          try {
            await execAsync('npm install', { cwd: this.config.getProjectRoot() });
            results.push('🔧 NPM dependencies: Fixed with npm install');
          } catch (fixError) {
            results.push(`❌ NPM dependencies: Fix failed - ${fixError.message}`);
          }
        }
      }

      // Check container runtime (Podman/Docker)
      try {
        const runtime = this.config.usesPodman() ? 'podman' : 'docker';
        const { stdout } = await execAsync(`${runtime} --version`);
        results.push(`✅ Container runtime (${runtime}): Available`);
      } catch (error) {
        const runtime = this.config.usesPodman() ? 'Podman' : 'Docker';
        results.push(`❌ Container runtime: ${runtime} not found`);
      }

      // Check required directories
      const requiredDirs = ['logs', 'backups', 'dist'];
      for (const dir of requiredDirs) {
        const fs = await import('fs');
        const dirPath = this.config.getPaths()[dir];

        if (fs.existsSync(dirPath)) {
          results.push(`✅ Directory ${dir}: Exists`);
        } else {
          results.push(`⚠️  Directory ${dir}: Missing`);
          if (fix) {
            try {
              fs.mkdirSync(dirPath, { recursive: true });
              results.push(`🔧 Directory ${dir}: Created`);
            } catch (fixError) {
              results.push(`❌ Directory ${dir}: Creation failed - ${fixError.message}`);
            }
          }
        }
      }

      const hasErrors = results.some(result => result.includes('❌'));
      const hasWarnings = results.some(result => result.includes('⚠️'));

      return {
        content: [
          {
            type: 'text',
            text: `${hasErrors ? '❌' : hasWarnings ? '⚠️' : '✅'} Environment Validation\n\n${results.join('\n')}${fix ? '\n\n🔧 Auto-fix was enabled' : '\n\n💡 Use fix=true to automatically resolve some issues'}`,
          },
        ],
        isError: hasErrors,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Environment validation failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Start services for testing
   */
  async startServicesForTesting() {
    try {
      await execAsync(`${this.config.getScriptPath('manageServices')} start`, {
        cwd: this.config.getProjectRoot(),
        timeout: 120000, // 2 minutes
      });

      // Wait for services to stabilize
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
      throw new Error(`Failed to start services for testing: ${error.message}`);
    }
  }
}