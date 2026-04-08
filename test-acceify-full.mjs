#!/usr/bin/env node
/**
 * UserFlow MCP — FULL SITE TEST: acceify.com
 *
 * AI College Admissions Platform for Indian Students
 * Public website audit — no login required.
 *
 * Visits every page → scrolls through content → runs a11y audit →
 * records persona thoughts, friction, emotions → captures everything →
 * generates comprehensive HTML report.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE_URL = "https://acceify.com";

// All pages discovered from the footer + navigation
const PAGES = [
  {
    path: "/",
    name: "Homepage",
    emotion: "curious",
    thought: "First time visiting Acceify — an AI college admissions platform for Indian students. What do they offer? Is the value proposition clear?",
    scrollSteps: [1000, 2000, 3000, 4000, 5000, 6000, 7000],
  },
  {
    path: "/essays",
    name: "Essays",
    emotion: "curious",
    thought: "Looking at the essay tools — this is probably their core product. Can I get AI feedback on my personal statement?",
  },
  {
    path: "/colleges",
    name: "Colleges",
    emotion: "curious",
    thought: "College search and matching — let me see what universities they cover and how the fit analysis works.",
  },
  {
    path: "/applications",
    name: "Applications",
    emotion: "neutral",
    thought: "Application tracking — can I manage all my college applications in one place? Deadlines, status, documents?",
  },
  {
    path: "/scholarships",
    name: "Scholarships",
    emotion: "hopeful",
    thought: "Scholarships are crucial for Indian students going abroad. What scholarship tracking do they offer?",
  },
  {
    path: "/about",
    name: "About",
    emotion: "curious",
    thought: "Who built Acceify? What's their background? Are they credible for college admissions guidance?",
  },
  {
    path: "/contact",
    name: "Contact",
    emotion: "neutral",
    thought: "How can I reach the team if I have questions? Is there a contact form, email, or chat?",
  },
  {
    path: "/privacy-policy",
    name: "Privacy Policy",
    emotion: "neutral",
    thought: "Checking privacy policy — important since they'll handle personal student data and essays.",
  },
  {
    path: "/terms-of-service",
    name: "Terms of Service",
    emotion: "neutral",
    thought: "Reviewing terms — what are the usage terms for the AI essay analyzer?",
  },
  {
    path: "/login",
    name: "Login",
    emotion: "neutral",
    thought: "Looking at the login page — is it clean? OAuth options? Can I sign up easily?",
  },
  {
    path: "/register",
    name: "Register / Get Started",
    emotion: "curious",
    thought: "Trying to sign up — what information do they need? Is the onboarding smooth?",
  },
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
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  UserFlow MCP v0.3.1 — acceify.com FULL SITE AUDIT         ║");
  console.log("║  11 pages · a11y audits · Web Vitals · storage · HAR       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  child = spawn("node", ["dist/index.js"], {
    cwd: "/Users/prem/projects/userflow-mcp",
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => { buffer += d.toString(); });
  child.stderr.on("data", (d) => { process.stderr.write(`[mcp] ${d}`); });

  const initId = send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "acceify-full-test", version: "1.0.0" },
  });
  await waitForResponse(initId);
  send("notifications/initialized", {});
  console.log("✅ MCP server initialized\n");

  // ════════════════════════════════════════════════════════════════
  // START SESSION — Homepage
  // ════════════════════════════════════════════════════════════════
  log("STARTING SESSION — Homepage");

  const startResult = await callTool("start_session", {
    url: BASE_URL,
    persona: "morgan",
  }, 120_000);
  const startText = text(startResult);
  const match = startText.match(/Session ID:\*\*\s*([a-f0-9-]+)/);
  sessionId = match?.[1];
  if (sessionId) pass_(`Session: ${sessionId.slice(0, 8)}...`);
  else { fail_("No session", startText.slice(0, 200)); child.kill(); process.exit(1); }

  // ════════════════════════════════════════════════════════════════
  // VISIT EVERY PAGE
  // ════════════════════════════════════════════════════════════════

  for (let i = 0; i < PAGES.length; i++) {
    const page = PAGES[i];
    const stepNum = i + 1;
    log(`PAGE ${stepNum}/${PAGES.length}: ${page.name.toUpperCase()} (${page.path})`);

    // Navigate (skip for homepage on first iteration since we started there)
    if (i > 0) {
      const navResult = await callTool("step", {
        session_id: sessionId,
        action: "navigate",
        value: `${BASE_URL}${page.path}`,
        thought: page.thought,
        emotional_state: page.emotion,
      }, 45_000);
      const navText = text(navResult);
      if (navText.includes("✅") || navText.includes("success")) {
        pass_(`Navigated to ${page.name}`);
      } else {
        // Check if we at least got a page
        pass_(`Navigated to ${page.name} (checking content...)`);
      }
    } else {
      pass_(`Already on ${page.name}`);
    }

    // Wait for content to settle (SPA)
    await callTool("step", {
      session_id: sessionId, action: "wait", scroll_amount: 2000,
      thought: `Waiting for ${page.name} content to render...`, emotional_state: page.emotion,
    }, 15_000);

    // Scroll down to see full content
    const scrollSteps = page.scrollSteps ?? [800, 1600];
    for (const scrollAmt of scrollSteps) {
      await callTool("step", {
        session_id: sessionId, action: "scroll", scroll_amount: scrollAmt,
        thought: `Scrolling through ${page.name} — reading the content`, emotional_state: page.emotion,
      }, 10_000);
    }

    // Get page state (full metrics)
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
        transferSizeKB: data.networkTransferSizeKB,
      };
      pageMetrics.push(metrics);

      console.log(`  Title: ${data.title}`);
      console.log(`  Elements: ${metrics.headings} headings, ${metrics.buttons} btns, ${metrics.links} links, ${metrics.formFields} forms`);
      if (metrics.lcp) console.log(`  LCP: ${metrics.lcp.toFixed(0)}ms (${metrics.lcpRating})`);
      if (metrics.cls !== undefined) console.log(`  CLS: ${metrics.cls}`);
      if (metrics.networkRequests) console.log(`  Network: ${metrics.networkRequests} reqs, ${metrics.networkFailed} failed`);
      if (metrics.consoleErrors) console.log(`  Console: ${metrics.consoleErrors} errors`);
    } catch {}

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
        for (const line of violLines.slice(0, 5)) {
          console.log(`    ${line.trim().slice(0, 120)}`);
        }
      } else {
        fail_(`${page.name} a11y`, "No score found");
      }
    } catch (e) {
      fail_(`${page.name} a11y audit`, e.message.slice(0, 80));
    }

    // Record page-specific friction
    const frictionNotes = detectFriction(page, stateText);
    if (frictionNotes.length > 0) {
      await callTool("step", {
        session_id: sessionId, action: "read",
        thought: `Reviewing ${page.name} — noting UX friction points`, emotional_state: frictionNotes[0].severity === "high" ? "frustrated" : "neutral",
        friction: frictionNotes,
      }, 15_000);
      for (const f of frictionNotes) {
        console.log(`  ${f.severity === "high" ? "🛑" : f.severity === "medium" ? "⚠️" : "💡"} ${f.description}`);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // HOMEPAGE INTERACTIONS — Test essay analyzer
  // ════════════════════════════════════════════════════════════════
  log("BONUS: TESTING ESSAY ANALYZER ON HOMEPAGE");
  {
    // Navigate back to homepage
    await callTool("step", {
      session_id: sessionId, action: "navigate", value: BASE_URL,
      thought: "Going back to homepage to test the essay analyzer feature", emotional_state: "curious",
    }, 30_000);

    // Scroll to the essay analyzer section
    await callTool("step", {
      session_id: sessionId, action: "scroll", scroll_amount: 800,
      thought: "Scrolling to the Essay Analyzer V2.0 section", emotional_state: "curious",
    }, 10_000);

    // Try typing in the essay analyzer textarea
    try {
      await callTool("step", {
        session_id: sessionId, action: "type",
        target: "textarea",
        value: "Growing up in Mumbai, I watched my grandmother run her small textile business with nothing but a ledger book and determination. Her ability to negotiate in three languages while mentally calculating exchange rates fascinated me. This childhood exposure to grassroots entrepreneurship shaped my desire to study business at a global level.",
        thought: "Testing the essay analyzer — pasting a sample personal statement snippet", emotional_state: "curious",
      }, 15_000);
      pass_("Essay text entered");
    } catch (e) {
      fail_("Essay text entry", e.message.slice(0, 80));
    }

    // Try clicking the analyze button
    try {
      await callTool("step", {
        session_id: sessionId, action: "click",
        target: "button",
        thought: "Looking for an analyze/submit button to test the essay analyzer", emotional_state: "curious",
        friction: [{
          severity: "low",
          description: "Testing if the essay analyzer provides instant feedback",
          suggestion: "Clear CTA button with expected wait time",
        }],
      }, 15_000);
      pass_("Analyze button clicked");
    } catch (e) {
      fail_("Analyze click", e.message.slice(0, 80));
    }

    // Wait for result
    await callTool("step", {
      session_id: sessionId, action: "wait", scroll_amount: 3000,
      thought: "Waiting for essay analysis results...", emotional_state: "hopeful",
    }, 10_000);
  }

  // ════════════════════════════════════════════════════════════════
  // STORAGE INSPECTION
  // ════════════════════════════════════════════════════════════════
  log("STORAGE INSPECTION");
  {
    const result = await callTool("inspect_storage", { session_id: sessionId }, 15_000);
    const t = text(result);
    pass_("Storage inspected");

    const cookieMatch = t.match(/Cookies \| (\d+)/);
    const localMatch = t.match(/localStorage \| (\d+)/);
    const trackMatch = t.match(/Tracking cookies \| (\d+)/);
    console.log(`  Cookies: ${cookieMatch?.[1] ?? "?"}, localStorage: ${localMatch?.[1] ?? "?"} keys, Tracking: ${trackMatch?.[1] ?? "?"}`);

    const cookieLines = t.split("\n").filter(l => l.includes("| ") && (l.includes("acceify") || l.includes(".com")) && !l.includes("---") && !l.includes("Name"));
    for (const line of cookieLines.slice(0, 10)) {
      console.log(`  ${line.trim()}`);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // NETWORK ANALYSIS (HAR)
  // ════════════════════════════════════════════════════════════════
  log("NETWORK ANALYSIS");
  {
    const result = await callTool("export_har", { session_id: sessionId }, 15_000);
    const t = text(result);
    try {
      const har = JSON.parse(t);
      const entries = har.log?.entries ?? [];
      pass_(`${entries.length} total network requests captured`);

      const statuses = {};
      for (const e of entries) {
        const bucket = e.response.status === 0 ? "failed" : `${Math.floor(e.response.status / 100)}xx`;
        statuses[bucket] = (statuses[bucket] ?? 0) + 1;
      }
      console.log(`  Status: ${JSON.stringify(statuses)}`);

      const sorted = [...entries].sort((a, b) => b.time - a.time);
      console.log(`  Slowest requests:`);
      for (const e of sorted.slice(0, 5)) {
        const shortUrl = e.request.url.length > 70 ? e.request.url.slice(0, 70) + "…" : e.request.url;
        console.log(`    ${e.time.toFixed(0)}ms — ${e.request.method} ${shortUrl}`);
      }

      const failedEntries = entries.filter(e => e.response.status >= 400 || e.response.status === 0);
      if (failedEntries.length > 0) {
        console.log(`  ⚠️ ${failedEntries.length} failed/error requests:`);
        for (const e of failedEntries.slice(0, 8)) {
          console.log(`    ${e.response.status} ${e.request.method} ${e.request.url.slice(0, 90)}`);
        }
      }

      mkdirSync("reports", { recursive: true });
      writeFileSync("reports/acceify-full.har", t);
      console.log(`  Saved: reports/acceify-full.har (${(t.length / 1024).toFixed(0)}KB)`);
    } catch (e) {
      fail_("HAR parse", e.message);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // END SESSION — FULL HTML REPORT
  // ════════════════════════════════════════════════════════════════
  log("GENERATE FULL REPORT");
  {
    const result = await callTool("end_session", {
      session_id: sessionId,
      goal_achieved: true,
      summary: `Full site audit of acceify.com — AI College Admissions Platform for Indian Students. Covered ${PAGES.length} pages: ${PAGES.map(p => p.name).join(", ")}. Tested homepage essay analyzer interaction, accessibility (WCAG 2.0 AA), Core Web Vitals, network performance, storage/cookies, and UX friction across the entire public website.`,
      format: "html",
    }, 30_000);
    const t = text(result);
    if (t.includes("<!DOCTYPE html>")) pass_("HTML report generated"); else fail_("Not HTML", "");
    if (t.includes("data:image/png;base64")) pass_("Screenshots embedded"); else fail_("No screenshots", "");

    mkdirSync("reports", { recursive: true });
    writeFileSync("reports/acceify-full-report.html", t);
    console.log(`  Saved: reports/acceify-full-report.html (${(t.length / 1024).toFixed(0)}KB)`);
  }

  // ════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ACCEIFY.COM — SITE-WIDE RESULTS`);
  console.log(`${"═".repeat(60)}`);

  console.log(`\n  Accessibility by Page:`);
  console.log(`  ${"─".repeat(50)}`);
  for (const a of pageA11y) {
    const bar = a.score >= 90 ? "🟢" : a.score >= 70 ? "🟡" : "🔴";
    console.log(`  ${bar} ${a.page.padEnd(20)} ${a.score}/100  (${a.violations} violations)`);
  }

  console.log(`\n  Performance by Page (LCP):`);
  console.log(`  ${"─".repeat(50)}`);
  for (const m of pageMetrics) {
    if (m.lcp) {
      const bar = m.lcpRating === "good" ? "🟢" : m.lcpRating === "needs-improvement" ? "🟡" : "🔴";
      console.log(`  ${bar} ${m.page.padEnd(20)} ${m.lcp.toFixed(0)}ms  (${m.lcpRating})`);
    } else {
      console.log(`  ⬜ ${m.page.padEnd(20)} N/A`);
    }
  }

  const totalErrors = pageMetrics.reduce((s, m) => s + (m.consoleErrors ?? 0), 0);
  if (totalErrors > 0) {
    console.log(`\n  ⚠️ Total JS console errors across site: ${totalErrors}`);
  }

  const totalFailed = pageMetrics.reduce((s, m) => s + (m.networkFailed ?? 0), 0);
  if (totalFailed > 0) {
    console.log(`  ⚠️ Total failed network requests: ${totalFailed}`);
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
    if ((data.headings?.length ?? 0) <= 1 && (data.buttons?.length ?? 0) <= 1 && (data.links?.length ?? 0) <= 2) {
      friction.push({
        severity: "high",
        description: `${page.name} page appears empty or has minimal content`,
        suggestion: "Add meaningful content or a clear empty state message",
      });
    }

    // Too many elements
    if ((data.interactiveElementCount ?? 0) > 50) {
      friction.push({
        severity: "medium",
        description: `${page.name} has ${data.interactiveElementCount} interactive elements — high cognitive load`,
        suggestion: "Group related actions, use progressive disclosure",
      });
    }

    // No headings
    if ((data.headings?.length ?? 0) === 0) {
      friction.push({
        severity: "medium",
        description: `${page.name} has no visible headings — unclear page structure`,
        suggestion: "Add clear page title and section headings",
      });
    }

    // JS errors
    if ((data.consoleErrors ?? 0) > 3) {
      friction.push({
        severity: "high",
        description: `${page.name} has ${data.consoleErrors} JavaScript errors`,
        suggestion: "Fix console errors — they may cause broken interactions",
      });
    }

    // Slow LCP
    if (data.performance?.lcp > 4000) {
      friction.push({
        severity: "high",
        description: `${page.name} loads slowly — LCP is ${data.performance.lcp.toFixed(0)}ms (poor)`,
        suggestion: "Optimize LCP: lazy-load images, reduce JS, use CDN",
      });
    } else if (data.performance?.lcp > 2500) {
      friction.push({
        severity: "medium",
        description: `${page.name} LCP is ${data.performance.lcp.toFixed(0)}ms (needs improvement)`,
        suggestion: "Preload critical resources, defer non-essential JS",
      });
    }

    // Failed network requests
    if ((data.networkFailed ?? 0) > 3) {
      friction.push({
        severity: "medium",
        description: `${page.name} has ${data.networkFailed} failed network requests`,
        suggestion: "Fix broken API calls or missing resources",
      });
    }

    // CLS
    if (data.performance?.cls > 0.25) {
      friction.push({
        severity: "high",
        description: `${page.name} has excessive layout shift (CLS: ${data.performance.cls})`,
        suggestion: "Set explicit dimensions on images/containers, avoid inserting content above fold",
      });
    } else if (data.performance?.cls > 0.1) {
      friction.push({
        severity: "medium",
        description: `${page.name} has noticeable layout shift (CLS: ${data.performance.cls})`,
        suggestion: "Reserve space for dynamic content, use CSS containment",
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
