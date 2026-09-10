# dsh-plugin-openbot 🤖

[![CI](https://github.com/jimmyjdejesus-cmyk/dsh-plugin-openbot/actions/workflows/ci.yml/badge.svg)](https://github.com/jimmyjdejesus-cmyk/dsh-plugin-openbot/actions/workflows/ci.yml)
[![Version: 0.2.0](https://img.shields.io/badge/Version-0.2.0-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-Plugin-blueviolet.svg)](https://github.com/deepseek-ai)
[![CopilotKit OpenBot](https://img.shields.io/badge/CopilotKit-OpenBot-orange.svg)](https://github.com/CopilotKit/openbot)

A native **Cordis plugin** for **DeepSeek Harness (DSH)** integrating **CopilotKit OpenBot** sandboxed execution, high-precision indexed browser automation (inspired by `browser-use`), and Human-in-the-Loop ("Take the Wheel") governance directly into DSH Desktop and CLI.

---

## 🌟 Key Features (v0.2.0)

- **🐳 Auto-Managed Docker Container**: Detects your local Docker runtime (Docker Desktop, OrbStack, Colima) and manages the `dsh-openbot-sandbox` container on demand, with a reliable local jailed fallback.
- **🌐 High-Precision Indexed Browser Automation**:
  - **Indexed Element Mapping (`@e1`, `@e2`)**: Automatically maps interactive DOM elements to numbered references, preventing brittle CSS/XPath guessing.
  - **Full Action Primitives**: Navigate, snapshot, click (`@ref` or selector), type, press keys (`Enter`, `Tab`, `Escape`), scroll, capture screenshots, and evaluate safe JavaScript.
- **🚗 Human-in-the-Loop ("Take the Wheel")**:
  - Allows human operators to take manual control of the browser session for 2FA, CAPTCHAs, or credential entry.
  - Automated agent browser calls are cleanly suspended during human takeover and resume seamlessly once the wheel is released.
- **📁 Sandboxed Workspace Filesystem**: All file reads, writes, and listings from agent tasks are jailed to `~/.dsh/openbot/workspace` (`/sandbox/workspace` in the container).
- **🛡️ Pre-Action Security & Fail-Closed Gateway**: Automatically evaluates risk levels of shell commands and filesystem operations, preventing destructive actions.
- **📜 Audited Action Ledger**: Records every tool execution with timestamps, risk level, duration, and output summary to `~/.dsh/openbot/audit.log.jsonl`.
- **🖥️ Interactive DSH Desktop UI Slot**: Injects an interactive dashboard tab into DSH Desktop featuring:
  - Live container state with one-click **Start / Stop / Restart** buttons.
  - One-click **Take the Wheel** manual takeover toggle.
  - Filterable audit trail by risk tag (`HIGH`, `MED`, `LOW`).
  - Sandboxed workspace file explorer.

---

## 📐 Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                             DSH Desktop UI                                 │
│  ┌───────────────────────────────┐     ┌────────────────────────────────┐  │
│  │   Agent Chat & Inline Cards   │     │   OpenBot Sandbox Panel (Slot) │  │
│  │   (Pre-action Approvals)      │     │   • Live Screencast (:8081)    │  │
│  │                               │     │   • "Take the Wheel" Toggle    │  │
│  │                               │     │   • Filterable Audit Trail     │  │
│  └───────────────┬───────────────┘     └───────────────▲────────────────┘  │
└──────────────────┼─────────────────────────────────────┼───────────────────┘
                   │                                     │
┌──────────────────▼─────────────────────────────────────┴───────────────────┐
                   DSH Runtime & Cordis 4.x Ecosystem
   ┌──────────────────────────────────────────────────────────────────────┐
   │                 dsh-plugin-openbot (Cordis Service)                  │
   │  • Docker Lifecycle: Provisions & health-checks OpenBot sandbox      │
   │  • Browser Tool Suite: 8 CDP actions with @ref element indexing      │
   │  • Security Gateway: Risk scoring, HITL suspension & audit ledger    │
   │  • UI Slot Registrar: Registers workspace.tab & settings.plugin.item │
   └──────────────────────────────────┬───────────────────────────────────┘
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

## 🛠️ Tool Catalog

### 1. Isolated System & Filesystem Tools
| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `openbot_bash_exec` | `command`, `workingDir?` | Run shell commands inside the container sandbox. |
| `openbot_fs_write` | `path`, `content` | Write or create files inside the sandboxed workspace. |
| `openbot_fs_read` | `path` | Read file contents from the sandboxed workspace. |
| `openbot_fs_list` | `path?` | List directory contents within the sandboxed workspace. |

### 2. High-Precision Browser Tools
| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `openbot_browser_navigate` | `url` | Navigate the isolated Chromium browser to target URL. |
| `openbot_browser_snapshot` | *none* | Capture accessibility tree with numbered element references (`@e1`, `@e2`). |
| `openbot_browser_click` | `target` (or `selector`) | Click an element by its indexed ref (e.g. `@e1`) or CSS selector. |
| `openbot_browser_type` | `target`, `text`, `clear?`, `pressEnter?` | Type text into an input field by `@ref` or selector. |
| `openbot_browser_press` | `key` | Send keyboard key events (`Enter`, `Tab`, `Escape`, `ArrowDown`). |
| `openbot_browser_scroll` | `direction?` (`down`/`up`/`top`/`bottom`), `amount?` | Scroll active page viewport. |
| `openbot_browser_screenshot` | `saveName?` | Save visual PNG screenshot to the sandbox workspace. |
| `openbot_browser_eval` | `script` | Evaluate sandboxed JavaScript expression in the page context. |

---

## ⚖️ Open-Source Ecosystem Comparison

| Feature | **dsh-plugin-openbot** | **CopilotKit OpenBot** | **browser-use** | **OpenHands** |
| :--- | :--- | :--- | :--- | :--- |
| **Host System** | DeepSeek Harness (Cordis) | Standalone Node/Next.js | Python library / CLI | Python controller + React |
| **Element Indexing** | Native (`@e1`, `@e2`) | Standard DOM | Native (`@e1`, `@e2`) | BrowserGym selectors |
| **Human Takeover** | One-Click "Take the Wheel" | "Take the Wheel" | Manual script pause | Web Terminal |
| **Container Sandboxing** | Auto Docker + Local Fallback | Multi-container Docker | None (Host/Cloud CDP) | Single Docker container |
| **Risk Scoring & Audit** | Pre-action scoring + JSONL | CEL policies + Fail-closed | Basic logging | Event stream log |

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
    "dsh-plugin-openbot": "0.2.0"
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

### 3. Verification & Tests

Run the complete integration test suite:
```bash
npm test
```
Output:
```text
✔ 1. Plugin module metadata & schemas
✔ 2. System prompt generator
✔ 3. Container Manager & Docker daemon checks
✔ 4. Security Gateway risk scoring & audit logging
✔ 5. Sandboxed Filesystem Tools Execution & Security Guard
✔ 6. High-Precision Browser Tools Suite Registration
✔ 7. Human-in-the-Loop "Take the Wheel" Mode Suspension
✔ 8. Cordis Context Plugin Mount & __ModuleLoader__ Browser Bundle

tests 8 | pass 8 | fail 0
```
