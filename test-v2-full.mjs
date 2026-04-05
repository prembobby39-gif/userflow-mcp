/**
 * Full v0.2 test — simulates exactly what Claude would do:
 * start_session → look at screenshot → decide action → step → repeat → end_session
 *
 * Since we can't call Claude from a test script, we simulate Claude's reasoning
 * by inspecting the page state and making intelligent decisions.
 */
import { sessionManager } from "./dist/session/session-manager.js";
import { closeBrowser } from "./dist/utils/browser.js";

const TEST_URL = process.argv[2] || "https://gitaguide.vercel.app";
const MAX_STEPS = 8;

async function main() {
  console.log(`\n━━━ UserFlow MCP v0.2 — Full Simulation Test ━━━`);
  console.log(`📍 URL: ${TEST_URL}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ── Start Session ──────────────────────────────────────────
  console.log(`[start_session] Opening as "Alex" (First-Timer, mobile)...\n`);
  const { sessionId, persona, page: initial } = await sessionManager.createSession(TEST_URL, "Alex");

  console.log(`  Session: ${sessionId.slice(0, 8)}...`);
  console.log(`  Persona: ${persona.name} — ${persona.description}`);
  console.log(`  Goals: ${persona.goals.join(", ")}`);
  console.log(`  Traits: tech=${persona.traits.techLiteracy}, patience=${persona.traits.patience}, device=${persona.traits.devicePreference}`);
  console.log(`\n  📸 Screenshot captured (${(initial.screenshot.length / 1024).toFixed(0)}KB base64)`);
  console.log(`  📄 Page: "${initial.title}"`);
  console.log(`  📝 Headings: ${initial.headings.slice(0, 3).join(" | ") || "None"}`);
  console.log(`  🔘 Buttons (${initial.buttons.length}): ${initial.buttons.map(b => `"${b.text}"`).join(", ") || "None"}`);
  console.log(`  🔗 Links (${initial.links.filter(l => l.isVisible).length} visible)`);
  console.log(`  📋 Forms: ${initial.formFields.length} fields`);
  console.log(`  ⚠️  Errors: ${initial.errorMessages.length > 0 ? initial.errorMessages.join("; ") : "None"}`);
  console.log(`  ⏱️  Load: ${initial.loadTimeMs}ms`);

  // ── Step-by-step: simulate Claude's reasoning ──────────────
  let stepCount = 0;
  let currentPage = initial;
  let lastUrl = initial.url;
  const failedSelectors = new Set(); // Track selectors that failed so we don't retry them
  const filledFields = new Set();   // Track form fields we already filled

  for (let i = 0; i < MAX_STEPS; i++) {
    // "Claude" looks at the page and decides what to do
    const decision = decideNextAction(currentPage, persona, i, lastUrl, failedSelectors, filledFields);

    if (decision.action === "give_up") {
      console.log(`\n  [Claude] ${decision.thought}`);
      console.log(`  [Claude] Emotional state: ${decision.emotion}`);
      console.log(`  → Giving up.`);
      break;
    }

    console.log(`\n─── Step ${i + 1} ──────────────────────────────────`);
    console.log(`  [Claude] 💭 ${decision.thought}`);
    console.log(`  [Claude] ${getEmoji(decision.emotion)} Feeling: ${decision.emotion}`);
    if (decision.friction.length > 0) {
      for (const f of decision.friction) {
        console.log(`  [Claude] ⚠️  FRICTION [${f.severity}]: ${f.description}`);
        console.log(`           → ${f.suggestion}`);
      }
    }
    console.log(`  [Action] ${decision.action}${decision.target ? ` → "${decision.target}"` : ""}${decision.value ? ` (value: "${decision.value}")` : ""}`);

    const result = await sessionManager.executeStep(sessionId, {
      action: decision.action,
      target: decision.target,
      value: decision.value,
      thought: decision.thought,
      emotionalState: decision.emotion,
      frictionNotes: decision.friction.length > 0 ? decision.friction : undefined,
    });

    console.log(`  [Result] ${result.success ? "✅ Success" : `❌ Failed: ${result.error}`}`);
    console.log(`  [Page] "${result.page.title}" — ${result.page.url}`);
    console.log(`  📸 New screenshot (${(result.page.screenshot.length / 1024).toFixed(0)}KB)`);

    if (!result.success) {
      console.log(`  → Action failed, trying to recover...`);
      // Track the failed selector so we don't retry it
      if (decision.target) failedSelectors.add(decision.target);
    } else if (decision.action === "type" && decision.target) {
      // Track filled form fields so we move to the next one
      filledFields.add(decision.target);
    }

    // If a click succeeded but URL didn't change, mark that selector as "tried"
    // so we don't loop clicking the same button forever
    if (result.success && decision.action === "click" && decision.target && result.page.url === currentPage.url) {
      failedSelectors.add(decision.target);
    }

    lastUrl = currentPage.url;
    currentPage = result.page;
    stepCount++;

    // Check if URL changed (navigation happened)
    if (currentPage.url !== lastUrl) {
      console.log(`  🔄 Navigated: ${lastUrl} → ${currentPage.url}`);
    }
  }

  // ── End Session ────────────────────────────────────────────
  console.log(`\n━━━ Ending Session ━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const session = await sessionManager.endSession(sessionId, false, "Alex couldn't fully figure out what the app does");

  console.log(`  📊 Total steps: ${session.steps.length}`);
  console.log(`  📊 Friction score: ${session.summary.frictionScore}/10`);
  console.log(`  🎯 Goal achieved: ${session.summary.goalAchieved ? "Yes" : "No"}`);
  console.log(`  📈 Emotional journey: ${session.summary.emotionalJourney.join(" → ")}`);
  console.log(`  ⚠️  Drop-off risk: ${session.summary.dropOffRisk}`);

  if (session.summary.topFrictionPoints.length > 0) {
    console.log(`\n  Top Friction Points:`);
    for (const f of session.summary.topFrictionPoints) {
      console.log(`    [${f.severity.toUpperCase()}] ${f.description}`);
      console.log(`    → ${f.suggestion}`);
    }
  }

  if (session.summary.recommendations.length > 0) {
    console.log(`\n  Recommendations:`);
    for (let i = 0; i < session.summary.recommendations.length; i++) {
      console.log(`    ${i + 1}. ${session.summary.recommendations[i]}`);
    }
  }

  // Print full transcript
  console.log(`\n━━━ Full Transcript ━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  for (const step of session.steps) {
    const emoji = getEmoji(step.emotionalState);
    console.log(`  Step ${step.index}: ${emoji} ${step.emotionalState} | ${step.action.type}${step.action.target ? ` → ${step.action.target}` : ""}`);
    console.log(`    💭 ${step.thought}`);
    for (const f of step.frictionPoints) {
      console.log(`    ⚠️  [${f.severity}] ${f.description}`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Full v0.2 test complete!`);

  await closeBrowser();
}

// ── Simulated Claude reasoning (what Claude would do with the screenshot) ──

/** Filter out sr-only, skip-to-content, and other non-user-facing links */
function isRealLink(link) {
  const skipTexts = ["skip to main content", "skip to content", "skip navigation", "skip nav"];
  const text = (link.text || "").toLowerCase().trim();
  if (skipTexts.includes(text)) return false;
  // Filter out sr-only selectors (Tailwind screen-reader-only elements)
  if (link.selector && /sr-only|visually-hidden|skiplink/i.test(link.selector)) return false;
  // Must have actual visible text
  if (!link.isVisible || text.length < 2) return false;
  // Filter out copyright/legal noise
  if (text.includes("©") || text === "privacy" || text === "terms") return false;
  return true;
}

/** Filter out buttons that are empty or invisible */
function isRealButton(btn, failedSelectors) {
  if (!btn.isVisible || !btn.text || btn.text.trim().length === 0) return false;
  if (failedSelectors.has(btn.selector)) return false;
  return true;
}

function decideNextAction(page, persona, stepIndex, prevUrl, failedSelectors = new Set(), filledFields = new Set()) {
  const friction = [];

  // Filtered elements (excluding already-failed and sr-only elements)
  const usableLinks = page.links.filter(l => isRealLink(l) && !failedSelectors.has(l.selector));
  const usableButtons = page.buttons.filter(b => isRealButton(b, failedSelectors));
  const usableForms = page.formFields.filter(f => f.isVisible && !failedSelectors.has(f.selector));
  const unfilledForms = usableForms.filter(f => !filledFields.has(f.selector));

  // Step 0: First impression — always scroll to see the full page
  if (stepIndex === 0) {
    const hasDescriptiveHeading = page.headings.length > 0 && page.headings[0].length > 10;

    if (!hasDescriptiveHeading) {
      friction.push({
        severity: "high",
        description: "Landing page doesn't clearly communicate what the product does",
        suggestion: "Add a clear H1 that describes the product's value proposition in one sentence",
      });
    }

    if (usableButtons.length === 0) {
      friction.push({
        severity: "medium",
        description: "No visible call-to-action button on landing page",
        suggestion: "Add a prominent CTA button above the fold",
      });
    }

    return {
      action: "scroll",
      thought: `"${page.headings[0] || 'Hmm, no heading'}... I'm trying to figure out what this app does. Let me scroll down to learn more."`,
      emotion: hasDescriptiveHeading ? "curious" : "confused",
      friction,
    };
  }

  // Step 1: After scrolling, look for a CTA or prominent link
  if (stepIndex === 1) {
    const cta = usableButtons[0];
    if (cta) {
      return {
        action: "click",
        target: cta.selector,
        thought: `"I see a '${cta.text}' button. As a first-time user, this seems like the main thing to click."`,
        emotion: "curious",
        friction,
      };
    }

    // Prefer links that look like navigation/CTA (longer text, contains action words)
    const actionLink = usableLinks.find(l =>
      /get started|try|sign up|learn more|explore|start|begin|enter|open|launch/i.test(l.text)
    ) || usableLinks.find(l => l.href && !l.href.startsWith("#") && l.text.length > 3);

    if (actionLink) {
      return {
        action: "click",
        target: actionLink.selector,
        thought: `"No obvious button, but '${actionLink.text}' looks interesting. Let me click it."`,
        emotion: "neutral",
        friction: [{ severity: "medium", description: "No prominent CTA button visible after scrolling", suggestion: "Add a clear call-to-action that stands out from navigation links" }],
      };
    }

    // Last resort: try any usable link
    if (usableLinks.length > 0) {
      const link = usableLinks[0];
      return {
        action: "click",
        target: link.selector,
        thought: `"I see '${link.text}' — let me try that to find out more."`,
        emotion: "neutral",
        friction: [{ severity: "medium", description: "No prominent CTA visible", suggestion: "Add a clear call-to-action button above the fold" }],
      };
    }

    return {
      action: "scroll",
      thought: `"I still don't see a clear next step. Let me keep scrolling..."`,
      emotion: "confused",
      friction: [{ severity: "high", description: "No clear next action after scrolling the full page", suggestion: "Add a persistent CTA or anchor that guides users to the main action" }],
    };
  }

  // Step 2+: Adaptive — forms, buttons, links, or scroll

  // Try unfilled form fields first
  if (unfilledForms.length > 0) {
    const field = unfilledForms[0];
    if (usableForms.length > 5) {
      friction.push({
        severity: "high",
        description: `Form has ${usableForms.length} fields — that's a lot to fill in as a first-time user`,
        suggestion: "Reduce form fields to essentials, ask for additional info later",
      });
    }
    const label = (field.placeholder || field.ariaLabel || field.type || "field").toLowerCase();
    const value = field.type === "email" || label.includes("email") ? "alex@example.com"
      : field.type === "password" || label.includes("password") ? "TestPass123!"
      : label.includes("name") ? "Alex"
      : label.includes("phone") ? "555-0123"
      : "test input";
    return {
      action: "type",
      target: field.selector,
      value,
      thought: `"There's a form. Let me fill in the ${label} field..."`,
      emotion: usableForms.length > 4 ? "anxious" : "neutral",
      friction,
    };
  }

  // All form fields filled — look for a submit button
  if (filledFields.size > 0 && usableButtons.length > 0) {
    // Prefer buttons that look like submit (submit, sign in, continue, etc.)
    const submitBtn = usableButtons.find(b =>
      /submit|sign in|log in|sign up|continue|send|go|enter|create|register/i.test(b.text)
    ) || usableButtons[0];
    return {
      action: "click",
      target: submitBtn.selector,
      thought: `"I've filled in the form. Let me click '${submitBtn.text}' to submit it."`,
      emotion: "confident",
      friction,
    };
  }

  // Try clicking a button (no form context)
  if (usableButtons.length > 0) {
    const btn = usableButtons[0];
    return {
      action: "click",
      target: btn.selector,
      thought: `"I see '${btn.text}'. Let me try that."`,
      emotion: "neutral",
      friction,
    };
  }

  // Try a navigational link (prefer ones that go to new pages)
  const navLink = usableLinks.find(l => l.href && l.href !== page.url && !l.href.startsWith("#"));
  if (navLink) {
    return {
      action: "click",
      target: navLink.selector,
      thought: `"Let me try '${navLink.text}' to see another page..."`,
      emotion: page.url === prevUrl ? "bored" : "neutral",
      friction,
    };
  }

  // Any remaining link
  if (usableLinks.length > 0) {
    const link = usableLinks[0];
    return {
      action: "click",
      target: link.selector,
      thought: `"Let me try '${link.text}'..."`,
      emotion: page.url === prevUrl ? "bored" : "neutral",
      friction,
    };
  }

  // Nothing clickable — scroll to discover more, or give up
  if (stepIndex < 5) {
    return {
      action: "scroll",
      thought: `"I'm not finding what I need. Let me scroll more..."`,
      emotion: "frustrated",
      friction: [{ severity: "medium", description: "User ran out of obvious actions to take", suggestion: "Ensure every page has a clear primary action" }],
    };
  }

  return {
    action: "give_up",
    thought: `"I've been clicking around and I still can't figure out what to do. A real user would leave by now."`,
    emotion: "frustrated",
    friction: [{ severity: "critical", description: "User gave up after multiple attempts to navigate", suggestion: "Review the full user flow — the path from landing to first value should take <3 steps" }],
  };
}

function getEmoji(emotion) {
  const map = { curious: "🔍", confident: "✅", neutral: "😐", confused: "❓", frustrated: "😤", delighted: "😊", anxious: "😰", bored: "😴" };
  return map[emotion] || "😐";
}

main().catch((err) => {
  console.error("Test failed:", err);
  closeBrowser().then(() => process.exit(1));
});
