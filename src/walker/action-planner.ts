import type { Persona, PageSnapshot, PageElement, StepAction, ActionType, EmotionalState, FrictionPoint, FrictionSeverity, SessionStep } from "../types.js";
import { getDiscoveryProbability } from "../personas/engine.js";
import { randomUUID } from "node:crypto";

/**
 * Score how relevant an element is to the persona's goals.
 * Returns 0-100 relevance score.
 */
function scoreElementRelevance(element: PageElement, goals: readonly string[]): number {
  const elementText = `${element.text} ${element.ariaLabel ?? ""} ${element.placeholder ?? ""} ${element.href ?? ""}`.toLowerCase();
  let score = 0;

  for (const goal of goals) {
    const goalWords = goal.toLowerCase().split(/\s+/);
    for (const word of goalWords) {
      if (word.length > 2 && elementText.includes(word)) {
        score += 20;
      }
    }
  }

  // Boost for common action patterns
  const ctaPatterns = ["sign up", "get started", "try", "start", "create", "login", "log in", "register", "submit", "continue", "next", "buy", "purchase", "subscribe", "pricing", "plans"];
  for (const pattern of ctaPatterns) {
    if (elementText.includes(pattern)) {
      score += 15;
      break;
    }
  }

  // Boost for prominent elements (buttons > links)
  if (element.tagName === "button" || element.type === "submit") score += 10;
  if (element.tagName === "a" && element.href) score += 5;

  return Math.min(100, score);
}

/**
 * Determine what emotional state this persona would feel on this page.
 */
export function assessEmotion(
  persona: Persona,
  page: PageSnapshot,
  previousSteps: readonly SessionStep[],
  frictionPoints: readonly FrictionPoint[]
): EmotionalState {
  const stepCount = previousSteps.length;
  const recentFriction = frictionPoints.filter((f) => f.severity === "high" || f.severity === "critical");
  const prevEmotion = previousSteps[previousSteps.length - 1]?.emotionalState ?? "curious";

  // First page — usually curious
  if (stepCount === 0) return "curious";

  // High friction → frustrated or confused
  if (recentFriction.length >= 2) return "frustrated";
  if (recentFriction.length === 1) return "confused";

  // Error messages on page → anxious
  if (page.errorMessages.length > 0) return "anxious";

  // Too many steps without progress → bored or frustrated
  const patienceMap: Record<string, number> = { very_low: 3, low: 5, moderate: 8, high: 12, very_high: 18 };
  const patienceThreshold = patienceMap[persona.traits.patience] ?? 8;
  if (stepCount > patienceThreshold * 0.7) return "frustrated";
  if (stepCount > patienceThreshold * 0.5) return "bored";

  // Page loads fast and has clear content → confident
  if (page.loadTimeMs < 2000 && page.headings.length > 0 && page.buttons.length > 0) return "confident";

  // Default: carry forward or neutral
  if (prevEmotion === "frustrated" && recentFriction.length === 0) return "neutral";
  return prevEmotion === "curious" ? "neutral" : prevEmotion;
}

/**
 * Detect friction points on the current page for this persona.
 */
export function detectFriction(
  persona: Persona,
  page: PageSnapshot,
  stepIndex: number
): readonly FrictionPoint[] {
  const frictionPoints: FrictionPoint[] = [];
  const createFriction = (severity: FrictionSeverity, description: string, suggestion: string): void => {
    frictionPoints.push({
      id: randomUUID(),
      severity,
      description,
      location: page.url,
      suggestion,
      stepIndex,
    });
  };

  // Slow load time
  if (page.loadTimeMs > 5000) {
    createFriction("high", `Page took ${(page.loadTimeMs / 1000).toFixed(1)}s to load`, "Optimize page load performance — aim for under 3 seconds");
  } else if (page.loadTimeMs > 3000) {
    createFriction("medium", `Page took ${(page.loadTimeMs / 1000).toFixed(1)}s to load`, "Consider lazy loading or code splitting to improve load time");
  }

  // No clear headings
  if (page.headings.length === 0) {
    createFriction("medium", "No headings found — page purpose is unclear", "Add a clear H1 heading that explains what this page is about");
  }

  // Too many interactive elements (cognitive overload)
  const interactiveCount = page.interactiveElements.length;
  if (interactiveCount > 20 && persona.traits.techLiteracy === "novice") {
    createFriction("high", `Page has ${interactiveCount} interactive elements — overwhelming for this user`, "Simplify the page or use progressive disclosure to reduce cognitive load");
  } else if (interactiveCount > 30) {
    createFriction("medium", `Page has ${interactiveCount} interactive elements — high cognitive load`, "Consider grouping related actions or using progressive disclosure");
  }

  // Error messages visible
  if (page.errorMessages.length > 0) {
    createFriction("high", `Error messages visible: "${page.errorMessages[0]}"`, "Ensure error messages are clear, actionable, and help the user recover");
  }

  // Too many form fields at once
  if (page.formFields.length > 6 && persona.traits.patience !== "very_high") {
    createFriction("high", `Form has ${page.formFields.length} fields — likely to cause abandonment`, "Break the form into smaller steps or make non-essential fields optional");
  } else if (page.formFields.length > 4) {
    createFriction("low", `Form has ${page.formFields.length} fields`, "Consider which fields are truly required at this stage");
  }

  // No clear CTA
  if (page.buttons.length === 0 && page.links.length > 0) {
    createFriction("medium", "No buttons found — unclear what action to take", "Add a prominent call-to-action button");
  }

  // Empty state (no content)
  if (page.mainText.trim().length < 50 && page.buttons.length === 0 && page.links.length < 3) {
    createFriction("critical", "Page appears empty — no guidance for the user", "Add an empty state with clear next steps or a getting-started guide");
  }

  // Accessibility friction for users with needs
  if (persona.traits.accessibilityNeeds.includes("screen_reader")) {
    const unlabeledButtons = page.buttons.filter((b) => !b.ariaLabel && !b.text.trim());
    if (unlabeledButtons.length > 0) {
      createFriction("critical", `${unlabeledButtons.length} buttons have no accessible label`, "Add aria-label or visible text to all interactive elements");
    }
    const unlabeledInputs = page.formFields.filter((f) => !f.ariaLabel && !f.placeholder);
    if (unlabeledInputs.length > 0) {
      createFriction("high", `${unlabeledInputs.length} form fields have no label or placeholder`, "Add labels to all form fields for screen reader accessibility");
    }
  }

  if (persona.traits.accessibilityNeeds.includes("low_vision") && page.formFields.length > 0) {
    createFriction("low", "Verify form field labels have sufficient size and contrast for low-vision users", "Ensure text is at least 16px and has 4.5:1 contrast ratio");
  }

  return frictionPoints;
}

/**
 * Plan the next action for a persona on the current page.
 * Uses heuristic scoring based on persona goals and traits.
 */
export function planNextAction(
  persona: Persona,
  page: PageSnapshot,
  previousSteps: readonly SessionStep[]
): StepAction {
  const discoveryProb = getDiscoveryProbability(persona);
  const stepCount = previousSteps.length;

  // If this is the first step, the action is just "read" — absorb the page
  if (stepCount === 0) {
    return {
      type: "read",
      reasoning: `${persona.name} is seeing this page for the first time and taking a moment to understand what it is.`,
    };
  }

  // Check if we're stuck in a loop (same URL visited 3+ times)
  const recentUrls = previousSteps.slice(-5).map((s) => s.page.url);
  const currentUrlCount = recentUrls.filter((u) => u === page.url).length;
  if (currentUrlCount >= 2) {
    return {
      type: "give_up",
      reasoning: `${persona.name} is going in circles and getting frustrated — they've been on this same page multiple times.`,
    };
  }

  // Score all interactive elements
  const allElements = [...page.buttons, ...page.links, ...page.formFields];
  const scoredElements = allElements
    .filter((el) => el.isVisible)
    .map((el) => ({
      element: el,
      score: scoreElementRelevance(el, persona.goals),
    }))
    .sort((a, b) => b.score - a.score);

  // Apply discovery probability — low-tech users may not find non-obvious elements
  const discoverable = scoredElements.filter((item) => {
    if (item.score > 30) return true; // Obvious elements always found
    return Math.random() < discoveryProb;
  });

  // If there are form fields, try to fill them (users expect to fill forms)
  const emptyFormField = page.formFields.find((f) => f.isVisible);
  if (emptyFormField && page.formFields.length <= 6) {
    const fieldType = emptyFormField.type ?? "text";
    const fillValue = generateFieldValue(fieldType, emptyFormField.placeholder);
    return {
      type: "type",
      target: emptyFormField.selector,
      value: fillValue,
      reasoning: `${persona.name} sees a form field (${emptyFormField.placeholder ?? emptyFormField.ariaLabel ?? fieldType}) and fills it in.`,
    };
  }

  // Click the highest-scored discoverable element
  if (discoverable.length > 0) {
    const bestMatch = discoverable[0];
    const elementDesc = bestMatch.element.text || bestMatch.element.ariaLabel || bestMatch.element.selector;
    return {
      type: "click",
      target: bestMatch.element.selector,
      reasoning: `${persona.name} clicks "${elementDesc}" — it looks like the most relevant action for their goal.`,
    };
  }

  // Nothing relevant found — scroll to discover more
  if (stepCount < 3) {
    return {
      type: "scroll",
      reasoning: `${persona.name} doesn't see anything obvious to do, so they scroll down to see more content.`,
    };
  }

  // Give up
  return {
    type: "give_up",
    reasoning: `${persona.name} can't figure out what to do next and gives up. The page doesn't provide clear guidance.`,
  };
}

/**
 * Generate a plausible fill value for a form field type.
 */
function generateFieldValue(fieldType: string, placeholder?: string): string {
  const typeValues: Record<string, string> = {
    email: "testuser@example.com",
    password: "SecurePass123!",
    tel: "555-0123",
    number: "42",
    url: "https://example.com",
    search: "test search",
    text: "Test User",
  };

  if (placeholder) {
    const lower = placeholder.toLowerCase();
    if (lower.includes("name")) return "Alex Johnson";
    if (lower.includes("email")) return "testuser@example.com";
    if (lower.includes("phone")) return "555-0123";
    if (lower.includes("company") || lower.includes("organization")) return "Acme Corp";
    if (lower.includes("url") || lower.includes("website")) return "https://example.com";
  }

  return typeValues[fieldType] ?? "test input";
}
