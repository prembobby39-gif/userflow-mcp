import type { PageSnapshot, ClarityAssessment } from "../types.js";

/**
 * Assess how clear a page's purpose, CTAs, and navigation are.
 * Returns a score from 0 (completely unclear) to 10 (crystal clear).
 */
export function assessClarity(page: PageSnapshot): ClarityAssessment {
  let score = 10; // Start perfect, deduct for issues
  const issues: string[] = [];

  // Value proposition (from headings)
  let valueProposition: string;
  if (page.headings.length > 0) {
    const h1 = page.headings[0];
    const hasAction = /\b(get|start|build|create|manage|track|discover|learn|grow|save|boost)\b/i.test(h1);
    const isVague = /\b(welcome|hello|home|dashboard)\b/i.test(h1) && h1.split(" ").length < 5;

    if (isVague) {
      valueProposition = `Vague heading: "${h1}" — doesn't explain what the product does`;
      score -= 2;
    } else if (hasAction) {
      valueProposition = `Clear action-oriented heading: "${h1}"`;
    } else if (h1.length > 10) {
      valueProposition = `Descriptive heading: "${h1}"`;
      score -= 0.5;
    } else {
      valueProposition = `Short heading: "${h1}" — may not communicate enough`;
      score -= 1;
    }
  } else {
    valueProposition = "No heading found — users won't know what this page is about";
    score -= 3;
  }

  // CTA clarity
  let ctaClarity: string;
  const visibleButtons = page.buttons.filter((b) => b.isVisible);
  if (visibleButtons.length === 0) {
    ctaClarity = "No visible buttons — unclear what action to take";
    score -= 2;
  } else if (visibleButtons.length === 1) {
    ctaClarity = `Single clear CTA: "${visibleButtons[0].text}"`;
    score += 0.5;
  } else if (visibleButtons.length <= 3) {
    ctaClarity = `${visibleButtons.length} buttons — clear hierarchy if primary CTA is visually distinct`;
  } else {
    ctaClarity = `${visibleButtons.length} buttons — too many competing CTAs, consider reducing`;
    score -= 1;
  }

  // Navigation logic
  let navigationLogic: string;
  const navLinks = page.links.filter((l) => l.isVisible);
  if (navLinks.length === 0 && page.buttons.length === 0) {
    navigationLogic = "No navigation options — user is stuck";
    score -= 3;
  } else if (navLinks.length > 20) {
    navigationLogic = `${navLinks.length} links — navigation is cluttered and overwhelming`;
    score -= 1.5;
  } else if (navLinks.length > 0) {
    navigationLogic = `${navLinks.length} links available — reasonable navigation density`;
  } else {
    navigationLogic = "Navigation relies only on buttons, no standard links";
    score -= 0.5;
  }

  // Heading structure
  let headingStructure: string;
  if (page.headings.length >= 3) {
    headingStructure = `Good structure: ${page.headings.length} headings organize the content`;
  } else if (page.headings.length > 0) {
    headingStructure = `Minimal structure: only ${page.headings.length} heading(s)`;
    score -= 0.5;
  } else {
    headingStructure = "No heading structure — content is unorganized";
    score -= 1;
  }

  // Error state
  if (page.errorMessages.length > 0) {
    score -= 2;
    issues.push(`${page.errorMessages.length} error messages visible`);
  }

  // Empty page
  if (page.mainText.trim().length < 30) {
    score -= 2;
    issues.push("Extremely sparse content — page appears empty or broken");
  }

  const clampedScore = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  const assessmentParts: string[] = [];
  if (clampedScore >= 8) assessmentParts.push("Page purpose and next steps are clear.");
  else if (clampedScore >= 6) assessmentParts.push("Page is mostly clear but has some ambiguity.");
  else if (clampedScore >= 4) assessmentParts.push("Page clarity needs improvement — users may be confused.");
  else assessmentParts.push("Page is unclear — users won't know what to do.");

  if (issues.length > 0) assessmentParts.push(`Issues: ${issues.join("; ")}.`);

  return {
    score: clampedScore,
    valueProposition,
    ctaClarity,
    navigationLogic,
    headingStructure,
    assessment: assessmentParts.join(" "),
  };
}
