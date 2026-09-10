/**
 * @file dashboard.js
 * Embedded HTTP control panel for dsh-plugin-openbot.
 * Provides a real-time web dashboard for toggling Human-in-the-Loop ("Take the Wheel"),
 * controlling the Docker sandbox, inspecting screenshots, and streaming the audit ledger.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Creates and starts the embedded dashboard server.
 * @param {Object} options
 * @param {import('./container.js').OpenBotContainerManager} options.containerManager
 * @param {import('./security.js').OpenBotSecurityGateway} options.securityGateway
 * @param {number} [options.port=8085]
 * @param {any} [options.logger]
 * @returns {Promise<http.Server>}
 */
export async function startDashboardServer({ containerManager, securityGateway, port = 8085, logger = console }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Set CORS headers for local interaction
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 1. API: Get Status
      if (url.pathname === '/api/status' && req.method === 'GET') {
        const containerStatus = await containerManager.getStatus();
        const audits = securityGateway.getRecentAudits(50);
        
        // Find latest screenshot in workspace if present
        let latestScreenshot = null;
        try {
          const files = await fs.readdir(containerManager.workspaceDir);
          const screenshots = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
          if (screenshots.length > 0) {
            screenshots.sort();
            latestScreenshot = `/workspace/${screenshots[screenshots.length - 1]}`;
          }
        } catch (e) {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          wheelActive: securityGateway.isHumanTakeoverActive,
          container: containerStatus,
          audits,
          latestScreenshot,
          workspaceDir: containerManager.workspaceDir
        }));
        return;
      }

      // 2. API: Toggle "Take the Wheel"
      if (url.pathname === '/api/wheel/toggle' && req.method === 'POST') {
        const newState = securityGateway.toggleWheel();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          wheelActive: newState,
          message: newState ? '🚗 Human user took the wheel' : '🤖 Autopilot resumed'
        }));
        return;
      }

      // 3. API: Set "Take the Wheel" explicitly
      if (url.pathname === '/api/wheel/set' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            if (data.active) {
              securityGateway.takeTheWheel();
            } else {
              securityGateway.releaseWheel();
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              wheelActive: securityGateway.isHumanTakeoverActive
            }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // 4. API: Container Lifecycle Action
      if (url.pathname.startsWith('/api/container/') && req.method === 'POST') {
        const action = url.pathname.split('/')[3];
        let result = null;
        if (action === 'start') {
          result = await containerManager.ensureRunning();
        } else if (action === 'stop') {
          result = await containerManager.stop();
        } else if (action === 'restart') {
          result = await containerManager.restart();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ action, result, status: await containerManager.getStatus() }));
        return;
      }

      // 5. API: Live Browser Navigate Trigger
      if (url.pathname === '/api/browser/navigate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const { targetUrl } = JSON.parse(body || '{}');
            if (!targetUrl) throw new Error('Missing targetUrl parameter');
            
            // Execute guarded browser navigation
            const resData = await securityGateway.executeGuarded('openbot_browser_navigate', { url: targetUrl }, async () => {
              const execRes = await containerManager.exec(`npx -y agent-browser open "${targetUrl}"`);
              return { stdout: execRes.stdout, stderr: execRes.stderr, exitCode: execRes.exitCode };
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resData));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // 6. Serve Workspace Files (e.g. screenshots)
      if (url.pathname.startsWith('/workspace/')) {
        const filename = path.basename(url.pathname);
        const filePath = path.join(containerManager.workspaceDir, filename);
        if (existsSync(filePath)) {
          const contentType = filename.endsWith('.png') ? 'image/png' : filename.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          createReadStream(filePath).pipe(res);
          return;
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found in workspace');
          return;
        }
      }

      // 7. Serve Dashboard HTML
      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderDashboardHtml());
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (err) {
      logger.warn?.('Dashboard request error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      logger.info?.(`[OpenBot Dashboard] Live control panel running at http://localhost:${port}`);
      resolve(server);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn?.(`Port ${port} in use; skipping embedded dashboard server.`);
        resolve(null);
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Returns consumer-readable, modern HTML interface for OpenBot control.
 */
function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenBot Sandbox & HITL Control Center</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --success: #10b981;
      --amber: #f59e0b;
      --danger: #ef4444;
      --radius: 12px;
      --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --card-bg: #1e293b;
        --text: #f8fafc;
        --text-muted: #94a3b8;
        --border: #334155;
        --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3);
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      padding: 32px 24px;
      line-height: 1.5;
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    .title-group h1 {
      font-size: 24px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .badge-autopilot { background: #dcfce7; color: #15803d; }
    .badge-driving { background: #fef3c7; color: #b45309; }
    .badge-stopped { background: #fee2e2; color: #b91c1c; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      box-shadow: var(--shadow);
    }
    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    /* Hero HITL Toggle Box */
    .hitl-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
      border-radius: 10px;
      background: rgba(37, 99, 235, 0.03);
      border: 2px dashed var(--border);
      margin-bottom: 16px;
    }
    .hitl-status-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    .hitl-status-text {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .hitl-desc {
      font-size: 13px;
      color: var(--text-muted);
      max-width: 380px;
      margin-bottom: 18px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-take-wheel { background: #ea580c; color: #fff; }
    .btn-take-wheel:hover { background: #c2410c; }
    .btn-release-wheel { background: #10b981; color: #fff; }
    .btn-release-wheel:hover { background: #059669; }
    .btn-secondary { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--border); }
    .btn-sm { padding: 6px 12px; font-size: 12px; }

    .status-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    .status-row:last-child { border-bottom: none; }
    .status-label { color: var(--text-muted); }
    .status-val { font-weight: 600; font-family: monospace; }

    /* Browser Test Section */
    .input-group {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
    }
    .input-group input {
      flex: 1;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font-size: 14px;
    }
    .screenshot-frame {
      width: 100%;
      height: 240px;
      border-radius: 8px;
      border: 1px solid var(--border);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
    }
    .screenshot-frame img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 2px solid var(--border);
      color: var(--text-muted);
      font-weight: 600;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    tr:last-child td { border-bottom: none; }
    .risk-pill {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .risk-low { background: #dcfce7; color: #166534; }
    .risk-med { background: #fef3c7; color: #92400e; }
    .risk-high { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-group">
        <h1>🤖 OpenBot Sandbox Control Center</h1>
      </div>
      <div id="topBadge">
        <span class="badge badge-autopilot">● System Online</span>
      </div>
    </header>

    <div class="grid">
      <!-- 1. Human-in-the-Loop Toggle Card -->
      <div class="card">
        <div class="card-title">Human-in-the-Loop ("Take the Wheel")</div>
        
        <div class="hitl-box" id="hitlBox">
          <div class="hitl-status-icon" id="hitlIcon">🤖</div>
          <div class="hitl-status-text" id="hitlTitle">Agent Autopilot Active</div>
          <div class="hitl-desc" id="hitlDesc">
            The AI agent has autonomous control over isolated browser operations. Click below to take the wheel for manual logins, 2FA, or CAPTCHAs.
          </div>
          <button id="wheelBtn" class="btn btn-take-wheel" onclick="toggleWheel()">
            🚗 Take the Wheel
          </button>
        </div>

        <div style="font-size: 12px; color: var(--text-muted); text-align: center;">
          Status updates live every 2 seconds. When wheel is taken, automated browser tools pause safely.
        </div>
      </div>

      <!-- 2. Docker Container Sandbox Status -->
      <div class="card">
        <div class="card-title">
          <span>Docker Sandbox Environment</span>
          <span id="containerStateBadge" class="badge badge-autopilot">Running</span>
        </div>

        <div class="status-row">
          <span class="status-label">Container</span>
          <span class="status-val" id="valContainer">dsh-openbot-sandbox</span>
        </div>
        <div class="status-row">
          <span class="status-label">Runtime Mode</span>
          <span class="status-val" id="valMode">Docker Container (Isolated)</span>
        </div>
        <div class="status-row">
          <span class="status-label">Ports</span>
          <span class="status-val">8080 (API), 8081 (VNC)</span>
        </div>
        <div class="status-row">
          <span class="status-label">Workspace Mount</span>
          <span class="status-val" style="font-size: 12px;" id="valWorkspace">~/.dsh/openbot/workspace</span>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="btn btn-secondary btn-sm" onclick="containerAction('restart')">🔄 Restart Sandbox</button>
          <button class="btn btn-secondary btn-sm" onclick="containerAction('stop')">⏹ Stop</button>
          <button class="btn btn-secondary btn-sm" onclick="containerAction('start')">▶ Start</button>
        </div>
      </div>
    </div>

    <!-- 3. Live Browser Runner & Screenshot Preview -->
    <div class="card" style="margin-bottom: 24px;">
      <div class="card-title">Live Containerized Browser Viewer</div>
      
      <div class="input-group">
        <input type="text" id="targetUrlInput" value="https://news.ycombinator.com" placeholder="Enter URL to test in sandbox browser...">
        <button class="btn btn-primary" onclick="runNavigate()">🌐 Navigate & Capture</button>
      </div>

      <div class="screenshot-frame">
        <img id="screenshotImg" src="/workspace/hackernews.png" onerror="this.src='https://via.placeholder.com/800x450?text=No+Screenshot+Captured+Yet';" alt="Browser Viewport">
      </div>
    </div>

    <!-- 4. Real-Time Audit Trail -->
    <div class="card">
      <div class="card-title">Security Gateway Audit Trail (Live)</div>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Tool Name</th>
            <th>Parameters</th>
            <th>Risk</th>
            <th>Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="auditTableBody">
          <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading audit entries...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    let isToggling = false;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        // Update Wheel UI
        const isWheelActive = Boolean(data.wheelActive);
        const hitlIcon = document.getElementById('hitlIcon');
        const hitlTitle = document.getElementById('hitlTitle');
        const hitlDesc = document.getElementById('hitlDesc');
        const wheelBtn = document.getElementById('wheelBtn');
        const topBadge = document.getElementById('topBadge');

        if (isWheelActive) {
          hitlIcon.innerText = '🚗';
          hitlTitle.innerText = 'Human User Driving';
          hitlTitle.style.color = '#ea580c';
          hitlDesc.innerText = 'Agent browser actions are suspended. You have full manual control. Click below to release the wheel back to the agent.';
          wheelBtn.className = 'btn btn-release-wheel';
          wheelBtn.innerText = '🤖 Release Wheel to Agent';
          topBadge.innerHTML = '<span class="badge badge-driving">🚗 Human in Control</span>';
        } else {
          hitlIcon.innerText = '🤖';
          hitlTitle.innerText = 'Agent Autopilot Active';
          hitlTitle.style.color = 'var(--text)';
          hitlDesc.innerText = 'The AI agent has autonomous control over isolated browser operations. Click below to take the wheel for manual logins, 2FA, or CAPTCHAs.';
          wheelBtn.className = 'btn btn-take-wheel';
          wheelBtn.innerText = '🚗 Take the Wheel';
          topBadge.innerHTML = '<span class="badge badge-autopilot">🤖 Agent Autopilot</span>';
        }

        // Update Container Status
        const cState = document.getElementById('containerStateBadge');
        if (data.container && data.container.running) {
          cState.className = 'badge badge-autopilot';
          cState.innerText = 'Active';
        } else {
          cState.className = 'badge badge-stopped';
          cState.innerText = 'Stopped';
        }

        if (data.workspaceDir) {
          document.getElementById('valWorkspace').innerText = data.workspaceDir;
        }

        // Update Screenshot if available
        if (data.latestScreenshot) {
          const img = document.getElementById('screenshotImg');
          const newSrc = data.latestScreenshot + '?t=' + Date.now();
          if (!img.src.includes(data.latestScreenshot)) {
            img.src = newSrc;
          }
        }

        // Render Audits Table
        const tbody = document.getElementById('auditTableBody');
        if (data.audits && data.audits.length > 0) {
          tbody.innerHTML = data.audits.map(item => {
            const timeStr = new Date(item.timestamp).toLocaleTimeString();
            const paramStr = JSON.stringify(item.params || {}).slice(0, 45);
            const riskClass = item.risk === 'high' ? 'risk-high' : item.risk === 'medium' ? 'risk-med' : 'risk-low';
            return '<tr>' +
              '<td style="color: var(--text-muted); font-size: 12px;">' + timeStr + '</td>' +
              '<td><code>' + item.tool + '</code></td>' +
              '<td style="color: var(--text-muted); font-family: monospace; font-size: 12px;">' + paramStr + '</td>' +
              '<td><span class="risk-pill ' + riskClass + '">' + (item.risk || 'low') + '</span></td>' +
              '<td>' + (item.durationMs || 0) + 'ms</td>' +
              '<td><span style="color: #10b981; font-weight: 600;">✓ ' + item.status + '</span></td>' +
            '</tr>';
          }).join('');
        }
      } catch (e) {
        console.error('Failed to sync status:', e);
      }
    }

    async function toggleWheel() {
      if (isToggling) return;
      isToggling = true;
      const btn = document.getElementById('wheelBtn');
      btn.innerText = 'Updating...';
      try {
        await fetch('/api/wheel/toggle', { method: 'POST' });
        await fetchStatus();
      } finally {
        isToggling = false;
      }
    }

    async function containerAction(act) {
      try {
        await fetch('/api/container/' + act, { method: 'POST' });
        await fetchStatus();
      } catch (e) {
        alert('Action failed: ' + e.message);
      }
    }

    async function runNavigate() {
      const url = document.getElementById('targetUrlInput').value.trim();
      if (!url) return;
      const btn = event.target;
      btn.innerText = 'Navigating...';
      btn.disabled = true;
      try {
        await fetch('/api/browser/navigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl: url })
        });
        setTimeout(fetchStatus, 1500);
      } finally {
        btn.innerText = '🌐 Navigate & Capture';
        btn.disabled = false;
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 2500);
  </script>
</body>
</html>`;
}
