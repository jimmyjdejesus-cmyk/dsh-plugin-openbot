/**
 * @file index.js
 * Main Cordis plugin entrypoint for dsh-plugin-openbot.
 * Orchestrates container lifecycle, security interceptor, tool registration,
 * and UI slot integration for DeepSeek Harness.
 */

import { OpenBotContainerManager } from './container.js';
import { OpenBotSecurityGateway } from './security.js';
import { registerOpenBotTools } from './tools.js';
import { buildOpenBotPrompt } from './prompt.js';

export const name = 'dsh-plugin-openbot';

/**
 * Required services from DSH runtime.
 */
export const inject = ['tools', 'systemPrompt'];

/**
 * Standard Schema compliant configuration schema for Cordis 4.x.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-plugin-openbot',
    validate(value) {
      return { value: value || {} };
    }
  }
};

/**
 * Apply the OpenBot plugin to the Cordis context.
 */
export async function apply(ctx, config = {}) {
  if (config.enabled === false) {
    ctx.logger?.info?.('dsh-plugin-openbot is disabled.');
    return;
  }

  // 1. Initialize Container Manager (Docker or Local Fallback)
  const containerManager = new OpenBotContainerManager({
    containerName: config.containerName || 'dsh-openbot-sandbox',
    workspaceDir: config.workspaceDir,
    apiPort: config.apiPort || 8080,
    vncPort: config.vncPort || 8081,
    logger: ctx.logger
  });

  // 2. Initialize Security Gateway & Human-in-the-Loop Interceptor
  const securityGateway = new OpenBotSecurityGateway({
    requireApproval: config.requireApproval ?? true,
    logger: ctx.logger
  });

  // 3. Expose the openbot service on ctx for client UI slots and other Cordis plugins
  ctx.provide('openbot');
  ctx.openbot = {
    getStatus: () => containerManager.getStatus(),
    getAudits: (limit) => securityGateway.getRecentAudits(limit),
    takeTheWheel: () => securityGateway.takeTheWheel(),
    releaseWheel: () => securityGateway.releaseWheel(),
    toggleWheel: () => securityGateway.toggleWheel(),
    isWheelActive: () => securityGateway.isHumanTakeoverActive,
    startContainer: () => containerManager.ensureRunning(),
    stopContainer: () => containerManager.stop(),
    restartContainer: () => containerManager.restart(),
    containerManager,
    securityGateway
  };

  // 4. Auto-start container if configured
  if (config.autoStartContainer !== false) {
    containerManager.ensureRunning().catch(err => {
      ctx.logger?.warn?.('Failed to auto-start OpenBot container on boot:', err.message);
    });
  }

  // 5. Register DSH tools (Shell, Filesystem, High-Precision Browser)
  registerOpenBotTools(ctx, containerManager, securityGateway);

  // 6. Inject updated system prompt section with element indexing guidance
  if (ctx.systemPrompt?.section) {
    ctx.systemPrompt.section({
      name: 'openbot:sandbox',
      order: 120,
      text: buildOpenBotPrompt()
    });
  }

  // 7. Graceful cleanup on DSH shutdown or plugin disposal
  ctx.on('dispose', async () => {
    ctx.logger?.info?.('DSH shutting down, stopping OpenBot container...');
    await containerManager.stop();
  });
}
