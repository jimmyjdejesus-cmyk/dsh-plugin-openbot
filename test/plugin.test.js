/**
 * @file plugin.test.js
 * Comprehensive integration test suite for dsh-plugin-openbot.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as plugin from '../lib/index.js';
import * as client from '../lib/client.js';
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
  assert.equal(plugin.Config.type, 'object');
  assert.ok(plugin.Config.properties.containerName);
  assert.ok(plugin.Config.properties.apiPort);
  assert.ok(plugin.Config.properties.workspaceDir);
});

test('2. System prompt generator', () => {
  const prompt = buildOpenBotPrompt();
  assert.ok(prompt.includes('CopilotKit OpenBot Sandbox Environment'));
  assert.ok(prompt.includes('openbot_bash_exec'));
  assert.ok(prompt.includes('openbot_browser_navigate'));
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
      define(toolDef) {
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

test('6. Cordis Context Plugin Mount & Client Slot Registration', async () => {
  const registeredSlots = [];
  const registeredSections = [];
  const providedServices = new Map();

  const mockCtx = {
    logger: { info() {}, warn() {}, error() {} },
    provide(name) { providedServices.set(name, true); },
    tools: { define() {} },
    systemPrompt: {
      section(sec) { registeredSections.push(sec); }
    },
    slots: {
      register(slotDef) { registeredSlots.push(slotDef); }
    },
    on(event, handler) {}
  };

  // Mount backend plugin
  await plugin.apply(mockCtx, {
    enabled: true,
    autoStartContainer: false,
    workspaceDir: testWorkspace
  });

  assert.ok(mockCtx.openbot);
  assert.ok(registeredSections.some(s => s.name === 'openbot:sandbox'));

  // Mount client module
  client.apply(mockCtx);
  assert.ok(registeredSlots.some(s => s.key === 'openbot-sandbox'));
  assert.ok(registeredSlots.some(s => s.key === 'openbot-settings'));
});
