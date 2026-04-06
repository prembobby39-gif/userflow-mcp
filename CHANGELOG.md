# Changelog

## v0.3.1 (2026-04-06)

### HTML Report Overhaul + Auto-Friction Detection

- **Auto-friction detection** — automatically detects friction points from page metrics (performance thresholds, a11y violations, console errors, network failures, layout issues, visible errors). Runs on every step and initial page load. No more near-zero friction scores.

- **Executive summary** — key metrics at a glance: friction score, goal status, steps, time, pages visited, avg accessibility score, JS errors, failed requests.

- **Site-wide page dashboard** — comparison table showing all pages side-by-side with LCP, CLS, a11y score, violations, requests, failed, transfer size, JS errors, and friction count.

- **Aggregated accessibility section** — all violations across the entire session, sorted by impact, with links to axe-core help docs and affected element counts.

- **Network overview** — total requests, failures, transfer size, resource type breakdown, and slowest requests table.

- **Auto-generated recommendations** — data-driven suggestions based on actual metrics instead of generic advice.

- **"Idiot Summary"** — plain-English section at the bottom explaining what's wrong with the website the way a regular user would say it.

- **Sidebar navigation** — fixed left sidebar with jump links to each section, highlights on scroll.

- **Collapsed steps by default** — steps start collapsed with expand/collapse all buttons, reducing initial visual noise.

- **Screenshot compression** — CSS max-height + object-fit for embedded screenshots, reducing visual bloat.

- **Print/PDF optimization** — all steps expand, sidebar hides, sections avoid page breaks.

---

## v0.3.0 (2026-04-06)

### Major Upgrade — 12 New Capabilities

- **Smart selector engine** — 8-strategy fallback chain (data-testid > id > aria-label > role-text > input-attr > link-href > text > CSS path). Actions automatically retry with alternative selectors when the primary fails.

- **Console capture** — monitors JS errors, warnings, and uncaught exceptions via `page.on('console')` and `page.on('pageerror')`. Deduplicates repeated errors in reports.

- **Network monitoring** — tracks all requests/responses with status codes, timing, and transfer sizes. Identifies failed and slow requests. Exports to HAR 1.2 format.

- **Accessibility auditing** — runs axe-core WCAG audit (supports 2.0 A, AA, AAA). Returns 0-100 score, violations with impact severity, WCAG criteria references, and help links.

- **Core Web Vitals** — collects LCP, CLS, INP, FCP, TTFB via PerformanceObserver injection before navigation. Includes Google's published rating thresholds (good/needs-improvement/poor).

- **Device emulation** — 10 built-in profiles (iPhone 14 Pro, iPhone SE, Pixel 7, Galaxy S23, Galaxy Fold, iPad Pro, iPad Mini, MacBook Pro 14", Desktop 1080p, Desktop 1440p) with accurate viewports, user agents, and scale factors.

- **Storage inspection** — reads cookies, localStorage, sessionStorage. Detects tracking cookies by domain mismatch and known prefixes (_ga, _fbp, __utm, etc.).

- **Screenshot diffing** — pixel-level visual comparison using pixelmatch. Handles different-sized images by padding to bounding box. Returns match percentage and diff overlay image.

- **Rich HTML reports** — standalone HTML files with embedded base64 screenshots, emotion journey visualization, performance bars, accessibility summaries, collapsible step walkthrough.

- **Custom persona creation** — build personas with any trait combination via the `create_persona` tool.

- **HTML report format** — `end_session` now accepts `format: "html"` for rich standalone reports.

- **Lightweight step mode** — steps collect performance and network data but skip heavy audits (accessibility, storage) for speed. Full audits run on initial page load and `get_page_state`.

### New Tools (6)

- `accessibility_audit` — WCAG audit with violations, criteria, and fix links
- `inspect_storage` — cookies, localStorage, sessionStorage, tracking detection
- `export_har` — HAR 1.2 network export
- `compare_screenshots` — visual diff with overlay image
- `create_persona` — custom persona builder
- `list_devices` — browse device emulation profiles

### Enhanced Tools (3)

- `start_session` — new `device_profile` parameter for mobile/tablet emulation
- `step` — smart selector fallback when primary CSS selector fails
- `end_session` — new `format` parameter for markdown or HTML reports

### Tool Count: 14 (was 8)

---

## v0.2.1 (2026-04-05)

### CDP Connection Support

- Connect to existing Chrome instances via `CHROME_CDP_URL` or `CHROME_WS_ENDPOINT` environment variables
- Enables testing logged-in sites without re-authenticating
- Browser disconnects gracefully instead of closing when using remote connection

---

## v0.2.0 (2026-04-05)

### Thin MCP Architecture

- **New step-by-step tools**: `start_session`, `step`, `end_session`, `get_page_state` — Claude drives the simulation with full control over each action
- **Auto tools retained**: `auto_walk`, `compare_personas_auto` — heuristic walker for fast scans
- **Quick tools**: `quick_scan`, `list_personas`
- 8 built-in personas with full trait system (tech literacy, patience, age group, device preference, accessibility needs)

---

## v0.1.0 (2026-04-05)

### Initial Release

- 11 MCP tools for persona-based UX feedback
- 8 built-in personas (Alex, Morgan, Patricia, Jordan, Sam, Riley, Casey, Taylor)
- Analysis engine: friction detection, cognitive load, clarity evaluation, emotional arc
- Autonomous flow walker with heuristic-based action planning
- Report generation: markdown, HTML, multi-persona comparison
- Cross-platform Chrome detection, Puppeteer browser management
