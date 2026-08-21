/**
 * @file tools.js
 * Tool registry definitions and bindings for OpenBot sandbox in DeepSeek Harness.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const defaultOutput = {
  schema: { type: 'object' },
  render(res) {
    if (typeof res === 'string') return res;
    return JSON.stringify(res, null, 2);
  }
};

function registerTool(ctx, def) {
  if (!ctx.tools) return;
  const normalizedDef = {
    output: defaultOutput,
    ...def
  };
  if (typeof ctx.tools.register === 'function') {
    ctx.tools.register(normalizedDef);
  } else if (typeof ctx.tools.define === 'function') {
    ctx.tools.define(normalizedDef);
  }
}

export function registerOpenBotTools(ctx, containerManager, securityGateway) {
  // 1. Isolated Bash Command Execution
  registerTool(ctx, {
    name: 'openbot_bash_exec',
    description: 'Execute a shell command inside the isolated OpenBot Docker container sandbox. All files are contained in /sandbox/workspace.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute inside the sandbox.' },
        workingDir: { type: 'string', description: 'Optional directory inside /sandbox/workspace (default: /sandbox/workspace)' }
      },
      required: ['command']
    },
    async execute(params) {
      return await securityGateway.executeGuarded('openbot_bash_exec', params, async () => {
        const res = await containerManager.exec(params.command, params.workingDir);
        return {
          exitCode: res.exitCode,
          stdout: res.stdout,
          stderr: res.stderr
        };
      });
    }
  });

  // 2. Sandboxed Filesystem - Write
  registerTool(ctx, {
    name: 'openbot_fs_write',
    description: 'Write or create a file inside the isolated OpenBot sandbox workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path within the sandbox workspace (e.g. "app.js", "data/output.json")' },
        content: { type: 'string', description: 'The text or code content to write.' }
      },
      required: ['path', 'content']
    },
    async execute(params) {
      return await securityGateway.executeGuarded('openbot_fs_write', params, async () => {
        const safePath = path.resolve(containerManager.workspaceDir, params.path);
        if (!safePath.startsWith(containerManager.workspaceDir)) {
          throw new Error('Access denied: path is outside the sandbox workspace.');
        }
        await fs.mkdir(path.dirname(safePath), { recursive: true });
        await fs.writeFile(safePath, params.content, 'utf8');
        return { status: 'success', path: params.path, bytesWritten: Buffer.byteLength(params.content) };
      });
    }
  });

  // 3. Sandboxed Filesystem - Read
  registerTool(ctx, {
    name: 'openbot_fs_read',
    description: 'Read the contents of a file inside the isolated OpenBot sandbox workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path within the sandbox workspace.' }
      },
      required: ['path']
    },
    async execute(params) {
      return await securityGateway.executeGuarded('openbot_fs_read', params, async () => {
        const safePath = path.resolve(containerManager.workspaceDir, params.path);
        if (!safePath.startsWith(containerManager.workspaceDir)) {
          throw new Error('Access denied: path is outside the sandbox workspace.');
        }
        const content = await fs.readFile(safePath, 'utf8');
        return { content, path: params.path };
      });
    }
  });

  // 4. Sandboxed Filesystem - List
  registerTool(ctx, {
    name: 'openbot_fs_list',
    description: 'List directory entries inside the isolated OpenBot sandbox workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Subdirectory path to list (default: "")' }
      }
    },
    async execute(params = {}) {
      return await securityGateway.executeGuarded('openbot_fs_list', params, async () => {
        const targetDir = path.resolve(containerManager.workspaceDir, params.path || '');
        if (!targetDir.startsWith(containerManager.workspaceDir)) {
          throw new Error('Access denied: path is outside the sandbox workspace.');
        }
        const entries = await fs.readdir(targetDir, { withFileTypes: true });
        return {
          directory: params.path || '/',
          entries: entries.map(e => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            isFile: e.isFile()
          }))
        };
      });
    }
  });

  // 5. Isolated Browser - Navigate
  registerTool(ctx, {
    name: 'openbot_browser_navigate',
    description: 'Navigate to a web URL inside the isolated containerized Chromium browser.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to navigate to (e.g. https://example.com)' }
      },
      required: ['url']
    },
    async execute(params) {
      return await securityGateway.executeGuarded('openbot_browser_navigate', params, async () => {
        const res = await containerManager.exec(`npx -y agent-browser open "${params.url}"`);
        return {
          status: res.exitCode === 0 ? 'navigated' : 'error',
          url: params.url,
          details: res.stdout || res.stderr
        };
      });
    }
  });

  // 6. Isolated Browser - Snapshot
  registerTool(ctx, {
    name: 'openbot_browser_snapshot',
    description: 'Capture a snapshot and textual DOM accessibility summary of the current page in the isolated browser.',
    parameters: {
      type: 'object',
      properties: {}
    },
    async execute(params = {}) {
      return await securityGateway.executeGuarded('openbot_browser_snapshot', params, async () => {
        const res = await containerManager.exec('npx -y agent-browser snapshot');
        return {
          snapshot: res.stdout || 'Page snapshot captured.',
          status: 'success'
        };
      });
    }
  });

  // 7. Isolated Browser - Click
  registerTool(ctx, {
    name: 'openbot_browser_click',
    description: 'Click an element on the active page in the isolated OpenBot browser.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or text selector to click' }
      },
      required: ['selector']
    },
    async execute(params) {
      return await securityGateway.executeGuarded('openbot_browser_click', params, async () => {
        const res = await containerManager.exec(`npx -y agent-browser click "${params.selector}"`);
        return {
          status: res.exitCode === 0 ? 'clicked' : 'failed',
          selector: params.selector,
          output: res.stdout || res.stderr
        };
      });
    }
  });
}
