import type { Page } from "puppeteer-core";
import { resolveSelector } from "./selector-engine.js";

const DEFAULT_WAIT_TIMEOUT = 5000;
const POST_ACTION_DELAY = 1500;
const SCROLL_DELAY = 800;

export interface ActionInput {
  readonly type: string;
  readonly target?: string;
  readonly value?: string;
  readonly scrollAmount?: number;
}

export interface ActionResult {
  readonly success: boolean;
  readonly error: string | null;
  /** The resolved selector that actually worked (may differ from input target). */
  readonly resolvedSelector?: string;
}

/**
 * Wait for and resolve a selector, trying smart fallbacks if the primary fails.
 * Returns the selector string that worked, or throws.
 */
async function waitForTarget(page: Page, target: string): Promise<string> {
  // First try direct waitForSelector (fast path)
  try {
    await page.waitForSelector(target, { visible: true, timeout: DEFAULT_WAIT_TIMEOUT });
    return target;
  } catch {
    // Primary selector failed — try smart selector resolution
  }

  // Use resolveSelector which tries multiple strategies
  const handle = await resolveSelector(page, target, [], 3_000);
  if (handle) {
    // Get the selector that worked by evaluating back to a CSS path
    const resolvedSel = await page.evaluate((el: Element) => {
      if (el.id) return `#${el.id}`;
      if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
      if (el.getAttribute("name")) return `[name="${el.getAttribute("name")}"]`;
      return "";
    }, handle);
    if (resolvedSel) return resolvedSel;
    // Fallback: return the original target and hope for the best
    return target;
  }

  throw new Error(`Element not found: ${target}`);
}

/**
 * Execute an action on a Puppeteer page.
 * Supports: click, type, scroll, scroll_up, navigate, select, hover, press_key, wait, read, give_up.
 */
export async function executeAction(page: Page, action: ActionInput): Promise<ActionResult> {
  try {
    switch (action.type) {
      case "click": {
        if (!action.target) return { success: false, error: "click requires a target selector" };
        const resolved = await waitForTarget(page, action.target);
        await page.click(resolved);
        await new Promise((resolve) => setTimeout(resolve, POST_ACTION_DELAY));
        return { success: true, error: null, resolvedSelector: resolved };
      }

      case "type": {
        if (!action.target) return { success: false, error: "type requires a target selector" };
        if (!action.value) return { success: false, error: "type requires a value" };
        const resolved = await waitForTarget(page, action.target);
        await page.click(resolved, { count: 3 });
        await page.type(resolved, action.value);
        return { success: true, error: null, resolvedSelector: resolved };
      }

      case "scroll": {
        const amount = action.scrollAmount ?? 500;
        await page.evaluate((px: number) => window.scrollBy(0, px), amount);
        await new Promise((resolve) => setTimeout(resolve, SCROLL_DELAY));
        return { success: true, error: null };
      }

      case "scroll_up": {
        const amount = action.scrollAmount ?? 500;
        await page.evaluate((px: number) => window.scrollBy(0, -px), amount);
        await new Promise((resolve) => setTimeout(resolve, SCROLL_DELAY));
        return { success: true, error: null };
      }

      case "navigate": {
        if (!action.value) return { success: false, error: "navigate requires a URL in value" };
        await page.goto(action.value, { waitUntil: "networkidle2", timeout: 30_000 });
        return { success: true, error: null };
      }

      case "select": {
        if (!action.target) return { success: false, error: "select requires a target selector" };
        if (!action.value) return { success: false, error: "select requires a value" };
        const resolved = await waitForTarget(page, action.target);
        await page.select(resolved, action.value);
        return { success: true, error: null, resolvedSelector: resolved };
      }

      case "hover": {
        if (!action.target) return { success: false, error: "hover requires a target selector" };
        const resolved = await waitForTarget(page, action.target);
        await page.hover(resolved);
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { success: true, error: null, resolvedSelector: resolved };
      }

      case "press_key": {
        if (!action.value) return { success: false, error: "press_key requires a key name in value" };
        await page.keyboard.press(action.value as any);
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { success: true, error: null };
      }

      case "wait": {
        const ms = action.scrollAmount ?? 2000;
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { success: true, error: null };
      }

      case "read":
      case "give_up": {
        return { success: true, error: null };
      }

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
