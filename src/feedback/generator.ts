import type { UserSession, SessionStep, FrictionPoint, EmotionalState, PerformanceMetrics, AccessibilityReport, NetworkSummary, ConsoleSummary } from "../types.js";
import { analyzeEmotionalArc, summarizeEmotionalArc } from "../analysis/emotional-arc.js";
import { assessCognitiveLoad } from "../analysis/cognitive-load.js";
import { assessClarity } from "../analysis/clarity.js";

const EMOTION_ICONS: Readonly<Record<EmotionalState, string>> = {
  curious: "🔍",
  confident: "✅",
  neutral: "😐",
  confused: "❓",
  frustrated: "😤",
  delighted: "😊",
  anxious: "😰",
  bored: "😴",
};

const SEVERITY_ICONS: Readonly<Record<string, string>> = {
  low: "💡",
  medium: "⚠️",
  high: "🛑",
  critical: "🚨",
};

/**
 * Generate a complete markdown feedback report from a user session.
 */
export function generateSessionReport(session: UserSession): string {
  const { persona, steps, summary } = session;
  const arc = analyzeEmotionalArc(steps);
  const arcSummary = summarizeEmotionalArc(arc);

  const lines: string[] = [];

  // Header
  lines.push(`# UserFlow Session Report`);
  lines.push(``);
  lines.push(`**URL:** ${session.startUrl}`);
  lines.push(`**Persona:** ${persona.name} — ${persona.description}`);
  lines.push(`**Background:** ${persona.background}`);
  lines.push(`**Goals:** ${persona.goals.join(", ")}`);
  lines.push(`**Tech Literacy:** ${persona.traits.techLiteracy} | **Patience:** ${persona.traits.patience} | **Device:** ${persona.traits.devicePreference}`);
  lines.push(`**Started:** ${session.startedAt} | **Completed:** ${session.completedAt}`);
  lines.push(``);

  // Summary card
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Steps taken | ${summary.totalSteps} |`);
  lines.push(`| Friction score | **${summary.frictionScore}/10** ${frictionLabel(summary.frictionScore)} |`);
  lines.push(`| Goal achieved | ${summary.goalAchieved ? "✅ Yes" : "❌ No"} |`);
  lines.push(`| Drop-off risk | ${summary.dropOffRisk} |`);
  lines.push(`| Emotional trend | ${arc.trend} |`);
  lines.push(``);

  // ── v0.3: Performance Metrics (from first step snapshot) ──
  const firstPerf = steps[0]?.page.performance;
  if (firstPerf) {
    lines.push(`## Core Web Vitals`);
    lines.push(``);
    lines.push(`| Metric | Value | Rating |`);
    lines.push(`|--------|-------|--------|`);
    if (firstPerf.lcp !== null) lines.push(`| LCP | ${firstPerf.lcp.toFixed(0)}ms | ${ratingEmoji(firstPerf.lcpRating)} ${firstPerf.lcpRating ?? "—"} |`);
    if (firstPerf.cls !== null) lines.push(`| CLS | ${firstPerf.cls.toFixed(3)} | ${ratingEmoji(firstPerf.clsRating)} ${firstPerf.clsRating ?? "—"} |`);
    if (firstPerf.inp !== null) lines.push(`| INP | ${firstPerf.inp.toFixed(0)}ms | ${ratingEmoji(firstPerf.inpRating)} ${firstPerf.inpRating ?? "—"} |`);
    if (firstPerf.fcp !== null) lines.push(`| FCP | ${firstPerf.fcp.toFixed(0)}ms | — |`);
    if (firstPerf.ttfb !== null) lines.push(`| TTFB | ${firstPerf.ttfb.toFixed(0)}ms | — |`);
    lines.push(`| Resources | ${firstPerf.resourceCount} files (${(firstPerf.totalResourceSize / 1024).toFixed(0)}KB) | — |`);
    lines.push(``);
  }

  // ── v0.3: Accessibility (from first step snapshot) ──
  const firstA11y = steps[0]?.page.accessibility;
  if (firstA11y) {
    lines.push(`## Accessibility (${firstA11y.wcagLevel})`);
    lines.push(``);
    lines.push(`**Score:** ${firstA11y.score}/100 | **Violations:** ${firstA11y.violations.length} | **Passes:** ${firstA11y.passes}`);
    lines.push(``);
    if (firstA11y.violations.length > 0) {
      lines.push(`| Impact | Issue | Help | Affected |`);
      lines.push(`|--------|-------|------|----------|`);
      for (const v of firstA11y.violations.slice(0, 10)) {
        lines.push(`| ${impactEmoji(v.impact)} ${v.impact} | ${v.description} | [${v.id}](${v.helpUrl}) | ${v.affectedNodes} nodes |`);
      }
      if (firstA11y.violations.length > 10) {
        lines.push(`| … | +${firstA11y.violations.length - 10} more violations | | |`);
      }
      lines.push(``);
    }
  }

  // ── v0.3: Network Summary (from first step snapshot) ──
  const firstNet = steps[0]?.page.network;
  if (firstNet && firstNet.totalRequests > 0) {
    lines.push(`## Network`);
    lines.push(``);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total requests | ${firstNet.totalRequests} |`);
    lines.push(`| Failed requests | ${firstNet.failedRequests > 0 ? `🛑 ${firstNet.failedRequests}` : "0"} |`);
    lines.push(`| Transfer size | ${(firstNet.totalTransferSize / 1024).toFixed(0)}KB |`);
    lines.push(`| Avg response time | ${firstNet.averageResponseTime.toFixed(0)}ms |`);
    lines.push(``);
    if (firstNet.slowestRequests.length > 0) {
      lines.push(`**Slowest requests:**`);
      for (const req of firstNet.slowestRequests.slice(0, 3)) {
        const shortUrl = req.url.length > 80 ? req.url.slice(0, 80) + "…" : req.url;
        lines.push(`- ${req.duration.toFixed(0)}ms — \`${shortUrl}\``);
      }
      lines.push(``);
    }
  }

  // ── v0.3: Console Errors (from first step snapshot) ──
  const firstConsole = steps[0]?.page.console;
  if (firstConsole && (firstConsole.errors > 0 || firstConsole.pageErrors > 0)) {
    lines.push(`## Console Errors`);
    lines.push(``);
    lines.push(`⚠️ **${firstConsole.errors} JS errors**, ${firstConsole.warnings} warnings, ${firstConsole.pageErrors} uncaught exceptions`);
    lines.push(``);
    if (firstConsole.criticalErrors.length > 0) {
      for (const err of firstConsole.criticalErrors.slice(0, 5)) {
        lines.push(`- \`${err.text.slice(0, 150)}\``);
      }
      lines.push(``);
    }
  }

  // Emotional journey
  lines.push(`## Emotional Journey`);
  lines.push(``);
  lines.push(summary.emotionalJourney.map((e, i) => `Step ${i}: ${EMOTION_ICONS[e]} ${e}`).join(" → "));
  lines.push(``);
  lines.push(arcSummary);
  lines.push(``);

  // Step-by-step walkthrough
  lines.push(`## Step-by-Step Walkthrough`);
  lines.push(``);

  for (const step of steps) {
    lines.push(`### Step ${step.index}: ${step.page.title || step.page.url}`);
    lines.push(``);
    lines.push(`${EMOTION_ICONS[step.emotionalState]} **${step.emotionalState}** | ${step.action.type}${step.action.target ? ` → \`${step.action.target}\`` : ""}`);
    lines.push(``);
    lines.push(`> ${step.thought}`);
    lines.push(``);

    // Page analysis (for first and key steps)
    if (step.index === 0 || step.frictionPoints.length > 0) {
      const cogLoad = assessCognitiveLoad(step.page);
      const clarity = assessClarity(step.page);
      lines.push(`📊 Cognitive Load: ${cogLoad.score}/10 (${cogLoad.visualComplexity}) | Clarity: ${clarity.score}/10`);
      lines.push(``);
    }

    // Step-level performance (if available)
    if (step.page.performance && step.index > 0) {
      const perf = step.page.performance;
      const parts: string[] = [];
      if (perf.lcp !== null) parts.push(`LCP: ${perf.lcp.toFixed(0)}ms`);
      if (perf.cls !== null) parts.push(`CLS: ${perf.cls.toFixed(3)}`);
      if (parts.length > 0) {
        lines.push(`⚡ ${parts.join(" | ")}`);
        lines.push(``);
      }
    }

    // Friction points
    if (step.frictionPoints.length > 0) {
      for (const friction of step.frictionPoints) {
        lines.push(`${SEVERITY_ICONS[friction.severity]} **${friction.severity.toUpperCase()}:** ${friction.description}`);
        lines.push(`   → ${friction.suggestion}`);
      }
      lines.push(``);
    }
  }

  // Top friction points
  if (summary.topFrictionPoints.length > 0) {
    lines.push(`## Top Friction Points`);
    lines.push(``);
    lines.push(`| # | Severity | Issue | Suggestion |`);
    lines.push(`|---|----------|-------|------------|`);
    for (let i = 0; i < summary.topFrictionPoints.length; i++) {
      const f = summary.topFrictionPoints[i];
      lines.push(`| ${i + 1} | ${SEVERITY_ICONS[f.severity]} ${f.severity} | ${f.description} | ${f.suggestion} |`);
    }
    lines.push(``);
  }

  // Recommendations
  if (summary.recommendations.length > 0) {
    lines.push(`## Recommendations`);
    lines.push(``);
    for (let i = 0; i < summary.recommendations.length; i++) {
      lines.push(`${i + 1}. ${summary.recommendations[i]}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

/**
 * Generate a brief first-impression report.
 */
export function generateQuickImpressionReport(params: {
  readonly url: string;
  readonly personaName: string;
  readonly firstImpression: string;
  readonly whatItDoes: string;
  readonly clarityScore: number;
  readonly emotionalReaction: EmotionalState;
  readonly wouldContinue: boolean;
  readonly reasoning: string;
}): string {
  const lines: string[] = [];
  lines.push(`# Quick Impression Report`);
  lines.push(``);
  lines.push(`**URL:** ${params.url}`);
  lines.push(`**Persona:** ${params.personaName}`);
  lines.push(``);
  lines.push(`## First Impression`);
  lines.push(``);
  lines.push(`> ${params.firstImpression}`);
  lines.push(``);
  lines.push(`**What the user thinks it does:** ${params.whatItDoes}`);
  lines.push(`**Clarity score:** ${params.clarityScore}/10`);
  lines.push(`**Emotional reaction:** ${EMOTION_ICONS[params.emotionalReaction]} ${params.emotionalReaction}`);
  lines.push(`**Would continue:** ${params.wouldContinue ? "✅ Yes" : "❌ No"}`);
  lines.push(``);
  lines.push(`**Reasoning:** ${params.reasoning}`);
  lines.push(``);

  return lines.join("\n");
}

function frictionLabel(score: number): string {
  if (score <= 2) return "(Low — smooth experience)";
  if (score <= 4) return "(Moderate — some bumps)";
  if (score <= 6) return "(High — significant friction)";
  if (score <= 8) return "(Very High — likely abandonment)";
  return "(Critical — broken experience)";
}

function ratingEmoji(rating: string | null): string {
  if (rating === "good") return "🟢";
  if (rating === "needs-improvement") return "🟡";
  if (rating === "poor") return "🔴";
  return "⚪";
}

function impactEmoji(impact: string): string {
  if (impact === "critical") return "🚨";
  if (impact === "serious") return "🛑";
  if (impact === "moderate") return "⚠️";
  return "💡";
}
