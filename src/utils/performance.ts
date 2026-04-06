import type { Page } from "puppeteer-core";

// ── Types ──────────────────────────────────────────────────────

export interface PerformanceMetrics {
  /** Largest Contentful Paint (ms) */
  lcp: number | null;
  /** Cumulative Layout Shift (unitless score) */
  cls: number | null;
  /** Interaction to Next Paint (ms) */
  inp: number | null;
  /** First Contentful Paint (ms) */
  fcp: number | null;
  /** Time to First Byte (ms) */
  ttfb: number | null;
  /** DOMContentLoaded relative to navigationStart (ms) */
  domContentLoaded: number | null;
  /** domComplete relative to navigationStart (ms) */
  domComplete: number | null;
  /** Total number of resources loaded */
  resourceCount: number;
  /** Total transfer size of all resources (bytes) */
  totalResourceSize: number;
  /** LCP quality rating per Google's thresholds */
  lcpRating: "good" | "needs-improvement" | "poor" | null;
  /** CLS quality rating per Google's thresholds */
  clsRating: "good" | "needs-improvement" | "poor" | null;
  /** INP quality rating per Google's thresholds */
  inpRating: "good" | "needs-improvement" | "poor" | null;
}

// ── Rating helpers ─────────────────────────────────────────────

type Rating = "good" | "needs-improvement" | "poor";

function rateLcp(ms: number): Rating {
  if (ms <= 2500) return "good";
  if (ms <= 4000) return "needs-improvement";
  return "poor";
}

function rateCls(score: number): Rating {
  if (score <= 0.1) return "good";
  if (score <= 0.25) return "needs-improvement";
  return "poor";
}

function rateInp(ms: number): Rating {
  if (ms <= 200) return "good";
  if (ms <= 500) return "needs-improvement";
  return "poor";
}

// ── Observer injection ─────────────────────────────────────────

/**
 * Inject PerformanceObservers into every new document before navigation.
 *
 * Must be called before `page.goto()`. Stores collected values on
 * `window.__userflow_perf` so they can be read by `collectPerformanceMetrics`.
 */
export async function injectPerformanceObservers(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    type PerfStore = { lcp: number | null; cls: number | null; inp: number | null };
    const store: PerfStore = { lcp: null, cls: null, inp: null };
    // @ts-expect-error — injected global not in Window typings
    window.__userflow_perf = store;

    const observe = (type: string, opts: PerformanceObserverInit, cb: (e: PerformanceEntry) => void) => {
      try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true, ...opts }); }
      catch { /* entry type unsupported in this browser */ }
    };

    // LCP — last entry wins (browser re-fires until first user interaction)
    observe("largest-contentful-paint", {}, (e) => { store.lcp = (e as PerformanceEntry & { startTime: number }).startTime; });

    // CLS — accumulate shifts not preceded by user input
    observe("layout-shift", {}, (e) => {
      const s = e as PerformanceEntry & { hadRecentInput: boolean; value: number };
      if (!s.hadRecentInput) store.cls = (store.cls ?? 0) + s.value;
    });

    // INP — worst (max) event duration; durationThreshold cast needed for older TS lib defs
    observe("event", { durationThreshold: 16 } as PerformanceObserverInit, (e) => {
      const d = (e as PerformanceEntry & { duration: number }).duration;
      if (store.inp === null || d > store.inp) store.inp = d;
    });
  });
}

// ── Metric collection ──────────────────────────────────────────

/**
 * Read all performance metrics from the page after it has loaded.
 *
 * Combines values captured by `injectPerformanceObservers` with
 * Navigation Timing and Resource Timing data from the browser's
 * Performance API. Missing or unsupported metrics are returned as `null`.
 */
export async function collectPerformanceMetrics(page: Page): Promise<PerformanceMetrics> {
  const raw = await page.evaluate(() => {
    // Observed vitals written by the injected PerformanceObservers
    const vitals = (window as unknown as { __userflow_perf?: { lcp: number | null; cls: number | null; inp: number | null } })
      .__userflow_perf ?? { lcp: null, cls: null, inp: null };

    // Navigation Timing (Level 2)
    const [navEntry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    const ttfb = navEntry ? navEntry.responseStart - navEntry.requestStart : null;
    const domContentLoaded = navEntry ? navEntry.domContentLoadedEventEnd - navEntry.startTime : null;
    const domComplete = navEntry ? navEntry.domComplete - navEntry.startTime : null;

    // FCP via paint entries
    const fcpEntry = performance.getEntriesByName("first-contentful-paint")[0] as (PerformanceEntry & { startTime: number }) | undefined;
    const fcp = fcpEntry ? fcpEntry.startTime : null;

    // Resource summary
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const resourceCount = resources.length;
    const totalResourceSize = resources.reduce(
      (sum, r) => sum + (r.transferSize ?? 0),
      0
    );

    return {
      lcp: vitals.lcp,
      cls: vitals.cls,
      inp: vitals.inp,
      fcp,
      ttfb,
      domContentLoaded,
      domComplete,
      resourceCount,
      totalResourceSize,
    };
  });

  return {
    lcp: raw.lcp,
    cls: raw.cls,
    inp: raw.inp,
    fcp: raw.fcp,
    ttfb: raw.ttfb,
    domContentLoaded: raw.domContentLoaded,
    domComplete: raw.domComplete,
    resourceCount: raw.resourceCount,
    totalResourceSize: raw.totalResourceSize,
    lcpRating: raw.lcp !== null ? rateLcp(raw.lcp) : null,
    clsRating: raw.cls !== null ? rateCls(raw.cls) : null,
    inpRating: raw.inp !== null ? rateInp(raw.inp) : null,
  };
}
