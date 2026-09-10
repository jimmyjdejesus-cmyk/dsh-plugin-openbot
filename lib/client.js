// dsh-plugin-openbot — browser client module for DeepSeek Harness (DSH) Desktop
window.__ModuleLoader__.load({
  id: "dsh-plugin-openbot",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let React = null;
    try {
      React = require("react");
    } catch (e) {}

    const name = "dsh-plugin-openbot";
    const inject = ["slots"];

    function OpenBotDashboard({ ctx }) {
      if (!React) return null;
      const [status, setStatus] = React.useState({ running: true, container: "dsh-openbot-sandbox", mode: "docker" });
      const [audits, setAudits] = React.useState([]);
      const [isWheelActive, setIsWheelActive] = React.useState(false);
      const [activeTab, setActiveTab] = React.useState("audit");
      const [riskFilter, setRiskFilter] = React.useState("all");
      const [actionLoading, setActionLoading] = React.useState(false);

      // Periodic state synchronization from openbot service on ctx
      React.useEffect(() => {
        const syncState = async () => {
          try {
            if (ctx && ctx.openbot) {
              if (typeof ctx.openbot.getStatus === "function") {
                const s = await ctx.openbot.getStatus();
                if (s) setStatus(s);
              }
              if (typeof ctx.openbot.getAudits === "function") {
                const a = ctx.openbot.getAudits(100);
                if (a) setAudits(a);
              }
              if (typeof ctx.openbot.isWheelActive === "function") {
                setIsWheelActive(Boolean(ctx.openbot.isWheelActive()));
              }
            }
          } catch (e) {}
        };

        syncState();
        const interval = setInterval(syncState, 2500);
        return () => clearInterval(interval);
      }, [ctx]);

      // Take the Wheel toggle handler
      const handleToggleWheel = async () => {
        if (!ctx || !ctx.openbot) return;
        try {
          setActionLoading(true);
          if (typeof ctx.openbot.toggleWheel === "function") {
            const newState = await ctx.openbot.toggleWheel();
            setIsWheelActive(newState);
          }
        } catch (err) {
          console.error("Failed to toggle wheel:", err);
        } finally {
          setActionLoading(false);
        }
      };

      // Container lifecycle handlers
      const handleContainerAction = async (action) => {
        if (!ctx || !ctx.openbot) return;
        try {
          setActionLoading(true);
          if (action === "restart" && typeof ctx.openbot.restartContainer === "function") {
            await ctx.openbot.restartContainer();
          } else if (action === "stop" && typeof ctx.openbot.stopContainer === "function") {
            await ctx.openbot.stopContainer();
          } else if (action === "start" && typeof ctx.openbot.startContainer === "function") {
            await ctx.openbot.startContainer();
          }
          const s = await ctx.openbot.getStatus();
          if (s) setStatus(s);
        } catch (err) {
          console.error(`Failed container ${action}:`, err);
        } finally {
          setActionLoading(false);
        }
      };

      // Filtered audits
      const filteredAudits = audits.filter(item => {
        if (riskFilter === "all") return true;
        return item.risk === riskFilter;
      });

      return React.createElement("div", {
        style: {
          padding: "16px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: "var(--fg-default, #c9d1d9)",
          background: "var(--bg-canvas, #0d1117)"
        }
      }, [
        // Top Header
        React.createElement("div", {
          key: "header",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "12px",
            borderBottom: "1px solid var(--border-default, #30363d)",
            marginBottom: "14px",
            flexWrap: "wrap",
            gap: "10px"
          }
        }, [
          React.createElement("div", { key: "title-group", style: { display: "flex", alignItems: "center", gap: "8px" } }, [
            React.createElement("span", { key: "icon", style: { fontSize: "20px" } }, "🤖"),
            React.createElement("div", { key: "text" }, [
              React.createElement("h2", { key: "title", style: { margin: 0, fontSize: "16px", fontWeight: 600 } }, "CopilotKit OpenBot Sandbox"),
              React.createElement("span", { key: "sub", style: { fontSize: "11px", color: "#8b949e" } }, "Isolated Docker Runtime, Chromium Browser & HITL Gateway")
            ])
          ]),

          React.createElement("div", { key: "badge-group", style: { display: "flex", gap: "8px", alignItems: "center" } }, [
            // Human Takeover Pill
            React.createElement("button", {
              key: "wheel-btn",
              onClick: handleToggleWheel,
              disabled: actionLoading,
              style: {
                padding: "4px 10px",
                borderRadius: "12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background: isWheelActive ? "rgba(218, 54, 51, 0.2)" : "rgba(31, 111, 235, 0.15)",
                color: isWheelActive ? "#f85149" : "#58a6ff",
                border: `1px solid ${isWheelActive ? "#da3633" : "#388bfd"}`,
                transition: "all 0.15s ease"
              }
            }, isWheelActive ? "🚗 Human Driving (Pause Agent)" : "🤖 Agent Autopilot"),

            // Container Status Pill
            React.createElement("span", {
              key: "status-pill",
              style: {
                padding: "4px 10px",
                borderRadius: "12px",
                fontSize: "12px",
                fontWeight: 600,
                background: status.running ? "rgba(46, 160, 67, 0.2)" : "rgba(218, 54, 51, 0.2)",
                color: status.running ? "#3fb950" : "#f85149",
                border: `1px solid ${status.running ? "#2ea043" : "#da3633"}`
              }
            }, status.running ? "● Container Active" : "○ Standby / Fallback"),

            // Quick Restart Button
            React.createElement("button", {
              key: "restart-btn",
              onClick: () => handleContainerAction(status.running ? "restart" : "start"),
              disabled: actionLoading,
              style: {
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "11px",
                background: "#21262d",
                color: "#c9d1d9",
                border: "1px solid #30363d",
                cursor: "pointer"
              }
            }, status.running ? "Restart" : "Start")
          ])
        ]),

        // Tab Navigation
        React.createElement("div", {
          key: "tabs",
          style: { display: "flex", gap: "8px", marginBottom: "12px" }
        }, [
          { id: "audit", label: "🛡️ Audit Trail & Policies" },
          { id: "browser", label: "🌐 Live Browser & Screencast" },
          { id: "files", label: "📁 Sandboxed Workspace" }
        ].map(tab =>
          React.createElement("button", {
            key: tab.id,
            onClick: () => setActiveTab(tab.id),
            style: {
              padding: "6px 14px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              background: activeTab === tab.id ? "#1f6feb" : "#21262d",
              color: activeTab === tab.id ? "#ffffff" : "#c9d1d9"
            }
          }, tab.label)
        )),

        // Tab Content Panel
        React.createElement("div", {
          key: "tab-content",
          style: {
            flex: 1,
            overflow: "auto",
            borderRadius: "8px",
            border: "1px solid #30363d",
            background: "#161b22",
            padding: "16px"
          }
        }, [
          // TAB 1: AUDIT TRAIL
          activeTab === "audit" && React.createElement("div", { key: "audit-panel" }, [
            React.createElement("div", {
              key: "audit-header-row",
              style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }
            }, [
              React.createElement("h3", { key: "a-title", style: { margin: 0, fontSize: "14px", color: "#8b949e" } }, "Pre-Action Security & Tool Execution Ledger"),
              React.createElement("div", { key: "filter-pills", style: { display: "flex", gap: "6px" } }, [
                { id: "all", label: "All" },
                { id: "high", label: "High Risk" },
                { id: "medium", label: "Med Risk" },
                { id: "low", label: "Low Risk" }
              ].map(rf =>
                React.createElement("button", {
                  key: rf.id,
                  onClick: () => setRiskFilter(rf.id),
                  style: {
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    border: "1px solid #30363d",
                    cursor: "pointer",
                    background: riskFilter === rf.id ? "#388bfd" : "#21262d",
                    color: riskFilter === rf.id ? "#ffffff" : "#8b949e"
                  }
                }, rf.label)
              ))
            ]),

            filteredAudits.length === 0
              ? React.createElement("p", { key: "empty", style: { color: "#8b949e", fontStyle: "italic" } }, "No actions matching criteria recorded yet. Run OpenBot tools from DSH chat to see real-time audits.")
              : React.createElement("div", { key: "list", style: { display: "flex", flexDirection: "column", gap: "8px" } },
                  filteredAudits.map((item, idx) =>
                    React.createElement("div", {
                      key: item.id || idx,
                      style: {
                        padding: "10px 12px",
                        borderRadius: "6px",
                        background: "#0d1117",
                        border: "1px solid #30363d",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "13px"
                      }
                    }, [
                      React.createElement("div", { key: "left" }, [
                        React.createElement("span", { style: { fontWeight: 600, color: "#58a6ff" } }, item.tool),
                        React.createElement("span", { style: { marginLeft: "8px", color: "#8b949e", fontSize: "12px" } }, item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ""),
                        item.durationMs ? React.createElement("span", { style: { marginLeft: "8px", color: "#6e7681", fontSize: "11px" } }, `(${item.durationMs}ms)`) : null,
                        item.status === "suspended_human_takeover" ? React.createElement("span", { style: { marginLeft: "8px", color: "#f85149", fontSize: "11px", fontWeight: 600 } }, "• SUSPENDED (HITL)") : null
                      ]),
                      React.createElement("span", {
                        key: "risk",
                        style: {
                          fontSize: "11px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: item.risk === "high" ? "#da3633" : item.risk === "medium" ? "#d29922" : "#238636",
                          color: "#ffffff"
                        }
                      }, (item.risk || "low").toUpperCase())
                    ])
                  )
                )
          ]),

          // TAB 2: LIVE BROWSER
          activeTab === "browser" && React.createElement("div", { key: "browser-panel", style: { textAlign: "center", padding: "28px" } }, [
            React.createElement("div", { key: "b-icon", style: { fontSize: "44px", marginBottom: "12px" } }, "🖥️"),
            React.createElement("h3", { key: "b-title", style: { margin: "0 0 8px 0" } }, "Containerized Chromium & Screencast"),
            React.createElement("p", { key: "b-desc", style: { color: "#8b949e", maxWidth: "460px", margin: "0 auto 16px auto", fontSize: "13px" } },
              isWheelActive
                ? "🚗 You have taken the wheel! Interact with the live browser session below to solve CAPTCHAs, sign in, or navigate manually. Click 'Agent Autopilot' when done."
                : "Live CDP/VNC screencast is forwarded from the OpenBot container on port 8081. Agent operates autonomously using indexed refs (@e1, @e2)."
            ),
            React.createElement("div", { key: "btn-row", style: { display: "flex", gap: "10px", justifyContent: "center" } }, [
              React.createElement("a", {
                key: "b-link",
                href: "http://localhost:8081",
                target: "_blank",
                rel: "noreferrer",
                style: {
                  display: "inline-block",
                  padding: "8px 16px",
                  background: "#238636",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: "6px",
                  fontWeight: 500,
                  fontSize: "13px"
                }
              }, "Open Live Screencast (Port 8081)"),
              React.createElement("button", {
                key: "take-wheel-tab-btn",
                onClick: handleToggleWheel,
                style: {
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #30363d",
                  background: isWheelActive ? "#da3633" : "#21262d",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500
                }
              }, isWheelActive ? "Release Wheel to Agent" : "Take the Wheel")
            ])
          ]),

          // TAB 3: SANDBOXED FILES
          activeTab === "files" && React.createElement("div", { key: "files-panel" }, [
            React.createElement("h3", { key: "f-title", style: { marginTop: 0, fontSize: "14px", color: "#8b949e" } }, "Sandboxed Workspace: ~/.dsh/openbot/workspace"),
            React.createElement("p", { key: "f-desc", style: { color: "#8b949e", fontSize: "13px" } }, "Files created by OpenBot tasks are isolated in this directory and mounted directly into the container (/sandbox/workspace).")
          ])
        ])
      ]);
    }

    function apply(ctx) {
      if (!ctx.slots) return;
      try {
        if (typeof ctx.slots.register === "function") {
          ctx.slots.register({
            key: "openbot-sandbox",
            id: "openbot-sandbox",
            slot: "workspace.tab",
            title: "OpenBot Sandbox",
            icon: "bot",
            component: () => React ? React.createElement(OpenBotDashboard, { ctx }) : null
          });

          ctx.slots.register({
            key: "openbot-settings",
            id: "openbot-settings",
            slot: "settings.plugin.item",
            title: "OpenBot Sandbox",
            component: () => React ? React.createElement(OpenBotDashboard, { ctx }) : null
          });
        }
      } catch (err) {
        ctx.logger?.warn?.("Failed to register OpenBot UI slot:", err);
      }
    }

    return { name, inject, apply };
  }
});
