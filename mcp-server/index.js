#!/usr/bin/env node

/**
 * SLM Business Layer - Unified MCP Server
 *
 * A Model Context Protocol server that provides unified tools for:
 * - Test Operations (unit, integration, health checks)
 * - Build Management (compilation, linting, packaging)
 * - Deployment Automation (local deployment, service management)
 * - Git Operations (commit, push, branch management, PR creation)
 *
 * Author: Partha Chandramohan
 * Version: 1.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import tool implementations
import { TestTools } from './tools/test-tools.js';
import { BuildTools } from './tools/build-tools.js';
import { DeployTools } from './tools/deploy-tools.js';
import { GitTools } from './tools/git-tools.js';
import { ProjectConfig } from './config/project-config.js';

class DevOpsMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'slm-devops-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize project configuration
    this.config = new ProjectConfig();

    // Initialize tool providers
    this.testTools = new TestTools(this.config);
    this.buildTools = new BuildTools(this.config);
    this.deployTools = new DeployTools(this.config);
    this.gitTools = new GitTools(this.config);

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [
        ...this.testTools.getToolDefinitions(),
        ...this.buildTools.getToolDefinitions(),
        ...this.deployTools.getToolDefinitions(),
        ...this.gitTools.getToolDefinitions(),
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Route to appropriate tool handler
        if (name.startsWith('test_')) {
          return await this.testTools.handleTool(name, args);
        } else if (name.startsWith('build_')) {
          return await this.buildTools.handleTool(name, args);
        } else if (name.startsWith('deploy_')) {
          return await this.deployTools.handleTool(name, args);
        } else if (name.startsWith('git_')) {
          return await this.gitTools.handleTool(name, args);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SLM DevOps MCP Server running on stdio');
  }
}

// Start the server
const server = new DevOpsMCPServer();
server.start().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});