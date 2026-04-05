import type { Persona, UserSession } from "../types.js";
import { getBrowser } from "../utils/browser.js";
import { extractPageSnapshot } from "../utils/page-snapshot.js";
import { executeAction } from "../utils/actions.js";
import { getMaxSteps, getViewport } from "../personas/engine.js";
import { planNextAction, assessEmotion, detectFriction } from "./action-planner.js";
import { SessionRecorder } from "./session-recorder.js";
import type { PageSnapshot } from "../types.js";

const NAVIGATION_TIMEOUT = 30_000;
const DEFAULT_SCALE_FACTOR = 2;

/**
 * Walk through a web application as a specific persona (legacy heuristic walker).
 * Autonomously navigates, interacts, and records observations.
 * Used by the `auto_walk` tool as a fast fallback.
 */
export async function walkFlow(
  startUrl: string,
  persona: Persona,
  options?: { readonly maxSteps?: number }
): Promise<UserSession> {
  const maxSteps = options?.maxSteps ?? getMaxSteps(persona);
  const viewport = getViewport(persona);
  const recorder = new SessionRecorder(persona, startUrl);

  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: DEFAULT_SCALE_FACTOR });

  let goalAchieved = false;
  let goalAchievedStep: number | undefined;

  try {
    await page.goto(startUrl, { waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT });

    for (let step = 0; step < maxSteps; step++) {
      const stepStart = Date.now();

      const snapshot = await extractPageSnapshot(page);
      const friction = detectFriction(persona, snapshot, step);
      const action = planNextAction(persona, snapshot, recorder.getSteps());
      const emotion = assessEmotion(persona, snapshot, recorder.getSteps(), friction);
      const thought = generateThought(persona, snapshot, action, emotion, step);

      recorder.recordStep({
        page: snapshot,
        action,
        thought,
        emotionalState: emotion,
        frictionPoints: friction,
        timeSpentMs: Date.now() - stepStart,
      });

      if (action.type === "give_up") {
        break;
      }

      const result = await executeAction(page, { type: action.type, target: action.target, value: action.value });
      if (!result.success) {
        const failSnapshot = await extractPageSnapshot(page);
        recorder.recordStep({
          page: failSnapshot,
          action: { type: "give_up", reasoning: `${persona.name}'s intended action failed — this would confuse a real user.` },
          thought: `"That didn't work... I clicked something and nothing happened. This is broken."`,
          emotionalState: "frustrated",
          frictionPoints: [{
            id: `friction-fail-${step}`,
            severity: "high",
            description: `Action failed: tried to ${action.type} on ${action.target ?? "element"} but it didn't respond`,
            location: failSnapshot.url,
            suggestion: "Ensure all interactive elements respond to user interaction and provide visual feedback",
            stepIndex: step + 1,
          }],
          timeSpentMs: Date.now() - stepStart,
        });
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    try { if (!page.isClosed()) await page.close(); } catch { /* ignore */ }
  }

  return recorder.finalize(goalAchieved, goalAchievedStep);
}

function generateThought(
  persona: Persona,
  page: PageSnapshot,
  action: { readonly type: string; readonly reasoning: string },
  emotion: string,
  stepIndex: number
): string {
  if (stepIndex === 0) {
    if (page.headings.length > 0) {
      return `"${page.headings[0]}... okay, let me see what this is about."`;
    }
    return `"Hmm, I'm not immediately sure what this site does. Let me look around."`;
  }
  if (emotion === "frustrated") {
    const reasons = [
      `"I've been trying to figure this out and it's not obvious what I should do next."`,
      `"Why is this so complicated? I just want to ${persona.goals[0] ?? 'get something done'}."`,
      `"I'm about to give up. Nothing here is clicking."`,
    ];
    return reasons[stepIndex % reasons.length];
  }
  if (emotion === "confused") {
    if (page.errorMessages.length > 0) return `"Something went wrong... '${page.errorMessages[0]}' — what does that mean?"`;
    return `"I'm not sure what I'm supposed to do here. The page doesn't guide me."`;
  }
  if (emotion === "delighted") return `"Oh nice, this is exactly what I was looking for!"`;
  if (action.type === "give_up") return `"I can't figure this out. A real person would leave at this point."`;
  if (action.type === "click") return `"Let me try clicking that — it looks like it might help me ${persona.goals[0] ?? 'move forward'}."`;
  if (action.type === "type") return `"Alright, filling in this form field..."`;
  if (action.type === "scroll") return `"Let me scroll down to see if there's more content below."`;
  return `"Okay, let me see what's here..."`;
}
