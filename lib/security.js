/**
 * @file security.js
 * Fail-closed security interceptor, risk scoring, audit trail ledger,
 * and Human-in-the-Loop ("Take the Wheel") coordinator for OpenBot actions.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export class OpenBotSecurityGateway {
  /**
   * @param {Object} options
   * @param {string} [options.auditLogPath] - Path to append audit JSONL logs
   * @param {boolean} [options.requireApproval=true] - Whether high-risk actions require explicit user confirmation
   * @param {any} [options.logger] - Cordis context logger
   */
  constructor(options = {}) {
    // Persistent audit log location inside ~/.dsh/openbot/
    this.auditLogPath = options.auditLogPath || path.join(process.env.HOME || '/tmp', '.dsh', 'openbot', 'audit.log.jsonl');
    this.requireApproval = options.requireApproval ?? true;
    this.logger = options.logger || console;
    
    // In-memory ring buffer for low-latency DSH Desktop UI rendering
    this.recentAuditEntries = [];

    // Human-in-the-Loop "Take the Wheel" state
    // When true, automated browser commands are temporarily suspended
    // allowing the human user to solve CAPTCHAs, 2FA, or perform sensitive inputs
    this.isHumanTakeoverActive = false;
  }

  /**
   * Engage Human-in-the-Loop mode ("Take the Wheel").
   * Suspends automated browser actions to allow manual user interaction.
   * @returns {boolean} Current takeover state
   */
  async takeTheWheel() {
    this.isHumanTakeoverActive = true;
    this.logger.info?.('[OpenBot Security] Human user has taken the wheel. Agent browser actions suspended.');
    
    await this.recordAudit({
      tool: 'system_human_takeover',
      params: { active: true },
      risk: 'low',
      status: 'takeover_activated',
      reason: 'Human user assumed manual control of the browser session.'
    });
    
    return this.isHumanTakeoverActive;
  }

  /**
   * Release Human-in-the-Loop mode back to the autonomous agent.
   * @returns {boolean} Current takeover state
   */
  async releaseWheel() {
    this.isHumanTakeoverActive = false;
    this.logger.info?.('[OpenBot Security] Human user released the wheel. Agent resumed control.');

    await this.recordAudit({
      tool: 'system_human_takeover',
      params: { active: false },
      risk: 'low',
      status: 'takeover_released',
      reason: 'Human user released control back to the autonomous agent.'
    });

    return this.isHumanTakeoverActive;
  }

  /**
   * Toggle the Human-in-the-Loop state.
   * @returns {Promise<boolean>} New state
   */
  async toggleWheel() {
    if (this.isHumanTakeoverActive) {
      return await this.releaseWheel();
    } else {
      return await this.takeTheWheel();
    }
  }

  /**
   * Analyze the risk level of an action before execution.
   * @param {string} toolName - Name of the tool being called
   * @param {Record<string, any>} params - Arguments passed to the tool
   * @returns {{ level: 'low' | 'medium' | 'high', reason?: string }}
   */
  assessRisk(toolName, params = {}) {
    // 1. Shell command safety checks
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

    // 2. Browser navigation safety checks
    if (toolName === 'openbot_browser_navigate') {
      const url = String(params.url || '').toLowerCase();
      if (url.startsWith('file://') || url.includes('localhost') || url.includes('127.0.0.1')) {
        return { level: 'medium', reason: 'Internal or loopback network navigation request.' };
      }
    }

    // 3. Browser text input checks
    if (toolName === 'openbot_browser_type') {
      const text = String(params.text || '');
      // Flag credential or secret leaks
      if (text.includes('sk-') || text.includes('ghp_') || text.includes('bearer ') || text.includes('password=')) {
        return { level: 'medium', reason: 'Potential credential or API secret string detected in input text.' };
      }
    }

    // 4. In-page JavaScript evaluation checks
    if (toolName === 'openbot_browser_eval') {
      const script = String(params.script || '').toLowerCase();
      if (script.includes('document.cookie') || script.includes('localstorage') || script.includes('sessionstorage')) {
        return { level: 'medium', reason: 'Evaluation attempts to inspect sensitive browser session storage or cookies.' };
      }
      return { level: 'low' };
    }

    // 5. Filesystem path traversal checks
    if (toolName === 'openbot_fs_write' || toolName === 'openbot_fs_read') {
      const filePath = String(params.path || '');
      if (filePath.includes('..') || filePath.startsWith('/etc') || filePath.startsWith('/root')) {
        return { level: 'high', reason: 'Attempted path traversal outside sandbox boundary.' };
      }
    }

    return { level: 'low' };
  }

  /**
   * Record action into persistent audit log and memory buffer.
   * @param {Object} entry
   * @returns {Promise<Object>} The persisted audit record
   */
  async recordAudit(entry) {
    const record = {
      timestamp: new Date().toISOString(),
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...entry
    };

    // Maintain recent in-memory buffer for UI rendering
    this.recentAuditEntries.unshift(record);
    if (this.recentAuditEntries.length > 200) {
      this.recentAuditEntries.pop();
    }

    // Append atomically to JSONL file on disk
    try {
      await fs.mkdir(path.dirname(this.auditLogPath), { recursive: true });
      await fs.appendFile(this.auditLogPath, JSON.stringify(record) + '\n', 'utf8');
    } catch (err) {
      this.logger.warn?.('Failed to write audit log entry:', err);
    }

    return record;
  }

  /**
   * Intercept a tool call for authorization, HITL suspension, and security audit.
   * @param {string} toolName - Tool name
   * @param {Record<string, any>} params - Input parameters
   * @param {() => Promise<any>} executor - The underlying action to run if permitted
   */
  async executeGuarded(toolName, params, executor) {
    // 1. Check Human-in-the-Loop "Take the Wheel" suspension
    // When the human user has taken control of the browser, automated browser actions are suspended
    if (this.isHumanTakeoverActive && toolName.startsWith('openbot_browser_')) {
      const auditRecord = await this.recordAudit({
        tool: toolName,
        params,
        risk: 'low',
        status: 'suspended_human_takeover',
        reason: 'Action suspended: human user currently holds the wheel.'
      });
      return {
        paused: true,
        status: 'suspended',
        auditId: auditRecord.id,
        message: 'Action suspended: The human user has taken the wheel on the browser session. Please wait for the user to complete their action and release the wheel.'
      };
    }

    // 2. Assess Risk Profile
    const risk = this.assessRisk(toolName, params);
    
    // 3. Strict Mode Check: High-risk operations require explicit user approval
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

    // 4. Execute and trace execution telemetry
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
   * Retrieve recent audit entries for DSH Desktop UI.
   * @param {number} [limit=50]
   */
  getRecentAudits(limit = 50) {
    return this.recentAuditEntries.slice(0, limit);
  }
}
