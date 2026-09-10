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
    '- **High-Precision Browser Automation**: You have a dedicated, containerized Chromium browser for web interactions:',
    '  - **`openbot_browser_navigate`**: Load target URLs.',
    '  - **`openbot_browser_snapshot`**: Capture the accessibility tree with numbered element references (`@e1`, `@e2`, etc.). ALWAYS snapshot the page to discover element refs before clicking or typing.',
    '  - **`openbot_browser_click`**: Click an element using its indexed ref (`target: "@e1"`) or a standard CSS selector.',
    '  - **`openbot_browser_type`**: Type into form fields using indexed refs (`target: "@e2"`, `text: "..."`, `pressEnter: true`).',
    '  - **`openbot_browser_press`**: Trigger keyboard keys like `"Enter"`, `"Tab"`, `"Escape"`, or `"ArrowDown"`.',
    '  - **`openbot_browser_scroll`**: Scroll pages up, down, or to the bottom.',
    '  - **`openbot_browser_screenshot`**: Save visual PNG captures to verify visual layouts.',
    '  - **`openbot_browser_eval`**: Safely evaluate JavaScript expressions on the page.',
    '- **Human-in-the-Loop ("Take the Wheel")**: If a tool returns a `paused: true` / suspended message, the human user is manually interacting with the browser (e.g. solving 2FA or CAPTCHAs). Acknowledge and wait for them to finish.',
    '- **Security & Auditability**: Every action is audited before execution. High-risk operations (such as destructive shell commands) will be reviewed by the user.',
    ''
  ].join('\n');
}
