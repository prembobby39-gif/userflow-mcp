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
  // v0.3 additions (optional for backward compat)
  readonly console?: ConsoleSummary;
  readonly network?: NetworkSummary;
  readonly performance?: PerformanceMetrics;
  readonly accessibility?: AccessibilityReport;
  readonly storage?: StorageData;
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

// ── Smart Selector Types ──────────────────────────────────────

export type SelectorStrategy = "testid" | "id" | "aria" | "role-text" | "input-attr" | "link-href" | "text" | "css";

export interface SmartSelector {
  readonly primary: string;
  readonly fallbacks: readonly string[];
  readonly description: string;
  readonly strategy: SelectorStrategy;
}

// ── Device Profile Types ─────────────────────────────────────

export interface DeviceProfile {
  readonly name: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly userAgent: string;
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
}

// ── Performance Metrics Types ────────────────────────────────

export type WebVitalRating = "good" | "needs-improvement" | "poor" | null;

export interface PerformanceMetrics {
  // Core Web Vitals
  readonly lcp: number | null;
  readonly cls: number | null;
  readonly inp: number | null;
  // Loading
  readonly fcp: number | null;
  readonly ttfb: number | null;
  readonly domContentLoaded: number | null;
  readonly domComplete: number | null;
  // Resources
  readonly resourceCount: number;
  readonly totalResourceSize: number;
  // Ratings
  readonly lcpRating: WebVitalRating;
  readonly clsRating: WebVitalRating;
  readonly inpRating: WebVitalRating;
}

// ── Accessibility Types ──────────────────────────────────────

export type A11yImpact = "minor" | "moderate" | "serious" | "critical";

export interface AccessibilityViolation {
  readonly id: string;
  readonly impact: A11yImpact;
  readonly description: string;
  readonly help: string;
  readonly helpUrl: string;
  readonly affectedNodes: number;
  readonly wcagCriteria: readonly string[];
  readonly target: readonly string[];
}

export interface AccessibilityReport {
  readonly score: number;
  readonly violations: readonly AccessibilityViolation[];
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

// ── Storage Types ────────────────────────────────────────────

export interface CookieInfo {
  readonly name: string;
  readonly domain: string;
  readonly path: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite: string;
  readonly expires: number | null;
  readonly size: number;
}

export interface StorageData {
  readonly cookies: readonly CookieInfo[];
  readonly localStorage: Readonly<Record<string, string>>;
  readonly sessionStorage: Readonly<Record<string, string>>;
  readonly cookieCount: number;
  readonly localStorageKeys: number;
  readonly sessionStorageKeys: number;
  readonly trackingCookies: readonly CookieInfo[];
  readonly totalCookieSize: number;
}

// ── Screenshot Diff Types ────────────────────────────────────

export interface ScreenshotDiff {
  readonly matchPercentage: number;
  readonly diffPixels: number;
  readonly totalPixels: number;
  readonly dimensions: { readonly width: number; readonly height: number };
  readonly diffImage: string;
}

// ── Console & Network Monitor Types ──────────────────────────

export type ConsoleLevel = "log" | "warn" | "error" | "info" | "debug" | "trace";

export interface ConsoleMessage {
  readonly level: ConsoleLevel;
  readonly text: string;
  readonly timestamp: number;
  readonly url?: string;
  readonly lineNumber?: number;
  readonly columnNumber?: number;
}

export interface PageError {
  readonly message: string;
  readonly stack?: string;
  readonly timestamp: number;
}

export interface ConsoleSummary {
  readonly total: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  readonly pageErrors: number;
  readonly messages: readonly ConsoleMessage[];
  readonly criticalErrors: readonly ConsoleMessage[];
}

export interface NetworkEntry {
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly status: number;
  readonly statusText: string;
  readonly mimeType: string;
  readonly responseSize: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly failed: boolean;
  readonly errorText?: string;
}

export interface NetworkSummary {
  readonly totalRequests: number;
  readonly failedRequests: number;
  readonly blockedRequests: number;
  readonly totalTransferSize: number;
  readonly byResourceType: Readonly<Record<string, number>>;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly slowestRequests: readonly NetworkEntry[];
  readonly averageResponseTime: number;
}

export interface HarEntry {
  readonly startedDateTime: string;
  readonly time: number;
  readonly request: {
    readonly method: string;
    readonly url: string;
    readonly headers: readonly { readonly name: string; readonly value: string }[];
  };
  readonly response: {
    readonly status: number;
    readonly statusText: string;
    readonly headers: readonly { readonly name: string; readonly value: string }[];
    readonly content: { readonly size: number; readonly mimeType: string };
  };
  readonly timings: { readonly wait: number; readonly receive: number };
}

export interface HarLog {
  readonly log: {
    readonly version: string;
    readonly creator: { readonly name: string; readonly version: string };
    readonly entries: readonly HarEntry[];
  };
}

// ── Legacy Browser Capture Types (backward compat) ───────────

export type PageErrorKind = "exception" | "unhandled-rejection" | "resource-load-failure";

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
