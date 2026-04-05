import type { Page } from "puppeteer-core";
import type { Persona, PageSnapshot, PageElement, UserSession } from "../types.js";
import { getBrowser } from "../utils/browser.js";
import { getMaxSteps, getViewport } from "../personas/engine.js";
import { planNextAction, assessEmotion, detectFriction } from "./action-planner.js";
import { SessionRecorder } from "./session-recorder.js";

const NAVIGATION_TIMEOUT = 30_000;
const DEFAULT_SCALE_FACTOR = 2;

/**
 * Extract a full snapshot of the current page state.
 * Gathers all interactive elements, text content, headings, etc.
 */
async function extractPageSnapshot(page: Page): Promise<PageSnapshot> {
  const startTime = Date.now();

  const url = page.url();
  const title = await page.title();

  // Extract page elements in a single evaluate call for performance
  const pageData = await page.evaluate(() => {
    function getSelector(el: Element): string {
      if (el.id) return `#${el.id}`;
      if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
      if (el.getAttribute("name")) return `[name="${el.getAttribute("name")}"]`;
      const tag = el.tagName.toLowerCase();
      const classes = el.className && typeof el.className === "string"
        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          return `${tag}${classes}:nth-of-type(${index})`;
        }
      }
      return `${tag}${classes}`;
    }

    function isVisible(el: Element): boolean {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function toPageElement(el: Element): {
      selector: string; tagName: string; text: string; type?: string;
      href?: string; isVisible: boolean; isInteractive: boolean;
      ariaLabel?: string; placeholder?: string;
    } {
      const htmlEl = el as HTMLInputElement;
      return {
        selector: getSelector(el),
        tagName: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").trim().slice(0, 200),
        type: htmlEl.type || undefined,
        href: (el as HTMLAnchorElement).href || undefined,
        isVisible: isVisible(el),
        isInteractive: true,
        ariaLabel: el.getAttribute("aria-label") || undefined,
        placeholder: htmlEl.placeholder || undefined,
      };
    }

    // Gather interactive elements
    const buttons = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit'], input[type='button']"))
      .map(toPageElement);
    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter((el) => {
        const href = (el as HTMLAnchorElement).href;
        return href && !href.startsWith("javascript:") && !href.startsWith("#");
      })
      .map(toPageElement);
    const formFields = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select"))
      .map(toPageElement);
    const allInteractive = [...buttons, ...links, ...formFields];

    // Headings
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((h) => (h.textContent ?? "").trim())
      .filter((t) => t.length > 0);

    // Main text content (first 500 chars of body)
    const mainText = (document.body?.innerText ?? "").trim().slice(0, 500);

    // Error messages
    const errorSelectors = [
      "[class*='error']", "[class*='Error']",
      "[role='alert']", "[class*='danger']",
      "[class*='warning']", ".toast-error",
    ];
    const errorMessages = errorSelectors.flatMap((sel) =>
      Array.from(document.querySelectorAll(sel))
        .map((el) => (el.textContent ?? "").trim())
        .filter((t) => t.length > 0 && t.length < 300)
    );

    return { buttons, links, formFields, allInteractive, headings, mainText, errorMessages };
  });

  const screenshotBuffer = await page.screenshot({
    type: "png",
    fullPage: false,
    encoding: "binary",
  });
  const screenshot = Buffer.from(screenshotBuffer).toString("base64");

  const loadTimeMs = Date.now() - startTime;

  return {
    url,
    title,
    timestamp: new Date().toISOString(),
    screenshot,
    interactiveElements: pageData.allInteractive as PageElement[],
    headings: pageData.headings,
    mainText: pageData.mainText,
    formFields: pageData.formFields as PageElement[],
    links: pageData.links as PageElement[],
    buttons: pageData.buttons as PageElement[],
    errorMessages: pageData.errorMessages,
    loadTimeMs,
  };
}

/**
 * Execute a planned action on the page.
 * Returns true if the action was successfully performed.
 */
async function executeAction(
  page: Page,
  action: { readonly type: string; readonly target?: string; readonly value?: string }
): Promise<boolean> {
  try {
    switch (action.type) {
      case "click": {
        if (!action.target) return false;
        await page.waitForSelector(action.target, { visible: true, timeout: 5000 });
        await page.click(action.target);
        // Wait for potential navigation or DOM update
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return true;
      }
      case "type": {
        if (!action.target || !action.value) return false;
        await page.waitForSelector(action.target, { visible: true, timeout: 5000 });
        await page.click(action.target, { count: 3 }); // Select existing text
        await page.type(action.target, action.value);
        return true;
      }
      case "scroll": {
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise((resolve) => setTimeout(resolve, 800));
        return true;
      }
      case "read":
      case "wait": {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return true;
      }
      case "give_up":
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Walk through a web application as a specific persona.
 * Autonomously navigates, interacts, and records observations.
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
    // Navigate to start URL
    await page.goto(startUrl, { waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT });

    for (let step = 0; step < maxSteps; step++) {
      const stepStart = Date.now();

      // 1. Snapshot the current page
      const snapshot = await extractPageSnapshot(page);

      // 2. Detect friction points
      const friction = detectFriction(persona, snapshot, step);

      // 3. Plan the next action
      const action = planNextAction(persona, snapshot, recorder.getSteps());

      // 4. Assess emotional state
      const emotion = assessEmotion(persona, snapshot, recorder.getSteps(), friction);

      // 5. Generate persona thought
      const thought = generateThought(persona, snapshot, action, emotion, step);

      // 6. Record the step
      recorder.recordStep({
        page: snapshot,
        action,
        thought,
        emotionalState: emotion,
        frictionPoints: friction,
        timeSpentMs: Date.now() - stepStart,
      });

      // 7. Check if persona gives up
      if (action.type === "give_up") {
        break;
      }

      // 8. Execute the action
      const success = await executeAction(page, action);
      if (!success) {
        // Action failed — record one more step acknowledging failure
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

      // Brief pause between steps to simulate real user timing
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    try { if (!page.isClosed()) await page.close(); } catch { /* ignore */ }
  }

  return recorder.finalize(goalAchieved, goalAchievedStep);
}

/**
 * Generate a natural-sounding thought for the persona at this step.
 */
function generateThought(
  persona: Persona,
  page: PageSnapshot,
  action: { readonly type: string; readonly reasoning: string },
  emotion: string,
  stepIndex: number
): string {
  const name = persona.name;

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
    if (page.errorMessages.length > 0) {
      return `"Something went wrong... '${page.errorMessages[0]}' — what does that mean?"`;
    }
    return `"I'm not sure what I'm supposed to do here. The page doesn't guide me."`;
  }

  if (emotion === "delighted") {
    return `"Oh nice, this is exactly what I was looking for!"`;
  }

  if (action.type === "give_up") {
    return `"I can't figure this out. A real person would leave at this point."`;
  }

  if (action.type === "click") {
    return `"Let me try clicking that — it looks like it might help me ${persona.goals[0] ?? 'move forward'}."`;
  }

  if (action.type === "type") {
    return `"Alright, filling in this form field..."`;
  }

  if (action.type === "scroll") {
    return `"Let me scroll down to see if there's more content below."`;
  }

  return `"Okay, let me see what's here..."`;
}
