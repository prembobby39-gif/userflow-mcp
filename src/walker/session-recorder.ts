import type { SessionStep, StepAction, PageSnapshot, FrictionPoint, EmotionalState, SessionSummary, UserSession, Persona } from "../types.js";
import { randomUUID } from "node:crypto";

/**
 * Mutable session builder that accumulates steps during a flow walk.
 * Finalized into an immutable UserSession at the end.
 */
export class SessionRecorder {
  private readonly steps: SessionStep[] = [];
  private readonly startedAt: string;

  constructor(
    private readonly persona: Persona,
    private readonly startUrl: string
  ) {
    this.startedAt = new Date().toISOString();
  }

  recordStep(params: {
    readonly page: PageSnapshot;
    readonly action: StepAction;
    readonly thought: string;
    readonly emotionalState: EmotionalState;
    readonly frictionPoints: readonly FrictionPoint[];
    readonly timeSpentMs: number;
  }): SessionStep {
    const step: SessionStep = {
      index: this.steps.length,
      timestamp: new Date().toISOString(),
      page: params.page,
      action: params.action,
      thought: params.thought,
      emotionalState: params.emotionalState,
      frictionPoints: [...params.frictionPoints],
      timeSpentMs: params.timeSpentMs,
    };
    this.steps.push(step);
    return step;
  }

  getSteps(): readonly SessionStep[] {
    return [...this.steps];
  }

  getStepCount(): number {
    return this.steps.length;
  }

  getLastStep(): SessionStep | undefined {
    return this.steps[this.steps.length - 1];
  }

  /**
   * Finalize the session into an immutable UserSession with computed summary.
   */
  finalize(goalAchieved: boolean, goalAchievedStep?: number): UserSession {
    const completedAt = new Date().toISOString();
    const allFriction = this.steps.flatMap((s) => s.frictionPoints);
    const totalTimeMs = this.steps.reduce((sum, s) => sum + s.timeSpentMs, 0);

    // Friction score: weighted sum of friction points normalized to 0-10
    const frictionWeights: Record<string, number> = { low: 1, medium: 2, high: 4, critical: 7 };
    const rawFriction = allFriction.reduce((sum, f) => sum + (frictionWeights[f.severity] ?? 1), 0);
    const frictionScore = Math.min(10, rawFriction / Math.max(1, this.steps.length) * 2);

    // Emotional journey
    const emotionalJourney = this.steps.map((s) => s.emotionalState);

    // Drop-off risk analysis
    const highFrictionSteps = this.steps.filter((s) =>
      s.frictionPoints.some((f) => f.severity === "high" || f.severity === "critical")
    );
    const dropOffRisk = highFrictionSteps.length > 0
      ? `High risk at step${highFrictionSteps.length > 1 ? "s" : ""} ${highFrictionSteps.map((s) => s.index).join(", ")} — ${highFrictionSteps[0].frictionPoints[0]?.description ?? "friction detected"}`
      : frictionScore > 5 ? "Moderate risk — cumulative friction may cause abandonment"
      : "Low risk — flow is relatively smooth";

    // Top friction points (sorted by severity)
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const topFrictionPoints = [...allFriction]
      .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
      .slice(0, 5);

    // Generate recommendations from friction points
    const recommendations = topFrictionPoints.map((f) => f.suggestion);
    if (!goalAchieved) {
      recommendations.push("User could not complete their goal — review the entire flow for blockers");
    }

    const summary: SessionSummary = {
      totalSteps: this.steps.length,
      totalTimeMs,
      frictionScore: Math.round(frictionScore * 10) / 10,
      dropOffRisk,
      emotionalJourney,
      topFrictionPoints,
      recommendations,
      goalAchieved,
      goalAchievedStep,
    };

    return {
      id: randomUUID(),
      persona: this.persona,
      startUrl: this.startUrl,
      startedAt: this.startedAt,
      completedAt,
      steps: [...this.steps],
      summary,
    };
  }
}
