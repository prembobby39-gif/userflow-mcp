# UserFlow MCP

**Simulates real users navigating your app and delivers qualitative UX feedback.** Built as an MCP server for Claude Code.

UserFlow doesn't run Lighthouse scores or check WCAG compliance — it puts itself in your user's shoes. It clicks through your app as different personas (a first-time user, a busy executive, a senior citizen, an accessibility-dependent user) and tells you where they'd get confused, frustrated, or give up.

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
→ simulate_user url:"https://myapp.com" persona:"Alex"
→ quick_impression url:"https://myapp.com"
→ compare_personas url:"https://myapp.com" personas:["Alex", "Morgan", "Patricia"]
```

## What You Get

Instead of scores and violations, you get feedback like this:

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

Step 3: Dashboard (8.4s)
  😤 frustrated
  > "Okay I'm in... now what? There's nothing here."
  🚨 CRITICAL: Empty state with no guidance
     → Add a getting-started checklist or demo project
```

## 11 Tools

| Tool | Description |
|------|-------------|
| **simulate_user** | Full persona simulation — walks the entire flow, records every step |
| **quick_impression** | 30-second first impression — would this user stay or bounce? |
| **test_onboarding** | Test signup/onboarding as a first-time user |
| **test_checkout** | Test purchase/conversion flow |
| **compare_personas** | Run 2-5 personas on the same flow, compare experiences |
| **find_dead_ends** | Discover pages with no exit, empty states, broken flows |
| **rate_clarity** | Evaluate value prop, CTAs, cognitive load — with scores |
| **session_transcript** | Detailed step-by-step journey log with thoughts |
| **custom_persona** | Define your own persona with specific traits and goals |
| **export_report** | Generate standalone HTML report |
| **list_personas** | See all built-in personas with descriptions |

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

## How It Works

1. **Puppeteer** opens your URL in a real browser
2. The **persona engine** creates a user with specific traits (tech literacy, patience, goals, device)
3. The **flow walker** autonomously navigates — clicking buttons, filling forms, scrolling — based on what the persona would actually do
4. At each step, the **analysis engine** checks for:
   - **Friction points** — confusing CTAs, too many form fields, empty states, slow loads
   - **Cognitive load** — how overwhelming the page is
   - **Clarity** — is the value prop clear? Can the user find the CTA?
   - **Emotional state** — curious → confident → confused → frustrated
5. The **feedback generator** compiles everything into a structured report

No LLM calls during simulation — all analysis uses deterministic heuristics. This means it's **fast**, **free**, and **consistent**.

## Custom Personas

```
→ custom_persona url:"https://myapp.com"
    name:"Startup Founder"
    description:"Technical founder evaluating tools for their team"
    goals:["understand pricing", "evaluate team features", "check integrations"]
    tech_literacy:"advanced"
    patience:"low"
    device:"desktop"
```

## Multi-Persona Comparison

The `compare_personas` tool reveals how different users experience the same flow:

```
→ compare_personas url:"https://myapp.com" personas:["Alex", "Jordan", "Patricia"]
```

Output includes:
- **Shared friction** — issues ALL users hit (fix these first)
- **Divergence points** — moments where different users interpret the UI differently
- **Per-persona summaries** — friction scores, emotional trends, goal achievement

## Architecture

```
src/
├── server.ts              # MCP tool registrations (11 tools)
├── personas/
│   ├── presets.ts         # 8 built-in personas
│   └── engine.ts          # Persona creation + utilities
├── walker/
│   ├── flow-walker.ts     # Autonomous page traversal
│   ├─�� action-planner.ts  # Decides what a persona would do
│   └── session-recorder.ts # Journey tracking
├── analysis/
│   ├── friction.ts        # Friction detection + scoring
│   ├── cognitive-load.ts  # Page complexity assessment
│   ��── clarity.ts         # CTA + value prop evaluation
│   └── emotional-arc.ts   # Sentiment tracking
├── feedback/
│   ├── generator.ts       # Markdown report generation
│   ├── comparison.ts      # Multi-persona comparison
│   └── report.ts          # HTML report generation
└── utils/
    └── browser.ts         # Puppeteer browser management
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
npm test
```

## License

MIT — ARISTONE
