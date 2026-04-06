import type { Page } from "puppeteer-core";
import type { PageSnapshot, PageElement } from "../types.js";
import type { NetworkMonitor } from "./network-monitor.js";
import type { ConsoleMonitor } from "./console-monitor.js";
import { collectPerformanceMetrics } from "./performance.js";
import { runAccessibilityAudit } from "./accessibility.js";
import { inspectStorage } from "./storage-inspector.js";

export interface SnapshotOptions {
  readonly fullPage?: boolean;
  readonly networkMonitor?: NetworkMonitor;
  readonly consoleMonitor?: ConsoleMonitor;
  /** Skip heavy audits (accessibility, storage) for faster snapshots during steps. */
  readonly lightweight?: boolean;
}

/**
 * Extract a full snapshot of the current page state.
 * Gathers all interactive elements, text content, headings, error messages,
 * plus optional v0.3 data: performance metrics, accessibility, network, console, storage.
 */
export async function extractPageSnapshot(
  page: Page,
  options?: SnapshotOptions
): Promise<PageSnapshot> {
  const startTime = Date.now();

  const url = page.url();
  const title = await page.title();

  const pageData = await page.evaluate(() => {
    const getSelector = (el: Element): string => {
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
    };

    const isVisible = (el: Element): boolean => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const toPageElement = (el: Element) => {
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
    };

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

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((h) => (h.textContent ?? "").trim())
      .filter((t) => t.length > 0);

    const mainText = (document.body?.innerText ?? "").trim().slice(0, 500);

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
    fullPage: options?.fullPage ?? false,
    encoding: "binary",
  });
  const screenshot = Buffer.from(screenshotBuffer).toString("base64");

  const loadTimeMs = Date.now() - startTime;

  // ── v0.3 enrichment: collect performance, network, console, storage, a11y ──

  // Performance metrics (always collected — lightweight)
  let performance = undefined;
  try {
    performance = await collectPerformanceMetrics(page);
  } catch {
    // Performance collection may fail on some pages — graceful degradation
  }

  // Network summary (from monitor if available)
  const network = options?.networkMonitor?.getSummary() ?? undefined;

  // Console summary (from monitor if available)
  const console = options?.consoleMonitor?.getSummary() ?? undefined;

  // Accessibility audit (skip in lightweight mode to keep step speed)
  let accessibility = undefined;
  if (!options?.lightweight) {
    try {
      accessibility = await runAccessibilityAudit(page);
    } catch {
      // axe-core injection may fail on some pages
    }
  }

  // Storage inspection (skip in lightweight mode)
  let storage = undefined;
  if (!options?.lightweight) {
    try {
      storage = await inspectStorage(page);
    } catch {
      // Storage inspection may fail on cross-origin pages
    }
  }

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
    performance,
    network,
    console,
    accessibility,
    storage,
  };
}
