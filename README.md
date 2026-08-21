# dsh-plugin-openbot 🤖

[![CI](https://github.com/jimmyjdejesus-cmyk/dsh-plugin-openbot/actions/workflows/ci.yml/badge.svg)](https://github.com/jimmyjdejesus-cmyk/dsh-plugin-openbot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-Plugin-blueviolet.svg)](https://github.com/deepseek-ai)
[![CopilotKit OpenBot](https://img.shields.io/badge/CopilotKit-OpenBot-orange.svg)](https://github.com/CopilotKit/openbot)

A native **Cordis plugin** for **DeepSeek Harness (DSH)** that integrates **CopilotKit OpenBot** sandboxed execution directly into DSH Desktop and CLI.

---

## 🌟 Features

- **🐳 Auto-Managed Docker Container**: Detects your local Docker runtime (Docker Desktop, OrbStack, Colima) and manages the `dsh-openbot-sandbox` container on demand.
- **🌐 Isolated Chromium Browser**: Gives AI agents a containerized Chromium instance with full CDP navigation, clicking, typing, and DOM snapshot capabilities without polluting host browsers.
- **📁 Sandboxed Workspace Filesystem**: All file reads/writes from agent tasks are jailed to `~/.dsh/openbot/workspace` (`/sandbox/workspace` in the container).
- **🛡️ Pre-Action Security & Fail-Closed Gateway**: Automatically scores risk levels of shell commands and filesystem operations, preventing destructive actions and enforcing user approval.
- **📜 Audited Action Ledger**: Records every tool execution with timestamps, risk level, and output summary to `~/.dsh/openbot/audit.log.jsonl`.
- **🖥️ DSH Desktop UI Slot**: Injects a real-time dashboard tab into DSH Desktop showing container health, audit streams, and live browser screencast links.

---

## 📐 Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                             DSH Desktop UI                                 │
│  ┌───────────────────────────────┐     ┌────────────────────────────────┐  │
│  │   Agent Chat & Inline Cards   │     │   OpenBot Sandbox Panel (Slot) │  │
│  │   (Pre-action Approvals)      │     │   (Live Browser, Audit Trail)  │  │
│  └───────────────┬───────────────┘     └───────────────▲────────────────┘  │
└──────────────────┼─────────────────────────────────────┼───────────────────┘
                   │                                     │
┌──────────────────▼─────────────────────────────────────┴───────────────────┐
│                    DSH Runtime & Cordis Ecosystem                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                 dsh-plugin-openbot (Cordis Service)                  │  │
│  │  • Docker Lifecycle: Auto-provisions and manages OpenBot sandbox     │  │
│  │  • Tool Provider: Injects `openbot_browser`, `openbot_bash`, `fs`     │  │
│  │  • Security Interceptor: Intercepts actions for chat approval cards  │  │
│  │  • Slot Registrar: Injects OpenBot tab & status into DSH Desktop     │  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────────┘
                                      │ REST / WebSocket / CDP
┌─────────────────────────────────────▼──────────────────────────────────────┐
│                    Local Docker (OpenBot Container)                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────┐  │
│  │ Isolated Chromium     │  │ Sandboxed Workspace   │  │ Isolated Bash  │  │
│  │ (CDP / Screencast)    │  │ Filesystem (`/work`)  │  │ & Audit Gateway│  │
│  └───────────────────────┘  └───────────────────────┘  └────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Installation & Quick Start

### 1. Link or Install the Plugin

Clone or link `dsh-plugin-openbot` into your DSH plugins directory:

```bash
mkdir -p ~/.dsh/plugins
git clone https://github.com/jimmyjdejesus-cmyk/dsh-plugin-openbot.git ~/.dsh/plugins/dsh-plugin-openbot
```

Link into your DSH Desktop profile:
```bash
ln -sfn ~/.dsh/plugins/dsh-plugin-openbot ~/.dsh/profiles/desktop/node_modules/dsh-plugin-openbot
```

### 2. Enable in DSH Desktop Profile

Add `dsh-plugin-openbot` to `~/.dsh/profiles/desktop/package.json`:

```json
{
  "dependencies": {
    "dsh-plugin-openbot": "0.1.0"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-plugin-openbot"
      ]
    }
  }
}
```

### 3. Configuration (`cordis.patch.yml`)

The plugin includes default configurations that can be customized in your profile or settings:

```yaml
- insert:
    - id: openbot
      name: dsh-plugin-openbot
      config:
        enabled: true
        containerName: "dsh-openbot-sandbox"
        apiPort: 8080
        vncPort: 8081
        autoStartContainer: true
        requireApproval: true
        workspaceDir: !!js process.env.HOME + '/.dsh/openbot/workspace'
```

---

## 🛠️ Registered Agent Tools

| Tool Name | Description |
| :--- | :--- |
| `openbot_browser_navigate` | Navigate to a URL in the containerized Chromium instance. |
| `openbot_browser_click` | Click on elements via CSS/text selector. |
| `openbot_browser_snapshot` | Capture current viewport accessibility tree and text snapshot. |
| `openbot_bash_exec` | Execute shell commands safely inside the isolated container workspace (`/sandbox/workspace`). |
| `openbot_fs_read` | Read files inside the sandboxed workspace. |
| `openbot_fs_write` | Create or write files inside the sandboxed workspace. |
| `openbot_fs_list` | List directory contents within the sandboxed workspace. |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a [Pull Request](https://github.com/jimmyjdejesus-cmyk/dsh-plugin-openbot/pulls) or open an [Issue](https://github.com/jimmyjdejesus-cmyk/dsh-plugin-openbot/issues).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
