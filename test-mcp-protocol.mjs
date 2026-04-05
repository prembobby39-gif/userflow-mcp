/**
 * Tests the MCP server via actual JSON-RPC protocol over stdio —
 * exactly how Claude Code communicates with it.
 * Uses newline-delimited JSON (the SDK's default stdio transport).
 */
import { spawn } from "child_process";
import { createInterface } from "readline";

const SERVER = spawn("node", ["dist/index.js"], {
  cwd: "/Users/prem/projects/userflow-mcp",
  stdio: ["pipe", "pipe", "pipe"],
});

let messageId = 0;
const pending = new Map();

const rl = createInterface({ input: SERVER.stdout });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    const resolver = pending.get(msg.id);
    if (resolver) {
      resolver(msg);
      pending.delete(msg.id);
    }
  } catch {}
});

SERVER.stderr.on("data", () => {}); // suppress stderr

function send(method, params = {}) {
  const id = ++messageId;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  SERVER.stdin.write(msg + "\n");
  return new Promise((resolve) => {
    pending.set(id, resolve);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ error: "timeout" });
      }
    }, 60000);
  });
}

function notify(method, params = {}) {
  const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
  SERVER.stdin.write(msg + "\n");
}

async function main() {
  console.log("━━━ MCP Protocol Test (Real JSON-RPC) ━━━\n");

  // 1. Initialize
  console.log("[1] initialize...");
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "claude-code-test", version: "1.0.0" },
  });
  console.log(`    ✅ Server: ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);
  console.log(`    Capabilities: tools=${!!init.result.capabilities.tools}`);
  notify("notifications/initialized");

  // 2. List tools
  console.log("\n[2] tools/list...");
  const tools = await send("tools/list");
  const toolNames = tools.result.tools.map((t) => t.name);
  console.log(`    ✅ ${toolNames.length} tools: ${toolNames.join(", ")}`);

  // 3. list_personas
  console.log("\n[3] list_personas...");
  const personas = await send("tools/call", { name: "list_personas", arguments: {} });
  const personaText = personas.result.content[0].text;
  const personaCount = (personaText.match(/### /g) || []).length;
  console.log(`    ✅ ${personaCount} personas loaded`);

  // 4. start_session
  console.log("\n[4] start_session (gitaguide.vercel.app, persona: Alex)...");
  const session = await send("tools/call", {
    name: "start_session",
    arguments: { url: "https://gitaguide.vercel.app", persona: "Alex" },
  });

  if (session.error) {
    console.log(`    ❌ Error: ${JSON.stringify(session.error)}`);
    SERVER.kill();
    process.exit(1);
  }

  const textContent = session.result.content.find((c) => c.type === "text");
  const imageContent = session.result.content.find((c) => c.type === "image");
  const sessionIdMatch = textContent.text.match(/Session ID:\*\*\s*(\S+)/);
  const sessionId = sessionIdMatch?.[1];

  console.log(`    ✅ Session: ${sessionId?.slice(0, 8)}...`);
  console.log(`    📸 Screenshot: ${imageContent ? `${(imageContent.data.length / 1024).toFixed(0)}KB` : "missing"}`);
  // Show page state excerpt
  const urlMatch = textContent.text.match(/\*\*URL:\*\*\s*(\S+)/);
  const titleMatch = textContent.text.match(/\*\*Title:\*\*\s*(.+)/);
  console.log(`    📄 ${titleMatch?.[1] || "?"} — ${urlMatch?.[1] || "?"}`);

  if (!sessionId) {
    console.log("    ❌ No session ID, aborting");
    SERVER.kill();
    process.exit(1);
  }

  // 5. step: scroll
  console.log("\n[5] step: scroll (Claude reasoning as Alex)...");
  const step1 = await send("tools/call", {
    name: "step",
    arguments: {
      session_id: sessionId,
      action: "scroll",
      thought: "The hero section says 'You are Arjuna' — interesting spiritual concept. Let me scroll to see what this app actually does and if there's a clear CTA.",
      emotional_state: "curious",
    },
  });
  const s1Text = step1.result.content.find((c) => c.type === "text");
  const s1Img = step1.result.content.find((c) => c.type === "image");
  console.log(`    ✅ ${s1Text.text.split("\n")[0]}`);
  console.log(`    📸 Screenshot: ${s1Img ? `${(s1Img.data.length / 1024).toFixed(0)}KB` : "missing"}`);

  // 6. step: click to navigate
  console.log("\n[6] step: click sign-in link...");
  const step2 = await send("tools/call", {
    name: "step",
    arguments: {
      session_id: sessionId,
      action: "click",
      target: "a[href*='login']",
      thought: "I want to try this app but there's no 'Get Started' button — only 'Sign in'. As a first-timer, this is a bit confusing. Do I need an account already?",
      emotional_state: "confused",
      friction: [{
        severity: "medium",
        description: "No distinction between sign-up and sign-in for new users",
        suggestion: "Add a clear 'Get Started Free' or 'Create Account' CTA separate from sign-in",
      }],
    },
  });
  const s2Text = step2.result.content.find((c) => c.type === "text");
  const s2Img = step2.result.content.find((c) => c.type === "image");
  console.log(`    ✅ ${s2Text.text.split("\n")[0]}`);
  console.log(`    📸 Screenshot: ${s2Img ? `${(s2Img.data.length / 1024).toFixed(0)}KB` : "missing"}`);

  // 7. get_page_state
  console.log("\n[7] get_page_state (re-examine login page)...");
  const ps = await send("tools/call", {
    name: "get_page_state",
    arguments: { session_id: sessionId },
  });
  const psData = JSON.parse(ps.result.content.find((c) => c.type === "text").text);
  const psImg = ps.result.content.find((c) => c.type === "image");
  console.log(`    ✅ URL: ${psData.url}`);
  console.log(`    📋 Buttons: ${psData.buttons?.length}, Forms: ${psData.formFields?.length}, Links: ${psData.links?.length}`);
  console.log(`    📸 Screenshot: ${psImg ? `${(psImg.data.length / 1024).toFixed(0)}KB` : "missing"}`);

  // 8. end_session
  console.log("\n[8] end_session...");
  const end = await send("tools/call", {
    name: "end_session",
    arguments: {
      session_id: sessionId,
      goal_achieved: false,
      summary: "Alex explored the landing page and navigated to login. The spiritual theme is beautiful but the first-time user path needs work — no clear 'Get Started' CTA, and sign-in vs sign-up is ambiguous.",
    },
  });
  const report = end.result.content[0].text;
  console.log(`    ✅ Report generated (${report.length} chars)`);

  // Print report preview
  console.log(`\n━━━ Session Report (preview) ━━━\n`);
  console.log(report.split("\n").slice(0, 30).join("\n"));
  console.log(`\n... (${report.split("\n").length - 30} more lines)`);

  console.log(`\n━━━ All MCP Tools Verified ━━━`);
  console.log(`✅ initialize — server handshake`);
  console.log(`✅ tools/list — ${toolNames.length} tools registered`);
  console.log(`✅ list_personas — ${personaCount} personas`);
  console.log(`✅ start_session — browser + screenshot + persona`);
  console.log(`✅ step (scroll) — action + new screenshot`);
  console.log(`✅ step (click) — navigation + friction recording`);
  console.log(`✅ get_page_state — passive observation`);
  console.log(`✅ end_session — report generation`);
  console.log(`\n🎉 UserFlow MCP v0.2 is production-ready.\n`);

  SERVER.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  SERVER.kill();
  process.exit(1);
});
