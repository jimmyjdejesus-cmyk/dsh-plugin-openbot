/**
 * @file security.js
 * Fail-closed security interceptor, risk scoring, and audit trail ledger for OpenBot actions.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export class OpenBotSecurityGateway {
  /**
   * @param {Object} options
   * @param {string} options.auditLogPath - Path to append audit JSONL logs
   * @param {boolean} options.requireApproval - Whether high-risk actions require explicit user confirmation
   * @param {any} options.logger - Cordis context logger
   */
  constructor(options = {}) {
    this.auditLogPath = options.auditLogPath || path.join(process.env.HOME || '/tmp', '.dsh', 'openbot', 'audit.log.jsonl');
    this.requireApproval = options.requireApproval ?? true;
    this.logger = options.logger || console;
    this.recentAuditEntries = [];
  }

  /**
   * Analyze the risk level of an action before execution.
   * @param {string} toolName - Name of the tool being called
   * @param {Record<string, any>} params - Arguments passed to the tool
   * @returns {{ level: 'low' | 'medium' | 'high', reason?: string }}
   */
  assessRisk(toolName, params) {
    if (toolName === 'openbot_bash_exec') {
      const cmd = String(params.command || '').toLowerCase();
      // Detect potentially destructive commands
      if (cmd.includes('rm -rf') || cmd.includes('mkfs') || cmd.includes('dd ') || cmd.includes(':(){ :|:& };:')) {
        return { level: 'high', reason: 'Destructive filesystem modification detected.' };
      }
      if (cmd.includes('curl ') || cmd.includes('wget ') || cmd.includes('ssh ') || cmd.includes('nc ')) {
        return { level: 'medium', reason: 'Outbound network operation in sandbox container.' };
      }
    }

    if (toolName === 'openbot_browser_navigate') {
      const url = String(params.url || '').toLowerCase();
      if (url.startsWith('file://') || url.includes('localhost') || url.includes('127.0.0.1')) {
        return { level: 'medium', reason: 'Internal/local network navigation request.' };
      }
    }

    if (toolName === 'openbot_fs_write') {
      const filePath = String(params.path || '');
      if (filePath.includes('..') || filePath.startsWith('/etc') || filePath.startsWith('/root')) {
        return { level: 'high', reason: 'Attempted write outside sandbox boundary.' };
      }
    }

    return { level: 'low' };
  }

  /**
   * Record action into persistent audit log and memory buffer.
   * @param {Object} entry
   */
  async recordAudit(entry) {
    const record = {
      timestamp: new Date().toISOString(),
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...entry
    };

    this.recentAuditEntries.unshift(record);
    if (this.recentAuditEntries.length > 200) {
      this.recentAuditEntries.pop();
    }

    try {
      await fs.mkdir(path.dirname(this.auditLogPath), { recursive: true });
      await fs.appendFile(this.auditLogPath, JSON.stringify(record) + '\n', 'utf8');
    } catch (err) {
      this.logger.warn('Failed to write audit log entry:', err);
    }

    return record;
  }

  /**
   * Intercept a tool call for authorization and security audit.
   * @param {string} toolName
   * @param {Record<string, any>} params
   * @param {() => Promise<any>} executor - The underlying action to run if permitted
   */
  async executeGuarded(toolName, params, executor) {
    const risk = this.assessRisk(toolName, params);
    
    // In strict mode, high risk commands require approval flag
    if (this.requireApproval && risk.level === 'high' && !params.__approved) {
      const auditRecord = await this.recordAudit({
        tool: toolName,
        params,
        risk: risk.level,
        status: 'blocked_needs_approval',
        reason: risk.reason
      });
      return {
        error: `Action blocked by OpenBot Security Gateway (${risk.reason}). Please prompt the user for confirmation.`,
        auditId: auditRecord.id,
        requiresApproval: true
      };
    }

    try {
      const startTime = Date.now();
      const result = await executor();
      const durationMs = Date.now() - startTime;

      await this.recordAudit({
        tool: toolName,
        params,
        risk: risk.level,
        status: 'success',
        durationMs,
        resultSummary: typeof result === 'string' ? result.slice(0, 100) : 'object'
      });

      return result;
    } catch (err) {
      await this.recordAudit({
        tool: toolName,
        params,
        risk: risk.level,
        status: 'error',
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Get recent audit entries for DSH Desktop UI.
   */
  getRecentAudits() {
    return this.recentAuditEntries;
  }
}
