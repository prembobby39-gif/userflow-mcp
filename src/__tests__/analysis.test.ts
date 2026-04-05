import { describe, it, expect } from "vitest";
import { assessCognitiveLoad } from "../analysis/cognitive-load.js";
import { assessClarity } from "../analysis/clarity.js";
import { analyzeEmotionalArc, summarizeEmotionalArc } from "../analysis/emotional-arc.js";
import { calculateFrictionScore, countBySeverity, getSortedFriction, groupFrictionByLocation } from "../analysis/friction.js";
import type { PageSnapshot, SessionStep, EmotionalState, FrictionPoint } from "../types.js";

// ── Test Fixtures ──────────────────────────────────────────────

function createMockPage(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: "https://example.com",
    title: "Test Page",
    timestamp: new Date().toISOString(),
    screenshot: "",
    interactiveElements: [],
    headings: ["Welcome to Our Product"],
    mainText: "This is a test page with some content that describes what the product does.",
    formFields: [],
    links: [],
    buttons: [
      { selector: "#cta", tagName: "button", text: "Get Started", isVisible: true, isInteractive: true },
    ],
    errorMessages: [],
    loadTimeMs: 1200,
    ...overrides,
  };
}

function createMockStep(overrides: Partial<SessionStep> = {}): SessionStep {
  return {
    index: 0,
    timestamp: new Date().toISOString(),
    page: createMockPage(),
    action: { type: "read", reasoning: "Looking at the page" },
    thought: "Hmm, let me see...",
    emotionalState: "neutral",
    frictionPoints: [],
    timeSpentMs: 2000,
    ...overrides,
  };
}

function createMockFriction(overrides: Partial<FrictionPoint> = {}): FrictionPoint {
  return {
    id: "test-friction",
    severity: "medium",
    description: "Test friction point",
    location: "https://example.com",
    suggestion: "Fix this",
    stepIndex: 0,
    ...overrides,
  };
}

// ── Cognitive Load Tests ───────────────────────────────────────

describe("assessCognitiveLoad", () => {
  it("should return low score for simple pages", () => {
    const page = createMockPage();
    const result = assessCognitiveLoad(page);
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("should return high score for complex pages", () => {
    const manyElements = Array.from({ length: 40 }, (_, i) => ({
      selector: `#el-${i}`, tagName: "button", text: `Button ${i}`,
      isVisible: true, isInteractive: true,
    }));
    const page = createMockPage({
      interactiveElements: manyElements,
      buttons: manyElements,
      formFields: Array.from({ length: 8 }, (_, i) => ({
        selector: `#field-${i}`, tagName: "input", text: "",
        type: "text", isVisible: true, isInteractive: true,
      })),
      links: Array.from({ length: 20 }, (_, i) => ({
        selector: `#link-${i}`, tagName: "a", text: `Link ${i}`,
        href: `https://example.com/${i}`, isVisible: true, isInteractive: true,
      })),
      mainText: "A".repeat(600),
    });
    const result = assessCognitiveLoad(page);
    expect(result.score).toBeGreaterThan(5);
  });

  it("should include element counts", () => {
    const result = assessCognitiveLoad(createMockPage());
    expect(result.elementCount).toBeGreaterThanOrEqual(0);
    expect(result.interactiveCount).toBeGreaterThanOrEqual(0);
    expect(result.decisionPoints).toBeGreaterThanOrEqual(0);
  });

  it("should always return score between 0 and 10", () => {
    const scores = [
      assessCognitiveLoad(createMockPage()).score,
      assessCognitiveLoad(createMockPage({ interactiveElements: [] })).score,
      assessCognitiveLoad(createMockPage({
        interactiveElements: Array.from({ length: 100 }, (_, i) => ({
          selector: `#el-${i}`, tagName: "button", text: `B${i}`,
          isVisible: true, isInteractive: true,
        })),
      })).score,
    ];
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    }
  });
});

// ── Clarity Tests ──────────────────────────────────────────────

describe("assessClarity", () => {
  it("should rate clear pages highly", () => {
    const page = createMockPage({
      headings: ["Build Better Products Faster"],
      buttons: [{ selector: "#cta", tagName: "button", text: "Start Free Trial", isVisible: true, isInteractive: true }],
      links: Array.from({ length: 5 }, (_, i) => ({
        selector: `#link-${i}`, tagName: "a", text: `Link ${i}`,
        href: `https://example.com/${i}`, isVisible: true, isInteractive: true,
      })),
    });
    const result = assessClarity(page);
    expect(result.score).toBeGreaterThanOrEqual(6);
  });

  it("should rate unclear pages low", () => {
    const page = createMockPage({
      headings: [],
      buttons: [],
      links: [],
      mainText: "x",
    });
    const result = assessClarity(page);
    expect(result.score).toBeLessThanOrEqual(4);
  });

  it("should assess all clarity dimensions", () => {
    const result = assessClarity(createMockPage());
    expect(result.valueProposition).toBeTruthy();
    expect(result.ctaClarity).toBeTruthy();
    expect(result.navigationLogic).toBeTruthy();
    expect(result.headingStructure).toBeTruthy();
    expect(result.assessment).toBeTruthy();
  });

  it("should penalize error messages", () => {
    const clean = assessClarity(createMockPage());
    const withErrors = assessClarity(createMockPage({ errorMessages: ["Something went wrong"] }));
    expect(withErrors.score).toBeLessThan(clean.score);
  });
});

// ── Emotional Arc Tests ────────────────────────────────────────

describe("analyzeEmotionalArc", () => {
  it("should handle empty steps", () => {
    const arc = analyzeEmotionalArc([]);
    expect(arc.states).toEqual([]);
    expect(arc.trend).toBe("stable");
  });

  it("should track emotional states", () => {
    const steps = [
      createMockStep({ emotionalState: "curious" }),
      createMockStep({ emotionalState: "confident" }),
      createMockStep({ emotionalState: "frustrated" }),
    ];
    const arc = analyzeEmotionalArc(steps);
    expect(arc.states).toEqual(["curious", "confident", "frustrated"]);
  });

  it("should find highest and lowest points", () => {
    const steps = [
      createMockStep({ emotionalState: "neutral" }),
      createMockStep({ emotionalState: "delighted" }),
      createMockStep({ emotionalState: "frustrated" }),
    ];
    const arc = analyzeEmotionalArc(steps);
    expect(arc.highestPoint.state).toBe("delighted");
    expect(arc.lowestPoint.state).toBe("frustrated");
  });

  it("should detect declining trend", () => {
    const steps = [
      createMockStep({ emotionalState: "delighted" }),
      createMockStep({ emotionalState: "confident" }),
      createMockStep({ emotionalState: "neutral" }),
      createMockStep({ emotionalState: "confused" }),
      createMockStep({ emotionalState: "frustrated" }),
    ];
    const arc = analyzeEmotionalArc(steps);
    expect(arc.trend).toBe("declining");
  });

  it("should produce human-readable summary", () => {
    const steps = [
      createMockStep({ emotionalState: "curious" }),
      createMockStep({ emotionalState: "frustrated" }),
    ];
    const arc = analyzeEmotionalArc(steps);
    const summary = summarizeEmotionalArc(arc);
    expect(summary).toBeTruthy();
    expect(summary.length).toBeGreaterThan(10);
  });
});

// ── Friction Tests ─────────────────────────────────────────────

describe("calculateFrictionScore", () => {
  it("should return 0 for steps with no friction", () => {
    const steps = [createMockStep(), createMockStep()];
    expect(calculateFrictionScore(steps)).toBe(0);
  });

  it("should increase with friction severity", () => {
    const lowSteps = [createMockStep({ frictionPoints: [createMockFriction({ severity: "low" })] })];
    const highSteps = [createMockStep({ frictionPoints: [createMockFriction({ severity: "critical" })] })];
    expect(calculateFrictionScore(highSteps)).toBeGreaterThan(calculateFrictionScore(lowSteps));
  });

  it("should cap at 10", () => {
    const manyFriction = Array.from({ length: 20 }, () => createMockFriction({ severity: "critical" }));
    const steps = [createMockStep({ frictionPoints: manyFriction })];
    expect(calculateFrictionScore(steps)).toBeLessThanOrEqual(10);
  });
});

describe("countBySeverity", () => {
  it("should count friction points by severity", () => {
    const steps = [
      createMockStep({ frictionPoints: [
        createMockFriction({ severity: "low" }),
        createMockFriction({ severity: "high" }),
        createMockFriction({ severity: "high" }),
      ]}),
    ];
    const counts = countBySeverity(steps);
    expect(counts.low).toBe(1);
    expect(counts.high).toBe(2);
    expect(counts.medium).toBe(0);
    expect(counts.critical).toBe(0);
  });
});

describe("getSortedFriction", () => {
  it("should sort critical first", () => {
    const steps = [
      createMockStep({ frictionPoints: [
        createMockFriction({ severity: "low", description: "low" }),
        createMockFriction({ severity: "critical", description: "critical" }),
        createMockFriction({ severity: "medium", description: "medium" }),
      ]}),
    ];
    const sorted = getSortedFriction(steps);
    expect(sorted[0].severity).toBe("critical");
    expect(sorted[1].severity).toBe("medium");
    expect(sorted[2].severity).toBe("low");
  });
});

describe("groupFrictionByLocation", () => {
  it("should group by URL", () => {
    const steps = [
      createMockStep({ frictionPoints: [
        createMockFriction({ location: "https://a.com" }),
        createMockFriction({ location: "https://b.com" }),
        createMockFriction({ location: "https://a.com" }),
      ]}),
    ];
    const grouped = groupFrictionByLocation(steps);
    expect(grouped.get("https://a.com")?.length).toBe(2);
    expect(grouped.get("https://b.com")?.length).toBe(1);
  });
});
