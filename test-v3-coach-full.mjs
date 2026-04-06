#!/usr/bin/env node
/**
 * v0.3.0 FULL SITE TEST — coach.tetr.com
 *
 * Logs in → visits every section → runs a11y audit on each page →
 * records persona thoughts, friction, emotions → captures everything →
 * generates comprehensive HTML report.
 */

import { spawn, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const LOGIN_URL = "https://coach.tetr.com/login";
const EMAIL = execSync(`${process.env.HOME}/MCPs/autopilot/bin/keychain.sh get coach-tetr email`, { encoding: "utf-8" }).trim();
const PASS = execSync(`${process.env.HOME}/MCPs/autopilot/bin/keychain.sh get coach-tetr password`, { encoding: "utf-8" }).trim();

// All known pages on coach.tetr.com
const PAGES = [
  { path: "/", name: "Dashboard", emotion: "curious", thought: "Just logged in. Let me see what's on my dashboard — grades, upcoming events, any notifications?" },
  { path: "/academics", name: "Academics", emotion: "curious", thought: "Let me check my academic progress — courses, grades, GPA breakdown." },
  { path: "/capstone", name: "Capstone", emotion: "neutral", thought: "What's the capstone project section? Any submissions or milestones to track?" },
  { path: "/placements", name: "Placements", emotion: "anxious", thought: "Placements — the most important thing. Are there job listings? Interview schedules? My application status?" },
  { path: "/events", name: "Events", emotion: "curious", thought: "Are there any upcoming events? Workshops, webinars, campus activities?" },
  { path: "/announcements", name: "Announcements", emotion: "neutral", thought: "Any announcements from faculty or administration?" },
  { path: "/repository", name: "Repository", emotion: "curious", thought: "What's in the repository? Study materials, past papers, resources?" },
  { path: "/support", name: "Support", emotion: "confused", thought: "If I need help, how do I reach support? Is there a ticket system, chat, or just a form?" },
];

let child, buffer = "", sessionId = null;
let passed = 0, failed = 0;
const pageA11y = [];
const pageMetrics = [];

// ── JSON-RPC ────────────────────────────────────────────────────

function send(method, params = {}) {
  const id = randomUUID();
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return id;
}

function waitForResponse(id, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${id}`)), timeoutMs);
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
  if (resp.error) throw new Error(`${name}: ${resp.error.message}`);
  return resp.result;
}

function text(r) { return r.content?.filter(c => c.type === "text").map(c => c.text).join("\n") ?? ""; }
function hasImage(r) { return r.content?.some(c => c.type === "image") ?? false; }

function log(label) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"─".repeat(60)}`);
}
function pass_(t) { console.log(`  ✅ ${t}`); passed++; }
function fail_(t, r) { console.log(`  ❌ ${t}: ${r}`); failed++; }

// ── Main ────────────────────────────────────────────────────────

async function run() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  UserFlow MCP v0.3.0 — coach.tetr.com FULL SITE TEST   ║");
  console.log("║  8 pages · a11y audits · Web Vitals · storage · HAR    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  child = spawn("node", ["dist/index.js"], {
    cwd: "/Users/prem/projects/userflow-mcp",
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => { buffer += d.toString(); });
  child.stderr.on("data", (d) => { process.stderr.write(`[mcp] ${d}`); });

  const initId = send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "coach-full-test", version: "1.0.0" },
  });
  await waitForResponse(initId);
  send("notifications/initialized", {});
  console.log("✅ MCP server initialized\n");

  // ════════════════════════════════════════════════════════════════
  // PHASE 1: LOGIN
  // ════════════════════════════════════════════════════════════════
  log("PHASE 1: LOGIN");

  // Start session
  const startResult = await callTool("start_session", { url: LOGIN_URL, persona: "morgan" }, 120_000);
  const startText = text(startResult);
  const match = startText.match(/Session ID:\*\*\s*([a-f0-9-]+)/);
  sessionId = match?.[1];
  if (sessionId) pass_(`Session: ${sessionId.slice(0, 8)}...`); else { fail_("No session", ""); child.kill(); process.exit(1); }

  // Type email
  await callTool("step", {
    session_id: sessionId, action: "type", target: '[name="officialEmail"]', value: EMAIL,
    thought: "Entering my college email to log into the coaching platform", emotional_state: "neutral",
  }, 30_000);
  pass_("Email entered");

  // Type password
  await callTool("step", {
    session_id: sessionId, action: "type", target: '[name="password"]', value: PASS,
    thought: "Typing my password", emotional_state: "neutral",
  }, 30_000);
  pass_("Password entered");

  // Click login
  await callTool("step", {
    session_id: sessionId, action: "click", target: "#gtmLoginStd",
    thought: "Clicking sign in — hope it loads fast", emotional_state: "curious",
    friction: [{
      severity: "low",
      description: "Login page is straightforward with clear email/password fields",
      suggestion: "Consider adding SSO/Google login for convenience",
    }],
  }, 30_000);
  pass_("Login clicked");

  // Wait for dashboard
  await callTool("step", {
    session_id: sessionId, action: "wait", scroll_amount: 6000,
    thought: "Waiting for the dashboard to fully load...", emotional_state: "neutral",
  }, 30_000);
  pass_("Dashboard loaded");

  // ════════════════════════════════════════════════════════════════
  // PHASE 2: VISIT EVERY PAGE
  // ════════════════════════════════════════════════════════════════

  for (let i = 0; i < PAGES.length; i++) {
    const page = PAGES[i];
    const stepNum = i + 1;
    log(`PHASE 2.${stepNum}: ${page.name.toUpperCase()} (${page.path})`);

    // Navigate
    const navResult = await callTool("step", {
      session_id: sessionId,
      action: "navigate",
      value: `https://coach.tetr.com${page.path}`,
      thought: page.thought,
      emotional_state: page.emotion,
    }, 45_000);
    const navText = text(navResult);
    if (navText.includes("✅")) pass_(`Navigated to ${page.name}`); else fail_(`Navigation to ${page.name}`, navText.slice(0, 100));

    // Wait for content to settle (SPA)
    await callTool("step", {
      session_id: sessionId, action: "wait", scroll_amount: 2000,
      thought: `Waiting for ${page.name} content to render...`, emotional_state: page.emotion,
    }, 15_000);

    // Get page state (with full metrics)
    const stateResult = await callTool("get_page_state", { session_id: sessionId }, 30_000);
    const stateText = text(stateResult);
    if (hasImage(stateResult)) pass_(`${page.name} screenshot captured`); else fail_(`${page.name} screenshot`, "");

    // Parse metrics
    try {
      const data = JSON.parse(stateText);
      const metrics = {
        page: page.name,
        url: data.url,
        title: data.title,
        headings: data.headings?.length ?? 0,
        buttons: data.buttons?.length ?? 0,
        links: data.links?.length ?? 0,
        formFields: data.formFields?.length ?? 0,
        interactive: data.interactiveElementCount ?? 0,
        lcp: data.performance?.lcp,
        lcpRating: data.performance?.lcpRating,
        cls: data.performance?.cls,
        fcp: data.performance?.fcp,
        ttfb: data.performance?.ttfb,
        resources: data.performance?.resourceCount,
        networkRequests: data.networkRequests,
        networkFailed: data.networkFailed,
        consoleErrors: data.consoleErrors ?? 0,
        consoleWarnings: data.consoleWarnings ?? 0,
      };
      pageMetrics.push(metrics);

      console.log(`  Title: ${data.title}`);
      console.log(`  Elements: ${metrics.buttons} buttons, ${metrics.links} links, ${metrics.formFields} forms`);
      if (metrics.lcp) console.log(`  LCP: ${metrics.lcp.toFixed(0)}ms (${metrics.lcpRating})`);
      if (metrics.networkRequests) console.log(`  Network: ${metrics.networkRequests} reqs, ${metrics.networkFailed} failed`);
      if (metrics.consoleErrors) console.log(`  Console: ${metrics.consoleErrors} errors`);
    } catch {}

    // Scroll down to see more content
    await callTool("step", {
      session_id: sessionId, action: "scroll", scroll_amount: 600,
      thought: `Scrolling to see the full ${page.name} page content`, emotional_state: page.emotion,
    }, 15_000);

    // Run accessibility audit
    try {
      const a11yResult = await callTool("accessibility_audit", {
        session_id: sessionId, wcag_level: "wcag2aa",
      }, 30_000);
      const a11yText = text(a11yResult);
      const scoreMatch = a11yText.match(/Score:\*\*\s*(\d+)\/100/);
      const violMatch = a11yText.match(/Violations:\*\*\s*(\d+)/);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
      const violations = violMatch ? parseInt(violMatch[1]) : null;

      if (score !== null) {
        pass_(`A11y: ${score}/100, ${violations} violations`);
        pageA11y.push({ page: page.name, score, violations });

        // Print critical/serious violations
        const violLines = a11yText.split("\n").filter(l => l.includes("| serious") || l.includes("| critical"));
        for (const line of violLines.slice(0, 3)) {
          console.log(`  ${line.trim().slice(0, 120)}`);
        }
      } else {
        fail_(`${page.name} a11y`, "No score");
      }
    } catch (e) {
      fail_(`${page.name} a11y audit`, e.message.slice(0, 80));
    }

    // Record page-specific friction
    const frictionNotes = detectFriction(page, stateText);
    if (frictionNotes.length > 0) {
      await callTool("step", {
        session_id: sessionId, action: "read",
        thought: `Reviewing ${page.name} — noting friction points`, emotional_state: frictionNotes[0].severity === "high" ? "frustrated" : "neutral",
        friction: frictionNotes,
      }, 15_000);
      for (const f of frictionNotes) {
        console.log(`  ${f.severity === "high" ? "🛑" : f.severity === "medium" ? "⚠️" : "💡"} ${f.description}`);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // PHASE 3: STORAGE INSPECTION
  // ════════════════════════════════════════════════════════════════
  log("PHASE 3: STORAGE INSPECTION");
  {
    const result = await callTool("inspect_storage", { session_id: sessionId }, 15_000);
    const t = text(result);
    pass_("Storage inspected");

    const cookieMatch = t.match(/Cookies \| (\d+)/);
    const localMatch = t.match(/localStorage \| (\d+)/);
    const trackMatch = t.match(/Tracking cookies \| (\d+)/);
    console.log(`  Cookies: ${cookieMatch?.[1] ?? "?"}, localStorage: ${localMatch?.[1] ?? "?"} keys, Tracking: ${trackMatch?.[1] ?? "?"}`);

    // Print cookie list
    const cookieLines = t.split("\n").filter(l => l.includes("| ") && l.includes("tetr.com") && !l.includes("---"));
    for (const line of cookieLines.slice(0, 10)) {
      console.log(`  ${line.trim()}`);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // PHASE 4: NETWORK ANALYSIS (HAR)
  // ════════════════════════════════════════════════════════════════
  log("PHASE 4: NETWORK ANALYSIS");
  {
    const result = await callTool("export_har", { session_id: sessionId }, 15_000);
    const t = text(result);
    try {
      const har = JSON.parse(t);
      const entries = har.log?.entries ?? [];
      pass_(`${entries.length} total network requests captured`);

      // Status breakdown
      const statuses = {};
      for (const e of entries) {
        const bucket = e.response.status === 0 ? "failed" : `${Math.floor(e.response.status / 100)}xx`;
        statuses[bucket] = (statuses[bucket] ?? 0) + 1;
      }
      console.log(`  Status: ${JSON.stringify(statuses)}`);

      // Slowest
      const sorted = [...entries].sort((a, b) => b.time - a.time);
      console.log(`  Slowest requests:`);
      for (const e of sorted.slice(0, 5)) {
        const shortUrl = e.request.url.length > 70 ? e.request.url.slice(0, 70) + "…" : e.request.url;
        console.log(`    ${e.time.toFixed(0)}ms — ${e.request.method} ${shortUrl}`);
      }

      // Failed
      const failedEntries = entries.filter(e => e.response.status >= 400 || e.response.status === 0);
      if (failedEntries.length > 0) {
        console.log(`  ⚠️ ${failedEntries.length} failed/error requests:`);
        for (const e of failedEntries.slice(0, 5)) {
          console.log(`    ${e.response.status} ${e.request.method} ${e.request.url.slice(0, 80)}`);
        }
      }

      // Save HAR
      writeFileSync("reports/coach-tetr-v3.har", t);
      console.log(`  Saved: reports/coach-tetr-v3.har (${(t.length / 1024).toFixed(0)}KB)`);
    } catch (e) {
      fail_("HAR parse", e.message);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // PHASE 5: END SESSION — FULL HTML REPORT
  // ════════════════════════════════════════════════════════════════
  log("PHASE 5: GENERATE FULL REPORT");
  {
    const result = await callTool("end_session", {
      session_id: sessionId,
      goal_achieved: true,
      summary: `Full site audit of coach.tetr.com covering ${PAGES.length} pages: ${PAGES.map(p => p.name).join(", ")}. Tested login flow, accessibility (WCAG 2.0 AA), Core Web Vitals, network performance, storage/cookies, and UX friction across the entire student portal.`,
      format: "html",
    }, 30_000);
    const t = text(result);
    if (t.includes("<!DOCTYPE html>")) pass_("HTML report generated"); else fail_("Not HTML", "");
    if (t.includes("data:image/png;base64")) pass_("Screenshots embedded"); else fail_("No screenshots", "");

    writeFileSync("reports/coach-tetr-v3-full-report.html", t);
    console.log(`  Saved: reports/coach-tetr-v3-full-report.html (${(t.length / 1024).toFixed(0)}KB)`);
  }

  // ════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  SITE-WIDE RESULTS`);
  console.log(`${"═".repeat(60)}`);

  // A11y summary
  console.log(`\n  Accessibility by Page:`);
  console.log(`  ${"─".repeat(50)}`);
  for (const a of pageA11y) {
    const bar = a.score >= 90 ? "🟢" : a.score >= 70 ? "🟡" : "🔴";
    console.log(`  ${bar} ${a.page.padEnd(16)} ${a.score}/100  (${a.violations} violations)`);
  }

  // Performance summary
  console.log(`\n  Performance by Page (LCP):`);
  console.log(`  ${"─".repeat(50)}`);
  for (const m of pageMetrics) {
    if (m.lcp) {
      const bar = m.lcpRating === "good" ? "🟢" : m.lcpRating === "needs-improvement" ? "🟡" : "🔴";
      console.log(`  ${bar} ${m.page.padEnd(16)} ${m.lcp.toFixed(0)}ms  (${m.lcpRating})`);
    }
  }

  // Console errors
  const totalErrors = pageMetrics.reduce((s, m) => s + (m.consoleErrors ?? 0), 0);
  if (totalErrors > 0) {
    console.log(`\n  ⚠️ Total JS console errors across site: ${totalErrors}`);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  TESTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log(`${"═".repeat(60)}\n`);

  child.kill();
  process.exit(failed > 0 ? 1 : 0);
}

// ── Friction detection heuristics ───────────────────────────────

function detectFriction(page, stateText) {
  const friction = [];
  try {
    const data = JSON.parse(stateText);

    // Empty page
    if ((data.headings?.length ?? 0) <= 1 && (data.buttons?.length ?? 0) <= 2) {
      friction.push({
        severity: "high",
        description: `${page.name} page appears empty or has minimal content`,
        suggestion: "Add meaningful content, onboarding guidance, or empty state messaging",
      });
    }

    // Too many elements (cognitive overload)
    if ((data.interactiveElementCount ?? 0) > 50) {
      friction.push({
        severity: "medium",
        description: `${page.name} has ${data.interactiveElementCount} interactive elements — high cognitive load`,
        suggestion: "Group related actions, use progressive disclosure, or collapse secondary actions",
      });
    }

    // No headings (unclear page purpose)
    if ((data.headings?.length ?? 0) === 0) {
      friction.push({
        severity: "medium",
        description: `${page.name} has no visible headings — page purpose unclear`,
        suggestion: "Add a clear page title and section headings for scannability",
      });
    }

    // JS errors
    if ((data.consoleErrors ?? 0) > 3) {
      friction.push({
        severity: "high",
        description: `${page.name} has ${data.consoleErrors} JavaScript errors in console`,
        suggestion: "Fix console errors — they may cause broken interactions or visual glitches",
      });
    }

    // Slow LCP
    if (data.performance?.lcp > 4000) {
      friction.push({
        severity: "high",
        description: `${page.name} loads slowly — LCP is ${data.performance.lcp.toFixed(0)}ms (poor)`,
        suggestion: "Optimize largest contentful paint: lazy-load images, reduce JS bundle, use CDN",
      });
    } else if (data.performance?.lcp > 2500) {
      friction.push({
        severity: "medium",
        description: `${page.name} LCP is ${data.performance.lcp.toFixed(0)}ms (needs improvement)`,
        suggestion: "Optimize LCP by preloading critical resources and deferring non-essential JS",
      });
    }

    // Failed network requests
    if ((data.networkFailed ?? 0) > 3) {
      friction.push({
        severity: "medium",
        description: `${page.name} has ${data.networkFailed} failed network requests`,
        suggestion: "Fix broken API calls or resources — failed requests may cause missing content",
      });
    }
  } catch {}
  return friction;
}

run().catch((e) => {
  console.error("Fatal:", e);
  child?.kill();
  process.exit(1);
});
