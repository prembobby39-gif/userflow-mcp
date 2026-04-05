# Changelog

## v0.1.0 (2026-04-05)

### Initial Release

- **11 MCP tools** for persona-based UX feedback
  - `simulate_user` — full flow simulation with any persona
  - `quick_impression` — 30-second first impression assessment
  - `test_onboarding` — onboarding-specific testing
  - `test_checkout` — checkout/conversion flow testing
  - `compare_personas` — multi-persona comparison matrix
  - `find_dead_ends` — dead end and empty state discovery
  - `rate_clarity` — value prop and CTA clarity scoring
  - `session_transcript` — detailed step-by-step journey log
  - `custom_persona` — user-defined persona simulation
  - `export_report` — standalone HTML report generation
  - `list_personas` — browse all available personas

- **8 built-in personas** with distinct traits
  - Alex (First-Timer), Morgan (Power User), Patricia (Senior), Jordan (Executive)
  - Sam (Accessibility), Riley (Skeptic), Casey (International), Taylor (Return Visitor)

- **Analysis engine**
  - Friction detection and scoring
  - Cognitive load assessment
  - Clarity evaluation (value prop, CTAs, navigation)
  - Emotional arc tracking

- **Flow walker** — autonomous page traversal using Puppeteer
  - Heuristic-based action planning (no LLM calls)
  - Persona-aware decision making
  - Session recording with timestamped steps

- **Report generation**
  - Markdown reports with friction points, emotional journey, recommendations
  - HTML standalone reports with styling
  - Multi-persona comparison reports

- **Infrastructure** (forked from UIMax MCP)
  - Cross-platform Chrome detection
  - Puppeteer browser management
  - TypeScript strict mode
  - Vitest test suite
