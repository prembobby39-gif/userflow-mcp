/**
 * Rich HTML report generator with embedded screenshots, charts, and interactive elements.
 * Produces a standalone HTML file with no external dependencies.
 */
import type { UserSession, SessionStep, FrictionPoint, AccessibilityReport, PerformanceMetrics, NetworkSummary, ConsoleSummary } from "../types.js";

/** Generate a full standalone HTML report from a session. */
export function generateHtmlSessionReport(session: UserSession): string {
  const { persona, steps, summary } = session;
  const emotionColors: Record<string, string> = {
    curious: "#3b82f6", confident: "#22c55e", neutral: "#6b7280",
    confused: "#f59e0b", frustrated: "#ef4444", delighted: "#a855f7",
    anxious: "#f97316", bored: "#94a3b8",
  };

  const stepsHtml = steps.map((step, i) => {
    const color = emotionColors[step.emotionalState] || "#6b7280";
    const frictionHtml = step.frictionPoints.length > 0
      ? `<div class="friction-list">${step.frictionPoints.map(f =>
          `<div class="friction ${f.severity}">
            <span class="badge">${f.severity.toUpperCase()}</span> ${esc(f.description)}
            <div class="suggestion">→ ${esc(f.suggestion)}</div>
          </div>`
        ).join("")}</div>`
      : "";

    const pageData = step.page;
    const perfHtml = pageData.performance ? renderPerformance(pageData.performance) : "";
    const a11yHtml = pageData.accessibility ? renderAccessibility(pageData.accessibility) : "";
    const networkHtml = pageData.network ? renderNetwork(pageData.network) : "";
    const consoleHtml = pageData.console && pageData.console.errors > 0 ? renderConsole(pageData.console) : "";

    return `
      <div class="step" id="step-${i}">
        <div class="step-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="step-num">${i}</div>
          <div class="step-info">
            <div class="step-title">${esc(pageData.title || pageData.url)}</div>
            <div class="step-meta">
              <span class="emotion" style="color:${color}">● ${step.emotionalState}</span>
              <span class="action">${step.action.type}${step.action.target ? ` → <code>${esc(step.action.target)}</code>` : ""}</span>
            </div>
          </div>
        </div>
        <div class="step-body">
          <div class="thought">"${esc(step.thought)}"</div>
          ${frictionHtml}
          ${perfHtml}${a11yHtml}${networkHtml}${consoleHtml}
          ${pageData.screenshot ? `<img class="screenshot" src="data:image/png;base64,${pageData.screenshot}" alt="Step ${i} screenshot" loading="lazy" />` : ""}
        </div>
      </div>`;
  }).join("\n");

  const frictionRows = summary.topFrictionPoints.map(f =>
    `<tr><td><span class="badge ${f.severity}">${f.severity}</span></td><td>${esc(f.description)}</td><td>${esc(f.suggestion)}</td></tr>`
  ).join("");

  const emotionJourney = summary.emotionalJourney.map((e, i) =>
    `<span class="ej-dot" style="background:${emotionColors[e] || "#6b7280"}" title="Step ${i}: ${e}"></span>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UX Report: ${esc(session.startUrl)} — ${esc(persona.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
  .container { max-width: 960px; margin: 0 auto; padding: 24px; }
  header { background: linear-gradient(135deg, #1e293b, #334155); color: white; padding: 32px 24px; border-radius: 12px; margin-bottom: 24px; }
  header h1 { font-size: 22px; margin-bottom: 8px; }
  header .url { opacity: 0.7; font-size: 14px; word-break: break-all; }
  .persona-card { display: flex; gap: 16px; background: white; border-radius: 8px; padding: 16px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .persona-card .avatar { width: 48px; height: 48px; border-radius: 50%; background: #3b82f6; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; flex-shrink: 0; }
  .persona-card .info h3 { font-size: 16px; } .persona-card .info p { font-size: 13px; color: #64748b; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .metric { background: white; border-radius: 8px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .metric .value { font-size: 28px; font-weight: 700; } .metric .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .metric.good .value { color: #22c55e; } .metric.warn .value { color: #f59e0b; } .metric.bad .value { color: #ef4444; }
  .section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .section h2 { font-size: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
  .emotion-journey { display: flex; gap: 4px; align-items: center; padding: 12px 0; }
  .ej-dot { width: 24px; height: 24px; border-radius: 50%; display: inline-block; cursor: pointer; transition: transform 0.15s; }
  .ej-dot:hover { transform: scale(1.3); }
  .step { background: #fafbfc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
  .step.collapsed .step-body { display: none; }
  .step-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; }
  .step-header:hover { background: #f1f5f9; }
  .step-num { width: 28px; height: 28px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
  .step-title { font-size: 14px; font-weight: 500; } .step-meta { font-size: 12px; color: #64748b; display: flex; gap: 12px; }
  .step-body { padding: 0 16px 16px; }
  .thought { font-style: italic; color: #475569; margin: 8px 0; padding: 8px 12px; border-left: 3px solid #3b82f6; background: #eff6ff; border-radius: 0 4px 4px 0; font-size: 13px; }
  .screenshot { width: 100%; border-radius: 6px; margin-top: 12px; border: 1px solid #e2e8f0; }
  .friction { padding: 8px 12px; margin: 6px 0; border-radius: 4px; font-size: 13px; }
  .friction.low { background: #f0fdf4; border-left: 3px solid #22c55e; }
  .friction.medium { background: #fffbeb; border-left: 3px solid #f59e0b; }
  .friction.high { background: #fef2f2; border-left: 3px solid #ef4444; }
  .friction.critical { background: #fef2f2; border-left: 3px solid #991b1b; }
  .suggestion { font-size: 12px; color: #64748b; margin-top: 4px; }
  .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; color: white; }
  .badge.low, .badge:not(.medium):not(.high):not(.critical) { background: #22c55e; }
  .badge.medium { background: #f59e0b; } .badge.high { background: #ef4444; } .badge.critical { background: #991b1b; }
  .perf-bar { display: flex; gap: 12px; flex-wrap: wrap; margin: 8px 0; }
  .perf-item { font-size: 12px; padding: 4px 8px; border-radius: 4px; background: #f1f5f9; }
  .perf-item.good { background: #dcfce7; color: #166534; }
  .perf-item.needs-improvement { background: #fef3c7; color: #92400e; }
  .perf-item.poor { background: #fee2e2; color: #991b1b; }
  .a11y-summary { font-size: 12px; padding: 6px 10px; border-radius: 4px; margin: 6px 0; }
  .net-summary, .console-summary { font-size: 12px; padding: 6px 10px; background: #f1f5f9; border-radius: 4px; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; }
  code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
  @media print { .step-body { display: block !important; } .screenshot { max-height: 300px; object-fit: contain; } }
</style>
</head>
<body>
<div class="container">

<header>
  <h1>UX Analysis Report</h1>
  <div class="url">${esc(session.startUrl)}</div>
</header>

<div class="persona-card">
  <div class="avatar">${esc(persona.name[0])}</div>
  <div class="info">
    <h3>${esc(persona.name)} — ${esc(persona.description)}</h3>
    <p>Tech: ${persona.traits.techLiteracy} · Patience: ${persona.traits.patience} · Device: ${persona.traits.devicePreference}</p>
    <p>Goals: ${persona.goals.map(g => esc(g)).join(", ")}</p>
  </div>
</div>

<div class="metrics">
  <div class="metric ${summary.frictionScore <= 3 ? "good" : summary.frictionScore <= 6 ? "warn" : "bad"}">
    <div class="value">${summary.frictionScore}/10</div><div class="label">Friction Score</div>
  </div>
  <div class="metric"><div class="value">${summary.totalSteps}</div><div class="label">Steps Taken</div></div>
  <div class="metric ${summary.goalAchieved ? "good" : "bad"}">
    <div class="value">${summary.goalAchieved ? "✓" : "✗"}</div><div class="label">Goal Achieved</div>
  </div>
  <div class="metric"><div class="value">${(summary.totalTimeMs / 1000).toFixed(1)}s</div><div class="label">Total Time</div></div>
</div>

<div class="section">
  <h2>Emotional Journey</h2>
  <div class="emotion-journey">${emotionJourney}</div>
  <p style="font-size:13px;color:#64748b;">Trend: <strong>${summary.dropOffRisk}</strong></p>
</div>

${summary.topFrictionPoints.length > 0 ? `
<div class="section">
  <h2>Top Friction Points</h2>
  <table>
    <thead><tr><th>Severity</th><th>Issue</th><th>Recommendation</th></tr></thead>
    <tbody>${frictionRows}</tbody>
  </table>
</div>` : ""}

<div class="section">
  <h2>Step-by-Step Walkthrough</h2>
  ${stepsHtml}
</div>

${summary.recommendations.length > 0 ? `
<div class="section">
  <h2>Recommendations</h2>
  <ol style="padding-left:20px;font-size:14px;">
    ${summary.recommendations.map(r => `<li style="margin-bottom:6px;">${esc(r)}</li>`).join("")}
  </ol>
</div>` : ""}

<div class="footer">
  Generated by UserFlow MCP v0.3.0 · userflow-mcp · ${new Date().toISOString().split("T")[0]}
</div>

</div>
</body>
</html>`;
}

function renderPerformance(perf: PerformanceMetrics): string {
  const items: string[] = [];
  if (perf.lcp !== null) items.push(`<span class="perf-item ${perf.lcpRating || ""}">LCP: ${perf.lcp.toFixed(0)}ms</span>`);
  if (perf.cls !== null) items.push(`<span class="perf-item ${perf.clsRating || ""}">CLS: ${perf.cls.toFixed(3)}</span>`);
  if (perf.fcp !== null) items.push(`<span class="perf-item">FCP: ${perf.fcp.toFixed(0)}ms</span>`);
  if (perf.ttfb !== null) items.push(`<span class="perf-item">TTFB: ${perf.ttfb.toFixed(0)}ms</span>`);
  if (items.length === 0) return "";
  return `<div class="perf-bar">${items.join("")}</div>`;
}

function renderAccessibility(a11y: AccessibilityReport): string {
  if (a11y.violations.length === 0) return "";
  const bg = a11y.score >= 90 ? "#dcfce7" : a11y.score >= 70 ? "#fef3c7" : "#fee2e2";
  return `<div class="a11y-summary" style="background:${bg}">
    ♿ A11y: ${a11y.score}/100 · ${a11y.violations.length} violations (${a11y.violationsByImpact.critical} critical, ${a11y.violationsByImpact.serious} serious)
  </div>`;
}

function renderNetwork(net: NetworkSummary): string {
  if (net.totalRequests === 0) return "";
  const failStr = net.failedRequests > 0 ? ` · <strong style="color:#ef4444">${net.failedRequests} failed</strong>` : "";
  return `<div class="net-summary">🌐 ${net.totalRequests} requests · ${(net.totalTransferSize / 1024).toFixed(0)}KB${failStr}</div>`;
}

function renderConsole(con: ConsoleSummary): string {
  return `<div class="console-summary" style="background:#fef2f2">⚠️ ${con.errors} JS errors, ${con.warnings} warnings</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
