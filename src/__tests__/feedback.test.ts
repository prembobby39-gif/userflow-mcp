import { describe, it, expect } from "vitest";
import { generateSessionReport, generateQuickImpressionReport } from "../feedback/generator.js";
import { comparePersonaSessions, generateComparisonReport } from "../feedback/comparison.js";
import { generateHtmlReport } from "../feedback/report.js";
import type { UserSession, Persona, SessionStep, PageSnapshot, FrictionPoint, SessionSummary } from "../types.js";

// ── Fixtures ───────────────────────────────────────────────────

function createMockPersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "test-persona",
    name: "Test User",
    description: "A test persona",
    background: "Testing background",
    goals: ["test the app"],
    traits: {
      techLiteracy: "intermediate",
      patience: "moderate",
      ageGroup: "adult",
      devicePreference: "desktop",
      accessibilityNeeds: ["none"],
      domainKnowledge: 5,
      attentionToDetail: 5,
    },
    behaviorNotes: [],
    ...overrides,
  };
}

function createMockSession(overrides: Partial<UserSession> = {}): UserSession {
  const mockPage: PageSnapshot = {
    url: "https://example.com",
    title: "Test Page",
    timestamp: new Date().toISOString(),
    screenshot: "",
    interactiveElements: [],
    headings: ["Welcome"],
    mainText: "Test content",
    formFields: [],
    links: [],
    buttons: [{ selector: "#cta", tagName: "button", text: "Click", isVisible: true, isInteractive: true }],
    errorMessages: [],
    loadTimeMs: 1000,
  };

  const mockStep: SessionStep = {
    index: 0,
    timestamp: new Date().toISOString(),
    page: mockPage,
    action: { type: "read", reasoning: "Looking around" },
    thought: "Let me see what this is about",
    emotionalState: "curious",
    frictionPoints: [],
    timeSpentMs: 2000,
  };

  const mockSummary: SessionSummary = {
    totalSteps: 1,
    totalTimeMs: 2000,
    frictionScore: 2.5,
    dropOffRisk: "Low risk",
    emotionalJourney: ["curious"],
    topFrictionPoints: [],
    recommendations: ["Add more guidance"],
    goalAchieved: true,
  };

  return {
    id: "test-session",
    persona: createMockPersona(),
    startUrl: "https://example.com",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    steps: [mockStep],
    summary: mockSummary,
    ...overrides,
  };
}

// ── Report Generation Tests ────────────────────────────────────

describe("generateSessionReport", () => {
  it("should generate a markdown report", () => {
    const session = createMockSession();
    const report = generateSessionReport(session);

    expect(report).toContain("# UserFlow Session Report");
    expect(report).toContain("example.com");
    expect(report).toContain("Test User");
    expect(report).toContain("Summary");
    expect(report).toContain("Step-by-Step");
  });

  it("should include friction information when present", () => {
    const friction: FrictionPoint = {
      id: "f1",
      severity: "high",
      description: "Page is too complex",
      location: "https://example.com",
      suggestion: "Simplify the design",
      stepIndex: 0,
    };

    const session = createMockSession({
      steps: [{
        index: 0,
        timestamp: new Date().toISOString(),
        page: {
          url: "https://example.com", title: "Test", timestamp: new Date().toISOString(),
          screenshot: "", interactiveElements: [], headings: ["H1"], mainText: "Content",
          formFields: [], links: [], buttons: [], errorMessages: [], loadTimeMs: 1000,
        },
        action: { type: "read", reasoning: "Looking" },
        thought: "Hmm",
        emotionalState: "confused",
        frictionPoints: [friction],
        timeSpentMs: 3000,
      }],
      summary: {
        totalSteps: 1,
        totalTimeMs: 3000,
        frictionScore: 6.0,
        dropOffRisk: "High risk",
        emotionalJourney: ["confused"],
        topFrictionPoints: [friction],
        recommendations: ["Simplify the design"],
        goalAchieved: false,
      },
    });

    const report = generateSessionReport(session);
    expect(report).toContain("Page is too complex");
    expect(report).toContain("Simplify the design");
    expect(report).toContain("HIGH");
  });

  it("should include emotional journey", () => {
    const report = generateSessionReport(createMockSession());
    expect(report).toContain("Emotional Journey");
    expect(report).toContain("curious");
  });
});

describe("generateQuickImpressionReport", () => {
  it("should generate a quick impression report", () => {
    const report = generateQuickImpressionReport({
      url: "https://example.com",
      personaName: "Jordan",
      firstImpression: "Looks interesting",
      whatItDoes: "Some kind of tool",
      clarityScore: 7,
      emotionalReaction: "curious",
      wouldContinue: true,
      reasoning: "Good layout",
    });

    expect(report).toContain("Quick Impression");
    expect(report).toContain("Jordan");
    expect(report).toContain("Looks interesting");
    expect(report).toContain("7/10");
  });
});

// ── Comparison Tests ───────────────────────────────────────────

describe("comparePersonaSessions", () => {
  it("should handle empty sessions", () => {
    const comparison = comparePersonaSessions([]);
    expect(comparison.personas).toEqual([]);
    expect(comparison.sharedFriction).toEqual([]);
  });

  it("should compare multiple sessions", () => {
    const session1 = createMockSession({
      persona: createMockPersona({ name: "Alex" }),
    });
    const session2 = createMockSession({
      persona: createMockPersona({ name: "Morgan" }),
    });

    const comparison = comparePersonaSessions([session1, session2]);
    expect(comparison.personas.length).toBe(2);
    expect(comparison.sessions.length).toBe(2);
  });

  it("should generate comparison report", () => {
    const session1 = createMockSession({ persona: createMockPersona({ name: "Alex" }) });
    const session2 = createMockSession({ persona: createMockPersona({ name: "Morgan" }) });
    const comparison = comparePersonaSessions([session1, session2]);
    const report = generateComparisonReport(comparison);

    expect(report).toContain("Multi-Persona Comparison");
    expect(report).toContain("Alex");
    expect(report).toContain("Morgan");
  });
});

// ── HTML Report Tests ──────────────────────────────────────────

describe("generateHtmlReport", () => {
  it("should generate valid HTML", () => {
    const session = createMockSession();
    const html = generateHtmlReport(session);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("UserFlow Session Report");
    expect(html).toContain("</html>");
  });

  it("should include persona info", () => {
    const html = generateHtmlReport(createMockSession());
    expect(html).toContain("Test User");
    expect(html).toContain("example.com");
  });

  it("should include friction score", () => {
    const html = generateHtmlReport(createMockSession());
    expect(html).toContain("Friction:");
    expect(html).toContain("/10");
  });
});
