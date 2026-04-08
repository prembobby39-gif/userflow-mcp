/**
 * Live test — Multi-persona comparison
 */
import { walkFlow } from "./dist/walker/flow-walker.js";
import { resolvePersona } from "./dist/personas/engine.js";
import { comparePersonaSessions, generateComparisonReport } from "./dist/feedback/comparison.js";
import { closeBrowser } from "./dist/utils/browser.js";

const TEST_URL = process.argv[2] || "https://gitaguide.vercel.app";

async function main() {
  console.log(`\n🚀 UserFlow MCP — Multi-Persona Comparison Test`);
  console.log(`📍 URL: ${TEST_URL}`);
  console.log(`─────────────────────────────────\n`);

  const personaNames = ["Alex", "Morgan", "Jordan"];
  const sessions = [];

  for (const name of personaNames) {
    console.log(`🧪 Simulating as "${name}"...`);
    const persona = resolvePersona(name);
    const session = await walkFlow(TEST_URL, persona, { maxSteps: 6 });
    sessions.push(session);
    console.log(`   ✅ ${session.steps.length} steps, friction: ${session.summary.frictionScore}/10, emotion: ${session.summary.emotionalJourney.join(" → ")}`);
  }

  console.log(`\n📊 Generating comparison report...`);
  const comparison = comparePersonaSessions(sessions);
  const report = generateComparisonReport(comparison);

  console.log(`\n${report}`);

  await closeBrowser();
}

main().catch((err) => {
  console.error("Test failed:", err);
  closeBrowser().then(() => process.exit(1));
});
