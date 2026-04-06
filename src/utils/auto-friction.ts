/**
 * Auto-detect friction points from v0.3 page snapshot metrics.
 * Generates friction automatically from performance, accessibility,
 * network, and console data — no manual annotation needed.
 */

import type { PageSnapshot, FrictionPoint } from "../types.js";

/**
 * Analyze a page snapshot and return auto-detected friction points.
 * Called after every step and on initial page load.
 */
export function detectAutoFriction(
  snapshot: PageSnapshot,
  stepIndex: number
): FrictionPoint[] {
  const friction: FrictionPoint[] = [];
  let fid = 0;
  const id = () => `auto-${stepIndex}-${fid++}`;

  // ── Performance friction ────────────────────────────────────
  const perf = snapshot.performance;
  if (perf) {
    if (perf.lcp !== null && perf.lcp > 4000) {
      friction.push({
        id: id(), severity: "high", stepIndex,
        location: snapshot.url,
        description: `Slow page load — LCP is ${perf.lcp.toFixed(0)}ms (poor, threshold: 2500ms)`,
        suggestion: "Optimize largest contentful paint: lazy-load below-fold images, defer non-critical JS, preload hero image, use CDN",
      });
    } else if (perf.lcp !== null && perf.lcp > 2500) {
      friction.push({
        id: id(), severity: "medium", stepIndex,
        location: snapshot.url,
        description: `Page load needs improvement — LCP is ${perf.lcp.toFixed(0)}ms (threshold: 2500ms)`,
        suggestion: "Preload critical resources, compress images, consider code-splitting JS bundles",
      });
    }

    if (perf.cls !== null && perf.cls > 0.25) {
      friction.push({
        id: id(), severity: "high", stepIndex,
        location: snapshot.url,
        description: `Layout instability — CLS is ${perf.cls.toFixed(3)} (poor, threshold: 0.1)`,
        suggestion: "Set explicit width/height on images and embeds, avoid inserting content above existing content",
      });
    } else if (perf.cls !== null && perf.cls > 0.1) {
      friction.push({
        id: id(), severity: "medium", stepIndex,
        location: snapshot.url,
        description: `Some layout shift detected — CLS is ${perf.cls.toFixed(3)} (threshold: 0.1)`,
        suggestion: "Reserve space for dynamic content, use CSS aspect-ratio for media",
      });
    }

    if (perf.fcp !== null && perf.fcp > 3000) {
      friction.push({
        id: id(), severity: "medium", stepIndex,
        location: snapshot.url,
        description: `Slow first paint — FCP is ${perf.fcp.toFixed(0)}ms, users see a blank screen`,
        suggestion: "Inline critical CSS, reduce render-blocking resources, use font-display: swap",
      });
    }
  }

  // ── Accessibility friction ──────────────────────────────────
  const a11y = snapshot.accessibility;
  if (a11y) {
    const critSerious = a11y.violationsByImpact.critical + a11y.violationsByImpact.serious;
    if (critSerious > 0) {
      const violations = a11y.violations
        .filter(v => v.impact === "critical" || v.impact === "serious")
        .slice(0, 3);
      const desc = violations.map(v => `${v.id} (${v.affectedNodes} elements)`).join(", ");
      friction.push({
        id: id(),
        severity: critSerious >= 3 ? "high" : "medium",
        stepIndex,
        location: snapshot.url,
        description: `Accessibility issues: ${critSerious} serious/critical violations — ${desc}`,
        suggestion: violations.map(v => v.help).join("; "),
      });
    }

    if (a11y.score < 50) {
      friction.push({
        id: id(), severity: "critical", stepIndex,
        location: snapshot.url,
        description: `Very poor accessibility score: ${a11y.score}/100 — many users will be unable to use this page`,
        suggestion: "Prioritize fixing critical and serious axe-core violations before other work",
      });
    }
  }

  // ── Console errors friction ─────────────────────────────────
  const con = snapshot.console;
  if (con) {
    if (con.errors > 5) {
      friction.push({
        id: id(), severity: "high", stepIndex,
        location: snapshot.url,
        description: `${con.errors} JavaScript errors in console — features may be broken`,
        suggestion: "Fix JS errors: check console output, add error boundaries, test critical paths",
      });
    } else if (con.errors > 0) {
      friction.push({
        id: id(), severity: "low", stepIndex,
        location: snapshot.url,
        description: `${con.errors} JavaScript error${con.errors > 1 ? "s" : ""} in console`,
        suggestion: "Review console errors and fix to prevent potential user-facing issues",
      });
    }

    if (con.pageErrors > 0) {
      friction.push({
        id: id(), severity: "high", stepIndex,
        location: snapshot.url,
        description: `${con.pageErrors} uncaught exception${con.pageErrors > 1 ? "s" : ""} — page may crash or behave unexpectedly`,
        suggestion: "Add error handling for uncaught exceptions, use window.onerror or error boundaries",
      });
    }
  }

  // ── Network friction ────────────────────────────────────────
  const net = snapshot.network;
  if (net) {
    if (net.failedRequests > 5) {
      friction.push({
        id: id(), severity: "medium", stepIndex,
        location: snapshot.url,
        description: `${net.failedRequests} failed network requests — content or features may be missing`,
        suggestion: "Fix broken API calls and 404 resources, add error states for failed requests",
      });
    }

    if (net.totalTransferSize > 5 * 1024 * 1024) {
      friction.push({
        id: id(), severity: "medium", stepIndex,
        location: snapshot.url,
        description: `Heavy page weight: ${(net.totalTransferSize / 1024 / 1024).toFixed(1)}MB transferred`,
        suggestion: "Compress assets, lazy-load images, use modern image formats (WebP/AVIF), tree-shake JS",
      });
    }
  }

  // ── Content/UX friction ─────────────────────────────────────
  if (snapshot.headings.length === 0) {
    friction.push({
      id: id(), severity: "medium", stepIndex,
      location: snapshot.url,
      description: "No headings found — page purpose unclear, poor for screen readers and scannability",
      suggestion: "Add a clear H1 page title and H2 section headings",
    });
  }

  if (snapshot.interactiveElements.length > 50) {
    friction.push({
      id: id(), severity: "medium", stepIndex,
      location: snapshot.url,
      description: `High cognitive load: ${snapshot.interactiveElements.length} interactive elements on one page`,
      suggestion: "Group related actions, use progressive disclosure, or collapse secondary options",
    });
  }

  if (snapshot.errorMessages.length > 0) {
    friction.push({
      id: id(), severity: "high", stepIndex,
      location: snapshot.url,
      description: `Visible error messages on page: "${snapshot.errorMessages[0].slice(0, 100)}"`,
      suggestion: "Fix the source of errors, or provide clear user-friendly error messages with recovery actions",
    });
  }

  return friction;
}
