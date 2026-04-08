/**
 * Full-site test of coach.tetr.com
 * Logs in → explores every section → generates UX report
 */
import { spawn, execSync } from "child_process";
import { createInterface } from "readline";

const TARGET_URL = "https://coach.tetr.com/";
const MAX_STEPS = 25;
const EMAIL = execSync(`${process.env.HOME}/MCPs/autopilot/bin/keychain.sh get coach-tetr email`, { encoding: "utf-8" }).trim();
const PASS = execSync(`${process.env.HOME}/MCPs/autopilot/bin/keychain.sh get coach-tetr password`, { encoding: "utf-8" }).trim();

const SERVER = spawn("node", ["dist/index.js"], {
  cwd: "/Users/prem/projects/userflow-mcp",
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, CHROME_CDP_URL: "http://localhost:9222" },
});

let messageId = 0;
const pending = new Map();
const rl = createInterface({ input: SERVER.stdout });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try { const m = JSON.parse(line); const r = pending.get(m.id); if (r) { r(m); pending.delete(m.id); } } catch {}
});
SERVER.stderr.on("data", () => {});

function send(method, params = {}) {
  const id = ++messageId;
  SERVER.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve) => {
    pending.set(id, resolve);
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ error: { message: "timeout" } }); } }, 90000);
  });
}
function notify(method, params = {}) {
  SERVER.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function getPageData(result) {
  if (!result?.result?.content) return null;
  const text = result.result.content.find(c => c.type === "text")?.text || "";
  const img = result.result.content.find(c => c.type === "image");
  let ps = null;
  // get_page_state returns raw JSON, step returns it under "## Page State"
  const jsonBlock = text.match(/## Page State\n([\s\S]*?)$/);
  try { ps = JSON.parse(jsonBlock ? jsonBlock[1] : text); } catch {}
  return {
    statusLine: text.split("\n")[0],
    ps,
    imgKB: img ? (img.data.length / 1024).toFixed(0) : "0",
  };
}

let stepNum = 0;

async function doStep(sid, opts) {
  stepNum++;
  const label = `${opts.action}${opts.target ? ` → ${opts.target.slice(0, 40)}` : ""}`;
  console.log(`\n─── Step ${stepNum}: ${label} ────────────────────`);
  console.log(`  💭 ${opts.thought}`);
  console.log(`  ${opts.emotional_state || "neutral"}`);

  const result = await send("tools/call", { name: "step", arguments: { session_id: sid, ...opts } });
  const data = getPageData(result);
  if (data) {
    console.log(`  ${data.statusLine}`);
    console.log(`  📸 ${data.imgKB}KB`);
    if (data.ps) {
      console.log(`  📍 ${data.ps.url || "?"}`);
      console.log(`  📋 B:${data.ps.buttons?.length||0} L:${data.ps.links?.length||0} F:${data.ps.formFields?.length||0}`);
      if (data.ps.headings?.length > 0) console.log(`  📝 ${data.ps.headings.slice(0,3).join(" | ")}`);
      if (data.ps.errorMessages?.length > 0) console.log(`  ⚠️  ${data.ps.errorMessages.join("; ")}`);
    }
  }
  return data;
}

async function getState(sid) {
  const result = await send("tools/call", { name: "get_page_state", arguments: { session_id: sid } });
  return getPageData(result);
}

async function main() {
  console.log(`\n━━━ UserFlow MCP — coach.tetr.com Full Test ━━━`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const init = await send("initialize", {
    protocolVersion: "2024-11-05", capabilities: {},
    clientInfo: { name: "coach-tetr-test", version: "1.0.0" },
  });
  console.log(`✅ ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);
  notify("notifications/initialized");

  // ── Start Session ──────────────────────────────────────

  const sess = await send("tools/call", {
    name: "start_session",
    arguments: { url: TARGET_URL, persona: "Alex" },
  });
  const sessText = sess.result?.content?.find(c => c.type === "text")?.text || "";
  const sid = sessText.match(/\*\*Session ID:\*\*\s+(\S+)/)?.[1];
  const sessImg = sess.result?.content?.find(c => c.type === "image");
  console.log(`\nSession: ${sid?.slice(0,8)}... | 📸 ${sessImg ? (sessImg.data.length/1024).toFixed(0)+"KB" : "none"}`);
  console.log(`Redirected to login page — need to authenticate first.\n`);

  if (!sid) { console.log("❌ No session"); SERVER.kill(); process.exit(1); }

  // ── Phase 1: Login ─────────────────────────────────────

  console.log(`══ PHASE 1: LOGIN ═══════════════════════════════\n`);

  await doStep(sid, {
    action: "type", target: '[name="officialEmail"]', value: EMAIL,
    thought: "Found the email field. Typing my email address to log in.",
    emotional_state: "neutral",
  });

  await doStep(sid, {
    action: "type", target: '[name="password"]', value: PASS,
    thought: "Entering password. The form is clean — just email, password, and a login button.",
    emotional_state: "neutral",
  });

  await doStep(sid, {
    action: "click", target: "#gtmLoginStd",
    thought: "Clicking 'Log in' to submit the form.",
    emotional_state: "confident",
  });

  // Wait for navigation
  await doStep(sid, {
    action: "wait", value: "4000",
    thought: "Waiting for the dashboard to load after login...",
    emotional_state: "neutral",
  });

  // Check post-login state
  let state = await getState(sid);
  const postLoginUrl = state?.ps?.url || "";
  console.log(`\n  ✅ Post-login: ${postLoginUrl}`);
  console.log(`  📄 Title: ${state?.ps?.title || "?"}`);

  if (postLoginUrl.includes("login")) {
    console.log(`  ⚠️  Still on login — reCAPTCHA may have blocked us.`);
    console.log(`  Checking for error messages...`);
    if (state?.ps?.errorMessages?.length > 0) {
      console.log(`  ❌ Errors: ${state.ps.errorMessages.join("; ")}`);
    }
    // Try waiting longer — sometimes reCAPTCHA resolves
    await doStep(sid, {
      action: "wait", value: "3000",
      thought: "Still on login. Maybe reCAPTCHA needs time to verify...",
      emotional_state: "anxious",
      friction: [{
        severity: "high",
        description: "reCAPTCHA on login page may block automated or assistive access",
        suggestion: "Consider invisible reCAPTCHA or alternative bot detection for better accessibility",
      }],
    });
    state = await getState(sid);
    console.log(`  Post-wait URL: ${state?.ps?.url || "?"}`);
  }

  // ── Phase 2: Explore Dashboard ─────────────────────────

  console.log(`\n══ PHASE 2: DASHBOARD EXPLORATION ═══════════════\n`);

  // Scroll through dashboard
  await doStep(sid, {
    action: "scroll",
    thought: "I'm on the dashboard now. Let me scroll to see everything that's available.",
    emotional_state: "curious",
  });

  await doStep(sid, {
    action: "scroll",
    thought: "More scrolling — I want to map out all sections and features visible on this page.",
    emotional_state: "curious",
  });

  await doStep(sid, {
    action: "scroll_up",
    thought: "Let me go back to the top to explore the navigation.",
    emotional_state: "neutral",
  });

  // Get full page state for navigation
  state = await getState(sid);
  if (state?.ps) {
    console.log(`\n  ── Current Page Map ──`);
    console.log(`  URL: ${state.ps.url}`);
    console.log(`  Headings: ${(state.ps.headings || []).join(" | ") || "none"}`);

    const buttons = state.ps.buttons || [];
    const links = state.ps.links || [];

    console.log(`  Buttons (${buttons.length}):`);
    for (const b of buttons.slice(0, 12)) {
      console.log(`    [${b.visible !== false ? "✓" : "✗"}] "${b.text}" — ${b.selector}`);
    }
    console.log(`  Links (${links.length}):`);
    for (const l of links.slice(0, 20)) {
      console.log(`    "${l.text}" → ${l.href}`);
    }
  }

  // ── Phase 3: Navigate key sections ─────────────────────

  console.log(`\n══ PHASE 3: SECTION EXPLORATION ══════════════════\n`);

  const visited = new Set([state?.ps?.url || postLoginUrl]);
  const navLinks = (state?.ps?.links || []).filter(l => {
    if (!l.text || l.text.length < 2 || l.text.length > 50) return false;
    if (/skip|logout|sign out|log out|#/i.test(l.text)) return false;
    if (!l.href || l.href === "#" || l.href.startsWith("javascript:")) return false;
    try {
      const clean = new URL(l.href, state?.ps?.url || TARGET_URL).href.split("?")[0].split("#")[0];
      if (visited.has(clean)) return false;
      // Only follow links within coach.tetr.com
      if (!clean.includes("coach.tetr.com")) return false;
      visited.add(clean);
      return true;
    } catch { return false; }
  });

  console.log(`  Found ${navLinks.length} unique sections to explore:`);
  for (const l of navLinks.slice(0, 8)) console.log(`    → "${l.text}"`);

  // Visit each section via direct URL navigation (more reliable than clicking styled-component selectors)
  const toVisit = navLinks.slice(0, 6);
  for (const link of toVisit) {
    if (stepNum >= MAX_STEPS - 2) break;

    // Navigate directly to the URL
    const fullUrl = new URL(link.href, state?.ps?.url || TARGET_URL).href;
    const r = await doStep(sid, {
      action: "navigate", value: fullUrl,
      thought: `Navigating to "${link.text}" (${fullUrl}) to explore this section.`,
      emotional_state: "curious",
    });

    // Scroll to see the page content
    await doStep(sid, {
      action: "scroll",
      thought: `Scrolling through "${link.text}" to see all the content and features here.`,
      emotional_state: "neutral",
    });
  }

  // Also explore pages found from icon-only links
  const iconLinks = (state?.ps?.links || []).filter(l => {
    if (l.text && l.text.length > 1) return false; // Already covered above
    if (!l.href || !l.href.includes("coach.tetr.com")) return false;
    const clean = new URL(l.href, TARGET_URL).href.split("?")[0].split("#")[0];
    return !visited.has(clean) && (visited.add(clean), true);
  });

  for (const link of iconLinks.slice(0, 3)) {
    if (stepNum >= MAX_STEPS - 1) break;
    const fullUrl = new URL(link.href, TARGET_URL).href;
    await doStep(sid, {
      action: "navigate", value: fullUrl,
      thought: `Found an icon-link to ${fullUrl}. Let me see what's here.`,
      emotional_state: "curious",
      friction: [{
        severity: "low",
        description: "Navigation link has no visible text — only an icon",
        suggestion: "Add aria-labels or visible text to icon-only navigation links for accessibility",
      }],
    });
  }

  // ── Phase 4: End & Report ──────────────────────────────

  console.log(`\n══ PHASE 4: FINAL REPORT ═════════════════════════\n`);

  const end = await send("tools/call", {
    name: "end_session",
    arguments: {
      session_id: sid,
      goal_achieved: false,
      summary: `Full exploration of coach.tetr.com as Alex (first-timer). Logged in, explored the dashboard and ${toVisit.length} additional sections. Assessed login UX, navigation clarity, content discoverability, and overall first-time user experience.`,
    },
  });

  const report = end.result?.content?.[0]?.text || "No report";
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log(report);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Done. ${stepNum} steps taken.\n`);

  SERVER.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  SERVER.kill();
  process.exit(1);
});
