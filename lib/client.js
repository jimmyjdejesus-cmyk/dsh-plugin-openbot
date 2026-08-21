/**
 * @file client.js
 * DSH Desktop UI slot registration and client-side view for CopilotKit OpenBot sandbox.
 * Hand-crafted bundle wrapped in window.__ModuleLoader__.load for DSH browser module loader.
 */

function defineClientModule(require) {
  let React = null;
  try {
    React = require('react');
  } catch (err) {
    // Degrade gracefully if react is unavailable
  }

  const name = 'dsh-plugin-openbot';

  /**
   * OpenBot Sandbox Dashboard Component for DSH Desktop.
   */
  function OpenBotDashboard({ ctx }) {
    if (!React) return null;
    const [status, setStatus] = React.useState({ running: true, container: 'dsh-openbot-sandbox', mode: 'docker' });
    const [audits, setAudits] = React.useState([]);
    const [activeTab, setActiveTab] = React.useState('audit');

    React.useEffect(() => {
      const interval = setInterval(async () => {
        try {
          if (ctx && ctx.openbot) {
            const s = await ctx.openbot.getStatus();
            if (s) setStatus(s);
            const a = ctx.openbot.getAudits();
            if (a) setAudits(a);
          }
        } catch (e) {}
      }, 3000);

      return () => clearInterval(interval);
    }, [ctx]);

    return React.createElement('div', {
      style: {
        padding: '16px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: 'var(--fg-default, #c9d1d9)',
        background: 'var(--bg-canvas, #0d1117)'
      }
    }, [
      // Header Bar
      React.createElement('div', {
        key: 'header',
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-default, #30363d)',
          marginBottom: '16px'
        }
      }, [
        React.createElement('div', { key: 'title-group', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
          React.createElement('span', { key: 'icon', style: { fontSize: '20px' } }, '🤖'),
          React.createElement('h2', { key: 'title', style: { margin: 0, fontSize: '18px', fontWeight: 600 } }, 'CopilotKit OpenBot Sandbox')
        ]),
        React.createElement('div', { key: 'badge-group', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
          React.createElement('span', {
            key: 'status-pill',
            style: {
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
              background: status.running ? 'rgba(46, 160, 67, 0.2)' : 'rgba(218, 54, 51, 0.2)',
              color: status.running ? '#3fb950' : '#f85149',
              border: `1px solid ${status.running ? '#2ea043' : '#da3633'}`
            }
          }, status.running ? '● Container Active' : '○ Standby / Fallback'),
          React.createElement('span', {
            key: 'container-tag',
            style: {
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              background: '#21262d',
              color: '#8b949e'
            }
          }, status.container || 'dsh-openbot-sandbox')
        ])
      ]),

      // Navigation Tabs
      React.createElement('div', {
        key: 'tabs',
        style: { display: 'flex', gap: '8px', marginBottom: '16px' }
      }, [
        { id: 'audit', label: '🛡️ Audit Trail' },
        { id: 'browser', label: '🌐 Live Browser View' },
        { id: 'files', label: '📁 Sandboxed Workspace' }
      ].map(tab =>
        React.createElement('button', {
          key: tab.id,
          onClick: () => setActiveTab(tab.id),
          style: {
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            background: activeTab === tab.id ? '#1f6feb' : '#21262d',
            color: activeTab === tab.id ? '#ffffff' : '#c9d1d9'
          }
        }, tab.label)
      )),

      // Tab Content Area
      React.createElement('div', {
        key: 'tab-content',
        style: {
          flex: 1,
          overflow: 'auto',
          borderRadius: '8px',
          border: '1px solid #30363d',
          background: '#161b22',
          padding: '16px'
        }
      }, [
        activeTab === 'audit' && React.createElement('div', { key: 'audit-panel' }, [
          React.createElement('h3', { key: 'a-title', style: { marginTop: 0, fontSize: '14px', color: '#8b949e' } }, 'Pre-Action Security & Tool Execution Ledger'),
          audits.length === 0
            ? React.createElement('p', { key: 'empty', style: { color: '#8b949e', fontStyle: 'italic' } }, 'No actions recorded yet. Run OpenBot tools from DSH chat to see real-time audits.')
            : React.createElement('div', { key: 'list', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                audits.map((item, idx) =>
                  React.createElement('div', {
                    key: item.id || idx,
                    style: {
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: '#0d1117',
                      border: '1px solid #30363d',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '13px'
                    }
                  }, [
                    React.createElement('div', { key: 'left' }, [
                      React.createElement('span', { style: { fontWeight: 600, color: '#58a6ff' } }, item.tool),
                      React.createElement('span', { style: { marginLeft: '8px', color: '#8b949e', fontSize: '12px' } }, item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '')
                    ]),
                    React.createElement('span', {
                      key: 'risk',
                      style: {
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: item.risk === 'high' ? '#da3633' : item.risk === 'medium' ? '#d29922' : '#238636',
                        color: '#ffffff'
                      }
                    }, (item.risk || 'low').toUpperCase())
                  ])
                )
              )
        ]),

        activeTab === 'browser' && React.createElement('div', { key: 'browser-panel', style: { textAlign: 'center', padding: '32px' } }, [
          React.createElement('div', { key: 'b-icon', style: { fontSize: '48px', marginBottom: '16px' } }, '🖥️'),
          React.createElement('h3', { key: 'b-title', style: { margin: '0 0 8px 0' } }, 'Isolated Chromium Live View'),
          React.createElement('p', { key: 'b-desc', style: { color: '#8b949e', maxWidth: '400px', margin: '0 auto 16px auto' } }, 'Live CDP/VNC screencast is forwarded from the OpenBot container on port 8081.'),
          React.createElement('a', {
            key: 'b-link',
            href: 'http://localhost:8081',
            target: '_blank',
            rel: 'noreferrer',
            style: {
              display: 'inline-block',
              padding: '8px 16px',
              background: '#238636',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '6px',
              fontWeight: 500
            }
          }, 'Open Screencast in New Window')
        ]),

        activeTab === 'files' && React.createElement('div', { key: 'files-panel' }, [
          React.createElement('h3', { key: 'f-title', style: { marginTop: 0, fontSize: '14px', color: '#8b949e' } }, 'Sandboxed Workspace: ~/.dsh/openbot/workspace'),
          React.createElement('p', { key: 'f-desc', style: { color: '#8b949e' } }, 'Files created by OpenBot tasks are isolated in this directory and mounted directly into the container.')
        ])
      ])
    ]);
  }

  function apply(ctx) {
    if (!ctx.slots) return;

    try {
      if (typeof ctx.slots.register === 'function') {
        ctx.slots.register({
          key: 'openbot-sandbox',
          id: 'openbot-sandbox',
          slot: 'workspace.tab',
          title: 'OpenBot Sandbox',
          icon: 'bot',
          component: () => React ? React.createElement(OpenBotDashboard, { ctx }) : null
        });

        ctx.slots.register({
          key: 'openbot-settings',
          id: 'openbot-settings',
          slot: 'settings.plugin.item',
          title: 'OpenBot Sandbox',
          component: () => React ? React.createElement(OpenBotDashboard, { ctx }) : null
        });
      }
    } catch (err) {
      ctx.logger?.warn?.('Failed to register OpenBot UI slot:', err);
    }
  }

  return { name, apply };
}

// In the browser, register with DSH's __ModuleLoader__
if (typeof window !== 'undefined' && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
  window.__ModuleLoader__.load({
    id: 'dsh-plugin-openbot',
    factory: defineClientModule
  });
}

// In Node/ESM test environments, export directly
const { name, apply } = defineClientModule((mod) => {
  if (mod === 'react') return { useState: () => [{}, () => {}], useEffect: () => {} };
  return {};
});

export { name, apply };
