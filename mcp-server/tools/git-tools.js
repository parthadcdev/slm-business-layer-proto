/**
 * Git Operations Tools for SLM Business Layer MCP Server
 * Provides comprehensive Git capabilities including commits, branches, PRs, and repository management
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitTools {
  constructor(config) {
    this.config = config;
  }

  /**
   * Get tool definitions for MCP
   */
  getToolDefinitions() {
    return [
      {
        name: 'git_status',
        description: 'Get Git repository status including changes, branch info, and remote status',
        inputSchema: {
          type: 'object',
          properties: {
            detailed: {
              type: 'boolean',
              description: 'Include detailed status information',
              default: false,
            },
            includeStash: {
              type: 'boolean',
              description: 'Include stash information',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_commit',
        description: 'Create a Git commit with staged changes',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Commit message',
              required: true,
            },
            addAll: {
              type: 'boolean',
              description: 'Add all changes before committing',
              default: false,
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific files to add (if addAll is false)',
              default: [],
            },
            amend: {
              type: 'boolean',
              description: 'Amend the last commit',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_branch',
        description: 'Branch management operations',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'create', 'switch', 'delete', 'merge'],
              description: 'Branch operation to perform',
              required: true,
            },
            name: {
              type: 'string',
              description: 'Branch name (required for create, switch, delete, merge)',
            },
            remote: {
              type: 'boolean',
              description: 'Include remote branches in list or create tracking branch',
              default: false,
            },
            force: {
              type: 'boolean',
              description: 'Force operation (for delete)',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_push',
        description: 'Push changes to remote repository',
        inputSchema: {
          type: 'object',
          properties: {
            remote: {
              type: 'string',
              description: 'Remote name',
              default: 'origin',
            },
            branch: {
              type: 'string',
              description: 'Branch to push (current branch if not specified)',
            },
            force: {
              type: 'boolean',
              description: 'Force push',
              default: false,
            },
            setUpstream: {
              type: 'boolean',
              description: 'Set upstream tracking',
              default: false,
            },
            tags: {
              type: 'boolean',
              description: 'Push tags as well',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_pull',
        description: 'Pull changes from remote repository',
        inputSchema: {
          type: 'object',
          properties: {
            remote: {
              type: 'string',
              description: 'Remote name',
              default: 'origin',
            },
            branch: {
              type: 'string',
              description: 'Branch to pull (current branch if not specified)',
            },
            rebase: {
              type: 'boolean',
              description: 'Use rebase instead of merge',
              default: false,
            },
            strategy: {
              type: 'string',
              enum: ['merge', 'rebase', 'fast-forward'],
              description: 'Pull strategy',
              default: 'merge',
            },
          },
        },
      },
      {
        name: 'git_create_pr',
        description: 'Create a pull request using GitHub CLI',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Pull request title',
              required: true,
            },
            body: {
              type: 'string',
              description: 'Pull request description',
            },
            base: {
              type: 'string',
              description: 'Base branch for the pull request',
              default: 'main',
            },
            draft: {
              type: 'boolean',
              description: 'Create as draft pull request',
              default: false,
            },
            assignees: {
              type: 'array',
              items: { type: 'string' },
              description: 'GitHub usernames to assign',
              default: [],
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Labels to add to the pull request',
              default: [],
            },
          },
        },
      },
      {
        name: 'git_log',
        description: 'View Git commit history',
        inputSchema: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              description: 'Number of commits to show',
              default: 10,
            },
            oneline: {
              type: 'boolean',
              description: 'Show commits in one line format',
              default: false,
            },
            graph: {
              type: 'boolean',
              description: 'Show commit graph',
              default: false,
            },
            author: {
              type: 'string',
              description: 'Filter by author',
            },
            since: {
              type: 'string',
              description: 'Show commits since date (e.g., "1 week ago")',
            },
          },
        },
      },
      {
        name: 'git_diff',
        description: 'Show differences between commits, branches, or working directory',
        inputSchema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              enum: ['working', 'staged', 'committed', 'branches'],
              description: 'What to compare',
              default: 'working',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific files to diff',
              default: [],
            },
            branch1: {
              type: 'string',
              description: 'First branch for branch comparison',
            },
            branch2: {
              type: 'string',
              description: 'Second branch for branch comparison',
            },
            statistical: {
              type: 'boolean',
              description: 'Show only statistics',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_tag',
        description: 'Tag management operations',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'create', 'delete', 'push'],
              description: 'Tag operation to perform',
              required: true,
            },
            name: {
              type: 'string',
              description: 'Tag name (required for create, delete, push)',
            },
            message: {
              type: 'string',
              description: 'Tag message (for annotated tags)',
            },
            commit: {
              type: 'string',
              description: 'Commit to tag (defaults to HEAD)',
            },
            force: {
              type: 'boolean',
              description: 'Force operation',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_stash',
        description: 'Stash management operations',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['save', 'list', 'apply', 'pop', 'drop', 'clear'],
              description: 'Stash operation to perform',
              required: true,
            },
            message: {
              type: 'string',
              description: 'Stash message (for save operation)',
            },
            index: {
              type: 'number',
              description: 'Stash index (for apply, pop, drop operations)',
              default: 0,
            },
            includeUntracked: {
              type: 'boolean',
              description: 'Include untracked files in stash',
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
      case 'git_status':
        return await this.getGitStatus(args);
      case 'git_commit':
        return await this.createCommit(args);
      case 'git_branch':
        return await this.manageBranch(args);
      case 'git_push':
        return await this.pushChanges(args);
      case 'git_pull':
        return await this.pullChanges(args);
      case 'git_create_pr':
        return await this.createPullRequest(args);
      case 'git_log':
        return await this.showLog(args);
      case 'git_diff':
        return await this.showDiff(args);
      case 'git_tag':
        return await this.manageTag(args);
      case 'git_stash':
        return await this.manageStash(args);
      default:
        throw new Error(`Unknown Git tool: ${name}`);
    }
  }

  /**
   * Get Git repository status
   */
  async getGitStatus(args = {}) {
    const { detailed = false, includeStash = false } = args;

    try {
      const results = [];

      // Basic status
      const { stdout: statusOutput } = await execAsync('git status --porcelain -b', {
        cwd: this.config.getProjectRoot(),
        timeout: 10000,
      });

      const { stdout: statusVerbose } = await execAsync('git status', {
        cwd: this.config.getProjectRoot(),
        timeout: 10000,
      });

      results.push('📊 Git Repository Status:');
      results.push(statusVerbose);

      if (detailed) {
        // Branch information
        const { stdout: branchInfo } = await execAsync('git branch -vv', {
          cwd: this.config.getProjectRoot(),
          timeout: 10000,
        });

        results.push('\n🌿 Branch Information:');
        results.push(branchInfo);

        // Remote information
        try {
          const { stdout: remoteInfo } = await execAsync('git remote -v', {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push('\n🔗 Remote Repositories:');
          results.push(remoteInfo || 'No remotes configured');
        } catch (error) {
          results.push('\n🔗 Remote Repositories: Unable to fetch');
        }

        // Last commit information
        try {
          const { stdout: lastCommit } = await execAsync('git log -1 --oneline', {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push('\n📝 Last Commit:');
          results.push(lastCommit);
        } catch (error) {
          results.push('\n📝 Last Commit: No commits found');
        }
      }

      if (includeStash) {
        try {
          const { stdout: stashList } = await execAsync('git stash list', {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push('\n📦 Stash List:');
          results.push(stashList || 'No stashes found');
        } catch (error) {
          results.push('\n📦 Stash List: Unable to fetch');
        }
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
            text: `❌ Git status failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Create a Git commit
   */
  async createCommit(args = {}) {
    const { message, addAll = false, files = [], amend = false } = args;

    try {
      const results = [];

      // Add files if specified
      if (addAll) {
        await execAsync('git add .', {
          cwd: this.config.getProjectRoot(),
          timeout: 30000,
        });
        results.push('✅ All changes staged');
      } else if (files.length > 0) {
        for (const file of files) {
          await execAsync(`git add "${file}"`, {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });
        }
        results.push(`✅ Staged files: ${files.join(', ')}`);
      }

      // Check if there are changes to commit
      const { stdout: statusCheck } = await execAsync('git status --porcelain --cached', {
        cwd: this.config.getProjectRoot(),
        timeout: 10000,
      });

      if (!statusCheck.trim() && !amend) {
        return {
          content: [
            {
              type: 'text',
              text: '⚠️  No changes staged for commit. Use addAll=true or specify files to stage changes first.',
            },
          ],
        };
      }

      // Create commit
      let commitCommand = `git commit -m "${message}"`;
      if (amend) {
        commitCommand = `git commit --amend -m "${message}"`;
      }

      const { stdout, stderr } = await execAsync(commitCommand, {
        cwd: this.config.getProjectRoot(),
        timeout: 30000,
      });

      results.push('✅ Commit created successfully');
      results.push(`Commit output:\n${stdout}`);

      if (stderr && stderr.trim()) {
        results.push(`Warnings:\n${stderr}`);
      }

      // Get commit hash
      const { stdout: commitHash } = await execAsync('git rev-parse HEAD', {
        cwd: this.config.getProjectRoot(),
        timeout: 10000,
      });

      results.push(`🎯 Commit hash: ${commitHash.trim().substring(0, 8)}`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Git Commit ${amend ? '(Amended)' : 'Created'}\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Git commit failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Manage Git branches
   */
  async manageBranch(args = {}) {
    const { action, name, remote = false, force = false } = args;

    try {
      const results = [];

      switch (action) {
        case 'list':
          const listCommand = remote ? 'git branch -a' : 'git branch';
          const { stdout } = await execAsync(listCommand, {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push(`🌿 Branches${remote ? ' (including remote)' : ''}:`);
          results.push(stdout);
          break;

        case 'create':
          if (!name) throw new Error('Branch name is required for create action');

          let createCommand = `git branch "${name}"`;
          if (remote) {
            createCommand = `git checkout -b "${name}"`;
          }

          const { stdout: createOutput } = await execAsync(createCommand, {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push(`✅ Branch '${name}' created${remote ? ' and checked out' : ''}`);
          if (createOutput) results.push(createOutput);
          break;

        case 'switch':
          if (!name) throw new Error('Branch name is required for switch action');

          const { stdout: switchOutput } = await execAsync(`git checkout "${name}"`, {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push(`✅ Switched to branch '${name}'`);
          if (switchOutput) results.push(switchOutput);
          break;

        case 'delete':
          if (!name) throw new Error('Branch name is required for delete action');

          const deleteFlag = force ? '-D' : '-d';
          const { stdout: deleteOutput } = await execAsync(`git branch ${deleteFlag} "${name}"`, {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push(`✅ Branch '${name}' deleted${force ? ' (forced)' : ''}`);
          if (deleteOutput) results.push(deleteOutput);
          break;

        case 'merge':
          if (!name) throw new Error('Branch name is required for merge action');

          const { stdout: mergeOutput } = await execAsync(`git merge "${name}"`, {
            cwd: this.config.getProjectRoot(),
            timeout: 30000,
          });

          results.push(`✅ Merged branch '${name}' into current branch`);
          results.push(mergeOutput);
          break;

        default:
          throw new Error(`Unknown branch action: ${action}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `🌿 Branch Management (${action})\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Branch ${action} failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Push changes to remote repository
   */
  async pushChanges(args = {}) {
    const { remote = 'origin', branch, force = false, setUpstream = false, tags = false } = args;

    try {
      const results = [];

      // Get current branch if not specified
      let targetBranch = branch;
      if (!targetBranch) {
        const { stdout } = await execAsync('git branch --show-current', {
          cwd: this.config.getProjectRoot(),
          timeout: 10000,
        });
        targetBranch = stdout.trim();
      }

      // Build push command
      let pushCommand = `git push ${remote} ${targetBranch}`;

      if (force) {
        pushCommand += ' --force';
      }
      if (setUpstream) {
        pushCommand += ' --set-upstream';
      }

      // Push main changes
      const { stdout, stderr } = await execAsync(pushCommand, {
        cwd: this.config.getProjectRoot(),
        timeout: 60000,
      });

      results.push(`✅ Pushed ${targetBranch} to ${remote}`);
      results.push(`Push output:\n${stdout}`);

      if (stderr && stderr.trim()) {
        results.push(`Push info:\n${stderr}`);
      }

      // Push tags if requested
      if (tags) {
        try {
          const { stdout: tagOutput } = await execAsync(`git push ${remote} --tags`, {
            cwd: this.config.getProjectRoot(),
            timeout: 30000,
          });

          results.push('✅ Tags pushed');
          if (tagOutput) results.push(`Tag push output:\n${tagOutput}`);
        } catch (tagError) {
          results.push(`⚠️  Tag push failed: ${tagError.message}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Git Push Complete\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Git push failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Pull changes from remote repository
   */
  async pullChanges(args = {}) {
    const { remote = 'origin', branch, rebase = false, strategy = 'merge' } = args;

    try {
      const results = [];

      // Get current branch if not specified
      let targetBranch = branch;
      if (!targetBranch) {
        const { stdout } = await execAsync('git branch --show-current', {
          cwd: this.config.getProjectRoot(),
          timeout: 10000,
        });
        targetBranch = stdout.trim();
      }

      // Build pull command based on strategy
      let pullCommand;
      switch (strategy) {
        case 'rebase':
          pullCommand = `git pull --rebase ${remote} ${targetBranch}`;
          break;
        case 'fast-forward':
          pullCommand = `git pull --ff-only ${remote} ${targetBranch}`;
          break;
        default:
          pullCommand = `git pull ${remote} ${targetBranch}`;
      }

      if (rebase && strategy === 'merge') {
        pullCommand = `git pull --rebase ${remote} ${targetBranch}`;
      }

      const { stdout, stderr } = await execAsync(pullCommand, {
        cwd: this.config.getProjectRoot(),
        timeout: 60000,
      });

      results.push(`✅ Pulled changes from ${remote}/${targetBranch}`);
      results.push(`Pull output:\n${stdout}`);

      if (stderr && stderr.trim()) {
        results.push(`Pull info:\n${stderr}`);
      }

      // Show what changed
      try {
        const { stdout: diffStats } = await execAsync('git diff --stat HEAD@{1} HEAD', {
          cwd: this.config.getProjectRoot(),
          timeout: 10000,
        });

        if (diffStats.trim()) {
          results.push(`\n📊 Changes summary:\n${diffStats}`);
        } else {
          results.push('\n📊 Already up to date');
        }
      } catch (error) {
        // Ignore diff errors
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Git Pull Complete (${strategy})\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Git pull failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Create a pull request using GitHub CLI
   */
  async createPullRequest(args = {}) {
    const { title, body, base = 'main', draft = false, assignees = [], labels = [] } = args;

    try {
      const results = [];

      // Check if GitHub CLI is available
      try {
        await execAsync('gh --version', { timeout: 5000 });
      } catch (error) {
        throw new Error('GitHub CLI (gh) is not installed. Install it from: https://cli.github.com/');
      }

      // Get current branch
      const { stdout: currentBranch } = await execAsync('git branch --show-current', {
        cwd: this.config.getProjectRoot(),
        timeout: 10000,
      });

      const branch = currentBranch.trim();

      if (branch === base) {
        throw new Error(`Cannot create PR from ${base} to ${base}. Switch to a feature branch first.`);
      }

      // Build PR creation command
      let prCommand = `gh pr create --title "${title}" --base "${base}"`;

      if (body) {
        prCommand += ` --body "${body}"`;
      } else {
        // Generate default body
        const defaultBody = `## Summary\nCreated from branch: ${branch}\n\n## Changes\n- (Add description of changes)\n\n🤖 Generated with SLM DevOps MCP`;
        prCommand += ` --body "${defaultBody}"`;
      }

      if (draft) {
        prCommand += ' --draft';
      }

      if (assignees.length > 0) {
        prCommand += ` --assignee ${assignees.join(',')}`;
      }

      if (labels.length > 0) {
        prCommand += ` --label ${labels.join(',')}`;
      }

      // Create the pull request
      const { stdout, stderr } = await execAsync(prCommand, {
        cwd: this.config.getProjectRoot(),
        timeout: 30000,
      });

      results.push('✅ Pull request created successfully');
      results.push(`PR details:\n${stdout}`);

      if (stderr && stderr.trim()) {
        results.push(`Additional info:\n${stderr}`);
      }

      // Extract PR URL from output
      const prUrlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
      if (prUrlMatch) {
        results.push(`\n🔗 PR URL: ${prUrlMatch[0]}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Pull Request Created\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Pull request creation failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Show Git log
   */
  async showLog(args = {}) {
    const { count = 10, oneline = false, graph = false, author, since } = args;

    try {
      let logCommand = 'git log';

      if (oneline) {
        logCommand += ' --oneline';
      } else {
        logCommand += ' --pretty=format:"%h - %s (%cr) <%an>"';
      }

      if (graph) {
        logCommand += ' --graph';
      }

      logCommand += ` -${count}`;

      if (author) {
        logCommand += ` --author="${author}"`;
      }

      if (since) {
        logCommand += ` --since="${since}"`;
      }

      const { stdout } = await execAsync(logCommand, {
        cwd: this.config.getProjectRoot(),
        timeout: 10000,
      });

      return {
        content: [
          {
            type: 'text',
            text: `📝 Git Log (last ${count} commits)\n\n${stdout}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Git log failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Show Git diff
   */
  async showDiff(args = {}) {
    const { target = 'working', files = [], branch1, branch2, statistical = false } = args;

    try {
      let diffCommand = 'git diff';

      if (statistical) {
        diffCommand += ' --stat';
      }

      switch (target) {
        case 'working':
          // Default - show working directory changes
          break;
        case 'staged':
          diffCommand += ' --cached';
          break;
        case 'committed':
          diffCommand += ' HEAD~1 HEAD';
          break;
        case 'branches':
          if (!branch1 || !branch2) {
            throw new Error('Both branch1 and branch2 are required for branch comparison');
          }
          diffCommand += ` ${branch1}..${branch2}`;
          break;
      }

      if (files.length > 0) {
        diffCommand += ` -- ${files.join(' ')}`;
      }

      const { stdout } = await execAsync(diffCommand, {
        cwd: this.config.getProjectRoot(),
        timeout: 30000,
      });

      if (!stdout.trim()) {
        return {
          content: [
            {
              type: 'text',
              text: `📊 Git Diff (${target})\n\nNo differences found.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `📊 Git Diff (${target})\n\n${stdout}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Git diff failed\n\nError: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Manage Git tags
   */
  async manageTag(args = {}) {
    const { action, name, message, commit = 'HEAD', force = false } = args;

    try {
      const results = [];

      switch (action) {
        case 'list':
          const { stdout } = await execAsync('git tag -l', {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push('🏷️  Tags:');
          results.push(stdout || 'No tags found');
          break;

        case 'create':
          if (!name) throw new Error('Tag name is required for create action');

          let createCommand = `git tag`;
          if (message) {
            createCommand += ` -a "${name}" -m "${message}"`;
          } else {
            createCommand += ` "${name}"`;
          }

          if (force) {
            createCommand += ' -f';
          }

          createCommand += ` ${commit}`;

          const { stdout: createOutput } = await execAsync(createCommand, {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push(`✅ Tag '${name}' created${message ? ' (annotated)' : ' (lightweight)'}`);
          if (createOutput) results.push(createOutput);
          break;

        case 'delete':
          if (!name) throw new Error('Tag name is required for delete action');

          const { stdout: deleteOutput } = await execAsync(`git tag -d "${name}"`, {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push(`✅ Tag '${name}' deleted locally`);
          if (deleteOutput) results.push(deleteOutput);
          break;

        case 'push':
          if (!name) throw new Error('Tag name is required for push action');

          const { stdout: pushOutput } = await execAsync(`git push origin "${name}"`, {
            cwd: this.config.getProjectRoot(),
            timeout: 30000,
          });

          results.push(`✅ Tag '${name}' pushed to remote`);
          if (pushOutput) results.push(pushOutput);
          break;

        default:
          throw new Error(`Unknown tag action: ${action}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `🏷️  Tag Management (${action})\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Tag ${action} failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Manage Git stash
   */
  async manageStash(args = {}) {
    const { action, message, index = 0, includeUntracked = false } = args;

    try {
      const results = [];

      switch (action) {
        case 'save':
          let saveCommand = 'git stash push';
          if (message) {
            saveCommand += ` -m "${message}"`;
          }
          if (includeUntracked) {
            saveCommand += ' -u';
          }

          const { stdout } = await execAsync(saveCommand, {
            cwd: this.config.getProjectRoot(),
            timeout: 30000,
          });

          results.push('✅ Changes stashed');
          if (stdout) results.push(stdout);
          break;

        case 'list':
          const { stdout: listOutput } = await execAsync('git stash list', {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push('📦 Stash List:');
          results.push(listOutput || 'No stashes found');
          break;

        case 'apply':
          const { stdout: applyOutput } = await execAsync(`git stash apply stash@{${index}}`, {
            cwd: this.config.getProjectRoot(),
            timeout: 30000,
          });

          results.push(`✅ Stash @{${index}} applied`);
          if (applyOutput) results.push(applyOutput);
          break;

        case 'pop':
          const { stdout: popOutput } = await execAsync(`git stash pop stash@{${index}}`, {
            cwd: this.config.getProjectRoot(),
            timeout: 30000,
          });

          results.push(`✅ Stash @{${index}} popped`);
          if (popOutput) results.push(popOutput);
          break;

        case 'drop':
          const { stdout: dropOutput } = await execAsync(`git stash drop stash@{${index}}`, {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push(`✅ Stash @{${index}} dropped`);
          if (dropOutput) results.push(dropOutput);
          break;

        case 'clear':
          const { stdout: clearOutput } = await execAsync('git stash clear', {
            cwd: this.config.getProjectRoot(),
            timeout: 10000,
          });

          results.push('✅ All stashes cleared');
          if (clearOutput) results.push(clearOutput);
          break;

        default:
          throw new Error(`Unknown stash action: ${action}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `📦 Stash Management (${action})\n\n${results.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Stash ${action} failed\n\nError: ${error.message}\n\nOutput:\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
        isError: true,
      };
    }
  }
}