#!/usr/bin/env node
/**
 * v0.3.0 Feature Test — exercises all new capabilities via MCP JSON-RPC.
 *
 * Tests: device emulation, Web Vitals, accessibility audit, storage inspection,
 * network monitoring, HAR export, smart selectors, HTML report, create_persona, list_devices.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const TARGET_URL = "https://gitaguide.vercel.app";
let child;
let buffer = "";
let sessionId = null;

// ── JSON-RPC transport ──────────────────────────────────────────

function send(method, params = {}) {
  const id = randomUUID();
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  child.stdin.write(msg + "\n");
  return id;
}

function waitForResponse(id, timeoutMs = 60_000) {
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

async function callTool(name, args = {}, timeout = 60_000) {
  const id = send("tools/call", { name, arguments: args });
  const resp = await waitForResponse(id, timeout);
  if (resp.error) throw new Error(`${name} error: ${resp.error.message}`);
  return resp.result;
}

// ── Helpers ─────────────────────────────────────────────────────

function textContent(result) {
  return result.content?.filter(c => c.type === "text").map(c => c.text).join("\n") ?? "";
}

function hasImage(result) {
  return result.content?.some(c => c.type === "image") ?? false;
}

function log(label, msg) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(60)}`);
  console.log(typeof msg === "string" ? msg.slice(0, 600) : JSON.stringify(msg).slice(0, 600));
}

function pass(test) { console.log(`  ✅ ${test}`); }
function fail(test, reason) { console.log(`  ❌ ${test}: ${reason}`); }

// ── Tests ───────────────────────────────────────────────────────

async function run() {
  console.log("Starting UserFlow MCP v0.3.0 feature test...\n");

  // Spawn MCP server
  child = spawn("node", ["dist/index.js"], {
    cwd: "/Users/prem/projects/userflow-mcp",
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => { buffer += d.toString(); });
  child.stderr.on("data", (d) => { process.stderr.write(`[server] ${d}`); });

  // Initialize
  const initId = send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-v3", version: "1.0.0" },
  });
  await waitForResponse(initId);
  send("notifications/initialized", {});
  console.log("✅ MCP server initialized\n");

  let passed = 0;
  let failed = 0;

  // ── TEST 1: list_devices ──────────────────────────────────────
  try {
    log("TEST 1: list_devices", "");
    const result = await callTool("list_devices");
    const text = textContent(result);
    if (text.includes("iphone-14-pro")) { pass("Has iPhone 14 Pro"); passed++; } else { fail("Missing iPhone 14 Pro", ""); failed++; }
    if (text.includes("galaxy-fold")) { pass("Has Galaxy Fold"); passed++; } else { fail("Missing Galaxy Fold", ""); failed++; }
    if (text.includes("desktop-1080p")) { pass("Has Desktop 1080p"); passed++; } else { fail("Missing Desktop 1080p", ""); failed++; }
    console.log(`  (${text.split("\n").length} lines)`);
  } catch (e) { fail("list_devices", e.message); failed++; }

  // ── TEST 2: create_persona ────────────────────────────────────
  try {
    log("TEST 2: create_persona", "");
    const result = await callTool("create_persona", {
      name: "TestBot",
      description: "Automated test persona",
      goals: ["verify v0.3 features"],
      tech_literacy: "expert",
      patience: "high",
      device: "mobile",
      accessibility_needs: ["low_vision"],
    });
    const text = textContent(result);
    if (text.includes("TestBot")) { pass("Persona created with name"); passed++; } else { fail("Name missing", ""); failed++; }
    if (text.includes("expert")) { pass("Tech literacy set"); passed++; } else { fail("Tech literacy missing", ""); failed++; }
    if (text.includes("low_vision")) { pass("Accessibility needs set"); passed++; } else { fail("A11y needs missing", ""); failed++; }
    console.log(text.slice(0, 300));
  } catch (e) { fail("create_persona", e.message); failed++; }

  // ── TEST 3: start_session with device emulation ───────────────
  try {
    log("TEST 3: start_session (iPhone 14 Pro)", "");
    const result = await callTool("start_session", {
      url: TARGET_URL,
      device_profile: "iphone-14-pro",
    }, 90_000);
    const text = textContent(result);

    // Extract session ID
    const match = text.match(/Session ID:\*\*\s*([a-f0-9-]+)/);
    sessionId = match?.[1];
    if (sessionId) { pass(`Session created: ${sessionId.slice(0, 8)}...`); passed++; } else { fail("No session ID", text.slice(0, 200)); failed++; }

    // Check device info
    if (text.includes("iPhone 14 Pro") || text.includes("393")) { pass("Device emulation applied"); passed++; } else { fail("No device info", ""); failed++; }

    // Check screenshot
    if (hasImage(result)) { pass("Screenshot returned"); passed++; } else { fail("No screenshot", ""); failed++; }

    // Check v0.3 metrics in page state
    if (text.includes("performance") || text.includes("lcp") || text.includes("lcpRating")) { pass("Performance metrics in snapshot"); passed++; } else { fail("No performance metrics", ""); failed++; }
    if (text.includes("a11yScore") || text.includes("a11yViolations")) { pass("Accessibility data in snapshot"); passed++; } else { fail("No a11y data", ""); failed++; }
    if (text.includes("networkRequests") || text.includes("networkFailed")) { pass("Network data in snapshot"); passed++; } else { fail("No network data", ""); failed++; }

    console.log(text.slice(0, 500));
  } catch (e) { fail("start_session", e.message); failed++; }

  if (!sessionId) {
    console.log("\n⛔ Cannot continue without session ID");
    child.kill();
    process.exit(1);
  }

  // ── TEST 4: accessibility_audit ───────────────────────────────
  try {
    log("TEST 4: accessibility_audit", "");
    const result = await callTool("accessibility_audit", {
      session_id: sessionId,
      wcag_level: "wcag2aa",
    }, 30_000);
    const text = textContent(result);
    if (text.includes("Score:")) { pass("Has a11y score"); passed++; } else { fail("No score", ""); failed++; }
    if (text.includes("Violations:")) { pass("Has violation count"); passed++; } else { fail("No violations", ""); failed++; }
    if (text.includes("wcag2aa")) { pass("Correct WCAG level"); passed++; } else { fail("Wrong WCAG level", ""); failed++; }
    console.log(text.slice(0, 500));
  } catch (e) { fail("accessibility_audit", e.message); failed++; }

  // ── TEST 5: inspect_storage ───────────────────────────────────
  try {
    log("TEST 5: inspect_storage", "");
    const result = await callTool("inspect_storage", {
      session_id: sessionId,
    }, 15_000);
    const text = textContent(result);
    if (text.includes("Cookies")) { pass("Has cookies section"); passed++; } else { fail("No cookies", ""); failed++; }
    if (text.includes("localStorage")) { pass("Has localStorage"); passed++; } else { fail("No localStorage", ""); failed++; }
    if (text.includes("Tracking")) { pass("Has tracking detection"); passed++; } else { fail("No tracking section", ""); failed++; }
    console.log(text.slice(0, 500));
  } catch (e) { fail("inspect_storage", e.message); failed++; }

  // ── TEST 6: step with smart selector ──────────────────────────
  try {
    log("TEST 6: step (scroll)", "");
    const result = await callTool("step", {
      session_id: sessionId,
      action: "scroll",
      scroll_amount: 300,
      thought: "Let me scroll to see more content",
      emotional_state: "curious",
    }, 20_000);
    const text = textContent(result);
    if (text.includes("Step")) { pass("Step executed"); passed++; } else { fail("No step info", ""); failed++; }
    if (hasImage(result)) { pass("Screenshot after step"); passed++; } else { fail("No screenshot", ""); failed++; }
    console.log(text.slice(0, 300));
  } catch (e) { fail("step", e.message); failed++; }

  // ── TEST 7: export_har ────────────────────────────────────────
  try {
    log("TEST 7: export_har", "");
    const result = await callTool("export_har", {
      session_id: sessionId,
    }, 15_000);
    const text = textContent(result);
    let harValid = false;
    try {
      const har = JSON.parse(text);
      if (har.log?.version === "1.2") { pass("Valid HAR 1.2 format"); passed++; harValid = true; }
      if (har.log?.creator?.name === "userflow-mcp") { pass("Correct creator"); passed++; } else { fail("Wrong creator", ""); failed++; }
      if (har.log?.entries?.length > 0) { pass(`${har.log.entries.length} network entries captured`); passed++; } else { fail("No entries", ""); failed++; }
    } catch {
      fail("HAR parse", "Invalid JSON"); failed++;
    }
    if (!harValid) { fail("HAR format", "Not 1.2"); failed++; }
  } catch (e) { fail("export_har", e.message); failed++; }

  // ── TEST 8: end_session with HTML format ──────────────────────
  try {
    log("TEST 8: end_session (HTML format)", "");
    const result = await callTool("end_session", {
      session_id: sessionId,
      goal_achieved: true,
      summary: "v0.3.0 feature test completed",
      format: "html",
    }, 30_000);
    const text = textContent(result);
    if (text.includes("<!DOCTYPE html>")) { pass("Valid HTML document"); passed++; } else { fail("Not HTML", ""); failed++; }
    if (text.includes("UX Analysis Report")) { pass("Has report title"); passed++; } else { fail("No title", ""); failed++; }
    if (text.includes("data:image/png;base64")) { pass("Embedded screenshots"); passed++; } else { fail("No screenshots", ""); failed++; }
    if (text.includes("Friction Score")) { pass("Has friction score"); passed++; } else { fail("No friction score", ""); failed++; }
    console.log(`  HTML report: ${text.length.toLocaleString()} characters`);
  } catch (e) { fail("end_session HTML", e.message); failed++; }

  // ── TEST 9: compare_screenshots (quick scan two viewports) ────
  try {
    log("TEST 9: compare_screenshots", "");
    // Take two quick scans at different viewports
    const scan1 = await callTool("quick_scan", { url: TARGET_URL, viewport_width: 1440, viewport_height: 900 }, 60_000);
    const scan2 = await callTool("quick_scan", { url: TARGET_URL, viewport_width: 375, viewport_height: 667 }, 60_000);

    const img1 = scan1.content?.find(c => c.type === "image")?.data;
    const img2 = scan2.content?.find(c => c.type === "image")?.data;

    if (img1 && img2) {
      const diff = await callTool("compare_screenshots", {
        screenshot1: img1,
        screenshot2: img2,
      }, 30_000);
      const text = textContent(diff);
      if (text.includes("Match:")) { pass("Has match percentage"); passed++; } else { fail("No match %", ""); failed++; }
      if (text.includes("Different pixels:")) { pass("Has diff pixel count"); passed++; } else { fail("No diff pixels", ""); failed++; }
      if (hasImage(diff)) { pass("Diff overlay image"); passed++; } else { fail("No diff image", ""); failed++; }
      console.log(text);
    } else {
      fail("Screenshots", "Could not capture two screenshots"); failed++;
    }
  } catch (e) { fail("compare_screenshots", e.message); failed++; }

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
