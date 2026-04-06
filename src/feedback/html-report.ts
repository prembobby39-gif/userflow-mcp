/**
 * Rich HTML report generator — v0.3.1 overhaul.
 *
 * Features:
 *  - Executive summary with key metrics
 *  - Site-wide page comparison dashboard table
 *  - Accessibility violations section with details
 *  - Network details (failed, slowest, resource breakdown)
 *  - Auto-generated recommendations from data
 *  - Collapsed steps by default
 *  - Sidebar page navigation (jump links)
 *  - Screenshot CSS compression (max-height, lazy-load)
 *  - Print/PDF optimized
 *  - **"Idiot Summary"** — plain-English explanation of issues
 */
import type {
  UserSession,
  SessionStep,
  FrictionPoint,
  AccessibilityReport,
  AccessibilityViolation,
  PerformanceMetrics,
  NetworkSummary,
  ConsoleSummary,
} from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EMOTION_COLORS: Readonly<Record<string, string>> = {
  curious: "#3b82f6",
  confident: "#22c55e",
  neutral: "#6b7280",
  confused: "#f59e0b",
  frustrated: "#ef4444",
  delighted: "#a855f7",
  anxious: "#f97316",
  bored: "#94a3b8",
};

function ratingClass(rating: string | null): string {
  if (rating === "good") return "good";
  if (rating === "needs-improvement") return "warn";
  if (rating === "poor") return "bad";
  return "";
}

function scoreClass(score: number, goodThresh: number, warnThresh: number): string {
  if (score >= goodThresh) return "good";
  if (score >= warnThresh) return "warn";
  return "bad";
}

function fmtMs(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

// ── Page-level data extraction ───────────────────────────────────

interface PageMetrics {
  readonly url: string;
  readonly title: string;
  readonly stepIndex: number;
  readonly lcp: number | null;
  readonly lcpRating: string | null;
  readonly cls: number | null;
  readonly clsRating: string | null;
  readonly fcp: number | null;
  readonly a11yScore: number | null;
  readonly a11yViolations: number;
  readonly networkRequests: number;
  readonly networkFailed: number;
  readonly transferSize: number;
  readonly consoleErrors: number;
  readonly pageErrors: number;
  readonly frictionCount: number;
}

function extractPageMetrics(step: SessionStep): PageMetrics {
  const p = step.page;
  return {
    url: p.url,
    title: p.title || p.url,
    stepIndex: step.index,
    lcp: p.performance?.lcp ?? null,
    lcpRating: p.performance?.lcpRating ?? null,
    cls: p.performance?.cls ?? null,
    clsRating: p.performance?.clsRating ?? null,
    fcp: p.performance?.fcp ?? null,
    a11yScore: p.accessibility?.score ?? null,
    a11yViolations: p.accessibility?.violations.length ?? 0,
    networkRequests: p.network?.totalRequests ?? 0,
    networkFailed: p.network?.failedRequests ?? 0,
    transferSize: p.network?.totalTransferSize ?? 0,
    consoleErrors: p.console?.errors ?? 0,
    pageErrors: p.console?.pageErrors ?? 0,
    frictionCount: step.frictionPoints.length,
  };
}

/** Deduplicate pages by URL — keep the one with the most data (highest step). */
function deduplicatePages(steps: readonly SessionStep[]): PageMetrics[] {
  const byUrl = new Map<string, PageMetrics>();
  for (const step of steps) {
    const m = extractPageMetrics(step);
    const existing = byUrl.get(m.url);
    // Prefer entry with a11y data or more friction points
    if (
      !existing ||
      (m.a11yScore !== null && existing.a11yScore === null) ||
      m.frictionCount > existing.frictionCount
    ) {
      byUrl.set(m.url, m);
    }
  }
  return [...byUrl.values()];
}

// ── Aggregate all a11y violations across steps ───────────────────

interface AggregatedViolation {
  readonly id: string;
  readonly impact: string;
  readonly description: string;
  readonly help: string;
  readonly helpUrl: string;
  readonly pages: readonly string[];
  readonly totalAffected: number;
}

function aggregateA11yViolations(steps: readonly SessionStep[]): AggregatedViolation[] {
  const map = new Map<string, { id: string; impact: string; description: string; help: string; helpUrl: string; pages: Set<string>; totalAffected: number }>();
  for (const step of steps) {
    const a11y = step.page.accessibility;
    if (!a11y) continue;
    for (const v of a11y.violations) {
      const existing = map.get(v.id);
      if (existing) {
        existing.pages.add(step.page.url);
        existing.totalAffected += v.affectedNodes;
      } else {
        map.set(v.id, {
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          pages: new Set([step.page.url]),
          totalAffected: v.affectedNodes,
        });
      }
    }
  }

  return [...map.values()]
    .map((v) => ({
      ...v,
      pages: [...v.pages],
    }))
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
      return (order[a.impact] ?? 3) - (order[b.impact] ?? 3);
    });
}

// ── Auto-generate recommendations from collected data ────────────

function generateAutoRecommendations(
  pages: readonly PageMetrics[],
  violations: readonly AggregatedViolation[],
  allFriction: readonly FrictionPoint[]
): string[] {
  const recs: string[] = [];

  // Performance recommendations
  const slowPages = pages.filter((p) => p.lcp !== null && p.lcp > 2500);
  if (slowPages.length > 0) {
    recs.push(
      `${slowPages.length} page${slowPages.length > 1 ? "s have" : " has"} slow LCP (>2.5s). Optimize largest contentful paint by lazy-loading below-fold images, preloading hero assets, and deferring non-critical JavaScript.`
    );
  }

  const highCls = pages.filter((p) => p.cls !== null && p.cls > 0.1);
  if (highCls.length > 0) {
    recs.push(
      `${highCls.length} page${highCls.length > 1 ? "s have" : " has"} layout instability (CLS > 0.1). Set explicit width/height on images and embeds, avoid inserting content above existing content.`
    );
  }

  // Accessibility recommendations
  const critViolations = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  if (critViolations.length > 0) {
    recs.push(
      `${critViolations.length} critical/serious accessibility violations found across the site. Priority fixes: ${critViolations.slice(0, 3).map((v) => v.id).join(", ")}.`
    );
  }

  const lowA11yPages = pages.filter((p) => p.a11yScore !== null && p.a11yScore < 70);
  if (lowA11yPages.length > 0) {
    recs.push(
      `${lowA11yPages.length} page${lowA11yPages.length > 1 ? "s score" : " scores"} below 70/100 on accessibility. Many users with disabilities will struggle to use these pages.`
    );
  }

  // Network recommendations
  const failedNetPages = pages.filter((p) => p.networkFailed > 0);
  if (failedNetPages.length > 0) {
    const totalFailed = failedNetPages.reduce((s, p) => s + p.networkFailed, 0);
    recs.push(
      `${totalFailed} failed network requests across ${failedNetPages.length} page${failedNetPages.length > 1 ? "s" : ""}. Fix broken API calls and missing resources.`
    );
  }

  const heavyPages = pages.filter((p) => p.transferSize > 3 * 1024 * 1024);
  if (heavyPages.length > 0) {
    recs.push(
      `${heavyPages.length} page${heavyPages.length > 1 ? "s exceed" : " exceeds"} 3MB transfer size. Compress assets, lazy-load images, use modern formats (WebP/AVIF).`
    );
  }

  // Console error recommendations
  const errorPages = pages.filter((p) => p.consoleErrors > 0);
  if (errorPages.length > 0) {
    const totalErrors = errorPages.reduce((s, p) => s + p.consoleErrors, 0);
    recs.push(
      `${totalErrors} JavaScript errors across ${errorPages.length} page${errorPages.length > 1 ? "s" : ""}. Fix JS errors to prevent broken features.`
    );
  }

  const crashPages = pages.filter((p) => p.pageErrors > 0);
  if (crashPages.length > 0) {
    recs.push(
      `${crashPages.reduce((s, p) => s + p.pageErrors, 0)} uncaught exceptions found. Add error boundaries and global error handlers.`
    );
  }

  // Friction recommendations
  const critFriction = allFriction.filter((f) => f.severity === "critical" || f.severity === "high");
  if (critFriction.length > 5) {
    recs.push(
      `${critFriction.length} high/critical friction points detected. The most common issues should be prioritized in the next sprint.`
    );
  }

  return recs;
}

// ── Dev Recommendations generator ────────────────────────────────

type DevPriority = "P0" | "P1" | "P2";
type DevCategory = "Performance" | "Accessibility" | "Network" | "Security" | "JavaScript" | "UX" | "SEO";

interface DevRecommendation {
  readonly priority: DevPriority;
  readonly category: DevCategory;
  readonly title: string;
  readonly problem: string;
  readonly pages: readonly string[];
  readonly fix: string;
  readonly code?: string;
}

function generateDevRecommendations(
  pages: readonly PageMetrics[],
  violations: readonly AggregatedViolation[],
  steps: readonly SessionStep[],
  allFriction: readonly FrictionPoint[]
): DevRecommendation[] {
  const recs: DevRecommendation[] = [];
  const allUrls = pages.map((p) => p.url);

  // ── Performance: Slow LCP ──────────────────────────────────────
  const poorLcp = pages.filter((p) => p.lcp !== null && p.lcp > 4000);
  const needsImpLcp = pages.filter((p) => p.lcp !== null && p.lcp > 2500 && p.lcp <= 4000);

  if (poorLcp.length > 0) {
    recs.push({
      priority: "P0",
      category: "Performance",
      title: "Fix poor Largest Contentful Paint (LCP)",
      problem: `${poorLcp.length} page${poorLcp.length > 1 ? "s have" : " has"} LCP over 4s (worst: ${fmtMs(Math.max(...poorLcp.map((p) => p.lcp ?? 0)))}). Google flags this as "poor" and it will hurt SEO and user experience.`,
      pages: poorLcp.map((p) => p.url),
      fix: `Identify the LCP element (usually a hero image or large text block) and optimize its loading.`,
      code: `<!-- 1. Preload the LCP image in <head> -->
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high">

<!-- 2. Use modern image formats + responsive sizes -->
<img src="/hero.webp" alt="..." width="1200" height="600"
     fetchpriority="high" decoding="async"
     srcset="/hero-400.webp 400w, /hero-800.webp 800w, /hero.webp 1200w"
     sizes="(max-width: 768px) 100vw, 1200px">

<!-- 3. Defer non-critical JS that blocks rendering -->
<script src="/analytics.js" defer></script>

<!-- 4. Inline critical CSS, lazy-load the rest -->
<link rel="preload" href="/styles.css" as="style" onload="this.rel='stylesheet'">`,
    });
  } else if (needsImpLcp.length > 0) {
    recs.push({
      priority: "P1",
      category: "Performance",
      title: "Improve LCP (needs improvement range)",
      problem: `${needsImpLcp.length} page${needsImpLcp.length > 1 ? "s" : ""} with LCP between 2.5-4s. Aim for under 2.5s.`,
      pages: needsImpLcp.map((p) => p.url),
      fix: `Preload LCP resources, compress images, and defer non-critical JavaScript.`,
      code: `<!-- Preload the largest element's resource -->
<link rel="preload" as="image" href="/largest-image.webp" fetchpriority="high">

<!-- Convert images to WebP/AVIF (80%+ smaller than JPEG) -->
npx sharp-cli resize 1200 --format webp --quality 80 input.jpg -o output.webp`,
    });
  }

  // ── Performance: Layout Shift (CLS) ────────────────────────────
  const highCls = pages.filter((p) => p.cls !== null && p.cls > 0.1);
  if (highCls.length > 0) {
    const worst = Math.max(...highCls.map((p) => p.cls ?? 0));
    recs.push({
      priority: worst > 0.25 ? "P0" : "P1",
      category: "Performance",
      title: "Fix Cumulative Layout Shift (CLS)",
      problem: `${highCls.length} page${highCls.length > 1 ? "s" : ""} with CLS > 0.1 (worst: ${worst.toFixed(3)}). Content shifts after loading, causing misclicks and frustration.`,
      pages: highCls.map((p) => p.url),
      fix: `Set explicit dimensions on all media elements and avoid injecting content above the fold after page load.`,
      code: `/* Always set width + height on images (browser reserves space) */
<img src="photo.jpg" width="800" height="450" alt="...">

/* Use CSS aspect-ratio for responsive containers */
.video-wrapper {
  aspect-ratio: 16 / 9;
  width: 100%;
}

/* Avoid dynamically inserting banners/bars above existing content */
/* If you must, use CSS transform instead of changing layout: */
.banner { transform: translateY(-100%); animation: slideDown 0.3s forwards; }`,
    });
  }

  // ── Accessibility: Color Contrast ──────────────────────────────
  const contrastViolations = violations.filter((v) => v.id === "color-contrast");
  if (contrastViolations.length > 0) {
    const cv = contrastViolations[0];
    recs.push({
      priority: "P0",
      category: "Accessibility",
      title: "Fix color contrast violations (WCAG 2.1 AA)",
      problem: `${cv.totalAffected} elements across ${cv.pages.length} page${cv.pages.length > 1 ? "s" : ""} fail color contrast requirements. Users with low vision cannot read this text.`,
      pages: cv.pages,
      fix: `Ensure all text meets WCAG AA contrast ratios: 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold).`,
      code: `/* Use a contrast checker: https://webaim.org/resources/contrastchecker/ */

/* BAD: Light gray on white — ratio ~2:1 */
.muted-text { color: #999; background: #fff; }

/* GOOD: Darker gray on white — ratio 4.6:1 */
.muted-text { color: #595959; background: #fff; }

/* Programmatic check in your CSS/build pipeline: */
/* npm install postcss-colorguard */
/* It flags low-contrast color pairs at build time */`,
    });
  }

  // ── Accessibility: Missing Labels ──────────────────────────────
  const labelViolations = violations.filter(
    (v) => v.id.includes("label") || v.id.includes("aria") || v.id === "image-alt"
  );
  for (const lv of labelViolations.slice(0, 2)) {
    recs.push({
      priority: lv.impact === "critical" || lv.impact === "serious" ? "P0" : "P1",
      category: "Accessibility",
      title: `Fix: ${lv.help}`,
      problem: `${lv.totalAffected} elements affected across ${lv.pages.length} page${lv.pages.length > 1 ? "s" : ""}. Screen reader users will not understand these elements.`,
      pages: lv.pages,
      fix: lv.help,
      code: lv.id === "image-alt"
        ? `<!-- BAD: Missing alt text -->
<img src="photo.jpg">

<!-- GOOD: Descriptive alt text -->
<img src="photo.jpg" alt="Student presenting capstone project to panel">

<!-- GOOD: Decorative image (empty alt is intentional) -->
<img src="divider.svg" alt="" role="presentation">`
        : lv.id.includes("label")
        ? `<!-- BAD: Input without label -->
<input type="email" name="email">

<!-- GOOD: Visible label -->
<label for="email">Email address</label>
<input type="email" id="email" name="email">

<!-- GOOD: aria-label when visual label isn't possible -->
<input type="search" aria-label="Search courses" placeholder="Search...">`
        : undefined,
    });
  }

  // ── Accessibility: Other critical/serious ──────────────────────
  const otherCritA11y = violations.filter(
    (v) =>
      (v.impact === "critical" || v.impact === "serious") &&
      v.id !== "color-contrast" &&
      !v.id.includes("label") &&
      !v.id.includes("aria") &&
      v.id !== "image-alt"
  );
  for (const v of otherCritA11y.slice(0, 3)) {
    recs.push({
      priority: v.impact === "critical" ? "P0" : "P1",
      category: "Accessibility",
      title: `Fix: ${v.help}`,
      problem: `${v.totalAffected} elements affected. Rule: ${v.id}`,
      pages: v.pages,
      fix: `See: ${v.helpUrl}`,
    });
  }

  // ── Network: Failed Requests ───────────────────────────────────
  const failPages = pages.filter((p) => p.networkFailed > 3);
  if (failPages.length > 0) {
    // Collect specific failed URLs from step data
    const failedUrls = new Set<string>();
    for (const step of steps) {
      const slow = step.page.network?.slowestRequests ?? [];
      for (const r of slow) {
        if (r.failed || r.status >= 400) failedUrls.add(`${r.status} ${r.url.slice(0, 100)}`);
      }
    }
    const totalFailed = failPages.reduce((s, p) => s + p.networkFailed, 0);
    const examples = [...failedUrls].slice(0, 5);

    recs.push({
      priority: totalFailed > 20 ? "P0" : "P1",
      category: "Network",
      title: "Fix failed network requests",
      problem: `${totalFailed} requests failing across ${failPages.length} page${failPages.length > 1 ? "s" : ""}. Broken API calls, missing assets, or CORS issues.${examples.length > 0 ? "\n\nExamples:\n" + examples.join("\n") : ""}`,
      pages: failPages.map((p) => p.url),
      fix: `Audit failed requests in browser DevTools Network tab. Common fixes:`,
      code: `# 1. Fix 404s — missing assets or wrong paths
#    Check your build output and deployment for missing files

# 2. Fix CORS errors (status 0) — blocked cross-origin requests
# Server-side: Add appropriate CORS headers
Access-Control-Allow-Origin: https://your-domain.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization

# 3. Fix blocked analytics/tracking (status 0)
# These are typically blocked by ad-blockers — not a bug,
# but handle gracefully:
fetch('/api/analytics', { keepalive: true }).catch(() => {});

# 4. Add a favicon to stop the 404
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    });
  }

  // ── Network: Heavy Pages ───────────────────────────────────────
  const heavyPages = pages.filter((p) => p.transferSize > 3 * 1024 * 1024);
  if (heavyPages.length > 0) {
    const worst = Math.max(...heavyPages.map((p) => p.transferSize));
    recs.push({
      priority: worst > 10 * 1024 * 1024 ? "P0" : "P1",
      category: "Network",
      title: "Reduce page weight",
      problem: `${heavyPages.length} page${heavyPages.length > 1 ? "s exceed" : " exceeds"} 3MB (worst: ${fmtBytes(worst)}). Slow on mobile and burns user data.`,
      pages: heavyPages.map((p) => p.url),
      fix: `Compress images, enable gzip/brotli, lazy-load below-fold content, tree-shake JS.`,
      code: `# 1. Enable Brotli/gzip compression on your server/CDN
# nginx:
gzip on;
gzip_types text/css application/javascript image/svg+xml;
brotli on;

# 2. Lazy-load images below the fold
<img src="photo.webp" loading="lazy" alt="...">

# 3. Code-split JavaScript (React/Next.js example)
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

# 4. Audit bundle size
npx webpack-bundle-analyzer stats.json
# or
npx vite-bundle-visualizer`,
    });
  }

  // ── JavaScript: Console Errors ─────────────────────────────────
  const errorPages = pages.filter((p) => p.consoleErrors > 0);
  if (errorPages.length > 0) {
    const totalErrors = errorPages.reduce((s, p) => s + p.consoleErrors, 0);

    // Collect actual error messages from steps
    const errorMsgs = new Set<string>();
    for (const step of steps) {
      for (const msg of step.page.console?.criticalErrors ?? []) {
        errorMsgs.add(msg.text.slice(0, 120));
      }
      for (const msg of step.page.console?.messages.filter((m) => m.level === "error") ?? []) {
        errorMsgs.add(msg.text.slice(0, 120));
      }
    }
    const examples = [...errorMsgs].slice(0, 5);

    recs.push({
      priority: totalErrors > 20 ? "P0" : "P1",
      category: "JavaScript",
      title: "Fix JavaScript console errors",
      problem: `${totalErrors} JS errors across ${errorPages.length} page${errorPages.length > 1 ? "s" : ""}. These may cause broken features, crashes, or data loss.${examples.length > 0 ? "\n\nTop errors:\n" + examples.map((e) => "• " + e).join("\n") : ""}`,
      pages: errorPages.map((p) => p.url),
      fix: `Open browser DevTools → Console tab. Fix errors by category:`,
      code: `// 1. Add a global error handler to catch and report crashes
window.addEventListener('error', (event) => {
  // Send to your error tracking service (Sentry, LogRocket, etc.)
  reportError({ message: event.message, stack: event.error?.stack, url: event.filename });
});

window.addEventListener('unhandledrejection', (event) => {
  reportError({ message: event.reason?.message || 'Unhandled promise rejection' });
});

// 2. Add React Error Boundary (if using React)
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { reportError(error, info); }
  render() {
    if (this.state.hasError) return <FallbackUI />;
    return this.props.children;
  }
}

// 3. Wrap async operations in try-catch
async function fetchData() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(\`API error: \${res.status}\`);
    return await res.json();
  } catch (err) {
    showUserFriendlyError('Failed to load data. Please try again.');
    reportError(err);
  }
}`,
    });
  }

  // ── Security: Insecure Cookies ─────────────────────────────────
  // Check storage data from steps
  for (const step of steps) {
    const storage = step.page.storage;
    if (!storage) continue;
    const insecureCookies = storage.cookies.filter((c) => !c.secure || !c.httpOnly);
    if (insecureCookies.length > 0) {
      const authCookies = insecureCookies.filter(
        (c) =>
          c.name.toLowerCase().includes("login") ||
          c.name.toLowerCase().includes("session") ||
          c.name.toLowerCase().includes("token") ||
          c.name.toLowerCase().includes("auth")
      );
      const hasAuthRisk = authCookies.length > 0;

      recs.push({
        priority: hasAuthRisk ? "P0" : "P2",
        category: "Security",
        title: "Secure cookie configuration",
        problem: `${insecureCookies.length} cookie${insecureCookies.length > 1 ? "s" : ""} missing Secure and/or HttpOnly flags.${hasAuthRisk ? ` Includes authentication cookies (${authCookies.map((c) => c.name).join(", ")}) — this is a security vulnerability.` : ""}`,
        pages: allUrls,
        fix: `Set Secure, HttpOnly, and SameSite attributes on all cookies, especially authentication ones.`,
        code: `// Node.js / Express
res.cookie('sessionToken', token, {
  httpOnly: true,    // Prevents JavaScript access (XSS protection)
  secure: true,      // Only sent over HTTPS
  sameSite: 'Lax',   // CSRF protection
  maxAge: 86400000,  // 24 hours
  path: '/',
});

// Set-Cookie header directly:
Set-Cookie: sessionToken=abc123; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`,
      });
      break; // Only add once
    }
  }

  // ── UX: Missing Headings ───────────────────────────────────────
  const noHeadings = allFriction.filter((f) => f.description.includes("No headings found"));
  if (noHeadings.length > 0) {
    const affectedUrls = [...new Set(noHeadings.map((f) => f.location))];
    recs.push({
      priority: "P1",
      category: "UX",
      title: "Add page headings for structure and accessibility",
      problem: `${affectedUrls.length} page${affectedUrls.length > 1 ? "s" : ""} have no headings. Screen readers use headings to navigate, and sighted users use them to scan.`,
      pages: affectedUrls,
      fix: `Add a clear H1 for the page title and H2s for major sections. Follow heading hierarchy (don't skip levels).`,
      code: `<!-- Every page needs exactly one H1 -->
<h1>Dashboard</h1>

<!-- Use H2 for major sections -->
<h2>Upcoming Events</h2>
<h2>Recent Grades</h2>
<h2>Announcements</h2>

<!-- H3 for subsections within an H2 -->
<h2>Academic Progress</h2>
<h3>Current Semester</h3>
<h3>Cumulative GPA</h3>

<!-- If you don't want visual headings, use visually-hidden class: -->
<h1 class="sr-only">Student Dashboard</h1>
<style>.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }</style>`,
    });
  }

  // ── UX: High Cognitive Load ────────────────────────────────────
  const highCogLoad = allFriction.filter((f) => f.description.includes("interactive elements"));
  if (highCogLoad.length > 0) {
    const affectedUrls = [...new Set(highCogLoad.map((f) => f.location))];
    recs.push({
      priority: "P2",
      category: "UX",
      title: "Reduce cognitive load on busy pages",
      problem: `${affectedUrls.length} page${affectedUrls.length > 1 ? "s have" : " has"} over 50 interactive elements. Users face decision paralysis.`,
      pages: affectedUrls,
      fix: `Group related actions, use progressive disclosure, and prioritize primary actions.`,
      code: `<!-- Use progressive disclosure — hide secondary actions -->
<details>
  <summary>More options</summary>
  <div class="secondary-actions">
    <!-- less-used actions go here -->
  </div>
</details>

<!-- Visual hierarchy — make primary action obvious -->
<button class="btn-primary">Submit Application</button>
<button class="btn-secondary">Save Draft</button>
<button class="btn-ghost">Cancel</button>

<!-- Group related items with clear section labels -->
<fieldset>
  <legend>Notification Preferences</legend>
  <!-- related toggles/checkboxes -->
</fieldset>`,
    });
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  recs.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

  return recs;
}

// ── Idiot Summary generator ──────────────────────────────────────

function generateIdiotSummary(
  pages: readonly PageMetrics[],
  violations: readonly AggregatedViolation[],
  allFriction: readonly FrictionPoint[],
  summary: { readonly frictionScore: number; readonly goalAchieved: boolean }
): string[] {
  const complaints: string[] = [];

  // Slow pages
  const slowPages = pages.filter((p) => p.lcp !== null && p.lcp > 4000);
  const kindaSlowPages = pages.filter((p) => p.lcp !== null && p.lcp > 2500 && p.lcp <= 4000);
  if (slowPages.length > 0) {
    complaints.push(
      `Some pages take forever to load. Like, I'm sitting there staring at a blank screen for ${Math.max(...slowPages.map((p) => p.lcp ?? 0)) > 5000 ? "over 5 seconds" : "several seconds"}. That's way too long.`
    );
  } else if (kindaSlowPages.length > 0) {
    complaints.push(
      `A few pages are a bit slow to load. Not terrible, but noticeable — you can feel the delay.`
    );
  }

  // JS errors
  const totalErrors = pages.reduce((s, p) => s + p.consoleErrors, 0);
  const totalCrashes = pages.reduce((s, p) => s + p.pageErrors, 0);
  if (totalCrashes > 0) {
    complaints.push(
      `The site has bugs that crash things. I found ${totalCrashes} crash${totalCrashes > 1 ? "es" : ""} — the kind where something just stops working and you don't know why.`
    );
  } else if (totalErrors > 10) {
    complaints.push(
      `There are ${totalErrors} errors happening behind the scenes. The site mostly works, but stuff is definitely breaking that you can't see.`
    );
  } else if (totalErrors > 0) {
    complaints.push(
      `A couple of minor errors in the background. Nothing major, but worth cleaning up.`
    );
  }

  // Accessibility
  const avgA11y = pages.filter((p) => p.a11yScore !== null);
  if (avgA11y.length > 0) {
    const avg = avgA11y.reduce((s, p) => s + (p.a11yScore ?? 0), 0) / avgA11y.length;
    if (avg < 50) {
      complaints.push(
        `The site is really hard to use if you have any kind of disability. Screen readers, keyboard navigation — basically broken. Average accessibility score is ${avg.toFixed(0)}/100.`
      );
    } else if (avg < 70) {
      complaints.push(
        `Accessibility needs work. People who use screen readers or keyboard navigation will run into problems. Score: ${avg.toFixed(0)}/100.`
      );
    } else if (avg < 90) {
      complaints.push(
        `Accessibility is okay but not great (${avg.toFixed(0)}/100). There are some issues that could trip up users with disabilities.`
      );
    }
  }

  // Critical violations in plain English
  const critViols = violations.filter((v) => v.impact === "critical");
  const seriousViols = violations.filter((v) => v.impact === "serious");
  if (critViols.length > 0) {
    const examples = critViols.slice(0, 2).map((v) => v.help).join(". Also, ");
    complaints.push(`Critical accessibility problems: ${examples}.`);
  }
  if (seriousViols.length > 3) {
    complaints.push(
      `There are ${seriousViols.length} serious accessibility issues — things like missing labels on buttons, images without descriptions, and form fields that don't tell you what they're for.`
    );
  }

  // Failed network requests
  const totalFailed = pages.reduce((s, p) => s + p.networkFailed, 0);
  if (totalFailed > 10) {
    complaints.push(
      `A bunch of things fail to load (${totalFailed} broken requests). Some images, scripts, or data might just not show up for users.`
    );
  } else if (totalFailed > 0) {
    complaints.push(
      `${totalFailed} thing${totalFailed > 1 ? "s" : ""} failed to load. Might be a missing image or a broken API call.`
    );
  }

  // Heavy pages
  const heavyPages = pages.filter((p) => p.transferSize > 5 * 1024 * 1024);
  if (heavyPages.length > 0) {
    const heaviest = Math.max(...heavyPages.map((p) => p.transferSize));
    complaints.push(
      `Some pages are huge — one is ${fmtBytes(heaviest)}. On a slow phone connection, that's going to take ages to load and eat through data.`
    );
  }

  // Visible errors on page
  const visibleErrors = allFriction.filter((f) => f.description.includes("Visible error messages"));
  if (visibleErrors.length > 0) {
    complaints.push(
      `There are actual error messages showing on the page that users can see. That's never a good look.`
    );
  }

  // Layout shift
  const shiftPages = pages.filter((p) => p.cls !== null && p.cls > 0.25);
  if (shiftPages.length > 0) {
    complaints.push(
      `The layout jumps around on ${shiftPages.length} page${shiftPages.length > 1 ? "s" : ""} while it loads. You try to click something and it moves. Really annoying.`
    );
  }

  // Overall verdict
  if (summary.frictionScore >= 7) {
    complaints.push(
      `**Overall:** This site has some serious problems. Regular users will get frustrated, and many will just leave.`
    );
  } else if (summary.frictionScore >= 4) {
    complaints.push(
      `**Overall:** The site works, but it's rough around the edges. Users will notice these issues and some might give up.`
    );
  } else if (complaints.length > 0) {
    complaints.push(
      `**Overall:** The site is mostly fine, but there are a few things that should really be fixed to make it smoother.`
    );
  } else {
    complaints.push(
      `**Overall:** The site is in pretty good shape! No major complaints from a regular user's perspective.`
    );
  }

  return complaints;
}

// ── Main export ──────────────────────────────────────────────────

/** Generate a full standalone HTML report from a session. */
export function generateHtmlSessionReport(session: UserSession): string {
  const { persona, steps, summary } = session;

  // Compute derived data
  const pages = deduplicatePages(steps);
  const allViolations = aggregateA11yViolations(steps);
  const allFriction = steps.flatMap((s) => s.frictionPoints);
  const autoRecs = generateAutoRecommendations(pages, allViolations, allFriction);
  const idiotSummary = generateIdiotSummary(pages, allViolations, allFriction, summary);
  const devRecs = generateDevRecommendations(pages, allViolations, steps, allFriction);

  // Count totals
  const totalConsoleErrors = pages.reduce((s, p) => s + p.consoleErrors, 0);
  const totalNetFailed = pages.reduce((s, p) => s + p.networkFailed, 0);
  const avgA11yPages = pages.filter((p) => p.a11yScore !== null);
  const avgA11y = avgA11yPages.length > 0
    ? avgA11yPages.reduce((s, p) => s + (p.a11yScore ?? 0), 0) / avgA11yPages.length
    : null;

  // ── Sidebar nav items ──────────────────────────────────────────
  const navItems = [
    { id: "summary", label: "Summary" },
    { id: "dashboard", label: "Page Dashboard" },
    { id: "a11y", label: "Accessibility" },
    { id: "network", label: "Network" },
    { id: "friction", label: "Friction Points" },
    { id: "journey", label: "Emotional Journey" },
    { id: "steps", label: "Step Walkthrough" },
    { id: "recs", label: "Recommendations" },
    { id: "dev-recs", label: "Dev Recommendations" },
    { id: "idiot-summary", label: "Plain English Summary" },
  ];

  // ── Build HTML sections ────────────────────────────────────────

  const executiveSummaryHtml = buildExecutiveSummary(summary, pages, avgA11y, totalConsoleErrors, totalNetFailed, allViolations.length);
  const dashboardHtml = buildDashboard(pages);
  const a11yHtml = buildAccessibilitySection(allViolations, avgA11y);
  const networkHtml = buildNetworkSection(steps);
  const frictionHtml = buildFrictionSection(summary.topFrictionPoints);
  const journeyHtml = buildEmotionJourney(summary);
  const stepsHtml = buildSteps(steps);
  const recsHtml = buildRecommendations(autoRecs, summary.recommendations);
  const devRecsHtml = buildDevRecommendations(devRecs);
  const idiotHtml = buildIdiotSummary(idiotSummary);

  const navHtml = navItems
    .map((n) => `<a href="#${n.id}" class="nav-link">${esc(n.label)}</a>`)
    .join("\n        ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UX Report: ${esc(session.startUrl)} - ${esc(persona.name)}</title>
<style>
${CSS}
</style>
</head>
<body>
<nav class="sidebar" id="sidebar">
  <div class="nav-title">Report</div>
  <div class="nav-links">
    ${navHtml}
  </div>
  <button class="nav-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')" aria-label="Toggle navigation">&#9776;</button>
</nav>

<div class="main">
<header>
  <h1>UX Analysis Report</h1>
  <div class="url">${esc(session.startUrl)}</div>
  <div class="meta">${esc(persona.name)} &middot; ${steps.length} steps &middot; ${new Date(session.startedAt).toLocaleDateString()}</div>
</header>

<div class="persona-card">
  <div class="avatar">${esc(persona.name[0])}</div>
  <div class="info">
    <h3>${esc(persona.name)} &mdash; ${esc(persona.description)}</h3>
    <p>Tech: ${persona.traits.techLiteracy} &middot; Patience: ${persona.traits.patience} &middot; Device: ${persona.traits.devicePreference}</p>
    <p>Goals: ${persona.goals.map((g) => esc(g)).join(", ")}</p>
  </div>
</div>

${executiveSummaryHtml}
${dashboardHtml}
${a11yHtml}
${networkHtml}
${frictionHtml}
${journeyHtml}
${stepsHtml}
${recsHtml}
${devRecsHtml}
${idiotHtml}

<div class="footer">
  Generated by UserFlow MCP v0.3.1 &middot; ${new Date().toISOString().split("T")[0]}
</div>
</div>

<script>
// Sidebar highlight on scroll
const sections = document.querySelectorAll('.section[id]');
const navLinks = document.querySelectorAll('.nav-link');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('active'));
      const link = document.querySelector('.nav-link[href="#' + entry.target.id + '"]');
      if (link) link.classList.add('active');
    }
  });
}, { rootMargin: '-20% 0px -70% 0px' });
sections.forEach(s => observer.observe(s));

// Expand/collapse all steps
function toggleAllSteps(expand) {
  document.querySelectorAll('.step').forEach(s => {
    if (expand) s.classList.remove('collapsed');
    else s.classList.add('collapsed');
  });
}
</script>
</body>
</html>`;
}

// ── Section builders ─────────────────────────────────────────────

function buildExecutiveSummary(
  summary: UserSession["summary"],
  pages: readonly PageMetrics[],
  avgA11y: number | null,
  totalErrors: number,
  totalFailed: number,
  violationCount: number
): string {
  const frictionCls = summary.frictionScore <= 3 ? "good" : summary.frictionScore <= 6 ? "warn" : "bad";
  const a11yCls = avgA11y !== null ? scoreClass(avgA11y, 90, 70) : "";
  const errorCls = totalErrors === 0 ? "good" : totalErrors <= 5 ? "warn" : "bad";

  return `
<div class="section" id="summary">
  <h2>Executive Summary</h2>
  <div class="metrics">
    <div class="metric ${frictionCls}">
      <div class="value">${summary.frictionScore}/10</div><div class="label">Friction Score</div>
    </div>
    <div class="metric ${summary.goalAchieved ? "good" : "bad"}">
      <div class="value">${summary.goalAchieved ? "&#10003;" : "&#10007;"}</div><div class="label">Goal Achieved</div>
    </div>
    <div class="metric"><div class="value">${summary.totalSteps}</div><div class="label">Steps</div></div>
    <div class="metric"><div class="value">${(summary.totalTimeMs / 1000).toFixed(1)}s</div><div class="label">Total Time</div></div>
    <div class="metric"><div class="value">${pages.length}</div><div class="label">Pages Visited</div></div>
    ${avgA11y !== null ? `<div class="metric ${a11yCls}"><div class="value">${avgA11y.toFixed(0)}</div><div class="label">Avg A11y Score</div></div>` : ""}
    <div class="metric ${errorCls}"><div class="value">${totalErrors}</div><div class="label">JS Errors</div></div>
    <div class="metric ${totalFailed === 0 ? "good" : "bad"}"><div class="value">${totalFailed}</div><div class="label">Failed Requests</div></div>
    <div class="metric"><div class="value">${violationCount}</div><div class="label">A11y Violations</div></div>
  </div>
</div>`;
}

function buildDashboard(pages: readonly PageMetrics[]): string {
  if (pages.length === 0) return "";

  const rows = pages
    .map((p) => {
      const shortUrl = p.url.replace(/^https?:\/\/[^/]+/, "");
      const lcpCls = ratingClass(p.lcpRating);
      const clsCls = ratingClass(p.clsRating);
      const a11yCls = p.a11yScore !== null ? scoreClass(p.a11yScore, 90, 70) : "";
      return `<tr>
        <td title="${esc(p.url)}">${esc(shortUrl || "/")}</td>
        <td class="${lcpCls}">${fmtMs(p.lcp)}</td>
        <td class="${clsCls}">${p.cls !== null ? p.cls.toFixed(3) : "—"}</td>
        <td class="${a11yCls}">${p.a11yScore !== null ? p.a11yScore : "—"}</td>
        <td>${p.a11yViolations || "—"}</td>
        <td>${p.networkRequests}</td>
        <td class="${p.networkFailed > 0 ? "bad" : ""}">${p.networkFailed || "0"}</td>
        <td>${fmtBytes(p.transferSize)}</td>
        <td class="${p.consoleErrors > 0 ? "bad" : ""}">${p.consoleErrors || "0"}</td>
        <td>${p.frictionCount || "0"}</td>
      </tr>`;
    })
    .join("\n");

  return `
<div class="section" id="dashboard">
  <h2>Site-Wide Page Dashboard</h2>
  <div class="table-scroll">
    <table class="dashboard-table">
      <thead><tr>
        <th>Page</th><th>LCP</th><th>CLS</th><th>A11y</th><th>Violations</th>
        <th>Requests</th><th>Failed</th><th>Size</th><th>JS Errors</th><th>Friction</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

function buildAccessibilitySection(
  violations: readonly AggregatedViolation[],
  avgScore: number | null
): string {
  if (violations.length === 0 && avgScore === null) return "";

  const rows = violations
    .slice(0, 20)
    .map((v) => {
      const impactCls =
        v.impact === "critical" ? "critical" : v.impact === "serious" ? "high" : v.impact === "moderate" ? "medium" : "low";
      return `<tr>
        <td><span class="badge ${impactCls}">${esc(v.impact)}</span></td>
        <td>${esc(v.description)}</td>
        <td><a href="${esc(v.helpUrl)}" target="_blank" rel="noopener">${esc(v.id)}</a></td>
        <td>${v.totalAffected}</td>
        <td>${v.pages.length}</td>
      </tr>`;
    })
    .join("\n");

  return `
<div class="section" id="a11y">
  <h2>Accessibility Violations</h2>
  ${avgScore !== null ? `<p class="section-subtitle">Average score: <strong class="${scoreClass(avgScore, 90, 70)}">${avgScore.toFixed(0)}/100</strong> &middot; ${violations.length} unique violations</p>` : ""}
  ${violations.length > 0 ? `
  <div class="table-scroll">
    <table>
      <thead><tr><th>Impact</th><th>Issue</th><th>Rule</th><th>Elements</th><th>Pages</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${violations.length > 20 ? `<p class="more-note">+${violations.length - 20} more violations not shown</p>` : ""}` : "<p>No accessibility violations found.</p>"}
</div>`;
}

function buildNetworkSection(steps: readonly SessionStep[]): string {
  // Aggregate network data across all steps with network info
  const allNetSteps = steps.filter((s) => s.page.network);
  if (allNetSteps.length === 0) return "";

  // Get the step with the most complete network data (usually first page load or get_page_state)
  const netPages = steps.filter((s) => s.page.network && s.page.network.totalRequests > 0);
  const totalRequests = netPages.reduce((s, p) => s + (p.page.network?.totalRequests ?? 0), 0);
  const totalFailed = netPages.reduce((s, p) => s + (p.page.network?.failedRequests ?? 0), 0);
  const totalTransfer = netPages.reduce((s, p) => s + (p.page.network?.totalTransferSize ?? 0), 0);

  // Collect slowest requests across all pages
  const slowest = netPages
    .flatMap((s) => s.page.network?.slowestRequests ?? [])
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);

  // Resource type breakdown from the first page with data
  const firstNet = netPages[0]?.page.network;
  const resourceBreakdown = firstNet?.byResourceType
    ? Object.entries(firstNet.byResourceType)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([type, count]) => `<span class="perf-item">${esc(type)}: ${count}</span>`)
        .join("")
    : "";

  const slowestHtml = slowest
    .map((r) => {
      const shortUrl = r.url.length > 70 ? r.url.slice(0, 70) + "..." : r.url;
      return `<tr>
        <td>${r.duration.toFixed(0)}ms</td>
        <td class="${r.status >= 400 ? "bad" : ""}">${r.status}</td>
        <td title="${esc(r.url)}">${esc(shortUrl)}</td>
      </tr>`;
    })
    .join("");

  return `
<div class="section" id="network">
  <h2>Network Overview</h2>
  <div class="metrics" style="margin-bottom:16px">
    <div class="metric"><div class="value">${totalRequests}</div><div class="label">Total Requests</div></div>
    <div class="metric ${totalFailed > 0 ? "bad" : "good"}"><div class="value">${totalFailed}</div><div class="label">Failed</div></div>
    <div class="metric"><div class="value">${fmtBytes(totalTransfer)}</div><div class="label">Transferred</div></div>
  </div>
  ${resourceBreakdown ? `<div class="perf-bar" style="margin-bottom:12px">${resourceBreakdown}</div>` : ""}
  ${slowest.length > 0 ? `
  <h3 style="font-size:14px;margin-bottom:8px">Slowest Requests</h3>
  <div class="table-scroll">
    <table>
      <thead><tr><th>Duration</th><th>Status</th><th>URL</th></tr></thead>
      <tbody>${slowestHtml}</tbody>
    </table>
  </div>` : ""}
</div>`;
}

function buildFrictionSection(topFriction: readonly FrictionPoint[]): string {
  if (topFriction.length === 0) return "";

  const rows = topFriction
    .map(
      (f) =>
        `<tr><td><span class="badge ${f.severity}">${esc(f.severity)}</span></td><td>${esc(f.description)}</td><td>${esc(f.suggestion)}</td></tr>`
    )
    .join("");

  return `
<div class="section" id="friction">
  <h2>Top Friction Points</h2>
  <table>
    <thead><tr><th>Severity</th><th>Issue</th><th>Recommendation</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

function buildEmotionJourney(summary: UserSession["summary"]): string {
  const EMOTION_LABELS: Readonly<Record<string, string>> = {
    curious: "Curious — exploring, interested",
    confident: "Confident — knows what to do",
    neutral: "Neutral — no strong feeling",
    confused: "Confused — lost or uncertain",
    frustrated: "Frustrated — something went wrong",
    delighted: "Delighted — pleasantly surprised",
    anxious: "Anxious — worried about outcome",
    bored: "Bored — losing interest",
  };

  const dots = summary.emotionalJourney
    .map(
      (e, i) =>
        `<span class="ej-dot" style="background:${EMOTION_COLORS[e] || "#6b7280"}" title="Step ${i}: ${EMOTION_LABELS[e] ?? e}"></span>`
    )
    .join("");

  // Build legend — only show emotions that actually appear
  const seen = new Set(summary.emotionalJourney);
  const legendItems = [...seen]
    .map(
      (e) =>
        `<span class="ej-legend-item"><span class="ej-legend-dot" style="background:${EMOTION_COLORS[e] || "#6b7280"}"></span>${e}</span>`
    )
    .join("");

  // Summarize the journey in plain English
  const total = summary.emotionalJourney.length;
  const counts: Record<string, number> = {};
  for (const e of summary.emotionalJourney) counts[e] = (counts[e] ?? 0) + 1;
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const dominant = sorted[0]?.[0] ?? "neutral";
  const dominantPct = total > 0 ? Math.round(((sorted[0]?.[1] ?? 0) / total) * 100) : 0;

  const negativeEmotions = ["frustrated", "confused", "anxious", "bored"];
  const positiveEmotions = ["confident", "delighted", "curious"];
  const negCount = summary.emotionalJourney.filter((e) => negativeEmotions.includes(e)).length;
  const posCount = summary.emotionalJourney.filter((e) => positiveEmotions.includes(e)).length;

  let journeySummary: string;
  if (negCount > posCount * 2) {
    journeySummary = `The user had a mostly negative experience — ${negCount} of ${total} steps involved frustration, confusion, or anxiety.`;
  } else if (posCount > negCount * 2) {
    journeySummary = `The user had a mostly positive experience — ${posCount} of ${total} steps felt confident, curious, or delighted.`;
  } else if (negCount > 0 && posCount > 0) {
    journeySummary = `Mixed experience — the user alternated between positive (${posCount} steps) and negative (${negCount} steps) emotions.`;
  } else {
    journeySummary = `The user felt mostly ${dominant} throughout the session (${dominantPct}% of steps).`;
  }

  return `
<div class="section" id="journey">
  <h2>Emotional Journey</h2>
  <p class="section-subtitle">Each dot represents one step in the user's session. The color shows how the user felt at that moment. Hover over a dot to see details.</p>
  <div class="emotion-journey">${dots}</div>
  <div class="ej-legend">${legendItems}</div>
  <div class="ej-summary">${journeySummary}</div>
  <p style="font-size:13px;color:#64748b;margin-top:8px;">Drop-off risk: <strong>${esc(summary.dropOffRisk)}</strong></p>
</div>`;
}

function buildSteps(steps: readonly SessionStep[]): string {
  const stepsHtml = steps
    .map((step, i) => {
      const color = EMOTION_COLORS[step.emotionalState] || "#6b7280";
      const frictionHtml =
        step.frictionPoints.length > 0
          ? `<div class="friction-list">${step.frictionPoints
              .map(
                (f) =>
                  `<div class="friction ${f.severity}"><span class="badge">${f.severity.toUpperCase()}</span> ${esc(f.description)}<div class="suggestion">&rarr; ${esc(f.suggestion)}</div></div>`
              )
              .join("")}</div>`
          : "";

      const perfHtml = step.page.performance ? renderPerformance(step.page.performance) : "";
      const a11yHtml = step.page.accessibility ? renderStepA11y(step.page.accessibility) : "";
      const netHtml = step.page.network ? renderStepNetwork(step.page.network) : "";
      const conHtml = step.page.console && step.page.console.errors > 0 ? renderStepConsole(step.page.console) : "";

      return `
      <div class="step collapsed" id="step-${i}">
        <div class="step-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="step-num">${i}</div>
          <div class="step-info">
            <div class="step-title">${esc(step.page.title || step.page.url)}</div>
            <div class="step-meta">
              <span class="emotion" style="color:${color}">&bull; ${step.emotionalState}</span>
              <span class="action">${step.action.type}${step.action.target ? ` &rarr; <code>${esc(step.action.target)}</code>` : ""}</span>
              ${step.frictionPoints.length > 0 ? `<span class="badge ${step.frictionPoints[0].severity}" style="font-size:9px">${step.frictionPoints.length} issues</span>` : ""}
            </div>
          </div>
          <div class="step-chevron">&#9660;</div>
        </div>
        <div class="step-body">
          ${step.thought ? `<div class="thought">&ldquo;${esc(step.thought)}&rdquo;</div>` : ""}
          ${frictionHtml}
          ${perfHtml}${a11yHtml}${netHtml}${conHtml}
          ${step.page.screenshot ? `<img class="screenshot" src="data:image/png;base64,${step.page.screenshot}" alt="Step ${i} screenshot" loading="lazy" />` : ""}
        </div>
      </div>`;
    })
    .join("\n");

  return `
<div class="section" id="steps">
  <h2>Step-by-Step Walkthrough</h2>
  <div style="margin-bottom:12px;font-size:13px;">
    <button onclick="toggleAllSteps(true)" class="btn-sm">Expand All</button>
    <button onclick="toggleAllSteps(false)" class="btn-sm">Collapse All</button>
  </div>
  ${stepsHtml}
</div>`;
}

function buildRecommendations(autoRecs: readonly string[], manualRecs: readonly string[]): string {
  // Merge and deduplicate — auto-recs first (data-driven), then manual
  const seen = new Set<string>();
  const all: string[] = [];
  for (const r of [...autoRecs, ...manualRecs]) {
    const key = r.slice(0, 60).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      all.push(r);
    }
  }

  if (all.length === 0) return "";

  const items = all.map((r, i) => `<li>${esc(r)}</li>`).join("\n");

  return `
<div class="section" id="recs">
  <h2>Recommendations</h2>
  <ol class="recs-list">${items}</ol>
</div>`;
}

function buildIdiotSummary(complaints: readonly string[]): string {
  if (complaints.length === 0) return "";

  const items = complaints
    .map((c) => {
      // Handle **bold** markers in the complaint text
      const formatted = c.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return `<div class="idiot-item">${formatted}</div>`;
    })
    .join("\n");

  return `
<div class="section idiot-section" id="idiot-summary">
  <h2>The "Idiot Summary"</h2>
  <p class="idiot-subtitle">Here's what a regular person would say about this website, in plain English:</p>
  ${items}
</div>`;
}

function buildDevRecommendations(recs: readonly DevRecommendation[]): string {
  if (recs.length === 0) return "";

  const priorityColors: Record<string, string> = { P0: "#dc2626", P1: "#f59e0b", P2: "#3b82f6" };
  const categoryIcons: Record<string, string> = {
    Performance: "&#9889;",
    Accessibility: "&#9855;",
    Network: "&#127760;",
    Security: "&#128274;",
    JavaScript: "&#128187;",
    UX: "&#128100;",
    SEO: "&#128269;",
  };

  const items = recs
    .map((r, i) => {
      const pagesHtml =
        r.pages.length > 0
          ? `<div class="dev-pages">Affected: ${r.pages
              .map((u) => {
                const short = u.replace(/^https?:\/\/[^/]+/, "");
                return `<code>${esc(short || "/")}</code>`;
              })
              .join(", ")}</div>`
          : "";

      const codeHtml = r.code
        ? `<details class="dev-code-block"><summary>Show code example</summary><pre><code>${esc(r.code)}</code></pre></details>`
        : "";

      // Handle newlines in problem text
      const problemHtml = esc(r.problem).replace(/\n/g, "<br>");

      return `
      <div class="dev-rec">
        <div class="dev-rec-header">
          <span class="dev-priority" style="background:${priorityColors[r.priority] ?? "#6b7280"}">${r.priority}</span>
          <span class="dev-category">${categoryIcons[r.category] ?? ""} ${esc(r.category)}</span>
          <span class="dev-title">${esc(r.title)}</span>
        </div>
        <div class="dev-rec-body">
          <div class="dev-problem"><strong>Problem:</strong> ${problemHtml}</div>
          ${pagesHtml}
          <div class="dev-fix"><strong>Fix:</strong> ${esc(r.fix)}</div>
          ${codeHtml}
        </div>
      </div>`;
    })
    .join("\n");

  const p0Count = recs.filter((r) => r.priority === "P0").length;
  const p1Count = recs.filter((r) => r.priority === "P1").length;
  const p2Count = recs.filter((r) => r.priority === "P2").length;

  return `
<div class="section dev-section" id="dev-recs">
  <h2>Developer Recommendations</h2>
  <p class="section-subtitle">Actionable fixes with code examples, sorted by priority.
    <span class="dev-priority" style="background:#dc2626">${p0Count} P0</span>
    <span class="dev-priority" style="background:#f59e0b">${p1Count} P1</span>
    <span class="dev-priority" style="background:#3b82f6">${p2Count} P2</span>
  </p>
  ${items}
</div>`;
}

// ── Step-level inline renderers ──────────────────────────────────

function renderPerformance(perf: PerformanceMetrics): string {
  const items: string[] = [];
  if (perf.lcp !== null)
    items.push(`<span class="perf-item ${ratingClass(perf.lcpRating)}">LCP: ${fmtMs(perf.lcp)}</span>`);
  if (perf.cls !== null)
    items.push(`<span class="perf-item ${ratingClass(perf.clsRating)}">CLS: ${perf.cls.toFixed(3)}</span>`);
  if (perf.fcp !== null) items.push(`<span class="perf-item">FCP: ${fmtMs(perf.fcp)}</span>`);
  if (perf.ttfb !== null) items.push(`<span class="perf-item">TTFB: ${fmtMs(perf.ttfb)}</span>`);
  if (items.length === 0) return "";
  return `<div class="perf-bar">${items.join("")}</div>`;
}

function renderStepA11y(a11y: AccessibilityReport): string {
  if (a11y.violations.length === 0) return "";
  const bg = a11y.score >= 90 ? "#dcfce7" : a11y.score >= 70 ? "#fef3c7" : "#fee2e2";
  return `<div class="a11y-summary" style="background:${bg}">
    &#9855; A11y: ${a11y.score}/100 &middot; ${a11y.violations.length} violations (${a11y.violationsByImpact.critical} critical, ${a11y.violationsByImpact.serious} serious)
  </div>`;
}

function renderStepNetwork(net: NetworkSummary): string {
  if (net.totalRequests === 0) return "";
  const failStr =
    net.failedRequests > 0
      ? ` &middot; <strong style="color:#ef4444">${net.failedRequests} failed</strong>`
      : "";
  return `<div class="net-summary">&#127760; ${net.totalRequests} requests &middot; ${fmtBytes(net.totalTransferSize)}${failStr}</div>`;
}

function renderStepConsole(con: ConsoleSummary): string {
  return `<div class="console-summary" style="background:#fef2f2">&#9888;&#65039; ${con.errors} JS errors, ${con.warnings} warnings</div>`;
}

// ── CSS ──────────────────────────────────────────────────────────

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }

  /* Sidebar */
  .sidebar { position: fixed; top: 0; left: 0; width: 200px; height: 100vh; background: #1e293b; color: white; padding: 20px 12px; overflow-y: auto; z-index: 100; transition: transform 0.3s; }
  .nav-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 16px; }
  .nav-link { display: block; padding: 6px 10px; font-size: 13px; color: #cbd5e1; text-decoration: none; border-radius: 4px; margin-bottom: 2px; transition: background 0.15s; }
  .nav-link:hover, .nav-link.active { background: #334155; color: white; }
  .nav-toggle { display: none; position: fixed; top: 12px; left: 12px; background: #1e293b; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 18px; cursor: pointer; z-index: 200; }

  @media (max-width: 900px) {
    .sidebar { transform: translateX(-100%); }
    .sidebar.open { transform: translateX(0); }
    .nav-toggle { display: block; }
    .main { margin-left: 0 !important; }
  }

  .main { margin-left: 200px; max-width: 1000px; padding: 24px 32px; }

  /* Header */
  header { background: linear-gradient(135deg, #1e293b, #334155); color: white; padding: 32px 24px; border-radius: 12px; margin-bottom: 24px; }
  header h1 { font-size: 22px; margin-bottom: 4px; }
  header .url { opacity: 0.7; font-size: 14px; word-break: break-all; }
  header .meta { opacity: 0.5; font-size: 12px; margin-top: 6px; }

  /* Persona */
  .persona-card { display: flex; gap: 16px; background: white; border-radius: 8px; padding: 16px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .persona-card .avatar { width: 48px; height: 48px; border-radius: 50%; background: #3b82f6; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; flex-shrink: 0; }
  .persona-card .info h3 { font-size: 16px; }
  .persona-card .info p { font-size: 13px; color: #64748b; }

  /* Metrics grid */
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .metric { background: white; border-radius: 8px; padding: 14px 10px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .metric .value { font-size: 24px; font-weight: 700; }
  .metric .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .metric.good .value { color: #22c55e; }
  .metric.warn .value { color: #f59e0b; }
  .metric.bad .value { color: #ef4444; }

  /* Sections */
  .section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .section h2 { font-size: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
  .section-subtitle { font-size: 14px; color: #475569; margin-bottom: 12px; }
  .more-note { font-size: 12px; color: #94a3b8; margin-top: 8px; }

  /* Tables */
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; white-space: nowrap; }
  td.good { color: #22c55e; font-weight: 600; }
  td.warn { color: #f59e0b; font-weight: 600; }
  td.bad { color: #ef4444; font-weight: 600; }
  .dashboard-table td { font-size: 12px; white-space: nowrap; }
  .dashboard-table td:first-child { white-space: normal; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }

  /* Emotion journey */
  .emotion-journey { display: flex; gap: 4px; align-items: center; padding: 8px 0; flex-wrap: wrap; }
  .ej-dot { width: 22px; height: 22px; border-radius: 50%; display: inline-block; cursor: pointer; transition: transform 0.15s; }
  .ej-dot:hover { transform: scale(1.3); }

  /* Emotion legend & summary */
  .ej-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; padding: 10px 0; }
  .ej-legend-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #475569; text-transform: capitalize; }
  .ej-legend-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .ej-summary { font-size: 14px; color: #334155; margin-top: 8px; padding: 10px 14px; background: #f1f5f9; border-radius: 6px; line-height: 1.5; }

  /* Steps */
  .step { background: #fafbfc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; overflow: hidden; }
  .step.collapsed .step-body { display: none; }
  .step.collapsed .step-chevron { transform: rotate(-90deg); }
  .step-header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; user-select: none; }
  .step-header:hover { background: #f1f5f9; }
  .step-num { width: 26px; height: 26px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
  .step-info { flex: 1; min-width: 0; }
  .step-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .step-meta { font-size: 11px; color: #64748b; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .step-chevron { font-size: 10px; color: #94a3b8; transition: transform 0.15s; flex-shrink: 0; }
  .step-body { padding: 0 14px 14px; }
  .thought { font-style: italic; color: #475569; margin: 8px 0; padding: 8px 12px; border-left: 3px solid #3b82f6; background: #eff6ff; border-radius: 0 4px 4px 0; font-size: 13px; }

  /* Screenshots — compressed */
  .screenshot { width: 100%; max-height: 400px; object-fit: contain; border-radius: 6px; margin-top: 10px; border: 1px solid #e2e8f0; background: #f1f5f9; }

  /* Friction */
  .friction-list { margin: 6px 0; }
  .friction { padding: 8px 12px; margin: 4px 0; border-radius: 4px; font-size: 13px; }
  .friction.low { background: #f0fdf4; border-left: 3px solid #22c55e; }
  .friction.medium { background: #fffbeb; border-left: 3px solid #f59e0b; }
  .friction.high { background: #fef2f2; border-left: 3px solid #ef4444; }
  .friction.critical { background: #fef2f2; border-left: 3px solid #991b1b; }
  .suggestion { font-size: 12px; color: #64748b; margin-top: 3px; }

  /* Badges */
  .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; color: white; }
  .badge.low { background: #22c55e; }
  .badge.medium { background: #f59e0b; }
  .badge.high { background: #ef4444; }
  .badge.critical { background: #991b1b; }

  /* Performance bar */
  .perf-bar { display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0; }
  .perf-item { font-size: 12px; padding: 3px 8px; border-radius: 4px; background: #f1f5f9; }
  .perf-item.good { background: #dcfce7; color: #166534; }
  .perf-item.warn, .perf-item.needs-improvement { background: #fef3c7; color: #92400e; }
  .perf-item.bad, .perf-item.poor { background: #fee2e2; color: #991b1b; }

  /* Inline summaries */
  .a11y-summary { font-size: 12px; padding: 6px 10px; border-radius: 4px; margin: 6px 0; }
  .net-summary, .console-summary { font-size: 12px; padding: 6px 10px; background: #f1f5f9; border-radius: 4px; margin: 6px 0; }

  /* Recommendations */
  .recs-list { padding-left: 20px; font-size: 14px; }
  .recs-list li { margin-bottom: 8px; line-height: 1.5; }

  /* Buttons */
  .btn-sm { background: #e2e8f0; border: none; padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; margin-right: 6px; }
  .btn-sm:hover { background: #cbd5e1; }

  /* Idiot Summary */
  .idiot-section { background: linear-gradient(135deg, #fef3c7, #fff7ed); border: 2px solid #f59e0b; }
  .idiot-section h2 { color: #92400e; border-bottom-color: #fbbf24; }
  .idiot-subtitle { font-size: 14px; color: #78716c; margin-bottom: 16px; font-style: italic; }
  .idiot-item { font-size: 15px; line-height: 1.7; padding: 10px 14px; margin-bottom: 8px; background: rgba(255,255,255,0.6); border-radius: 6px; border-left: 3px solid #f59e0b; }
  .idiot-item strong { color: #92400e; }

  /* Dev Recommendations */
  .dev-section { background: linear-gradient(135deg, #eff6ff, #f0f9ff); border: 2px solid #3b82f6; }
  .dev-section h2 { color: #1e40af; border-bottom-color: #93c5fd; }
  .dev-rec { background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
  .dev-rec-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
  .dev-priority { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 3px; color: white; }
  .dev-category { font-size: 12px; color: #64748b; font-weight: 600; }
  .dev-title { font-size: 14px; font-weight: 600; color: #1e293b; }
  .dev-rec-body { padding: 14px 16px; }
  .dev-problem { font-size: 13px; color: #475569; margin-bottom: 10px; line-height: 1.6; }
  .dev-pages { font-size: 12px; color: #64748b; margin-bottom: 10px; }
  .dev-pages code { font-size: 11px; background: #e2e8f0; padding: 1px 5px; border-radius: 3px; }
  .dev-fix { font-size: 13px; color: #1e293b; margin-bottom: 10px; line-height: 1.5; }
  .dev-code-block { margin-top: 8px; }
  .dev-code-block summary { font-size: 12px; color: #3b82f6; cursor: pointer; font-weight: 600; padding: 4px 0; }
  .dev-code-block summary:hover { color: #1d4ed8; }
  .dev-code-block pre { background: #1e293b; color: #e2e8f0; padding: 14px 16px; border-radius: 6px; overflow-x: auto; margin-top: 6px; font-size: 12px; line-height: 1.5; }
  .dev-code-block pre code { background: none; color: inherit; padding: 0; font-size: 12px; }

  /* Footer */
  .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; }

  code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  a { color: #3b82f6; }

  /* Print */
  @media print {
    .sidebar, .nav-toggle { display: none !important; }
    .main { margin-left: 0 !important; max-width: 100% !important; }
    .step-body { display: block !important; }
    .step.collapsed .step-body { display: block !important; }
    .screenshot { max-height: 250px; break-inside: avoid; }
    .section { break-inside: avoid; }
    .btn-sm { display: none; }
  }
`;
