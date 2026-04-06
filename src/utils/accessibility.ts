import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "puppeteer-core";

const require = createRequire(import.meta.url);

// -- Public types ------------------------------------------------------------

export interface AccessibilityViolation {
  readonly id: string;
  readonly impact: "minor" | "moderate" | "serious" | "critical";
  readonly description: string;
  readonly help: string;
  readonly helpUrl: string;
  readonly affectedNodes: number;
  readonly wcagCriteria: string[];
  readonly target: string[]; // CSS selectors of affected elements
}

export interface AccessibilityReport {
  readonly score: number; // 0-100, where 100 = no violations
  readonly violations: AccessibilityViolation[];
  readonly passes: number;
  readonly incomplete: number;
  readonly violationsByImpact: {
    readonly critical: number;
    readonly serious: number;
    readonly moderate: number;
    readonly minor: number;
  };
  readonly wcagLevel: string;
}

export interface AuditOptions {
  readonly wcagLevel?: "wcag2a" | "wcag2aa" | "wcag2aaa";
  readonly rules?: string[];
}

// -- Internal axe-core result shape (subset) ---------------------------------

interface AxeNode { readonly target: string[] }
interface AxeViolation {
  readonly id: string;
  readonly impact: "minor" | "moderate" | "serious" | "critical" | null;
  readonly description: string;
  readonly help: string;
  readonly helpUrl: string;
  readonly nodes: AxeNode[];
  readonly tags: string[];
}
interface AxeResults {
  readonly violations: AxeViolation[];
  readonly passes: unknown[];
  readonly incomplete: unknown[];
}

// -- Module-level: load axe-core source once ---------------------------------

/** axe-core bundle resolved via createRequire for ESM compatibility. */
const axeSource: string = readFileSync(
  require.resolve("axe-core/axe.min.js"),
  "utf-8"
);

// -- Helpers -----------------------------------------------------------------

/** Convert axe tag (e.g. "wcag111") to WCAG criterion string "1.1.1". */
function parseWcagCriteria(tags: readonly string[]): string[] {
  return tags
    .filter((t) => /^wcag\d{3,}$/.test(t))
    .map((t) => t.replace("wcag", "").split("").join("."));
}

/** score = max(0, 100 - (critical*25 + serious*15 + moderate*5 + minor*2)) */
function calculateScore(c: AccessibilityReport["violationsByImpact"]): number {
  return Math.max(0, 100 - (c.critical * 25 + c.serious * 15 + c.moderate * 5 + c.minor * 2));
}

function parseViolations(raw: readonly AxeViolation[]): AccessibilityViolation[] {
  return raw.map((v) => ({
    id: v.id,
    impact: v.impact ?? "minor",
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    affectedNodes: v.nodes.length,
    wcagCriteria: parseWcagCriteria(v.tags),
    target: v.nodes.flatMap((n) => n.target),
  }));
}

// -- Public API --------------------------------------------------------------

/**
 * Run an axe-core WCAG accessibility audit on a Puppeteer page.
 *
 * Injects axe-core from node_modules, runs the audit at the requested WCAG
 * conformance level, and returns a structured report with a 0-100 score.
 *
 * @param page    Puppeteer Page instance to audit.
 * @param options Optional WCAG level (default: `wcag2aa`) and rule filter.
 *
 * @example
 * const report = await runAccessibilityAudit(page, { wcagLevel: "wcag2aa" });
 * console.log(`Score: ${report.score}/100  Violations: ${report.violations.length}`);
 */
export async function runAccessibilityAudit(
  page: Page,
  options: AuditOptions = {}
): Promise<AccessibilityReport> {
  const { wcagLevel = "wcag2aa", rules } = options;

  await page.evaluate(axeSource); // inject axe-core

  const rawResults = await page.evaluate(
    (level: string, ruleIds: string[] | undefined): Promise<AxeResults> => {
      // @ts-expect-error — axe is injected at runtime via page.evaluate
      return axe.run(document, {
        runOnly: { type: "tag", values: [level] },
        ...(ruleIds?.length
          ? { rules: Object.fromEntries(ruleIds.map((id) => [id, { enabled: true }])) }
          : {}),
      }) as Promise<AxeResults>;
    },
    wcagLevel,
    rules
  );

  const violations = parseViolations(rawResults.violations);
  const violationsByImpact = {
    critical: violations.filter((v) => v.impact === "critical").length,
    serious:  violations.filter((v) => v.impact === "serious").length,
    moderate: violations.filter((v) => v.impact === "moderate").length,
    minor:    violations.filter((v) => v.impact === "minor").length,
  };

  return {
    score: calculateScore(violationsByImpact),
    violations,
    passes: rawResults.passes.length,
    incomplete: rawResults.incomplete.length,
    violationsByImpact,
    wcagLevel,
  };
}
