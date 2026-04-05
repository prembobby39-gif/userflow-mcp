import type { PageSnapshot, CognitiveLoadAssessment } from "../types.js";

/**
 * Assess the cognitive load of a page snapshot.
 * Returns a score from 0 (minimal) to 10 (overwhelming).
 */
export function assessCognitiveLoad(page: PageSnapshot): CognitiveLoadAssessment {
  const elementCount = page.interactiveElements.length + page.headings.length;
  const interactiveCount = page.interactiveElements.length;
  const textLength = page.mainText.length;
  const textDensity = textLength / Math.max(1, page.headings.length + 1); // chars per section
  const decisionPoints = page.buttons.length + page.links.filter((l) => l.isVisible).length;

  // Score components (each 0-2, sum to 0-10)
  const elementScore = elementCount > 50 ? 2 : elementCount > 30 ? 1.5 : elementCount > 15 ? 1 : 0.5;
  const interactiveScore = interactiveCount > 20 ? 2 : interactiveCount > 12 ? 1.5 : interactiveCount > 6 ? 1 : 0.5;
  const textScore = textDensity > 500 ? 2 : textDensity > 300 ? 1.5 : textDensity > 150 ? 1 : 0.5;
  const decisionScore = decisionPoints > 15 ? 2 : decisionPoints > 8 ? 1.5 : decisionPoints > 4 ? 1 : 0.5;
  const formScore = page.formFields.length > 6 ? 2 : page.formFields.length > 3 ? 1.5 : page.formFields.length > 0 ? 1 : 0;

  const rawScore = elementScore + interactiveScore + textScore + decisionScore + formScore;
  const score = Math.min(10, Math.round(rawScore * 10) / 10);

  const visualComplexity = score > 7 ? "Very High" : score > 5 ? "High" : score > 3 ? "Moderate" : "Low";

  const assessmentParts: string[] = [];
  if (score > 7) assessmentParts.push("This page is overwhelming — too many elements competing for attention.");
  else if (score > 5) assessmentParts.push("This page has high cognitive load — users may feel decision fatigue.");
  else if (score > 3) assessmentParts.push("This page has moderate cognitive load — manageable for most users.");
  else assessmentParts.push("This page has low cognitive load — clean and focused.");

  if (decisionPoints > 10) assessmentParts.push(`${decisionPoints} clickable elements create decision paralysis.`);
  if (page.formFields.length > 5) assessmentParts.push(`Form with ${page.formFields.length} fields adds significant friction.`);
  if (page.headings.length === 0) assessmentParts.push("No headings to organize content — users lack visual anchors.");

  return {
    score,
    elementCount,
    interactiveCount,
    textDensity: Math.round(textDensity),
    decisionPoints,
    visualComplexity,
    assessment: assessmentParts.join(" "),
  };
}
