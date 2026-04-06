/**
 * Smart Selector Engine for Puppeteer
 *
 * Generates reliable, fallback-capable selectors that survive styled-components
 * and dynamic class names. Each element gets multiple selector strategies tried
 * in priority order, from most stable to least stable.
 */

import type { Page, ElementHandle } from "puppeteer-core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmartSelector {
  /** The best selector to try first. */
  primary: string;
  /** Ordered list of alternatives to try if primary fails. */
  fallbacks: string[];
  /** Human-readable description of what the element is. */
  description: string;
  /** Strategy used to derive the primary selector. */
  strategy: "testid" | "id" | "aria" | "role-text" | "input-attr" | "link-href" | "text" | "css";
}

// ---------------------------------------------------------------------------
// Browser-context helper (runs inside page.evaluate)
// ---------------------------------------------------------------------------

/**
 * Generates multiple selector strategies for an element.
 * Designed to run inside `page.evaluate()` — has no Node.js dependencies.
 *
 * Priority order (most → least stable):
 *   1. data-testid
 *   2. Unique id
 *   3. aria-label / aria-labelledby
 *   4. role + visible text
 *   5. input type + name or placeholder
 *   6. anchor href
 *   7. Puppeteer text pseudo-selector
 *   8. Minimal CSS path (fallback)
 */
export function generateSmartSelectors(element: Element): SmartSelector {
  const tag = element.tagName.toLowerCase();
  const candidates: Array<{ selector: string; strategy: SmartSelector["strategy"] }> = [];

  // 1. data-testid (most stable — explicit test hook)
  const testid = element.getAttribute("data-testid") ?? element.getAttribute("data-test-id") ?? element.getAttribute("data-cy");
  if (testid) {
    const attr = element.hasAttribute("data-testid") ? "data-testid" : element.hasAttribute("data-test-id") ? "data-test-id" : "data-cy";
    candidates.push({ selector: `[${attr}="${CSS.escape(testid)}"]`, strategy: "testid" });
  }

  // 2. Unique id attribute
  const id = element.getAttribute("id");
  if (id && document.querySelectorAll(`#${CSS.escape(id)}`).length === 1) {
    candidates.push({ selector: `#${CSS.escape(id)}`, strategy: "id" });
  }

  // 3. aria-label / aria-labelledby
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    candidates.push({ selector: `[aria-label="${CSS.escape(ariaLabel)}"]`, strategy: "aria" });
  }
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    candidates.push({ selector: `[aria-labelledby="${CSS.escape(labelledBy)}"]`, strategy: "aria" });
  }

  // 4. Role + visible text content (for buttons, links, headings, etc.)
  const role = element.getAttribute("role") ?? tag;
  const visibleText = (element.textContent ?? "").trim().slice(0, 80);
  if (visibleText && ["button", "a", "h1", "h2", "h3", "h4", "h5", "h6", "label", "li"].includes(tag)) {
    candidates.push({ selector: `::-p-aria(${visibleText})`, strategy: "role-text" });
  }

  // 5. Input type + name or placeholder
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const name = element.getAttribute("name");
    const placeholder = element.getAttribute("placeholder");
    const type = element.getAttribute("type") ?? "text";
    if (name) {
      candidates.push({ selector: `${tag}[name="${CSS.escape(name)}"]`, strategy: "input-attr" });
    } else if (placeholder) {
      candidates.push({ selector: `${tag}[placeholder="${CSS.escape(placeholder)}"]`, strategy: "input-attr" });
    } else if (type !== "text") {
      candidates.push({ selector: `${tag}[type="${CSS.escape(type)}"]`, strategy: "input-attr" });
    }
  }

  // 6. Anchor href (for navigation links)
  if (tag === "a") {
    const href = element.getAttribute("href");
    if (href && !href.startsWith("javascript:") && href !== "#") {
      candidates.push({ selector: `a[href="${CSS.escape(href)}"]`, strategy: "link-href" });
    }
  }

  // 7. Puppeteer text pseudo-selector
  if (visibleText) {
    candidates.push({ selector: `::-p-text(${visibleText})`, strategy: "text" });
  }

  // 8. Minimal CSS path (stable ancestor chain, stops at id or body)
  candidates.push({ selector: buildMinimalCssPath(element), strategy: "css" });

  // Build result: first candidate is primary, rest are fallbacks
  const [first, ...rest] = candidates;

  const description = buildDescription(tag, visibleText, ariaLabel, testid, id);

  return {
    primary: first.selector,
    fallbacks: rest.map((c) => c.selector),
    description,
    strategy: first.strategy,
  };
}

/** Builds a minimal CSS path by walking up the DOM, stopping at an id anchor or body. */
function buildMinimalCssPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.tagName.toLowerCase() !== "body") {
    const tag = current.tagName.toLowerCase();
    const id = current.getAttribute("id");

    if (id && document.querySelectorAll(`#${CSS.escape(id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(id)}`);
      break;
    }

    // nth-of-type using only the tag (avoids fragile dynamic class names)
    const siblings = Array.from(current.parentElement?.children ?? []).filter(
      (s) => s.tagName === current!.tagName
    );
    if (siblings.length > 1) {
      const idx = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${idx})`);
    } else {
      parts.unshift(tag);
    }

    current = current.parentElement;
  }

  return parts.join(" > ") || el.tagName.toLowerCase();
}

/** Builds a human-readable description of the element. */
function buildDescription(
  tag: string,
  text: string,
  ariaLabel: string | null,
  testid: string | null,
  id: string | null
): string {
  const label = ariaLabel ?? testid ?? id ?? text;
  if (label) return `${tag}[${label.slice(0, 60)}]`;
  return `<${tag}>`;
}

// ---------------------------------------------------------------------------
// Node.js-context helpers (use Page API)
// ---------------------------------------------------------------------------

/**
 * Tries to find an element on the page using multiple selector strategies.
 * Returns the first `ElementHandle` that successfully resolves, or `null`.
 *
 * @param page     - Puppeteer Page instance.
 * @param target   - Primary selector string or SmartSelector.primary.
 * @param fallbacks - Additional selectors to try if primary fails.
 * @param timeout  - Per-selector wait timeout in ms (default: 3000).
 */
export async function resolveSelector(
  page: Page,
  target: string,
  fallbacks: string[] = [],
  timeout = 3_000
): Promise<ElementHandle | null> {
  const strategies = [target, ...fallbacks];

  for (const selector of strategies) {
    try {
      const handle = await page.waitForSelector(selector, { timeout });
      if (handle) return handle as ElementHandle;
    } catch {
      // Selector not found within timeout — try next
    }
  }

  return null;
}

/**
 * Takes a basic CSS selector (e.g. from a snapshot), injects
 * `generateSmartSelectors` into the page, and returns a richer SmartSelector
 * with stable alternatives.
 *
 * @param page        - Puppeteer Page instance.
 * @param cssSelector - Existing (possibly fragile) CSS selector.
 */
export async function enhanceElementSelectors(
  page: Page,
  cssSelector: string
): Promise<SmartSelector> {
  const result = await page.evaluate(
    // NOTE: generateSmartSelectors is serialised and sent to the browser.
    // It must remain self-contained (no closures over Node.js variables).
    (sel: string, genFnSrc: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return (${genFnSrc})`)() as (e: Element) => unknown;
      return fn(el);
    },
    cssSelector,
    generateSmartSelectors.toString()
  );

  if (!result) {
    // Element not found — return a degenerate SmartSelector
    return {
      primary: cssSelector,
      fallbacks: [],
      description: `<not found: ${cssSelector}>`,
      strategy: "css",
    };
  }

  return result as SmartSelector;
}
