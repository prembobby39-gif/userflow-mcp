#!/usr/bin/env node
/**
 * UserFlow MCP — Full UX Audit on http://localhost:3099/profile
 * Persona: Morgan (desktop power user)
 *
 * Flow: start_session → get_page_state → accessibility_audit (wcag2aa) →
 *       inspect_storage → scroll down → get_page_state → export_har → end_session (HTML)
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TARGET_URL = "http://localhost:3099/profile";
const PROJECT_DIR = "/Users/prem/projects/userflow-mcp";
const REPORTS_DIR = join(PROJECT_DIR, "reports");

let child;
let buffer = "";
let sessionId = null;
let passed = 0;
let failed = 0;

// ── JSON-RPC helpers ────────────────────────────────────────────

function send(method, params = {}) {
  const id = randomUUID();
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  child.stdin.write(msg + "\n");
  return id;
}

function waitForResponse(id, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timeout waiting for response to ${id}`)),
      timeoutMs
    );
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
  return (
    result.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n") ?? ""
  );
}

function hasImage(result) {
  return result.content?.some((c) => c.type === "image") ?? false;
}

function log(label) {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(64)}`);
}

function pass_(t) {
  console.log(`  PASS  ${t}`);
  passed++;
}

function fail_(t, reason = "") {
  console.log(`  FAIL  ${t}${reason ? ": " + reason : ""}`);
  failed++;
}

// ── Main ────────────────────────────────────────────────────────

async function run() {
  console.log("UserFlow MCP — localhost:3099/profile Full Audit");
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Persona: Morgan (desktop power user)\n`);

  // Ensure reports dir exists
  mkdirSync(REPORTS_DIR, { recursive: true });

  // Spawn MCP server
  child = spawn("node", ["dist/index.js"], {
    cwd: PROJECT_DIR,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => {
    buffer += d.toString();
  });
  child.stderr.on("data", (d) => {
    process.stderr.write(`[mcp] ${d}`);
  });
  child.on("error", (e) => {
    console.error("Child process error:", e);
  });

  // ── Initialize MCP ──────────────────────────────────────────
  const initId = send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-localhost-profile-audit", version: "1.0.0" },
  });
  await waitForResponse(initId);
  send("notifications/initialized", {});
  console.log("MCP server initialized\n");

  // ── 1. Start session ────────────────────────────────────────
  log("1. START SESSION — localhost:3099/profile (Morgan persona)");
  {
    let result;
    try {
      result = await callTool(
        "start_session",
        {
          url: TARGET_URL,
          persona: "Morgan",
        },
        120_000
      );
    } catch (e) {
      fail_("start_session threw", e.message);
      console.log("\nAborting — cannot proceed without a session.");
      child.kill();
      process.exit(1);
    }

    const t = text(result);

    // Extract session ID
    const match = t.match(/Session ID:\*\*\s*([a-f0-9-]+)/);
    sessionId = match?.[1];
    if (sessionId) {
      pass_(`Session created: ${sessionId.slice(0, 8)}...`);
    } else {
      fail_("No session ID found in response", t.slice(0, 300));
    }

    if (hasImage(result)) pass_("Initial screenshot captured");
    else fail_("No screenshot in start_session response");

    if (t.includes("Morgan")) pass_("Morgan persona loaded");
    else fail_("Morgan persona not in response");

    if (t.includes("a11yScore") || t.includes("A11y") || t.includes("accessibility")) {
      pass_("Accessibility data in initial snapshot");
    } else {
      fail_("No accessibility data in snapshot");
    }

    if (t.includes("networkRequests") || t.includes("Network") || t.includes("network")) {
      pass_("Network data in initial snapshot");
    } else {
      fail_("No network data in snapshot");
    }

    // Log title
    const titleMatch = t.match(/Title:\*\*\s*(.+)/);
    if (titleMatch) console.log(`  Page title: ${titleMatch[1].trim()}`);
  }

  if (!sessionId) {
    console.log("\nAborting — no session ID.");
    child.kill();
    process.exit(1);
  }

  // ── 2. Get page state ───────────────────────────────────────
  log("2. GET PAGE STATE — initial");
  {
    let result;
    try {
      result = await callTool("get_page_state", { session_id: sessionId }, 30_000);
    } catch (e) {
      fail_("get_page_state threw", e.message);
      result = null;
    }

    if (result) {
      const t = text(result);
      if (t.includes("3099") || t.includes("profile")) {
        pass_("Confirmed on localhost:3099/profile");
      } else {
        fail_("URL not confirmed", t.slice(0, 150));
      }

      if (hasImage(result)) pass_("Page state screenshot");
      else fail_("No screenshot in page state");

      // Try to parse JSON state
      try {
        const data = JSON.parse(t);
        console.log(`  URL: ${data.url ?? "?"}`);
        console.log(`  Title: ${data.title ?? "?"}`);
        if (data.headings?.length) {
          console.log(`  Headings: ${data.headings.slice(0, 4).join(" | ")}`);
        }
        if (data.buttons !== undefined) console.log(`  Buttons: ${data.buttons?.length ?? 0}`);
        if (data.links !== undefined) console.log(`  Links: ${data.links?.length ?? 0}`);
        if (data.performance?.lcp !== undefined) {
          console.log(
            `  LCP: ${data.performance.lcp.toFixed(0)}ms (${data.performance.lcpRating ?? "?"})`
          );
        }
        if (data.a11yScore !== undefined) {
          console.log(`  A11y score: ${data.a11yScore}/100 (${data.a11yViolations} violations)`);
        }
        if (data.consoleErrors !== undefined) {
          console.log(
            `  Console: ${data.consoleErrors} errors, ${data.consoleWarnings ?? 0} warnings`
          );
        }
      } catch {
        // Not JSON — just log a snippet
        console.log(`  State (text): ${t.slice(0, 200)}`);
      }
    }
  }

  // ── 3. Accessibility audit ──────────────────────────────────
  log("3. ACCESSIBILITY AUDIT — wcag2aa");
  let a11yScore = null;
  let a11yViolations = null;
  {
    let result;
    try {
      result = await callTool(
        "accessibility_audit",
        { session_id: sessionId, wcag_level: "wcag2aa" },
        60_000
      );
    } catch (e) {
      fail_("accessibility_audit threw", e.message);
      result = null;
    }

    if (result) {
      const t = text(result);

      if (t.includes("Score:")) pass_("Accessibility score present");
      else fail_("No accessibility score");

      if (t.includes("Violations:") || t.includes("violation")) {
        pass_("Violations section present");
      } else {
        fail_("No violations section");
      }

      // Extract score
      const scoreMatch = t.match(/Score:\*\*\s*(\d+)\/100/);
      if (scoreMatch) {
        a11yScore = parseInt(scoreMatch[1], 10);
        console.log(`  A11y Score: ${a11yScore}/100`);
      }

      const violMatch = t.match(/Violations:\*\*\s*(\d+)/);
      if (violMatch) {
        a11yViolations = parseInt(violMatch[1], 10);
        console.log(`  Violations: ${a11yViolations}`);
      }

      // Print top violations
      const violLines = t
        .split("\n")
        .filter((l) => l.includes("|") && !l.includes("---") && !l.includes("Impact"));
      for (const line of violLines.slice(0, 6)) {
        console.log(`  ${line.trim()}`);
      }
    }
  }

  // ── 4. Inspect storage ──────────────────────────────────────
  log("4. INSPECT STORAGE — cookies, localStorage, sessionStorage");
  {
    let result;
    try {
      result = await callTool("inspect_storage", { session_id: sessionId }, 30_000);
    } catch (e) {
      fail_("inspect_storage threw", e.message);
      result = null;
    }

    if (result) {
      const t = text(result);

      if (t.includes("Cookies") || t.includes("cookie")) {
        pass_("Cookie data found");
      } else {
        fail_("No cookie data");
      }

      if (t.includes("localStorage") || t.includes("local storage")) {
        pass_("localStorage data found");
      } else {
        fail_("No localStorage data");
      }

      // Print storage summary lines
      const lines = t
        .split("\n")
        .filter((l) => l.includes("|") && !l.includes("---") && !l.includes("Storage"));
      console.log(`  Storage entries (first 8):`);
      for (const line of lines.slice(0, 8)) {
        console.log(`    ${line.trim()}`);
      }

      // Check for auth tokens / session cookies
      if (t.toLowerCase().includes("token") || t.toLowerCase().includes("session")) {
        console.log(`  Auth/session data detected`);
      }
    }
  }

  // ── 5. Scroll down ──────────────────────────────────────────
  log("5. SCROLL DOWN — 800px to reveal more content");
  {
    let result;
    try {
      result = await callTool(
        "step",
        {
          session_id: sessionId,
          action: "scroll",
          scroll_amount: 800,
          thought: "As Morgan I scroll down to see the full profile page and look for advanced features, API links, settings, or dev tools.",
          emotional_state: "curious",
        },
        30_000
      );
    } catch (e) {
      fail_("scroll step threw", e.message);
      result = null;
    }

    if (result) {
      const t = text(result);
      if (t.includes("✅") || t.includes("scroll") || hasImage(result)) {
        pass_("Scroll action executed");
      } else {
        fail_("Scroll may have failed", t.slice(0, 150));
      }
      if (hasImage(result)) pass_("Post-scroll screenshot captured");
      else fail_("No screenshot after scroll");
    }
  }

  // ── 6. Get page state after scroll ─────────────────────────
  log("6. GET PAGE STATE — after scroll");
  {
    let result;
    try {
      result = await callTool("get_page_state", { session_id: sessionId }, 30_000);
    } catch (e) {
      fail_("get_page_state (post-scroll) threw", e.message);
      result = null;
    }

    if (result) {
      const t = text(result);

      if (hasImage(result)) pass_("Post-scroll page state screenshot");
      else fail_("No screenshot in post-scroll state");

      // Parse updated state
      try {
        const data = JSON.parse(t);
        console.log(`  URL: ${data.url ?? "?"}`);
        if (data.scrollY !== undefined) console.log(`  ScrollY: ${data.scrollY}px`);
        if (data.performance?.lcp !== undefined) {
          console.log(`  LCP: ${data.performance.lcp.toFixed(0)}ms`);
        }
        pass_("Post-scroll page state parsed");
      } catch {
        if (t.length > 50) pass_("Post-scroll page state received (non-JSON)");
        else fail_("Post-scroll page state empty");
        console.log(`  State snippet: ${t.slice(0, 200)}`);
      }
    }
  }

  // ── 7. Export HAR ───────────────────────────────────────────
  log("7. EXPORT HAR — network capture");
  let harData = null;
  {
    let result;
    try {
      result = await callTool("export_har", { session_id: sessionId }, 30_000);
    } catch (e) {
      fail_("export_har threw", e.message);
      result = null;
    }

    if (result) {
      const t = text(result);
      try {
        harData = JSON.parse(t);
        if (harData.log?.version === "1.2") {
          pass_("Valid HAR 1.2 format");
        } else {
          fail_("Unexpected HAR format", `version=${harData.log?.version}`);
        }

        const entries = harData.log?.entries?.length ?? 0;
        pass_(`${entries} network entries captured`);

        // Resource type breakdown
        const types = {};
        for (const e of harData.log?.entries ?? []) {
          const url = e.request.url;
          const ext = url.split("?")[0].split(".").pop()?.slice(0, 10) ?? "other";
          types[ext] = (types[ext] ?? 0) + 1;
        }
        console.log(`  Resource types: ${JSON.stringify(types)}`);

        // Failed requests
        const failedReqs = (harData.log?.entries ?? []).filter(
          (e) => e.response.status >= 400 || e.response.status === 0
        );
        if (failedReqs.length > 0) {
          console.log(`  WARNING: ${failedReqs.length} failed/error requests:`);
          for (const r of failedReqs.slice(0, 5)) {
            console.log(
              `    HTTP ${r.response.status} ${r.request.method} ${r.request.url.slice(0, 80)}`
            );
          }
        } else {
          console.log(`  No failed requests`);
        }

        // Save HAR file
        const harPath = join(REPORTS_DIR, "localhost-3099-profile.har");
        writeFileSync(harPath, JSON.stringify(harData, null, 2));
        pass_(`HAR saved to ${harPath}`);
      } catch (e) {
        fail_("HAR parse failed", e.message);
        console.log(`  Raw (first 300): ${t.slice(0, 300)}`);
      }
    }
  }

  // ── 8. End session — HTML report ────────────────────────────
  log("8. END SESSION — generate HTML report");
  {
    let result;
    try {
      result = await callTool(
        "end_session",
        {
          session_id: sessionId,
          goal_achieved: true,
          format: "html",
          summary:
            "Full UX audit of localhost:3099/profile as Morgan (desktop power user). " +
            "Captured initial page state, ran WCAG 2AA accessibility audit, inspected cookies and localStorage, " +
            "scrolled to reveal additional content, captured post-scroll page state, and exported full network HAR. " +
            "Assessed the profile page for technical depth, navigation efficiency, keyboard shortcut availability, " +
            "API/developer tool discoverability, and overall power-user friendliness.",
        },
        60_000
      );
    } catch (e) {
      fail_("end_session threw", e.message);
      result = null;
    }

    if (result) {
      const t = text(result);

      if (t.includes("<!DOCTYPE html>") || t.includes("<html")) {
        pass_("Valid HTML report generated");
      } else {
        fail_("Response is not HTML", t.slice(0, 200));
      }

      if (t.includes("data:image/png;base64")) {
        pass_("Screenshots embedded in report");
      } else {
        fail_("No embedded screenshots");
      }

      if (t.includes("Friction") || t.includes("friction")) {
        pass_("Friction scoring included");
      } else {
        fail_("No friction score in report");
      }

      if (t.includes("Morgan") || t.includes("power user")) {
        pass_("Persona context in report");
      } else {
        fail_("No persona context in report");
      }

      // Save HTML report
      if (t.includes("<html") || t.includes("<!DOCTYPE")) {
        const reportPath = join(REPORTS_DIR, "localhost-3099-profile-report.html");
        writeFileSync(reportPath, t);
        console.log(
          `  HTML report saved: ${reportPath} (${(t.length / 1024).toFixed(1)}KB)`
        );
      }

      // Extract friction score if present
      const frictionMatch = t.match(/[Ff]riction[^:]*:\s*([0-9.]+)/);
      if (frictionMatch) {
        console.log(`  Friction score: ${frictionMatch[1]}`);
      }

      // Extract overall score if present
      const overallMatch = t.match(/[Oo]verall[^:]*:\s*([0-9]+)/);
      if (overallMatch) {
        console.log(`  Overall score: ${overallMatch[1]}`);
      }
    }
  }

  // ── Summary ─────────────────────────────────────────────────
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  AUDIT RESULTS`);
  console.log(`${"═".repeat(64)}`);
  console.log(`  Target:       ${TARGET_URL}`);
  console.log(`  Persona:      Morgan (desktop power user)`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Total checks: ${passed + failed}`);
  if (a11yScore !== null) console.log(`  A11y score:   ${a11yScore}/100`);
  if (a11yViolations !== null) console.log(`  A11y violations: ${a11yViolations}`);
  console.log(`  Reports dir:  ${REPORTS_DIR}`);
  console.log(`${"═".repeat(64)}\n`);

  child.kill();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Fatal error:", e);
  child?.kill();
  process.exit(1);
});
