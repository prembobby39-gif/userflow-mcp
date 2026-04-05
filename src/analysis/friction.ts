import type { FrictionPoint, SessionStep, FrictionSeverity } from "../types.js";

const SEVERITY_WEIGHTS: Readonly<Record<FrictionSeverity, number>> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 7,
};

/**
 * Calculate an overall friction score for a set of steps.
 * Returns 0-10 where 10 is maximum friction.
 */
export function calculateFrictionScore(steps: readonly SessionStep[]): number {
  const allFriction = steps.flatMap((s) => s.frictionPoints);
  if (allFriction.length === 0) return 0;

  const totalWeight = allFriction.reduce(
    (sum, f) => sum + (SEVERITY_WEIGHTS[f.severity] ?? 1),
    0
  );

  // Normalize: scale by step count, cap at 10
  const normalized = (totalWeight / Math.max(1, steps.length)) * 2;
  return Math.min(10, Math.round(normalized * 10) / 10);
}

/**
 * Get all friction points sorted by severity (critical first).
 */
export function getSortedFriction(steps: readonly SessionStep[]): readonly FrictionPoint[] {
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return steps
    .flatMap((s) => s.frictionPoints)
    .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));
}

/**
 * Identify which steps have the highest friction concentration.
 */
export function getHighFrictionSteps(steps: readonly SessionStep[]): readonly SessionStep[] {
  return steps.filter((s) =>
    s.frictionPoints.some((f) => f.severity === "high" || f.severity === "critical")
  );
}

/**
 * Group friction points by their location (URL).
 */
export function groupFrictionByLocation(
  steps: readonly SessionStep[]
): ReadonlyMap<string, readonly FrictionPoint[]> {
  const map = new Map<string, FrictionPoint[]>();
  for (const step of steps) {
    for (const friction of step.frictionPoints) {
      const existing = map.get(friction.location) ?? [];
      existing.push(friction);
      map.set(friction.location, existing);
    }
  }
  return map;
}

/**
 * Get a count summary of friction by severity level.
 */
export function countBySeverity(
  steps: readonly SessionStep[]
): Readonly<Record<FrictionSeverity, number>> {
  const counts: Record<FrictionSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const step of steps) {
    for (const friction of step.frictionPoints) {
      counts[friction.severity]++;
    }
  }
  return counts;
}
