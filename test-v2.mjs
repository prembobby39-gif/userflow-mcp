/**
 * Live test of v0.2 step-by-step session API.
 * Simulates what Claude would do: start session, take steps, end session.
 */
import { sessionManager } from "./dist/session/session-manager.js";
import { closeBrowser } from "./dist/utils/browser.js";

const TEST_URL = process.argv[2] || "https://gitaguide.vercel.app";

async function main() {
  console.log(`\n🚀 UserFlow MCP v0.2 — Step-by-Step Test`);
  console.log(`📍 URL: ${TEST_URL}`);
  console.log(`─────────────────────────────────\n`);

  // 1. Start session
  console.log(`🧪 Starting session as "Alex"...`);
  const { sessionId, persona, page: initialPage } = await sessionManager.createSession(TEST_URL, "Alex");
  console.log(`   ✅ Session: ${sessionId.slice(0, 8)}...`);
  console.log(`   📍 URL: ${initialPage.url}`);
  console.log(`   📝 Title: ${initialPage.title}`);
  console.log(`   🔘 Buttons: ${initialPage.buttons.length}`);
  console.log(`   🔗 Links: ${initialPage.links.length}`);
  console.log(`   📝 Headings: ${initialPage.headings.join(" | ") || "None"}`);
  console.log(`   📸 Screenshot: ${initialPage.screenshot.length} chars (base64)`);
  console.log(`   👤 Persona: ${persona?.name ?? "none"}`);

  // 2. Step: Claude would look at the screenshot and decide to scroll
  console.log(`\n🧪 Step 1: Scrolling down (as Claude would decide)...`);
  const step1 = await sessionManager.executeStep(sessionId, {
    action: "scroll",
    thought: `"Let me scroll down to see what this app offers..."`,
    emotionalState: "curious",
  });
  console.log(`   ✅ Success: ${step1.success}`);
  console.log(`   📍 URL: ${step1.page.url}`);
  console.log(`   📸 New screenshot: ${step1.page.screenshot.length} chars`);

  // 3. Step: Click the first visible button
  const firstButton = initialPage.buttons.find(b => b.isVisible && b.text.length > 0);
  if (firstButton) {
    console.log(`\n🧪 Step 2: Clicking "${firstButton.text}" (selector: ${firstButton.selector})...`);
    const step2 = await sessionManager.executeStep(sessionId, {
      action: "click",
      target: firstButton.selector,
      thought: `"I see '${firstButton.text}' — let me try that."`,
      emotionalState: "confident",
      frictionNotes: firstButton.text.length < 3 ? [{
        severity: "low",
        description: "Button text is very short — might not be descriptive enough",
        suggestion: "Use descriptive button labels that tell users what will happen",
      }] : undefined,
    });
    console.log(`   ✅ Success: ${step2.success}${step2.error ? ` (error: ${step2.error})` : ""}`);
    console.log(`   📍 URL: ${step2.page.url}`);
    console.log(`   📝 Title: ${step2.page.title}`);
  }

  // 4. Get page state (re-examine without acting)
  console.log(`\n🧪 Getting page state (no action)...`);
  const currentState = await sessionManager.getPageState(sessionId);
  console.log(`   📍 URL: ${currentState.url}`);
  console.log(`   🔘 Buttons: ${currentState.buttons.length}`);
  console.log(`   📝 Headings: ${currentState.headings.join(" | ") || "None"}`);

  // 5. End session
  console.log(`\n🧪 Ending session...`);
  const session = await sessionManager.endSession(sessionId, false, "Test session for v0.2 validation");
  console.log(`   ✅ Session finalized`);
  console.log(`   📊 Steps: ${session.steps.length}`);
  console.log(`   📊 Friction score: ${session.summary.frictionScore}/10`);
  console.log(`   💭 Emotional journey: ${session.summary.emotionalJourney.join(" → ")}`);
  console.log(`   📝 Thoughts recorded:`);
  for (const step of session.steps) {
    console.log(`      Step ${step.index}: "${step.thought}"`);
  }

  console.log(`\n─────────────────────────────────`);
  console.log(`✅ v0.2 step-by-step API working!`);

  await closeBrowser();
}

main().catch((err) => {
  console.error("Test failed:", err);
  closeBrowser().then(() => process.exit(1));
});
