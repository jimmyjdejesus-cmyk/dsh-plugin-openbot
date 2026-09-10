/**
 * @file tools.js
 * Tool registry definitions and bindings for OpenBot sandbox in DeepSeek Harness.
 * Provides isolated bash execution, jailed filesystem operations, and
 * high-precision, index-referenced browser automation inspired by browser-use and OpenBot.
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

/**
 * Normalizes element targeting.
 * Accepts either:
 *  - Ref format: "@e1", "@e2"
 *  - Numeric shorthand: "1", 2 -> "@e1", "@e2"
 *  - Standard CSS / XPath selector: "button.submit", "input[name='q']"
 * @param {string|number} target
 * @returns {string}
 */
function normalizeTarget(target) {
  if (!target) return '';
  const str = String(target).trim();
  if (str.startsWith('@')) return str;
  if (/^\d+$/.test(str)) return `@e${str}`;
  return str;
}

/**
 * Safe tool registration across Cordis and DSH variations.
 */
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

  // ============================================================================
  // 1. ISOLATED SHELL COMMAND EXECUTION
  // ============================================================================
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

  // ============================================================================
  // 2. SANDBOXED FILESYSTEM TOOLS
  // ============================================================================
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

  // ============================================================================
  // 3. HIGH-PRECISION ISOLATED BROWSER AUTOMATION (INDEXED REFS + CDP)
  // ============================================================================

  // 3.1 Navigate
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

  // 3.2 Snapshot with Interactive Element Indexing
  registerTool(ctx, {
    name: 'openbot_browser_snapshot',
    description: 'Capture a clean DOM accessibility tree with numbered element references (@e1, @e2, etc.) for precise clicking and typing.',
    parameters: {
      type: 'object',
      properties: {}
    },
    async execute(params = {}) {
      return await securityGateway.executeGuarded('openbot_browser_snapshot', params, async () => {
        const res = await containerManager.exec('npx -y agent-browser snapshot');
        const rawOutput = res.stdout || 'Page snapshot captured.';

        // Parse interactive element references from the snapshot
        // Patterns like [ref=e1], [ref=e2]
        const refMatches = [...rawOutput.matchAll(/-\s+(link|button|textbox|checkbox|combobox|menuitem|tab|heading)\s+"([^"]*)"[^\[]*\[(?:[^\]]*,)?ref=(e\d+)\]/gi)];
        const interactiveElements = refMatches.map(m => ({
          ref: `@${m[3]}`,
          type: m[1],
          label: m[2]
        }));

        return {
          status: 'success',
          snapshot: rawOutput,
          interactiveElementsCount: interactiveElements.length,
          interactiveElements: interactiveElements.slice(0, 30) // sample for fast inspection
        };
      });
    }
  });

  // 3.3 Click (by @ref or CSS selector)
  registerTool(ctx, {
    name: 'openbot_browser_click',
    description: 'Click an interactive element in the browser. You can pass an indexed element ref (e.g. "@e1") from openbot_browser_snapshot or a standard CSS selector.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'The element reference (e.g. "@e1") or CSS selector to click' },
        selector: { type: 'string', description: 'Alternative alias for target' }
      }
    },
    async execute(params) {
      return await securityGateway.executeGuarded('openbot_browser_click', params, async () => {
        const rawTarget = params.target || params.selector;
        if (!rawTarget) throw new Error('Missing target or selector to click.');
        const normTarget = normalizeTarget(rawTarget);

        const res = await containerManager.exec(`npx -y agent-browser click "${normTarget}"`);
        return {
          status: res.exitCode === 0 ? 'clicked' : 'failed',
          target: normTarget,
          output: res.stdout || res.stderr
        };
      });
    }
  });

  // 3.4 Type Text into Form Fields
  registerTool(ctx, {
    name: 'openbot_browser_type',
    description: 'Type text into an input field or textarea in the isolated browser. Supports clearing fields and pressing Enter upon completion.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'The element reference (e.g. "@e2") or CSS selector of the input field' },
        text: { type: 'string', description: 'The string to type into the field' },
        clear: { type: 'boolean', description: 'Whether to clear existing text before typing (default: false)' },
        pressEnter: { type: 'boolean', description: 'Whether to press Enter after typing (default: false)' }
      },
      required: ['target', 'text']
    },
    async execute(params) {
      return await securityGateway.executeGuarded('openbot_browser_type', params, async () => {
        const normTarget = normalizeTarget(params.target);
        const escapedText = String(params.text).replace(/"/g, '\\"');

        // Use fill if clear is requested, otherwise type
        const subCmd = params.clear ? 'fill' : 'type';
        const res = await containerManager.exec(`npx -y agent-browser ${subCmd} "${normTarget}" "${escapedText}"`);

        if (params.pressEnter && res.exitCode === 0) {
          await containerManager.exec('npx -y agent-browser press Enter');
        }

        return {
          status: res.exitCode === 0 ? 'typed' : 'failed',
          target: normTarget,
          textLength: params.text.length,
          output: res.stdout || res.stderr
        };
      });
    }
  });

  // 3.5 Press Keyboard Keys
  registerTool(ctx, {
    name: 'openbot_browser_press',
    description: 'Send a keyboard key press event to the active browser page (e.g. "Enter", "Tab", "Escape", "ArrowDown", "Backspace").',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key identifier to press (e.g. "Enter", "Escape", "Tab", "ArrowDown")' }
      },
      required: ['key']
    },
    async execute(params) {
      return await securityGateway.executeGuarded('openbot_browser_press', params, async () => {
        const res = await containerManager.exec(`npx -y agent-browser press "${params.key}"`);
        return {
          status: res.exitCode === 0 ? 'pressed' : 'failed',
          key: params.key,
          output: res.stdout || res.stderr
        };
      });
    }
  });

  // 3.6 Scroll Viewport
  registerTool(ctx, {
    name: 'openbot_browser_scroll',
    description: 'Scroll the active browser viewport up, down, to top, or to bottom.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['down', 'up', 'top', 'bottom'], description: 'Scroll direction (default: "down")' },
        amount: { type: 'number', description: 'Pixel distance to scroll (default: 500)' }
      }
    },
    async execute(params = {}) {
      return await securityGateway.executeGuarded('openbot_browser_scroll', params, async () => {
        const dir = params.direction || 'down';
        const dist = params.amount || 500;
        
        let scrollScript = '';
        if (dir === 'top') scrollScript = 'window.scrollTo(0, 0);';
        else if (dir === 'bottom') scrollScript = 'window.scrollTo(0, document.body.scrollHeight);';
        else if (dir === 'up') scrollScript = `window.scrollBy(0, -${dist});`;
        else scrollScript = `window.scrollBy(0, ${dist});`;

        const escapedScript = scrollScript.replace(/"/g, '\\"');
        const res = await containerManager.exec(`npx -y agent-browser eval "${escapedScript}"`);

        return {
          status: res.exitCode === 0 ? 'scrolled' : 'failed',
          direction: dir,
          amount: dist
        };
      });
    }
  });

  // 3.7 Visual Screenshot Capture
  registerTool(ctx, {
    name: 'openbot_browser_screenshot',
    description: 'Capture a visual PNG screenshot of the active browser viewport.',
    parameters: {
      type: 'object',
      properties: {
        saveName: { type: 'string', description: 'Optional filename relative to workspace (default: "screenshot.png")' }
      }
    },
    async execute(params = {}) {
      return await securityGateway.executeGuarded('openbot_browser_screenshot', params, async () => {
        const filename = params.saveName || `screenshot_${Date.now()}.png`;
        const targetPath = path.join(containerManager.workspaceDir, filename);

        const res = await containerManager.exec(`npx -y agent-browser screenshot "${targetPath}"`);
        return {
          status: res.exitCode === 0 ? 'captured' : 'failed',
          filename,
          workspacePath: targetPath,
          output: res.stdout || res.stderr
        };
      });
    }
  });

  // 3.8 Safe In-Page JavaScript Evaluation
  registerTool(ctx, {
    name: 'openbot_browser_eval',
    description: 'Evaluate a sandboxed JavaScript expression in the active web page and return the evaluated result.',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'The JavaScript expression to evaluate (e.g. "document.title", "window.location.href")' }
      },
      required: ['script']
    },
    async execute(params) {
      return await securityGateway.executeGuarded('openbot_browser_eval', params, async () => {
        const escapedScript = String(params.script).replace(/"/g, '\\"');
        const res = await containerManager.exec(`npx -y agent-browser eval "${escapedScript}"`);
        return {
          status: res.exitCode === 0 ? 'evaluated' : 'failed',
          result: res.stdout || res.stderr
        };
      });
    }
  });
}
