#!/usr/bin/env node
/**
 * @file mcp-server.js
 * Universal Model Context Protocol (MCP) Server for OpenBot.
 * Exposes containerized sandbox execution, high-precision indexed browser tools (@e1, @e2),
 * and Human-in-the-Loop ("Take the Wheel") mode to any MCP-compliant AI client
 * (Antigravity, Claude Desktop, Cursor, Windsurf, Hermes, LibreChat, Open WebUI).
 */

import readline from 'node:readline';
import { OpenBotContainerManager } from '../lib/container.js';
import { OpenBotSecurityGateway } from '../lib/security.js';
import { registerOpenBotTools } from '../lib/tools.js';

// Protocol constants
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'openbot-mcp-server';
const SERVER_VERSION = '0.2.0';

// Initialize container manager and security gateway
const containerManager = new OpenBotContainerManager({
  workspaceDir: process.env.OPENBOT_WORKSPACE,
  logger: {
    info: (...args) => process.stderr.write(`[INFO] ${args.join(' ')}\n`),
    warn: (...args) => process.stderr.write(`[WARN] ${args.join(' ')}\n`),
    error: (...args) => process.stderr.write(`[ERROR] ${args.join(' ')}\n`)
  }
});

const securityGateway = new OpenBotSecurityGateway({
  logger: {
    info: (...args) => process.stderr.write(`[INFO] ${args.join(' ')}\n`),
    warn: (...args) => process.stderr.write(`[WARN] ${args.join(' ')}\n`),
    error: (...args) => process.stderr.write(`[ERROR] ${args.join(' ')}\n`)
  }
});

// Registry map to collect all registered tools
const toolsRegistry = new Map();

// Mock Cordis context that populates toolsRegistry
const mockCtx = {
  tools: {
    register: (toolDef) => {
      toolsRegistry.set(toolDef.name, toolDef);
    }
  }
};

// Register all browser, sandbox, and HITL tools
registerOpenBotTools(mockCtx, containerManager, securityGateway);

/**
 * Convert internal tool definition to MCP Tool schema.
 * @param {Object} def
 * @returns {Object} MCP Tool object
 */
function toMcpTool(def) {
  return {
    name: def.name,
    description: def.description || '',
    inputSchema: def.parameters || {
      type: 'object',
      properties: {}
    }
  };
}

/**
 * Handle incoming JSON-RPC request.
 * @param {Object} req
 * @returns {Promise<Object>} JSON-RPC response
 */
async function handleRpcRequest(req) {
  const { id, method, params } = req;

  // 1. Lifecycle: initialize
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        }
      }
    };
  }

  // 2. Lifecycle: notifications/initialized
  if (method === 'notifications/initialized') {
    // Auto-ensure sandbox container is active upon client connection
    containerManager.ensureRunning().catch(err => {
      process.stderr.write(`[WARN] Background container start notice: ${err.message}\n`);
    });
    return null; // Notifications do not receive responses
  }

  // 3. Ping
  if (method === 'ping') {
    return {
      jsonrpc: '2.0',
      id,
      result: {}
    };
  }

  // 4. Tools: list tools
  if (method === 'tools/list') {
    const tools = Array.from(toolsRegistry.values()).map(toMcpTool);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools
      }
    };
  }

  // 5. Tools: call tool
  if (method === 'tools/call') {
    const { name, arguments: toolArgs = {} } = params || {};
    const tool = toolsRegistry.get(name);

    if (!tool) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Unknown tool: "${name}"`
        }
      };
    }

    try {
      // Execute the guarded tool handler
      const result = await tool.execute(toolArgs);

      // Return content array conforming to MCP protocol
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Tool execution failed: ${err.message}`
            }
          ]
        }
      };
    }
  }

  // Default: method not found
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method "${method}" not found`
    }
  };
}

/**
 * Standard I/O loop reading JSON-RPC 2.0 messages from stdin
 */
function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const request = JSON.parse(trimmed);
      const response = await handleRpcRequest(request);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err.message}`
        }
      }) + '\n');
    }
  });

  process.stderr.write(`[INFO] ${SERVER_NAME} v${SERVER_VERSION} listening on stdio\n`);
}

main();
