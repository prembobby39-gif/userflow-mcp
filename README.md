# UserFlow MCP

**Simulates real users navigating your app and delivers qualitative UX feedback.** Built as an MCP server for Claude Code.

UserFlow puts itself in your user's shoes. It clicks through your app as different personas (a first-time user, a busy executive, a senior citizen, an accessibility-dependent user) and tells you where they'd get confused, frustrated, or give up. Now with auto-friction detection, Core Web Vitals, WCAG accessibility auditing, network monitoring, device emulation, and rich HTML reports with dev recommendations.

> **Free for Claude Pro users.** No API keys, no external services. Just install and go.

## Quick Start

```bash
# Install globally
npm install -g userflow-mcp

# Or use directly with npx
npx -y userflow-mcp
```

### Add to Claude Code

In your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "userflow": {
      "command": "npx",
      "args": ["-y", "userflow-mcp"]
    }
  }
}
```

Then in Claude Code:

```
→ "Start a user flow session on https://myapp.com as Alex"
→ "Quick scan https://myapp.com"
→ "Run an accessibility audit on this page"
→ "Compare Alex and Morgan on https://myapp.com"
```

## What You Get

### Persona-Driven UX Feedback

```
Step 1: Landing Page (3.2s)
  🔍 curious
  > "Hmm, 'Supercharge your workflow' — but what does this product actually do?"
  ⚠️ MEDIUM: Value prop unclear — heading doesn't explain the product
     → Rewrite heading to describe what the product does, not how it makes you feel

Step 2: Signup (12.1s)
  😐 neutral
  > "Alright, let me sign up and see..."
  🛑 HIGH: Form asks for company size during signup — feels invasive
     → Remove non-essential fields from signup, ask later during onboarding
```

### Auto-Friction Detection

Friction is automatically detected from page metrics on every step — no manual annotation needed:

- **Performance**: LCP > 2.5s, CLS > 0.1, FCP > 3s
- **Accessibility**: Critical/serious axe-core violations, score < 50
- **Console**: JS errors, uncaught exceptions
- **Network**: Failed requests, pages > 5MB transfer
- **Content**: Missing headings, 50+ interactive elements (cognitive overload), visible error messages

### Core Web Vitals & Performance

```
| Metric | Value   | Rating |
|--------|---------|--------|
| LCP    | 1840ms  | 🟢 good |
| CLS    | 0.042   | 🟢 good |
| FCP    | 920ms   | — |
| TTFB   | 180ms   | — |
| Resources | 47 files (1,280KB) | — |
```

### Accessibility (axe-core WCAG Audit)

```
Score: 82/100 | Violations: 5 (0 critical, 2 serious, 2 moderate, 1 minor)
| serious | [color-contrast] Insufficient contrast ratio | 12 nodes |
| serious | [image-alt] Missing alt text on images | 3 nodes |
```

### Rich HTML Reports

The `end_session` tool generates standalone HTML reports with:

- **Executive summary** — key metrics at a glance (friction score, goal status, steps, time, pages, a11y score, JS errors, failed requests)
- **Site-wide page dashboard** — comparison table of all pages with LCP, CLS, a11y, requests, errors
- **Emotional journey** — color-coded chart with legend, tooltips, and plain English summary
- **Step-by-step walkthrough** — collapsible steps with embedded screenshots
- **Aggregated accessibility** — all WCAG violations across the session, sorted by impact, with axe-core help links
- **Network overview** — total requests, failures, transfer size, resource breakdown, slowest requests
- **Dev recommendations** — P0/P1/P2 prioritized fixes with code examples (LCP, CLS, contrast, labels, errors, cookies, headings)
- **"Idiot summary"** — plain English section explaining what's wrong the way a regular user would say it
- **Print/PDF optimized** — all steps expand, sidebar hides, sections avoid page breaks

## 14 Tools

### Step-by-Step Session Tools (Claude drives the simulation)

| Tool | Description |
|------|-------------|
| **start_session** | Open browser, navigate to URL, return page snapshot with screenshot + Web Vitals + a11y score. Supports device emulation. |
| **step** | Execute an action (click, type, scroll, etc.) with smart selector fallback. Record persona thoughts and friction. |
| **end_session** | Close session, compute friction score and emotional arc, return full report (markdown or HTML). |
| **get_page_state** | Get current page state and screenshot without performing any action. |

### v0.3 Session Tools (new capabilities)

| Tool | Description |
|------|-------------|
| **accessibility_audit** | Run WCAG 2.0 A/AA/AAA audit using axe-core. Returns score, violations, and fix links. |
| **inspect_storage** | Inspect cookies, localStorage, sessionStorage. Detects tracking cookies. |
| **export_har** | Export all network activity as HAR 1.2 log for analysis. |
| **compare_screenshots** | Pixel-level visual diff between two screenshots with overlay image. |
| **create_persona** | Build a custom persona with any trait combination. |

### Quick Tools (stateless)

| Tool | Description |
|------|-------------|
| **quick_scan** | Fast single-page scan with screenshot and element extraction. |
| **list_personas** | Browse all 8 built-in personas with full trait definitions. |
| **list_devices** | Browse all 10 device emulation profiles. |

### Auto Tools (heuristic walker)

| Tool | Description |
|------|-------------|
| **auto_walk** | Fast automated walk with heuristic navigation — no AI reasoning. |
| **compare_personas_auto** | Run 2-5 personas on the same URL and compare experiences. |

## 8 Built-in Personas

| Name | Description | Tech | Patience | Device |
|------|-------------|------|----------|--------|
| **Alex** | The First-Timer — never used SaaS before | Novice | Moderate | Mobile |
| **Morgan** | The Power User — developer, expects excellence | Expert | Low | Desktop |
| **Patricia** | The Senior Explorer — 68, low vision | Basic | High | Desktop |
| **Jordan** | The Busy Executive — 10 seconds to impress | Intermediate | Very Low | Mobile |
| **Sam** | The Accessibility Tester — screen reader user | Advanced | Moderate | Desktop |
| **Riley** | The Skeptical Evaluator — looking for red flags | Intermediate | Moderate | Desktop |
| **Casey** | The International User — potential language barriers | Basic | High | Mobile |
| **Taylor** | The Return Visitor — knows the app, wants efficiency | Advanced | Moderate | Desktop |

## 10 Device Profiles

| Key | Device | Viewport | Scale |
|-----|--------|----------|-------|
| iphone-14-pro | iPhone 14 Pro | 393×852 | 3x |
| iphone-se | iPhone SE | 375×667 | 2x |
| pixel-7 | Pixel 7 | 412×915 | 2.625x |
| samsung-galaxy-s23 | Galaxy S23 | 393×851 | 3x |
| galaxy-fold | Galaxy Fold | 280×653 | 3x |
| ipad-pro-12-9 | iPad Pro 12.9" | 1024×1366 | 2x |
| ipad-mini | iPad Mini | 768×1024 | 2x |
| macbook-pro-14 | MacBook Pro 14" | 1512×982 | 2x |
| desktop-1080p | Desktop 1080p | 1920×1080 | 1x |
| desktop-1440p | Desktop 1440p | 2560×1440 | 1x |

## How It Works

1. **Puppeteer** opens your URL in a real browser
2. **Monitors attach before navigation** — network requests, console messages, and performance observers start capturing immediately
3. The **persona engine** creates a user with specific traits (tech literacy, patience, goals, device)
4. Claude drives the simulation step-by-step using the **step** tool, with **smart selector fallback** (8 strategies: data-testid → id → aria-label → role-text → input-attr → link-href → text → CSS path)
5. At each step, the system collects:
   - **Page snapshot** — interactive elements, headings, forms, errors, screenshot
   - **Core Web Vitals** — LCP, CLS, INP, FCP, TTFB via PerformanceObserver
   - **Network summary** — request count, failures, transfer size, slow requests
   - **Console errors** — JS errors, warnings, uncaught exceptions
   - **Accessibility** — axe-core WCAG audit with violation details (on initial load)
   - **Storage** — cookies, localStorage, sessionStorage, tracking detection (on initial load)
6. The **feedback generator** compiles everything into a structured report with emotional journey, friction scores, Web Vitals, and recommendations

## Architecture

```
src/
├── server.ts                  # MCP tool registrations (14 tools)
├── types.ts                   # Full type system (450+ lines)
├── personas/
│   ├── presets.ts             # 8 built-in personas
│   └── engine.ts              # Persona creation + resolution
├── session/
│   ├── types.ts               # LiveSession with monitors
│   └── session-manager.ts     # Session lifecycle + new audit methods
├── walker/
│   ├── flow-walker.ts         # Autonomous page traversal
│   ├── action-planner.ts      # Heuristic action decisions
│   └── session-recorder.ts    # Journey tracking
├── analysis/
│   ├── friction.ts            # Friction detection + scoring
│   ├── cognitive-load.ts      # Page complexity assessment
│   ├── clarity.ts             # CTA + value prop evaluation
│   └── emotional-arc.ts       # Sentiment tracking
├── feedback/
│   ├── generator.ts           # Markdown report (with Web Vitals, a11y, network)
│   ├── html-report.ts         # Rich standalone HTML report
│   ├── comparison.ts          # Multi-persona comparison
│   └── report.ts              # Legacy report utilities
└── utils/
    ├── browser.ts             # Puppeteer + CDP connection support
    ├── page-snapshot.ts       # Full page state extraction + v0.3 enrichment
    ├── actions.ts             # Action execution with smart selector fallback
    ├── selector-engine.ts     # 8-strategy smart selector generation
    ├── auto-friction.ts       # Auto-detect friction from page metrics
    ├── network-monitor.ts     # Request/response tracking + HAR export
    ├── console-monitor.ts     # Console message + page error capture
    ├── performance.ts         # Core Web Vitals via PerformanceObserver
    ├── accessibility.ts       # axe-core WCAG audit
    ├── device-profiles.ts     # 10 device emulation presets
    ├── storage-inspector.ts   # Cookie/localStorage inspection
    └── screenshot-diff.ts     # Pixel-level visual comparison
```

## Requirements

- **Node.js** >= 18.0.0
- **Google Chrome** or Chromium installed
- **Claude Code** with MCP support

## Development

```bash
git clone https://github.com/prembobby39-gif/userflow-mcp.git
cd userflow-mcp
npm install
npm run build
npm test          # 42 tests
```

## Changelog

### v0.3.1

- **Auto-friction detection** — automatically detects friction from page metrics (performance thresholds, a11y violations, console errors, network failures, layout issues, visible errors). Runs on every step and initial page load.
- **Executive summary** — key metrics at a glance in HTML reports
- **Site-wide page dashboard** — comparison table showing all pages side-by-side with LCP, CLS, a11y, violations, requests, errors
- **Aggregated accessibility section** — all violations across the session, sorted by impact, with axe-core help links
- **Network overview** — total requests, failures, transfer size, resource breakdown, slowest requests
- **Dev recommendations** — P0/P1/P2 prioritized actionable fixes with code examples
- **"Idiot summary"** — plain English section explaining what's wrong the way a regular user would say it
- **Emotional journey improvements** — color legend, descriptive tooltips, plain English summary
- **Sidebar navigation** — fixed left sidebar with jump links, highlights on scroll
- **Collapsed steps** — steps start collapsed with expand/collapse all buttons
- **Screenshot compression** — CSS max-height + object-fit for embedded screenshots
- **Print/PDF optimization** — all steps expand, sidebar hides, sections avoid page breaks

### v0.3.0

- Smart selector engine with 8-strategy fallback chain
- Console capture (JS errors, warnings, uncaught exceptions)
- Network monitoring with HAR 1.2 export
- Accessibility auditing via axe-core (WCAG 2.0 A/AA/AAA)
- Core Web Vitals (LCP, CLS, INP, FCP, TTFB)
- Device emulation (10 profiles: iPhone, Pixel, iPad, Galaxy Fold, desktops)
- Cookie/localStorage/sessionStorage inspection with tracking detection
- Screenshot visual diffing via pixelmatch
- Rich standalone HTML reports with embedded screenshots
- Custom persona creation tool
- 6 new tools, 3 enhanced tools (14 total)

### v0.2.1

- CDP connection support for testing logged-in sites (CHROME_CDP_URL, CHROME_WS_ENDPOINT)

### v0.2.0

- Thin MCP architecture — Claude drives step-by-step simulation
- 8 built-in personas with full trait system

### v0.1.0

- Initial release with autonomous heuristic walker

## License

MIT — ARISTONE
