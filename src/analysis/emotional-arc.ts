import type { EmotionalState, EmotionalArc, SessionStep } from "../types.js";

const EMOTION_VALENCE: Readonly<Record<EmotionalState, number>> = {
  delighted: 5,
  confident: 4,
  curious: 3,
  neutral: 2,
  anxious: 1,
  confused: 0,
  bored: -1,
  frustrated: -2,
};

/**
 * Analyze the emotional arc across a session's steps.
 */
export function analyzeEmotionalArc(steps: readonly SessionStep[]): EmotionalArc {
  if (steps.length === 0) {
    return {
      states: [],
      trend: "stable",
      lowestPoint: { step: 0, state: "neutral" },
      highestPoint: { step: 0, state: "neutral" },
    };
  }

  const states = steps.map((s) => s.emotionalState);

  // Find highest and lowest points
  let lowestStep = 0;
  let lowestValence = Infinity;
  let highestStep = 0;
  let highestValence = -Infinity;

  for (let i = 0; i < states.length; i++) {
    const valence = EMOTION_VALENCE[states[i]] ?? 2;
    if (valence < lowestValence) {
      lowestValence = valence;
      lowestStep = i;
    }
    if (valence > highestValence) {
      highestValence = valence;
      highestStep = i;
    }
  }

  // Determine trend
  const trend = determineTrend(states);

  return {
    states,
    trend,
    lowestPoint: { step: lowestStep, state: states[lowestStep] },
    highestPoint: { step: highestStep, state: states[highestStep] },
  };
}

/**
 * Determine the overall emotional trend of the session.
 */
function determineTrend(
  states: readonly EmotionalState[]
): "improving" | "stable" | "declining" | "volatile" {
  if (states.length < 2) return "stable";

  const valences = states.map((s) => EMOTION_VALENCE[s] ?? 2);

  // Calculate changes between consecutive steps
  const changes: number[] = [];
  for (let i = 1; i < valences.length; i++) {
    changes.push(valences[i] - valences[i - 1]);
  }

  const avgChange = changes.reduce((sum, c) => sum + c, 0) / changes.length;
  const volatility = changes.reduce((sum, c) => sum + Math.abs(c), 0) / changes.length;

  // High volatility = volatile
  if (volatility > 2) return "volatile";

  // Consistent direction
  if (avgChange > 0.3) return "improving";
  if (avgChange < -0.3) return "declining";

  return "stable";
}

/**
 * Get a human-readable summary of the emotional journey.
 */
export function summarizeEmotionalArc(arc: EmotionalArc): string {
  if (arc.states.length === 0) return "No emotional data recorded.";

  const trendDescriptions: Record<string, string> = {
    improving: "The user's experience improved over the session",
    stable: "The user's emotional state remained relatively consistent",
    declining: "The user became increasingly frustrated or disengaged",
    volatile: "The user's experience was inconsistent — swinging between positive and negative",
  };

  const parts: string[] = [trendDescriptions[arc.trend] ?? "Unknown trend"];

  parts.push(`Lowest point: step ${arc.lowestPoint.step} (${arc.lowestPoint.state})`);
  parts.push(`Highest point: step ${arc.highestPoint.step} (${arc.highestPoint.state})`);

  const startEmotion = arc.states[0];
  const endEmotion = arc.states[arc.states.length - 1];
  if (startEmotion !== endEmotion) {
    parts.push(`Journey: ${startEmotion} → ${endEmotion}`);
  }

  return parts.join(". ") + ".";
}
