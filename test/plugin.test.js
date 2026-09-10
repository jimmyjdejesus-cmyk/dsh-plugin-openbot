/**
 * @file plugin.test.js
 * Comprehensive integration test suite for dsh-plugin-openbot v0.2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as plugin from '../lib/index.js';
import { OpenBotContainerManager } from '../lib/container.js';
import { OpenBotSecurityGateway } from '../lib/security.js';
import { registerOpenBotTools } from '../lib/tools.js';
import { buildOpenBotPrompt } from '../lib/prompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testWorkspace = path.join(__dirname, '.tmp_workspace');
const testAuditLog = path.join(__dirname, '.tmp_audit.log.jsonl');

test.beforeEach(async () => {
  await fs.mkdir(testWorkspace, { recursive: true });
});

test.afterEach(async () => {
  try {
    await fs.rm(testWorkspace, { recursive: true, force: true });
    await fs.rm(testAuditLog, { force: true });
  } catch (_) {}
});

test('1. Plugin module metadata & schemas', () => {
  assert.equal(plugin.name, 'dsh-plugin-openbot');
  assert.deepEqual(plugin.inject, ['tools', 'systemPrompt']);
  assert.ok(plugin.Config['~standard']);
  assert.equal(typeof plugin.Config['~standard'].validate, 'function');
});

test('2. System prompt generator', () => {
  const prompt = buildOpenBotPrompt();
  assert.ok(prompt.includes('CopilotKit OpenBot Sandbox Environment'));
  assert.ok(prompt.includes('openbot_bash_exec'));
  assert.ok(prompt.includes('openbot_browser_navigate'));
  assert.ok(prompt.includes('openbot_browser_snapshot'));
  assert.ok(prompt.includes('openbot_browser_click'));
  assert.ok(prompt.includes('openbot_browser_type'));
  assert.ok(prompt.includes('Take the Wheel'));
});

test('3. Container Manager & Docker daemon checks', async () => {
  const manager = new OpenBotContainerManager({
    containerName: 'dsh-test-sandbox',
    workspaceDir: testWorkspace,
    logger: console
  });

  await manager.ensureWorkspace();
  const exists = await fs.stat(testWorkspace).then(() => true).catch(() => false);
  assert.equal(exists, true);

  const isDockerAvailable = await manager.checkDockerAvailable();
  assert.equal(typeof isDockerAvailable, 'boolean');

  const status = await manager.getStatus();
  assert.ok(['missing', 'running', 'exited'].includes(status.status));
});

test('4. Security Gateway risk scoring & audit logging', async () => {
  const gateway = new OpenBotSecurityGateway({
    auditLogPath: testAuditLog,
    requireApproval: true
  });

  // Low risk check
  const lowRisk = gateway.assessRisk('openbot_fs_read', { path: 'README.md' });
  assert.equal(lowRisk.level, 'low');

  // High risk destructive command
  const highRisk = gateway.assessRisk('openbot_bash_exec', { command: 'rm -rf /' });
  assert.equal(highRisk.level, 'high');
  assert.ok(highRisk.reason);

  // Browser type credential leak check
  const credRisk = gateway.assessRisk('openbot_browser_type', { text: 'sk-proj-123456789' });
  assert.equal(credRisk.level, 'medium');

  // Browser eval cookie inspection check
  const evalRisk = gateway.assessRisk('openbot_browser_eval', { script: 'document.cookie' });
  assert.equal(evalRisk.level, 'medium');

  // Path traversal check
  const pathTraversalRisk = gateway.assessRisk('openbot_fs_write', { path: '../../etc/passwd', content: 'x' });
  assert.equal(pathTraversalRisk.level, 'high');

  // Execute safe action through gateway
  const result = await gateway.executeGuarded('test_tool', { a: 1 }, async () => {
    return 'ok';
  });
  assert.equal(result, 'ok');

  const audits = gateway.getRecentAudits();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].tool, 'test_tool');
  assert.equal(audits[0].status, 'success');

  // Verify file write
  const fileContent = await fs.readFile(testAuditLog, 'utf8');
  assert.ok(fileContent.includes('test_tool'));
});

test('5. Sandboxed Filesystem Tools Execution & Security Guard', async () => {
  const manager = new OpenBotContainerManager({
    workspaceDir: testWorkspace
  });
  const gateway = new OpenBotSecurityGateway({
    auditLogPath: testAuditLog,
    requireApproval: true
  });

  const registeredTools = new Map();
  const mockCtx = {
    tools: {
      register(toolDef) {
        registeredTools.set(toolDef.name, toolDef);
      }
    }
  };

  registerOpenBotTools(mockCtx, manager, gateway);

  assert.ok(registeredTools.has('openbot_fs_write'));
  assert.ok(registeredTools.has('openbot_fs_read'));
  assert.ok(registeredTools.has('openbot_fs_list'));
  assert.ok(registeredTools.has('openbot_bash_exec'));

  // Test write
  const writeTool = registeredTools.get('openbot_fs_write');
  const writeRes = await writeTool.execute({
    path: 'test.txt',
    content: 'Hello from OpenBot Sandbox test!'
  });
  assert.equal(writeRes.status, 'success');

  // Test read
  const readTool = registeredTools.get('openbot_fs_read');
  const readRes = await readTool.execute({ path: 'test.txt' });
  assert.equal(readRes.content, 'Hello from OpenBot Sandbox test!');

  // Test list
  const listTool = registeredTools.get('openbot_fs_list');
  const listRes = await listTool.execute({});
  assert.ok(listRes.entries.some(e => e.name === 'test.txt'));

  // Test unapproved path traversal blocking by security gateway
  const blockedRes = await writeTool.execute({
    path: '../outside.txt',
    content: 'malicious'
  });
  assert.equal(blockedRes.requiresApproval, true);
  assert.ok(blockedRes.error.includes('OpenBot Security Gateway'));

  // Test that even if marked approved, directory escape is hard-rejected by filesystem jail
  await assert.rejects(async () => {
    await writeTool.execute({
      path: '../outside.txt',
      content: 'malicious',
      __approved: true
    });
  }, /outside the sandbox workspace/);
});

test('6. High-Precision Browser Tools Suite Registration', async () => {
  const manager = new OpenBotContainerManager({ workspaceDir: testWorkspace });
  const gateway = new OpenBotSecurityGateway({ auditLogPath: testAuditLog });

  const registeredTools = new Map();
  const mockCtx = {
    tools: {
      register(toolDef) {
        registeredTools.set(toolDef.name, toolDef);
      }
    }
  };

  registerOpenBotTools(mockCtx, manager, gateway);

  const expectedTools = [
    'openbot_browser_navigate',
    'openbot_browser_snapshot',
    'openbot_browser_click',
    'openbot_browser_type',
    'openbot_browser_press',
    'openbot_browser_scroll',
    'openbot_browser_screenshot',
    'openbot_browser_eval'
  ];

  for (const name of expectedTools) {
    assert.ok(registeredTools.has(name), `Missing expected browser tool: ${name}`);
  }
});

test('7. Human-in-the-Loop "Take the Wheel" Mode Suspension', async () => {
  const gateway = new OpenBotSecurityGateway({ auditLogPath: testAuditLog });
  assert.equal(gateway.isHumanTakeoverActive, false);

  // Activate Take the Wheel
  await gateway.takeTheWheel();
  assert.equal(gateway.isHumanTakeoverActive, true);

  // Attempt to execute an automated browser action while takeover is active
  let wasExecuted = false;
  const result = await gateway.executeGuarded('openbot_browser_click', { target: '@e1' }, async () => {
    wasExecuted = true;
    return { status: 'clicked' };
  });

  // Action MUST be suspended without executing the underlying tool
  assert.equal(wasExecuted, false);
  assert.equal(result.paused, true);
  assert.equal(result.status, 'suspended');
  assert.ok(result.message.includes('human user has taken the wheel'));

  // Non-browser actions (e.g. reading a local file) should still be permitted
  let fsExecuted = false;
  const fsResult = await gateway.executeGuarded('openbot_fs_read', { path: 'data.txt' }, async () => {
    fsExecuted = true;
    return { content: 'sample' };
  });
  assert.equal(fsExecuted, true);
  assert.equal(fsResult.content, 'sample');

  // Release the wheel
  await gateway.releaseWheel();
  assert.equal(gateway.isHumanTakeoverActive, false);

  // Now browser actions proceed normally
  const resumeResult = await gateway.executeGuarded('openbot_browser_click', { target: '@e1' }, async () => {
    return { status: 'clicked' };
  });
  assert.equal(resumeResult.status, 'clicked');
});

test('8. Cordis Context Plugin Mount & __ModuleLoader__ Browser Bundle', async () => {
  const registeredSections = [];
  const providedServices = new Map();

  const mockCtx = {
    logger: { info() {}, warn() {}, error() {} },
    provide(name) { providedServices.set(name, true); },
    tools: { register() {} },
    systemPrompt: {
      section(sec) { registeredSections.push(sec); }
    },
    on(event, handler) {}
  };

  // Mount backend plugin
  await plugin.apply(mockCtx, {
    enabled: true,
    autoStartContainer: false,
    dashboard: false,
    workspaceDir: testWorkspace
  });

  assert.ok(mockCtx.openbot);
  assert.equal(typeof mockCtx.openbot.takeTheWheel, 'function');
  assert.equal(typeof mockCtx.openbot.releaseWheel, 'function');
  assert.equal(typeof mockCtx.openbot.toggleWheel, 'function');
  assert.equal(typeof mockCtx.openbot.isWheelActive, 'function');
  assert.equal(typeof mockCtx.openbot.restartContainer, 'function');

  assert.ok(registeredSections.some(s => s.name === 'openbot:sandbox'));

  // Test browser client bundle registration via __ModuleLoader__
  let registeredModule = null;
  global.window = {
    __ModuleLoader__: {
      load(mod) {
        registeredModule = mod;
      }
    }
  };

  const clientCode = await fs.readFile(path.join(__dirname, '../lib/client.js'), 'utf8');
  new Function(clientCode)();

  assert.ok(registeredModule);
  assert.equal(registeredModule.id, 'dsh-plugin-openbot');
  assert.equal(typeof registeredModule.factory, 'function');

  // Test factory invocation
  const clientExports = registeredModule.factory((mod) => {
    if (mod === 'react') return { useState: () => [{}, () => {}], useEffect: () => {} };
    return {};
  });
  assert.equal(clientExports.name, 'dsh-plugin-openbot');
  assert.equal(typeof clientExports.apply, 'function');
});

test('9. Universal Model Context Protocol (MCP) Server stdio protocol', async () => {
  const { spawn } = await import('node:child_process');
  const serverPath = path.join(__dirname, '../bin/mcp-server.js');
  
  const server = spawn('node', [serverPath], {
    env: { ...process.env, OPENBOT_WORKSPACE: testWorkspace }
  });

  let outputBuffer = '';
  const responses = [];

  server.stdout.on('data', (chunk) => {
    outputBuffer += chunk.toString();
    const lines = outputBuffer.split('\n');
    outputBuffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) {
        try {
          responses.push(JSON.parse(line));
        } catch (e) {}
      }
    }
  });

  // 1. Send initialize
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 101,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05' }
  }) + '\n');

  // 2. Send tools/list
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 102,
    method: 'tools/list'
  }) + '\n');

  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 300));
  server.kill();

  const initResp = responses.find(r => r.id === 101);
  assert.ok(initResp, 'Should receive initialize response');
  assert.equal(initResp.result.serverInfo.name, 'openbot-mcp-server');

  const toolsResp = responses.find(r => r.id === 102);
  assert.ok(toolsResp, 'Should receive tools/list response');
  assert.ok(Array.isArray(toolsResp.result.tools));
  assert.ok(toolsResp.result.tools.some(t => t.name === 'openbot_browser_navigate'));
  assert.ok(toolsResp.result.tools.some(t => t.name === 'openbot_take_wheel'));
});
