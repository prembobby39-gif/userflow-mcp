import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "./session/session-manager.js";
import { walkFlow } from "./walker/flow-walker.js";
import { resolvePersona, PERSONA_PRESETS, listPresetNames } from "./personas/engine.js";
import { generateSessionReport } from "./feedback/generator.js";
import { comparePersonaSessions, generateComparisonReport } from "./feedback/comparison.js";
import { extractPageSnapshot } from "./utils/page-snapshot.js";
import { createPage, navigateAndWait, closePage } from "./utils/browser.js";
import type { Persona, PageSnapshot } from "./types.js";

/**
 * Serialize a PageSnapshot for text output (everything except the screenshot binary).
 */
function serializePageState(page: PageSnapshot): string {
  return JSON.stringify({
    url: page.url,
    title: page.title,
    timestamp: page.timestamp,
    loadTimeMs: page.loadTimeMs,
    headings: page.headings,
    mainText: page.mainText,
    buttons: page.buttons.map((b) => ({ selector: b.selector, text: b.text, visible: b.isVisible })),
    links: page.links.filter((l) => l.isVisible).slice(0, 30).map((l) => ({ selector: l.selector, text: l.text, href: l.href })),
    formFields: page.formFields.map((f) => ({ selector: f.selector, type: f.type, placeholder: f.placeholder, ariaLabel: f.ariaLabel })),
    errorMessages: page.errorMessages,
    interactiveElementCount: page.interactiveElements.length,
  }, null, 2);
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "userflow-mcp",
    version: "0.2.1",
  });

  // ═══════════════════════════════════════════════════════════════
  // STEP-BY-STEP TOOLS (Claude drives the simulation)
  // ═══════════════════════════════════════��═══════════════════════

  // ── start_session ──────────────────────────────────────────────
  server.tool(
    "start_session",
    `Start a user flow session. Opens a browser, navigates to the URL, and returns the first page snapshot with a screenshot. Claude then drives the simulation step-by-step using the "step" tool, roleplaying as the persona.

Workflow: start_session → step (repeat) → end_session

The persona definition is returned so you can roleplay as them — adopt their tech literacy, patience, goals, and behavioral patterns when deciding what to click next.`,
    {
      url: z.string().url().describe("The URL to start the session at"),
      persona: z.string().optional().describe("Persona name (e.g., 'Alex', 'Morgan'). Use list_personas to see all. Omit to be persona-free."),
      viewport_width: z.number().optional().describe("Override viewport width"),
      viewport_height: z.number().optional().describe("Override viewport height"),
    },
    async ({ url, persona: personaName, viewport_width, viewport_height }) => {
      const viewport = viewport_width || viewport_height
        ? { width: viewport_width, height: viewport_height }
        : undefined;

      const result = await sessionManager.createSession(url, personaName ?? undefined, viewport);

      const personaBrief = result.persona
        ? [
            `## Persona: ${result.persona.name}`,
            `**${result.persona.description}**`,
            ``,
            `> ${result.persona.background}`,
            ``,
            `**Goals:** ${result.persona.goals.join(", ")}`,
            `**Traits:** Tech: ${result.persona.traits.techLiteracy} | Patience: ${result.persona.traits.patience} | Age: ${result.persona.traits.ageGroup} | Device: ${result.persona.traits.devicePreference}`,
            `**Accessibility:** ${result.persona.traits.accessibilityNeeds.join(", ")}`,
            result.persona.behaviorNotes.length > 0 ? `**Behavior notes:** ${result.persona.behaviorNotes.join("; ")}` : "",
          ].filter(Boolean).join("\n")
        : "No persona selected — you decide how to navigate.";

      const pageState = serializePageState(result.page);

      return {
        content: [
          {
            type: "text",
            text: [
              `# Session Started`,
              `**Session ID:** ${result.sessionId}`,
              `**URL:** ${result.page.url}`,
              `**Title:** ${result.page.title}`,
              ``,
              personaBrief,
              ``,
              `## Page State`,
              pageState,
              ``,
              `---`,
              `Use the **step** tool with this session_id to navigate. Look at the screenshot, think as this persona, and decide what to do next.`,
            ].join("\n"),
          },
          {
            type: "image",
            data: result.page.screenshot,
            mimeType: "image/png",
          },
        ],
      };
    }
  );

  // ── step ────────���──────────────────────────────────────────────
  server.tool(
    "step",
    `Execute one step in a session. Tell the MCP what action to take (click, type, scroll, etc.) and optionally record your persona thoughts, emotional state, and any friction you noticed. Returns the resulting page state with a new screenshot.

Actions: click, type, scroll, scroll_up, navigate, select, hover, press_key, wait`,
    {
      session_id: z.string().describe("Session ID from start_session"),
      action: z.enum(["click", "type", "scroll", "scroll_up", "navigate", "select", "hover", "press_key", "wait"])
        .describe("Action to perform"),
      target: z.string().optional()
        .describe("CSS selector (required for click, type, select, hover)"),
      value: z.string().optional()
        .describe("Text to type, URL to navigate to, option value, or key name"),
      scroll_amount: z.number().optional()
        .describe("Pixels to scroll (default: 500)"),
      thought: z.string().optional()
        .describe("Your persona's thought at this moment — recorded in the session transcript"),
      emotional_state: z.enum(["curious", "confident", "neutral", "confused", "frustrated", "delighted", "anxious", "bored"]).optional()
        .describe("How the persona feels right now"),
      friction: z.array(z.object({
        severity: z.enum(["low", "medium", "high", "critical"]),
        description: z.string(),
        suggestion: z.string(),
      })).optional()
        .describe("Friction points you noticed at this step"),
    },
    async ({ session_id, action, target, value, scroll_amount, thought, emotional_state, friction }) => {
      const result = await sessionManager.executeStep(session_id, {
        action,
        target,
        value,
        scrollAmount: scroll_amount,
        thought,
        emotionalState: emotional_state,
        frictionNotes: friction,
      });

      const pageState = serializePageState(result.page);

      const statusLine = result.success
        ? `**Step ${result.stepIndex}:** ${action}${target ? ` → \`${target}\`` : ""} ✅`
        : `**Step ${result.stepIndex}:** ${action}${target ? ` → \`${target}\`` : ""} ❌ ${result.error}`;

      return {
        content: [
          {
            type: "text",
            text: [
              statusLine,
              `**URL:** ${result.page.url}`,
              `**Title:** ${result.page.title}`,
              ``,
              `## Page State`,
              pageState,
            ].join("\n"),
          },
          {
            type: "image",
            data: result.page.screenshot,
            mimeType: "image/png",
          },
        ],
      };
    }
  );

  // ── end_session ────────────────────────────────────────────────
  server.tool(
    "end_session",
    "End a session and get the final report. Closes the browser, computes friction score and emotional arc, and returns the full session transcript with all recorded thoughts, friction points, and recommendations.",
    {
      session_id: z.string().describe("Session ID to close"),
      goal_achieved: z.boolean().optional().describe("Did the persona achieve their goal?"),
      summary: z.string().optional().describe("Your overall summary of the session"),
    },
    async ({ session_id, goal_achieved, summary }) => {
      const session = await sessionManager.endSession(session_id, goal_achieved, summary);
      const report = generateSessionReport(session);

      return {
        content: [{ type: "text", text: report }],
      };
    }
  );

  // ── get_page_state ─────────────────────────────────────────────
  server.tool(
    "get_page_state",
    "Get the current page state and screenshot without performing any action. Useful for re-examining the page or checking if lazy-loaded content has appeared.",
    {
      session_id: z.string().describe("Session ID"),
      full_page: z.boolean().optional().describe("Capture full page instead of viewport (default: false)"),
    },
    async ({ session_id, full_page }) => {
      const snapshot = await sessionManager.getPageState(session_id, full_page);
      const pageState = serializePageState(snapshot);

      return {
        content: [
          { type: "text", text: pageState },
          { type: "image", data: snapshot.screenshot, mimeType: "image/png" },
        ],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════════
  // QUICK TOOLS (stateless, single-page)
  // ═════════════���═════════════════════════════════════════════════

  // ── quick_scan ─────────────────────────────────────────────────
  server.tool(
    "quick_scan",
    "Fast single-page scan. Navigates to the URL, captures a screenshot, extracts all interactive elements, headings, forms, and error messages. Returns everything to you for analysis — no session state required.",
    {
      url: z.string().url().describe("URL to scan"),
      viewport_width: z.number().optional().describe("Viewport width (default: 1440)"),
      viewport_height: z.number().optional().describe("Viewport height (default: 900)"),
      full_page: z.boolean().optional().describe("Capture full page (default: false)"),
      wait_ms: z.number().optional().describe("Extra wait after page load in ms (default: 1000)"),
    },
    async ({ url, viewport_width, viewport_height, full_page, wait_ms }) => {
      const width = viewport_width ?? 1440;
      const height = viewport_height ?? 900;
      const page = await createPage(width, height, 2);

      try {
        await navigateAndWait(page, url, wait_ms ?? 1000);
        const snapshot = await extractPageSnapshot(page, { fullPage: full_page });
        const pageState = serializePageState(snapshot);

        return {
          content: [
            { type: "text", text: `# Page Scan: ${snapshot.title}\n**URL:** ${url}\n**Load time:** ${snapshot.loadTimeMs}ms\n\n${pageState}` },
            { type: "image", data: snapshot.screenshot, mimeType: "image/png" },
          ],
        };
      } finally {
        await closePage(page);
      }
    }
  );

  // ── list_personas ───────────────────────────────────���──────────
  server.tool(
    "list_personas",
    "List all built-in personas with their full trait definitions. Use this to choose a persona for start_session, or to understand each persona before roleplaying as them.",
    {},
    async () => {
      const personas = PERSONA_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        background: p.background,
        goals: p.goals,
        traits: p.traits,
        behaviorNotes: p.behaviorNotes,
      }));

      const markdown = PERSONA_PRESETS.map((p) => [
        `### ${p.name}`,
        `*${p.description}*`,
        `> ${p.background}`,
        `- **Tech:** ${p.traits.techLiteracy} | **Patience:** ${p.traits.patience} | **Device:** ${p.traits.devicePreference}`,
        `- **Goals:** ${p.goals.join(", ")}`,
        `- **Accessibility:** ${p.traits.accessibilityNeeds.join(", ")}`,
        p.behaviorNotes.length > 0 ? `- **Notes:** ${p.behaviorNotes.join("; ")}` : "",
        ``,
      ].filter(Boolean).join("\n")).join("\n");

      return {
        content: [{
          type: "text",
          text: `# Available Personas\n\n${markdown}\n\n---\n\`\`\`json\n${JSON.stringify(personas, null, 2)}\n\`\`\``,
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════════
  // AUTO TOOLS (legacy heuristic walker — fast fallback)
  // ══════════════════════════════════���════════════════════════════

  // ── auto_walk ──────────────────────────────────────────────────
  server.tool(
    "auto_walk",
    "Fast automated walk using heuristic-based navigation (no AI reasoning). Runs the full flow autonomously and returns a report. Use this for quick scans when you don't need to drive step-by-step.",
    {
      url: z.string().url().describe("Starting URL"),
      persona: z.string().describe("Persona name (e.g., 'Alex', 'Morgan')"),
      max_steps: z.number().optional().describe("Maximum steps (default: based on persona patience)"),
    },
    async ({ url, persona: personaName, max_steps }) => {
      const persona = resolvePersona(personaName);
      if (!persona) {
        return {
          content: [{ type: "text", text: `Persona "${personaName}" not found. Available: ${listPresetNames().join(", ")}` }],
          isError: true,
        };
      }

      const session = await walkFlow(url, persona, { maxSteps: max_steps });
      const report = generateSessionReport(session);

      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
        { type: "text", text: report },
      ];

      const firstScreenshot = session.steps[0]?.page.screenshot;
      if (firstScreenshot) {
        content.push({ type: "image", data: firstScreenshot, mimeType: "image/png" });
      }

      return { content };
    }
  );

  // ── compare_personas_auto ──────────────────────────────────────
  server.tool(
    "compare_personas_auto",
    "Run the automated heuristic walker for multiple personas on the same URL and compare their experiences. Fast but less nuanced than step-by-step simulation.",
    {
      url: z.string().url().describe("URL to test"),
      personas: z.array(z.string()).min(2).max(5).describe("Persona names to compare (2-5)"),
      max_steps: z.number().optional().describe("Max steps per persona"),
    },
    async ({ url, personas: personaNames, max_steps }) => {
      const resolvedPersonas: Persona[] = [];
      for (const name of personaNames) {
        const persona = resolvePersona(name);
        if (!persona) {
          return {
            content: [{ type: "text", text: `Persona "${name}" not found. Available: ${listPresetNames().join(", ")}` }],
            isError: true,
          };
        }
        resolvedPersonas.push(persona);
      }

      const sessions = [];
      for (const persona of resolvedPersonas) {
        const session = await walkFlow(url, persona, { maxSteps: max_steps });
        sessions.push(session);
      }

      const comparison = comparePersonaSessions(sessions);
      const report = generateComparisonReport(comparison);

      return { content: [{ type: "text", text: report }] };
    }
  );

  return server;
}
