/**
 * @file index.js
 * Main Cordis plugin entrypoint for dsh-plugin-openbot.
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
 * Configuration schema definition.
 */
export const Config = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean', default: true },
    containerName: { type: 'string', default: 'dsh-openbot-sandbox' },
    workspaceDir: { type: 'string', default: '' },
    apiPort: { type: 'number', default: 8080 },
    vncPort: { type: 'number', default: 8081 },
    autoStartContainer: { type: 'boolean', default: true },
    requireApproval: { type: 'boolean', default: true }
  }
};

/**
 * Apply the OpenBot plugin to the Cordis context.
 */
export async function apply(ctx, config = {}) {
  if (config.enabled === false) {
    ctx.logger?.info('dsh-plugin-openbot is disabled.');
    return;
  }

  const containerManager = new OpenBotContainerManager({
    containerName: config.containerName || 'dsh-openbot-sandbox',
    workspaceDir: config.workspaceDir,
    apiPort: config.apiPort || 8080,
    vncPort: config.vncPort || 8081,
    logger: ctx.logger
  });

  const securityGateway = new OpenBotSecurityGateway({
    requireApproval: config.requireApproval ?? true,
    logger: ctx.logger
  });

  // Expose the openbot service on ctx for client UI slots
  ctx.provide('openbot');
  ctx.openbot = {
    getStatus: () => containerManager.getStatus(),
    getAudits: () => securityGateway.getRecentAudits(),
    containerManager,
    securityGateway
  };

  // Auto-start container if requested
  if (config.autoStartContainer !== false) {
    containerManager.ensureRunning().catch(err => {
      ctx.logger?.warn('Failed to auto-start OpenBot container on boot:', err.message);
    });
  }

  // Register DSH tools
  registerOpenBotTools(ctx, containerManager, securityGateway);

  // Inject system prompt section
  if (ctx.systemPrompt?.section) {
    ctx.systemPrompt.section({
      name: 'openbot:sandbox',
      order: 120,
      text: buildOpenBotPrompt()
    });
  }

  // Graceful shutdown on DSH dispose
  ctx.on('dispose', async () => {
    ctx.logger?.info('DSH shutting down, stopping OpenBot container...');
    await containerManager.stop();
  });
}
