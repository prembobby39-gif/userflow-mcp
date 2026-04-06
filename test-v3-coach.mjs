#!/usr/bin/env node
/**
 * v0.3.0 Full Feature Test on coach.tetr.com (authenticated site)
 *
 * Flow: Login → Dashboard → accessibility_audit → inspect_storage →
 *       export_har → navigate pages → compare_screenshots → end_session (HTML)
 */

import { spawn, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const LOGIN_URL = "https://coach.tetr.com/login";
const EMAIL = execSync(`${process.env.HOME}/MCPs/autopilot/bin/keychain.sh get coach-tetr email`, { encoding: "utf-8" }).trim();
const PASS = execSync(`${process.env.HOME}/MCPs/autopilot/bin/keychain.sh get coach-tetr password`, { encoding: "utf-8" }).trim();

let child;
let buffer = "";
let sessionId = null;
let passed = 0;
let failed = 0;

// ── JSON-RPC ────────────────────────────────────────────────────

function send(method, params = {}) {
  const id = randomUUID();
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  child.stdin.write(msg + "\n");
  return id;
}

function waitForResponse(id, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${id}`)), timeoutMs);
    const check = () => {
      const lines = buffer.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            clearTimeout(timeout);
            buffer = lines.slice(i + 1).join("\n");
            resolve(parsed);
            return;
          }
        } catch {}
      }
      setTimeout(check, 200);
    };
    check();
  });
}

async function callTool(name, args = {}, timeout = 90_000) {
  const id = send("tools/call", { name, arguments: args });
  const resp = await waitForResponse(id, timeout);
  if (resp.error) throw new Error(`${name} error: ${resp.error.message}`);
  return resp.result;
}

function text(result) {
  return result.content?.filter(c => c.type === "text").map(c => c.text).join("\n") ?? "";
}
function hasImage(result) {
  return result.content?.some(c => c.type === "image") ?? false;
}
function getImage(result) {
  return result.content?.find(c => c.type === "image")?.data;
}

function log(label) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(60)}`);
}
function pass_(t) { console.log(`  ✅ ${t}`); passed++; }
function fail_(t, r) { console.log(`  ❌ ${t}: ${r}`); failed++; }

// ── Tests ───────────────────────────────────────────────────────

async function run() {
  console.log("UserFlow MCP v0.3.0 — coach.tetr.com Full Test\n");

  child = spawn("node", ["dist/index.js"], {
    cwd: "/Users/prem/projects/userflow-mcp",
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => { buffer += d.toString(); });
  child.stderr.on("data", (d) => { process.stderr.write(`[mcp] ${d}`); });

  const initId = send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-v3-coach", version: "1.0.0" },
  });
  await waitForResponse(initId);
  send("notifications/initialized", {});
  console.log("✅ MCP server initialized");

  // ── 1. Start session on login page (desktop) ─────────────────
  log("1. START SESSION — coach.tetr.com login page");
  {
    const result = await callTool("start_session", {
      url: LOGIN_URL,
    }, 120_000);
    const t = text(result);
    const match = t.match(/Session ID:\*\*\s*([a-f0-9-]+)/);
    sessionId = match?.[1];
    if (sessionId) pass_(`Session: ${sessionId.slice(0, 8)}...`); else fail_("No session ID", t.slice(0, 200));
    if (hasImage(result)) pass_("Screenshot"); else fail_("No screenshot", "");
    if (t.includes("a11yScore") || t.includes("a11yViolations")) pass_("A11y data in initial snapshot"); else fail_("No a11y", "");
    if (t.includes("networkRequests")) pass_("Network data in initial snapshot"); else fail_("No network", "");
    if (t.includes("performance")) pass_("Performance data in initial snapshot"); else fail_("No performance", "");
    console.log(`  Title: ${t.match(/Title:\*\*\s*(.+)/)?.[1] ?? "?"}`);
  }

  if (!sessionId) { console.log("\n⛔ No session ID — aborting"); child.kill(); process.exit(1); }

  // ── 2. Login: type email ──────────────────────────────────────
  log("2. LOGIN — type email");
  {
    const result = await callTool("step", {
      session_id: sessionId,
      action: "type",
      target: '[name="officialEmail"]',
      value: EMAIL,
      thought: "Entering my email to log in",
      emotional_state: "neutral",
    }, 30_000);
    const t = text(result);
    if (t.includes("✅")) pass_("Email typed"); else fail_("Email type failed", t.slice(0, 200));
  }

  // ── 3. Login: type password ───────────────────────────────────
  log("3. LOGIN — type password");
  {
    const result = await callTool("step", {
      session_id: sessionId,
      action: "type",
      target: '[name="password"]',
      value: PASS,
      thought: "Entering my password",
      emotional_state: "neutral",
    }, 30_000);
    const t = text(result);
    if (t.includes("✅")) pass_("Password typed"); else fail_("Password type failed", t.slice(0, 200));
  }

  // ── 4. Login: click submit ────────────────────────────────────
  log("4. LOGIN — click sign in");
  {
    const result = await callTool("step", {
      session_id: sessionId,
      action: "click",
      target: "#gtmLoginStd",
      thought: "Clicking the sign in button",
      emotional_state: "curious",
    }, 30_000);
    const t = text(result);
    if (t.includes("✅")) pass_("Login button clicked"); else fail_("Click failed", t.slice(0, 200));
  }

  // ── 5. Wait for dashboard to load ─────────────────────────────
  log("5. WAIT — dashboard load");
  {
    const result = await callTool("step", {
      session_id: sessionId,
      action: "wait",
      scroll_amount: 5000,
      thought: "Waiting for the dashboard to load after login",
      emotional_state: "curious",
    }, 30_000);
    pass_("Waited 5s for dashboard");
  }

  // ── 6. Get page state (dashboard) ─────────────────────────────
  log("6. GET PAGE STATE — dashboard");
  {
    const result = await callTool("get_page_state", {
      session_id: sessionId,
    }, 30_000);
    const t = text(result);
    if (t.includes("coach.tetr.com")) pass_("On coach.tetr.com"); else fail_("Wrong URL", t.slice(0, 100));
    if (hasImage(result)) pass_("Dashboard screenshot"); else fail_("No screenshot", "");

    // Parse some data
    try {
      const data = JSON.parse(t);
      console.log(`  URL: ${data.url}`);
      console.log(`  Title: ${data.title}`);
      console.log(`  Headings: ${data.headings?.slice(0, 3).join(", ")}`);
      console.log(`  Buttons: ${data.buttons?.length}`);
      console.log(`  Links: ${data.links?.length}`);
      if (data.performance) console.log(`  LCP: ${data.performance.lcp?.toFixed(0)}ms (${data.performance.lcpRating})`);
      if (data.networkRequests) console.log(`  Network: ${data.networkRequests} requests, ${data.networkFailed} failed`);
      if (data.a11yScore !== undefined) console.log(`  A11y: ${data.a11yScore}/100, ${data.a11yViolations} violations`);
      if (data.consoleErrors) console.log(`  Console: ${data.consoleErrors} errors, ${data.consoleWarnings} warnings`);
    } catch {}
  }

  // ── 7. Accessibility audit on dashboard ───────────────────────
  log("7. ACCESSIBILITY AUDIT — dashboard");
  {
    const result = await callTool("accessibility_audit", {
      session_id: sessionId,
      wcag_level: "wcag2aa",
    }, 30_000);
    const t = text(result);
    if (t.includes("Score:")) pass_("Has accessibility score"); else fail_("No score", "");
    if (t.includes("Violations:")) pass_("Has violation details"); else fail_("No violations", "");

    // Extract score
    const scoreMatch = t.match(/Score:\*\*\s*(\d+)\/100/);
    if (scoreMatch) console.log(`  Score: ${scoreMatch[1]}/100`);
    const violMatch = t.match(/Violations:\*\*\s*(\d+)/);
    if (violMatch) console.log(`  Violations: ${violMatch[1]}`);

    // Print first few violations
    const violLines = t.split("\n").filter(l => l.includes("|") && !l.includes("---") && !l.includes("Impact"));
    for (const line of violLines.slice(0, 5)) {
      console.log(`  ${line.trim()}`);
    }
  }

  // ── 8. Inspect storage ────────────────────────────────────────
  log("8. INSPECT STORAGE — cookies & localStorage");
  {
    const result = await callTool("inspect_storage", {
      session_id: sessionId,
    }, 15_000);
    const t = text(result);
    if (t.includes("Cookies")) pass_("Cookie inspection"); else fail_("No cookies", "");
    if (t.includes("localStorage")) pass_("localStorage inspection"); else fail_("No localStorage", "");

    // Print summary
    const lines = t.split("\n").filter(l => l.includes("|") && !l.includes("---") && !l.includes("Storage"));
    for (const line of lines.slice(0, 8)) {
      console.log(`  ${line.trim()}`);
    }
  }

  // ── 9. Navigate to Academics ──────────────────────────────────
  log("9. NAVIGATE — Academics page");
  let dashboardScreenshot;
  {
    // Capture dashboard screenshot first for later comparison
    const dashState = await callTool("get_page_state", { session_id: sessionId }, 15_000);
    dashboardScreenshot = getImage(dashState);

    const result = await callTool("step", {
      session_id: sessionId,
      action: "navigate",
      value: "https://coach.tetr.com/academics",
      thought: "Navigating to see academic content",
      emotional_state: "curious",
    }, 30_000);
    const t = text(result);
    if (t.includes("✅")) pass_("Navigated to academics"); else fail_("Navigation failed", t.slice(0, 200));
    if (t.toLowerCase().includes("academic")) pass_("On academics page"); else console.log(`  (URL: ${t.match(/"url":\s*"([^"]+)"/)?.[1] ?? "?"})`);
  }

  // ── 10. A11y audit on academics ───────────────────────────────
  log("10. ACCESSIBILITY AUDIT — academics page");
  {
    const result = await callTool("accessibility_audit", {
      session_id: sessionId,
    }, 30_000);
    const t = text(result);
    const scoreMatch = t.match(/Score:\*\*\s*(\d+)\/100/);
    const violMatch = t.match(/Violations:\*\*\s*(\d+)/);
    if (scoreMatch) { pass_(`Score: ${scoreMatch[1]}/100`); } else fail_("No score", "");
    if (violMatch) console.log(`  Violations: ${violMatch[1]}`);
  }

  // ── 11. Navigate to Placements ────────────────────────────────
  log("11. NAVIGATE — Placements page");
  {
    const result = await callTool("step", {
      session_id: sessionId,
      action: "navigate",
      value: "https://coach.tetr.com/placements",
      thought: "Checking the placements section",
      emotional_state: "curious",
      friction: [{
        severity: "medium",
        description: "Navigation requires knowing the URL — no obvious menu link",
        suggestion: "Add a persistent sidebar or top nav with all sections",
      }],
    }, 30_000);
    const t = text(result);
    if (t.includes("✅")) pass_("Navigated to placements"); else fail_("Navigation failed", t.slice(0, 200));
  }

  // ── 12. Compare screenshots (dashboard vs placements) ─────────
  log("12. COMPARE SCREENSHOTS — dashboard vs placements");
  {
    const placementsState = await callTool("get_page_state", { session_id: sessionId }, 15_000);
    const placementsScreenshot = getImage(placementsState);

    if (dashboardScreenshot && placementsScreenshot) {
      const result = await callTool("compare_screenshots", {
        screenshot1: dashboardScreenshot,
        screenshot2: placementsScreenshot,
      }, 30_000);
      const t = text(result);
      if (t.includes("Match:")) pass_("Screenshot comparison"); else fail_("No match %", "");
      if (hasImage(result)) pass_("Diff overlay generated"); else fail_("No diff image", "");
      console.log(`  ${t.split("\n").filter(l => l.includes("Match") || l.includes("Different") || l.includes("Canvas")).join("\n  ")}`);
    } else {
      fail_("Screenshots", "Missing dashboard or placements screenshot");
    }
  }

  // ── 13. Export HAR ────────────────────────────────────────────
  log("13. EXPORT HAR — full session network log");
  {
    const result = await callTool("export_har", { session_id: sessionId }, 15_000);
    const t = text(result);
    try {
      const har = JSON.parse(t);
      if (har.log?.version === "1.2") pass_("Valid HAR 1.2"); else fail_("Invalid HAR", "");
      const entries = har.log?.entries?.length ?? 0;
      pass_(`${entries} network entries captured`);

      // Breakdown by resource type
      const types = {};
      for (const e of har.log.entries) {
        const url = e.request.url;
        const ext = url.split("?")[0].split(".").pop()?.slice(0, 10) ?? "other";
        types[ext] = (types[ext] ?? 0) + 1;
      }
      console.log(`  Resources: ${JSON.stringify(types)}`);

      // Failed requests
      const failedReqs = har.log.entries.filter(e => e.response.status >= 400 || e.response.status === 0);
      if (failedReqs.length > 0) {
        console.log(`  ⚠️ ${failedReqs.length} failed requests:`);
        for (const r of failedReqs.slice(0, 3)) {
          console.log(`    ${r.response.status} ${r.request.method} ${r.request.url.slice(0, 80)}`);
        }
      }
    } catch (e) {
      fail_("HAR parse", e.message);
    }
  }

  // ── 14. End session with HTML report ──────────────────────────
  log("14. END SESSION — HTML report");
  {
    const result = await callTool("end_session", {
      session_id: sessionId,
      goal_achieved: true,
      summary: "Tested login flow, dashboard, academics, placements. Captured Web Vitals, accessibility audits, network HAR, storage inspection, and screenshot diffs.",
      format: "html",
    }, 30_000);
    const t = text(result);
    if (t.includes("<!DOCTYPE html>")) pass_("Valid HTML report"); else fail_("Not HTML", "");
    if (t.includes("data:image/png;base64")) pass_("Embedded screenshots"); else fail_("No screenshots", "");
    if (t.includes("Friction Score")) pass_("Friction scoring"); else fail_("No friction", "");

    // Save report
    writeFileSync("reports/coach-tetr-v3-report.html", t);
    console.log(`  Saved: reports/coach-tetr-v3-report.html (${(t.length / 1024).toFixed(0)}KB)`);
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log(`${"═".repeat(60)}\n`);

  child.kill();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Fatal:", e);
  child?.kill();
  process.exit(1);
});
