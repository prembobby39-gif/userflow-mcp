import type { UserSession, SessionStep, FrictionPoint, EmotionalState } from "../types.js";
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
