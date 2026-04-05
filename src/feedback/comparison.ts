import type { UserSession, PersonaComparison, FrictionPoint } from "../types.js";

/**
 * Compare sessions from multiple personas on the same flow.
 * Identifies shared friction points and divergence points.
 */
export function comparePersonaSessions(
  sessions: readonly UserSession[]
): PersonaComparison {
  if (sessions.length === 0) {
    return {
      personas: [],
      sessions: [],
      sharedFriction: [],
      divergencePoints: [],
      overallRecommendations: [],
    };
  }

  const personas = sessions.map((s) => s.persona);

  // Find friction points that appear across multiple personas
  const frictionByUrl = new Map<string, { friction: FrictionPoint; personas: Set<string> }[]>();

  for (const session of sessions) {
    for (const step of session.steps) {
      for (const friction of step.frictionPoints) {
        const urlFriction = frictionByUrl.get(friction.location) ?? [];
        // Check if similar friction already recorded
        const existing = urlFriction.find((f) =>
          f.friction.description === friction.description
        );
        if (existing) {
          existing.personas.add(session.persona.name);
        } else {
          urlFriction.push({
            friction,
            personas: new Set([session.persona.name]),
          });
        }
        frictionByUrl.set(friction.location, urlFriction);
      }
    }
  }

  // Shared friction = friction experienced by 2+ personas
  const sharedFriction: FrictionPoint[] = [];
  for (const [, frictionList] of frictionByUrl) {
    for (const item of frictionList) {
      if (item.personas.size >= 2) {
        sharedFriction.push(item.friction);
      }
    }
  }

  // Divergence points: steps where personas took different actions on the same URL
  const divergencePoints: PersonaComparison["divergencePoints"] extends readonly (infer T)[] ? T[] : never[] = [];

  // Build URL → persona action map per step index
  const maxSteps = Math.max(...sessions.map((s) => s.steps.length));
  for (let step = 0; step < Math.min(maxSteps, 20); step++) {
    const actionsAtStep: { persona: string; action: string; thought: string; url: string }[] = [];

    for (const session of sessions) {
      const sessionStep = session.steps[step];
      if (sessionStep) {
        actionsAtStep.push({
          persona: session.persona.name,
          action: `${sessionStep.action.type}${sessionStep.action.target ? ` → ${sessionStep.action.target}` : ""}`,
          thought: sessionStep.thought,
          url: sessionStep.page.url,
        });
      }
    }

    // Check if actions diverge
    const uniqueActions = new Set(actionsAtStep.map((a) => a.action));
    if (uniqueActions.size > 1 && actionsAtStep.length > 1) {
      divergencePoints.push({
        step,
        url: actionsAtStep[0].url,
        personaActions: actionsAtStep.map((a) => ({
          persona: a.persona,
          action: a.action,
          thought: a.thought,
        })),
      });
    }
  }

  // Generate overall recommendations
  const overallRecommendations: string[] = [];

  if (sharedFriction.length > 0) {
    overallRecommendations.push(
      `Fix ${sharedFriction.length} shared friction point(s) first — these affect ALL user types`
    );
  }

  const failedSessions = sessions.filter((s) => !s.summary.goalAchieved);
  if (failedSessions.length > 0) {
    const failedPersonas = failedSessions.map((s) => s.persona.name).join(", ");
    overallRecommendations.push(
      `${failedSessions.length}/${sessions.length} personas could not achieve their goal (${failedPersonas})`
    );
  }

  const avgFriction = sessions.reduce((sum, s) => sum + s.summary.frictionScore, 0) / sessions.length;
  if (avgFriction > 5) {
    overallRecommendations.push(
      `Average friction score is ${avgFriction.toFixed(1)}/10 — the flow needs significant UX improvement`
    );
  }

  if (divergencePoints.length > 3) {
    overallRecommendations.push(
      `${divergencePoints.length} divergence points found — the UI is interpreted differently by different user types`
    );
  }

  return {
    personas,
    sessions: [...sessions],
    sharedFriction,
    divergencePoints,
    overallRecommendations,
  };
}

/**
 * Generate a markdown comparison report.
 */
export function generateComparisonReport(comparison: PersonaComparison): string {
  const lines: string[] = [];

  lines.push(`# Multi-Persona Comparison Report`);
  lines.push(``);
  lines.push(`**Personas tested:** ${comparison.personas.map((p) => p.name).join(", ")}`);
  lines.push(``);

  // Summary table
  lines.push(`## Session Summary`);
  lines.push(``);
  lines.push(`| Persona | Steps | Friction | Goal | Emotional Trend |`);
  lines.push(`|---------|-------|----------|------|-----------------|`);
  for (const session of comparison.sessions) {
    lines.push(
      `| ${session.persona.name} | ${session.summary.totalSteps} | ${session.summary.frictionScore}/10 | ${session.summary.goalAchieved ? "✅" : "❌"} | ${session.summary.emotionalJourney[session.summary.emotionalJourney.length - 1] ?? "n/a"} |`
    );
  }
  lines.push(``);

  // Shared friction
  if (comparison.sharedFriction.length > 0) {
    lines.push(`## Shared Friction Points (affect all users)`);
    lines.push(``);
    for (const friction of comparison.sharedFriction) {
      lines.push(`- **[${friction.severity.toUpperCase()}]** ${friction.description}`);
      lines.push(`  → ${friction.suggestion}`);
    }
    lines.push(``);
  }

  // Divergence points
  if (comparison.divergencePoints.length > 0) {
    lines.push(`## Divergence Points`);
    lines.push(``);
    lines.push(`These are moments where different personas interpreted the UI differently:`);
    lines.push(``);
    for (const dp of comparison.divergencePoints.slice(0, 10)) {
      lines.push(`### Step ${dp.step} — ${dp.url}`);
      for (const pa of dp.personaActions) {
        lines.push(`- **${pa.persona}:** ${pa.action}`);
        lines.push(`  > ${pa.thought}`);
      }
      lines.push(``);
    }
  }

  // Overall recommendations
  if (comparison.overallRecommendations.length > 0) {
    lines.push(`## Overall Recommendations`);
    lines.push(``);
    for (let i = 0; i < comparison.overallRecommendations.length; i++) {
      lines.push(`${i + 1}. ${comparison.overallRecommendations[i]}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}
