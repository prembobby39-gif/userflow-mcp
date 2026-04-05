// ── Persona Types ──────────────────────────────────────────────

export type TechLiteracy = "novice" | "basic" | "intermediate" | "advanced" | "expert";
export type PatienceLevel = "very_low" | "low" | "moderate" | "high" | "very_high";
export type AgeGroup = "teen" | "young_adult" | "adult" | "middle_aged" | "senior";
export type DevicePreference = "mobile" | "tablet" | "desktop";
export type AccessibilityNeed = "none" | "low_vision" | "screen_reader" | "motor_impaired" | "cognitive";

export interface PersonaTraits {
  readonly techLiteracy: TechLiteracy;
  readonly patience: PatienceLevel;
  readonly ageGroup: AgeGroup;
  readonly devicePreference: DevicePreference;
  readonly accessibilityNeeds: readonly AccessibilityNeed[];
  readonly domainKnowledge: number; // 0-10
  readonly attentionToDetail: number; // 0-10
}

export interface Persona {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly background: string;
  readonly goals: readonly string[];
  readonly traits: PersonaTraits;
  readonly behaviorNotes: readonly string[];
}

// ── Session Types ──────────────────────────────────────────────

export type EmotionalState = "curious" | "confident" | "neutral" | "confused" | "frustrated" | "delighted" | "anxious" | "bored";
export type FrictionSeverity = "low" | "medium" | "high" | "critical";
export type ActionType = "navigate" | "click" | "type" | "scroll" | "wait" | "read" | "give_up";

export interface PageElement {
  readonly selector: string;
  readonly tagName: string;
  readonly text: string;
  readonly type?: string;
  readonly href?: string;
  readonly isVisible: boolean;
  readonly isInteractive: boolean;
  readonly ariaLabel?: string;
  readonly placeholder?: string;
}

export interface PageSnapshot {
  readonly url: string;
  readonly title: string;
  readonly timestamp: string;
  readonly screenshot: string;
  readonly interactiveElements: readonly PageElement[];
  readonly headings: readonly string[];
  readonly mainText: string;
  readonly formFields: readonly PageElement[];
  readonly links: readonly PageElement[];
  readonly buttons: readonly PageElement[];
  readonly errorMessages: readonly string[];
  readonly loadTimeMs: number;
}

export interface StepAction {
  readonly type: ActionType;
  readonly target?: string;
  readonly value?: string;
  readonly reasoning: string;
}

export interface FrictionPoint {
  readonly id: string;
  readonly severity: FrictionSeverity;
  readonly description: string;
  readonly location: string;
  readonly suggestion: string;
  readonly stepIndex: number;
}

export interface SessionStep {
  readonly index: number;
  readonly timestamp: string;
  readonly page: PageSnapshot;
  readonly action: StepAction;
  readonly thought: string;
  readonly emotionalState: EmotionalState;
  readonly frictionPoints: readonly FrictionPoint[];
  readonly timeSpentMs: number;
}

export interface SessionSummary {
  readonly totalSteps: number;
  readonly totalTimeMs: number;
  readonly frictionScore: number; // 0-10
  readonly dropOffRisk: string;
  readonly emotionalJourney: readonly EmotionalState[];
  readonly topFrictionPoints: readonly FrictionPoint[];
  readonly recommendations: readonly string[];
  readonly goalAchieved: boolean;
  readonly goalAchievedStep?: number;
}

export interface UserSession {
  readonly id: string;
  readonly persona: Persona;
  readonly startUrl: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly steps: readonly SessionStep[];
  readonly summary: SessionSummary;
}

// ── Analysis Types ─────────────────────────────────────────────

export interface CognitiveLoadAssessment {
  readonly score: number; // 0-10 (10 = overwhelming)
  readonly elementCount: number;
  readonly interactiveCount: number;
  readonly textDensity: number;
  readonly decisionPoints: number;
  readonly visualComplexity: string;
  readonly assessment: string;
}

export interface ClarityAssessment {
  readonly score: number; // 0-10 (10 = crystal clear)
  readonly valueProposition: string;
  readonly ctaClarity: string;
  readonly navigationLogic: string;
  readonly headingStructure: string;
  readonly assessment: string;
}

export interface EmotionalArc {
  readonly states: readonly EmotionalState[];
  readonly trend: "improving" | "stable" | "declining" | "volatile";
  readonly lowestPoint: { readonly step: number; readonly state: EmotionalState };
  readonly highestPoint: { readonly step: number; readonly state: EmotionalState };
}

// ── Comparison Types ───────────────────────────────────────────

export interface PersonaComparison {
  readonly personas: readonly Persona[];
  readonly sessions: readonly UserSession[];
  readonly sharedFriction: readonly FrictionPoint[];
  readonly divergencePoints: readonly {
    readonly step: number;
    readonly url: string;
    readonly personaActions: readonly { readonly persona: string; readonly action: string; readonly thought: string }[];
  }[];
  readonly overallRecommendations: readonly string[];
}

// ── Browser Types (forked from UIMax) ──────────────────────────

export interface NavigateResult {
  readonly url: string;
  readonly title: string;
  readonly status: number | null;
  readonly screenshot: string;
}

export interface ClickResult {
  readonly clicked: boolean;
  readonly selector: string;
  readonly screenshot: string;
}

export interface TypeResult {
  readonly typed: boolean;
  readonly selector: string;
  readonly text: string;
  readonly screenshot: string;
}

export interface SelectResult {
  readonly selected: boolean;
  readonly value: string;
  readonly screenshot: string;
}

export interface ScrollResult {
  readonly scrolled: boolean;
  readonly screenshot: string;
}

export interface WaitResult {
  readonly found: boolean;
  readonly selector: string;
  readonly tagName: string;
  readonly textContent: string;
}

export interface ElementInfo {
  readonly tagName: string;
  readonly textContent: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly boundingBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly computedStyles: {
    readonly color: string;
    readonly backgroundColor: string;
    readonly fontSize: string;
    readonly fontFamily: string;
    readonly fontWeight: string;
    readonly display: string;
    readonly visibility: string;
  };
  readonly isVisible: boolean;
  readonly screenshot: string;
}

export interface ScreenshotResult {
  readonly base64: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly url: string;
  readonly timestamp: string;
}

// ── Browser Capture Types ──────────────────────────────────────

export type ConsoleLevel = "log" | "warn" | "error" | "info" | "debug";

export interface ConsoleEntry {
  readonly level: ConsoleLevel;
  readonly text: string;
  readonly timestamp: string;
  readonly location?: string;
}

export interface ConsoleCaptureResult {
  readonly url: string;
  readonly timestamp: string;
  readonly entries: readonly ConsoleEntry[];
  readonly uncaughtExceptions: readonly string[];
  readonly totalCount: number;
  readonly countByLevel: Readonly<Record<ConsoleLevel, number>>;
}

export interface NetworkEntry {
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly status: number;
  readonly size: number;
  readonly duration: number;
  readonly failed: boolean;
  readonly failureReason?: string;
}

export interface NetworkSummary {
  readonly totalRequests: number;
  readonly failedRequests: number;
  readonly totalTransferSize: number;
  readonly byType: readonly { readonly type: string; readonly count: number; readonly totalSize: number }[];
}

export interface NetworkCaptureResult {
  readonly url: string;
  readonly timestamp: string;
  readonly entries: readonly NetworkEntry[];
  readonly summary: NetworkSummary;
}

export type PageErrorKind = "exception" | "unhandled-rejection" | "resource-load-failure";

export interface PageError {
  readonly kind: PageErrorKind;
  readonly message: string;
  readonly timestamp: string;
  readonly source?: string;
}

export interface ErrorCaptureResult {
  readonly url: string;
  readonly timestamp: string;
  readonly errors: readonly PageError[];
  readonly totalCount: number;
  readonly countByKind: Readonly<Record<PageErrorKind, number>>;
}

// ── Tool Result Types ──────────────────────────────────────────

export interface SimulateUserResult {
  readonly session: UserSession;
  readonly report: string;
}

export interface QuickImpressionResult {
  readonly url: string;
  readonly persona: string;
  readonly firstImpression: string;
  readonly whatItDoes: string;
  readonly clarityScore: number;
  readonly emotionalReaction: EmotionalState;
  readonly wouldContinue: boolean;
  readonly reasoning: string;
  readonly screenshot: string;
}

export interface DeadEnd {
  readonly url: string;
  readonly description: string;
  readonly reachedFrom: string;
  readonly severity: FrictionSeverity;
}

export interface DeadEndResult {
  readonly startUrl: string;
  readonly deadEnds: readonly DeadEnd[];
  readonly totalPagesExplored: number;
  readonly report: string;
}
