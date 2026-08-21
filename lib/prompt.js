/**
 * @file prompt.js
 * Builds the system prompt section for CopilotKit OpenBot sandbox tools.
 */

export function buildOpenBotPrompt() {
  return [
    '## CopilotKit OpenBot Sandbox Environment',
    '',
    'You have access to an isolated, secure Docker container sandbox environment powered by CopilotKit OpenBot.',
    '',
    '### Capabilities & Guidelines:',
    '- **Isolated Shell Execution (`openbot_bash_exec`)**: Execute commands, scripts, and build tools safely. The working directory is `/sandbox/workspace`. Never attempt to escape the container filesystem.',
    '- **Sandboxed Filesystem (`openbot_fs_read`, `openbot_fs_write`, `openbot_fs_list`)**: Manage and inspect project files without affecting the host machine.',
    '- **Isolated Chromium Browser (`openbot_browser_navigate`, `openbot_browser_click`, `openbot_browser_snapshot`)**: Browse web pages, authenticate on web services, and extract dynamic DOM information in a secure, containerized browser instance.',
    '- **Security & Auditability**: Every action is audited before execution. High-risk operations (such as destructive shell commands) will be reviewed by the user.',
    ''
  ].join('\n');
}
