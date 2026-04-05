import type { Page } from "puppeteer-core";

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
        await page.waitForSelector(action.target, { visible: true, timeout: DEFAULT_WAIT_TIMEOUT });
        await page.click(action.target);
        await new Promise((resolve) => setTimeout(resolve, POST_ACTION_DELAY));
        return { success: true, error: null };
      }

      case "type": {
        if (!action.target) return { success: false, error: "type requires a target selector" };
        if (!action.value) return { success: false, error: "type requires a value" };
        await page.waitForSelector(action.target, { visible: true, timeout: DEFAULT_WAIT_TIMEOUT });
        await page.click(action.target, { count: 3 });
        await page.type(action.target, action.value);
        return { success: true, error: null };
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
        await page.waitForSelector(action.target, { timeout: DEFAULT_WAIT_TIMEOUT });
        await page.select(action.target, action.value);
        return { success: true, error: null };
      }

      case "hover": {
        if (!action.target) return { success: false, error: "hover requires a target selector" };
        await page.waitForSelector(action.target, { visible: true, timeout: DEFAULT_WAIT_TIMEOUT });
        await page.hover(action.target);
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { success: true, error: null };
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
