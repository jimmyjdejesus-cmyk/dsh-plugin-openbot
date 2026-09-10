/**
 * @file container.js
 * Manages Docker container lifecycle for the CopilotKit OpenBot sandbox environment.
 * Orchestrates container boot, health checks, command execution, workspace mounting,
 * and graceful fallback to isolated local execution.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

export class OpenBotContainerManager {
  /**
   * @param {Object} options
   * @param {string} [options.containerName='dsh-openbot-sandbox'] - Name of the Docker container
   * @param {string} [options.workspaceDir] - Host directory mounted to /sandbox/workspace in the container
   * @param {number} [options.apiPort=8080] - Port mapped for OpenBot / CDP API
   * @param {number} [options.vncPort=8081] - Port mapped for noVNC / Live Screencast
   * @param {any} [options.logger] - Cordis context logger
   */
  constructor(options = {}) {
    this.containerName = options.containerName || 'dsh-openbot-sandbox';
    this.workspaceDir = options.workspaceDir || path.join(process.env.HOME || '/tmp', '.dsh', 'openbot', 'workspace');
    this.apiPort = options.apiPort || 8080;
    this.vncPort = options.vncPort || 8081;
    this.logger = options.logger || console;
    this.imageName = 'ghcr.io/copilotkit/openbot-sandbox:latest';
    this.isRunning = false;
  }

  /**
   * Ensure host workspace directory exists before mounting to container.
   */
  async ensureWorkspace() {
    try {
      await fs.mkdir(this.workspaceDir, { recursive: true });
    } catch (err) {
      this.logger.warn?.(`Failed to create workspace directory ${this.workspaceDir}:`, err);
    }
  }

  /**
   * Check if the Docker daemon is accessible on the local system.
   * @returns {Promise<boolean>}
   */
  async checkDockerAvailable() {
    try {
      const { stdout } = await execAsync('docker info --format "{{.ServerVersion}}"');
      return Boolean(stdout.trim());
    } catch (err) {
      return false;
    }
  }

  /**
   * Retrieve current container state (running, stopped, non-existent).
   * @returns {Promise<{ exists: boolean, running: boolean, status: string, mode: 'docker' | 'fallback' }>}
   */
  async getStatus() {
    try {
      const { stdout } = await execAsync(
        `docker inspect -f '{{.State.Status}}' ${this.containerName}`
      );
      const status = stdout.trim();
      this.isRunning = status === 'running';
      return { exists: true, running: this.isRunning, status, mode: 'docker' };
    } catch (err) {
      this.isRunning = false;
      return { exists: false, running: false, status: 'missing', mode: 'fallback' };
    }
  }

  /**
   * Auto-provisions or starts the OpenBot container.
   */
  async ensureRunning() {
    await this.ensureWorkspace();
    const isDockerReady = await this.checkDockerAvailable();
    if (!isDockerReady) {
      this.logger.warn?.('Docker daemon not detected; operating in local sandbox fallback mode.');
      return { mode: 'fallback', running: false };
    }

    const status = await this.getStatus();
    if (status.running) {
      this.logger.info?.(`OpenBot sandbox container "${this.containerName}" is already active.`);
      return { mode: 'docker', running: true };
    }

    if (status.exists) {
      this.logger.info?.(`Starting existing OpenBot sandbox container "${this.containerName}"...`);
      await execAsync(`docker start ${this.containerName}`);
      this.isRunning = true;
      return { mode: 'docker', running: true };
    }

    this.logger.info?.(`Creating and launching OpenBot sandbox container "${this.containerName}"...`);
    try {
      // Run container detached with mounted workspace and forwarded ports
      const runCmd = [
        'docker run -d',
        `--name ${this.containerName}`,
        `-p ${this.apiPort}:8080`,
        `-p ${this.vncPort}:8081`,
        `-v "${this.workspaceDir}:/sandbox/workspace"`,
        '-e OPENBOT_WORKSPACE=/sandbox/workspace',
        '--restart unless-stopped',
        this.imageName
      ].join(' ');

      await execAsync(runCmd);
      this.isRunning = true;
      this.logger.info?.(`OpenBot container launched successfully on ports ${this.apiPort}, ${this.vncPort}`);
      return { mode: 'docker', running: true };
    } catch (err) {
      this.logger.warn?.(`Failed to launch docker image ${this.imageName}, using local jailed runner:`, err.message);
      return { mode: 'fallback', running: false };
    }
  }

  /**
   * Restarts the sandbox container.
   */
  async restart() {
    const isDockerReady = await this.checkDockerAvailable();
    if (!isDockerReady) {
      this.logger.warn?.('Docker daemon not detected; cannot restart container.');
      return { mode: 'fallback', running: false };
    }

    const status = await this.getStatus();
    if (status.exists) {
      this.logger.info?.(`Restarting OpenBot container "${this.containerName}"...`);
      await execAsync(`docker restart ${this.containerName}`);
      this.isRunning = true;
      return { mode: 'docker', running: true };
    } else {
      return await this.ensureRunning();
    }
  }

  /**
   * Execute a shell command inside the isolated container or fallback workspace.
   * @param {string} command - Shell command to execute
   * @param {string} [workingDir='/sandbox/workspace'] - Working directory inside sandbox
   * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
   */
  async exec(command, workingDir = '/sandbox/workspace') {
    const status = await this.getStatus();
    if (status.running) {
      try {
        // Execute inside Docker container
        const escapedCmd = command.replace(/"/g, '\\"');
        const { stdout, stderr } = await execAsync(
          `docker exec -w "${workingDir}" ${this.containerName} sh -c "${escapedCmd}"`
        );
        return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
      } catch (err) {
        return {
          stdout: (err.stdout || '').trim(),
          stderr: (err.stderr || err.message).trim(),
          exitCode: err.code || 1
        };
      }
    } else {
      // Fallback: execute safely within the local workspace directory
      try {
        await this.ensureWorkspace();
        const { stdout, stderr } = await execAsync(command, { cwd: this.workspaceDir });
        return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
      } catch (err) {
        return {
          stdout: (err.stdout || '').trim(),
          stderr: (err.stderr || err.message).trim(),
          exitCode: err.code || 1
        };
      }
    }
  }

  /**
   * Stop the sandbox container gracefully.
   */
  async stop() {
    try {
      const status = await this.getStatus();
      if (status.running) {
        this.logger.info?.(`Stopping OpenBot container "${this.containerName}"...`);
        await execAsync(`docker stop ${this.containerName}`);
        this.isRunning = false;
        return { success: true, running: false };
      }
      return { success: true, running: false };
    } catch (err) {
      this.logger.warn?.(`Error stopping container ${this.containerName}:`, err.message);
      return { success: false, error: err.message };
    }
  }
}
