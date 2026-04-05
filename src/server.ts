import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { walkFlow } from "./walker/flow-walker.js";
import {
  resolvePersona,
  createCustomPersona,
  listPresetNames,
  PERSONA_PRESETS,
  getMaxSteps,
  getViewport,
} from "./personas/engine.js";
import { generateSessionReport, generateQuickImpressionReport } from "./feedback/generator.js";
import { comparePersonaSessions, generateComparisonReport } from "./feedback/comparison.js";
import { generateHtmlReport } from "./feedback/report.js";
import { assessCognitiveLoad } from "./analysis/cognitive-load.js";
import { assessClarity } from "./analysis/clarity.js";
import { analyzeEmotionalArc, summarizeEmotionalArc } from "./analysis/emotional-arc.js";
import { calculateFrictionScore, countBySeverity } from "./analysis/friction.js";
import { getBrowser, createPage, navigateAndWait, closePage } from "./utils/browser.js";
import type { PageSnapshot, PageElement, Persona, QuickImpressionResult } from "./types.js";

/**
 * Extract a page snapshot for quick analysis (shared utility).
 */
async function quickPageSnapshot(url: string): Promise<PageSnapshot> {
  const page = await createPage(1440, 900, 2);
  try {
    const startTime = Date.now();
    await navigateAndWait(page, url, 1000);

    const pageData = await page.evaluate(() => {
      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
        const tag = el.tagName.toLowerCase();
        const classes = el.className && typeof el.className === "string"
          ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
        return `${tag}${classes}`;
      }
      function isVisible(el: Element): boolean {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }
      function toPageElement(el: Element) {
        const htmlEl = el as HTMLInputElement;
        return {
          selector: getSelector(el), tagName: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 200),
          type: htmlEl.type || undefined, href: (el as HTMLAnchorElement).href || undefined,
          isVisible: isVisible(el), isInteractive: true,
          ariaLabel: el.getAttribute("aria-label") || undefined,
          placeholder: htmlEl.placeholder || undefined,
        };
      }
      const buttons = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']")).map(toPageElement);
      const links = Array.from(document.querySelectorAll("a[href]")).filter((el) => {
        const href = (el as HTMLAnchorElement).href;
        return href && !href.startsWith("javascript:") && !href.startsWith("#");
      }).map(toPageElement);
      const formFields = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='submit']), textarea, select")).map(toPageElement);
      const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map((h) => (h.textContent ?? "").trim()).filter((t) => t.length > 0);
      const mainText = (document.body?.innerText ?? "").trim().slice(0, 500);
      const errorMessages = Array.from(document.querySelectorAll("[class*='error'], [role='alert']")).map((el) => (el.textContent ?? "").trim()).filter((t) => t.length > 0 && t.length < 300);
      return { buttons, links, formFields, headings, mainText, errorMessages, allInteractive: [...buttons, ...links, ...formFields] };
    });

    const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false, encoding: "binary" });
    const screenshot = Buffer.from(screenshotBuffer).toString("base64");

    return {
      url, title: await page.title(), timestamp: new Date().toISOString(), screenshot,
      interactiveElements: pageData.allInteractive as PageElement[],
      headings: pageData.headings, mainText: pageData.mainText,
      formFields: pageData.formFields as PageElement[],
      links: pageData.links as PageElement[],
      buttons: pageData.buttons as PageElement[],
      errorMessages: pageData.errorMessages,
      loadTimeMs: Date.now() - startTime,
    };
  } finally {
    await closePage(page);
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "userflow-mcp",
    version: "0.1.0",
  });

  // ── simulate_user ──────────────────────────────────────────────
  server.tool(
    "simulate_user",
    "Simulate a specific user persona navigating through your app. Walks the entire flow autonomously, records observations, friction points, and emotional state at each step. Returns a detailed session report with actionable UX feedback.",
    {
      url: z.string().url().describe("The URL to start the user flow simulation"),
      persona: z.string().describe("Persona name (e.g., 'Alex', 'Morgan', 'Patricia') or 'list' to see all available presets"),
      max_steps: z.number().optional().describe("Maximum steps to simulate (default: based on persona patience)"),
    },
    async ({ url, persona: personaName, max_steps }) => {
      if (personaName === "list") {
        const presetList = PERSONA_PRESETS.map((p) => `• **${p.name}** — ${p.description} (${p.traits.techLiteracy} tech, ${p.traits.patience} patience)`).join("\n");
        return {
          content: [{ type: "text", text: `Available personas:\n\n${presetList}\n\nUse any persona name with simulate_user.` }],
        };
      }

      const persona = resolvePersona(personaName);
      if (!persona) {
        return {
          content: [{ type: "text", text: `Persona "${personaName}" not found. Available: ${listPresetNames().join(", ")}` }],
          isError: true,
        };
      }

      const session = await walkFlow(url, persona, { maxSteps: max_steps });
      const report = generateSessionReport(session);

      // Include screenshot from first step
      const firstScreenshot = session.steps[0]?.page.screenshot;

      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
        { type: "text", text: report },
      ];

      if (firstScreenshot) {
        content.push({ type: "image", data: firstScreenshot, mimeType: "image/png" });
      }

      return { content };
    }
  );

  // ── quick_impression ───────────────────────────────────────────
  server.tool(
    "quick_impression",
    "Get a persona's first 30-second impression of a page. What do they think the app does? Would they stay or bounce? Fast assessment without full flow simulation.",
    {
      url: z.string().url().describe("The URL to assess"),
      persona: z.string().optional().describe("Persona name (default: 'Jordan' — the busy executive)"),
    },
    async ({ url, persona: personaName }) => {
      const persona = resolvePersona(personaName ?? "Jordan") ?? PERSONA_PRESETS[3]; // Default: Jordan

      const snapshot = await quickPageSnapshot(url);
      const clarity = assessClarity(snapshot);
      const cogLoad = assessCognitiveLoad(snapshot);

      // Determine first impression based on page content
      const hasHeading = snapshot.headings.length > 0;
      const headingText = snapshot.headings[0] ?? "";
      const hasCTA = snapshot.buttons.length > 0;

      let whatItDoes: string;
      if (hasHeading && headingText.length > 15) {
        whatItDoes = `Based on the heading "${headingText}", it appears to be: ${headingText}`;
      } else if (snapshot.mainText.length > 50) {
        whatItDoes = `From the page content: "${snapshot.mainText.slice(0, 100)}..."`;
      } else {
        whatItDoes = "Unclear — the page doesn't communicate its purpose effectively";
      }

      let emotionalReaction: "curious" | "confident" | "confused" | "bored" | "neutral";
      if (clarity.score >= 8) emotionalReaction = "confident";
      else if (clarity.score >= 6) emotionalReaction = "curious";
      else if (clarity.score >= 4) emotionalReaction = "neutral";
      else if (clarity.score >= 2) emotionalReaction = "confused";
      else emotionalReaction = "bored";

      const wouldContinue = clarity.score >= 5 && cogLoad.score <= 7;

      let firstImpression: string;
      if (wouldContinue) {
        firstImpression = `"${headingText || "Interesting"} — I can see what this does and there's a clear next step. Let me explore."`;
      } else if (clarity.score < 4) {
        firstImpression = `"I don't understand what this is or what I'm supposed to do. I'd probably leave."`;
      } else {
        firstImpression = `"I kind of get it but it's not compelling enough to keep me here. The page feels ${cogLoad.score > 6 ? "overwhelming" : "underwhelming"}."`;
      }

      const reasoning = [
        `Clarity: ${clarity.score}/10 — ${clarity.assessment}`,
        `Cognitive load: ${cogLoad.score}/10 — ${cogLoad.assessment}`,
        `CTAs: ${clarity.ctaClarity}`,
        `Value prop: ${clarity.valueProposition}`,
      ].join("\n");

      const report = generateQuickImpressionReport({
        url,
        personaName: persona.name,
        firstImpression,
        whatItDoes,
        clarityScore: clarity.score,
        emotionalReaction,
        wouldContinue,
        reasoning,
      });

      return {
        content: [
          { type: "text", text: report },
          { type: "image", data: snapshot.screenshot, mimeType: "image/png" },
        ],
      };
    }
  );

  // ── test_onboarding ────────────────────────────────────────────
  server.tool(
    "test_onboarding",
    "Specifically test the signup/onboarding flow as a first-time user. Simulates the 'Alex' persona (first-timer) trying to sign up and complete initial setup.",
    {
      url: z.string().url().describe("The landing page or signup page URL"),
      max_steps: z.number().optional().describe("Maximum steps (default: 15)"),
    },
    async ({ url, max_steps }) => {
      const persona = resolvePersona("Alex")!; // The First-Timer
      const session = await walkFlow(url, persona, { maxSteps: max_steps ?? 15 });
      const report = generateSessionReport(session);

      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
        { type: "text", text: `# Onboarding Test Results\n\n${report}` },
      ];

      const firstScreenshot = session.steps[0]?.page.screenshot;
      if (firstScreenshot) {
        content.push({ type: "image", data: firstScreenshot, mimeType: "image/png" });
      }

      return { content };
    }
  );

  // ── test_checkout ──────────────────────────────────────────────
  server.tool(
    "test_checkout",
    "Test a purchase or conversion flow. Simulates a moderately tech-savvy user attempting to complete a purchase or signup conversion.",
    {
      url: z.string().url().describe("The pricing page or checkout start URL"),
      max_steps: z.number().optional().describe("Maximum steps (default: 12)"),
    },
    async ({ url, max_steps }) => {
      const checkoutPersona = createCustomPersona({
        name: "Checkout Tester",
        description: "A user ready to buy but sensitive to friction in the purchase flow",
        background: "Has their credit card ready and wants to complete the purchase quickly. Experienced online shopper.",
        goals: ["find pricing", "select a plan", "complete checkout", "verify purchase confirmation"],
        traits: {
          techLiteracy: "intermediate",
          patience: "low",
          ageGroup: "adult",
          devicePreference: "desktop",
          accessibilityNeeds: ["none"],
          domainKnowledge: 5,
          attentionToDetail: 7,
        },
      });

      const session = await walkFlow(url, checkoutPersona, { maxSteps: max_steps ?? 12 });
      const report = generateSessionReport(session);

      return { content: [{ type: "text", text: `# Checkout Flow Test Results\n\n${report}` }] };
    }
  );

  // ── compare_personas ───────────────────────────────────────────
  server.tool(
    "compare_personas",
    "Run the same flow with multiple personas and compare their experiences. Reveals how different user types interpret your UI differently.",
    {
      url: z.string().url().describe("The URL to test"),
      personas: z.array(z.string()).min(2).max(5).describe("List of persona names to compare (2-5)"),
      max_steps: z.number().optional().describe("Maximum steps per persona (default: based on each persona's patience)"),
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

      // Run simulations sequentially (to avoid browser contention)
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

  // ── find_dead_ends ─────────────────────────────────────────────
  server.tool(
    "find_dead_ends",
    "Discover paths in your app that lead nowhere — pages with no clear next action, broken links, or dead-end states.",
    {
      url: z.string().url().describe("The starting URL to explore from"),
      max_pages: z.number().optional().describe("Maximum pages to explore (default: 10)"),
    },
    async ({ url, max_pages }) => {
      const maxPages = max_pages ?? 10;
      const explorerPersona = createCustomPersona({
        name: "Explorer",
        description: "Systematically explores every link and button to find dead ends",
        goals: ["explore every reachable page", "find pages with no exit", "discover broken states"],
        traits: {
          techLiteracy: "expert",
          patience: "very_high",
          ageGroup: "adult",
          devicePreference: "desktop",
          accessibilityNeeds: ["none"],
          domainKnowledge: 8,
          attentionToDetail: 10,
        },
      });

      const session = await walkFlow(url, explorerPersona, { maxSteps: maxPages * 2 });

      // Identify dead-end steps
      const deadEnds = session.steps
        .filter((step) => {
          const page = step.page;
          const hasNoExit = page.buttons.length === 0 && page.links.length === 0;
          const hasEmptyState = page.mainText.trim().length < 30;
          const hasError = page.errorMessages.length > 0;
          return hasNoExit || hasEmptyState || hasError;
        })
        .map((step) => ({
          url: step.page.url,
          description: step.page.errorMessages.length > 0
            ? `Error state: ${step.page.errorMessages[0]}`
            : step.page.mainText.trim().length < 30
              ? "Empty/sparse page — no meaningful content"
              : "Dead end — no buttons or links to continue",
          reachedFrom: session.steps[step.index - 1]?.page.url ?? url,
          severity: (step.page.errorMessages.length > 0 ? "high" : "medium") as "high" | "medium",
        }));

      const report = [
        `# Dead End Analysis`,
        ``,
        `**Starting URL:** ${url}`,
        `**Pages explored:** ${session.steps.length}`,
        `**Dead ends found:** ${deadEnds.length}`,
        ``,
        ...(deadEnds.length > 0 ? [
          `## Dead Ends`,
          ``,
          ...deadEnds.map((de, i) => [
            `### ${i + 1}. ${de.url}`,
            `**Severity:** ${de.severity}`,
            `**Issue:** ${de.description}`,
            `**Reached from:** ${de.reachedFrom}`,
            ``,
          ].join("\n")),
        ] : [`No dead ends found in ${session.steps.length} pages explored.`]),
      ].join("\n");

      return { content: [{ type: "text", text: report }] };
    }
  );

  // ── rate_clarity ───────────────────────────────────────────────
  server.tool(
    "rate_clarity",
    "Evaluate how clear your page's value proposition, CTAs, and navigation are. Returns detailed clarity and cognitive load scores with specific improvement suggestions.",
    {
      url: z.string().url().describe("The URL to evaluate"),
    },
    async ({ url }) => {
      const snapshot = await quickPageSnapshot(url);
      const clarity = assessClarity(snapshot);
      const cogLoad = assessCognitiveLoad(snapshot);

      const report = [
        `# Clarity & Cognitive Load Report`,
        ``,
        `**URL:** ${url}`,
        `**Page title:** ${snapshot.title}`,
        ``,
        `## Clarity Score: ${clarity.score}/10`,
        ``,
        `| Aspect | Assessment |`,
        `|--------|-----------|`,
        `| Value Proposition | ${clarity.valueProposition} |`,
        `| CTA Clarity | ${clarity.ctaClarity} |`,
        `| Navigation | ${clarity.navigationLogic} |`,
        `| Heading Structure | ${clarity.headingStructure} |`,
        ``,
        `**Overall:** ${clarity.assessment}`,
        ``,
        `## Cognitive Load Score: ${cogLoad.score}/10 (${cogLoad.visualComplexity})`,
        ``,
        `| Metric | Value |`,
        `|--------|-------|`,
        `| Total elements | ${cogLoad.elementCount} |`,
        `| Interactive elements | ${cogLoad.interactiveCount} |`,
        `| Text density | ${cogLoad.textDensity} chars/section |`,
        `| Decision points | ${cogLoad.decisionPoints} |`,
        ``,
        `**Overall:** ${cogLoad.assessment}`,
        ``,
        `## Page Structure`,
        ``,
        `- **Headings:** ${snapshot.headings.length > 0 ? snapshot.headings.slice(0, 5).join(" | ") : "None"}`,
        `- **Buttons:** ${snapshot.buttons.length} (${snapshot.buttons.filter((b) => b.isVisible).length} visible)`,
        `- **Links:** ${snapshot.links.length} (${snapshot.links.filter((l) => l.isVisible).length} visible)`,
        `- **Form fields:** ${snapshot.formFields.length}`,
        `- **Error messages:** ${snapshot.errorMessages.length > 0 ? snapshot.errorMessages.join("; ") : "None"}`,
        `- **Load time:** ${snapshot.loadTimeMs}ms`,
        ``,
      ].join("\n");

      return {
        content: [
          { type: "text", text: report },
          { type: "image", data: snapshot.screenshot, mimeType: "image/png" },
        ],
      };
    }
  );

  // ── session_transcript ─────────────────────────────────────────
  server.tool(
    "session_transcript",
    "Get a detailed step-by-step transcript of a persona's journey through your app. Shows every action, thought, and emotional state.",
    {
      url: z.string().url().describe("The URL to navigate"),
      persona: z.string().optional().describe("Persona name (default: 'Alex')"),
      max_steps: z.number().optional().describe("Maximum steps (default: based on persona)"),
    },
    async ({ url, persona: personaName, max_steps }) => {
      const persona = resolvePersona(personaName ?? "Alex") ?? PERSONA_PRESETS[0];
      const session = await walkFlow(url, persona, { maxSteps: max_steps });

      const lines: string[] = [
        `# Session Transcript`,
        ``,
        `**Persona:** ${persona.name} — ${persona.description}`,
        `**URL:** ${url}`,
        `**Steps:** ${session.steps.length}`,
        `**Duration:** ${session.summary.totalTimeMs}ms`,
        ``,
        `---`,
        ``,
      ];

      for (const step of session.steps) {
        lines.push(`## [Step ${step.index}] ${step.page.title || step.page.url}`);
        lines.push(`**Time:** ${step.timestamp} | **Emotion:** ${step.emotionalState} | **Action:** ${step.action.type}`);
        if (step.action.target) lines.push(`**Target:** \`${step.action.target}\``);
        lines.push(``);
        lines.push(`> ${step.thought}`);
        lines.push(``);
        lines.push(`*${step.action.reasoning}*`);
        lines.push(``);
        if (step.frictionPoints.length > 0) {
          lines.push(`**Friction:**`);
          for (const f of step.frictionPoints) {
            lines.push(`- [${f.severity.toUpperCase()}] ${f.description}`);
          }
          lines.push(``);
        }
        lines.push(`---`);
        lines.push(``);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── custom_persona ─────────────────────────────────────────────
  server.tool(
    "custom_persona",
    "Create a custom user persona and run a simulation with specific traits, goals, and background. For when the built-in presets don't match your target user.",
    {
      url: z.string().url().describe("The URL to test"),
      name: z.string().describe("Persona name"),
      description: z.string().describe("Brief description of who this person is"),
      goals: z.array(z.string()).min(1).describe("What the persona is trying to accomplish"),
      tech_literacy: z.enum(["novice", "basic", "intermediate", "advanced", "expert"]).optional(),
      patience: z.enum(["very_low", "low", "moderate", "high", "very_high"]).optional(),
      age_group: z.enum(["teen", "young_adult", "adult", "middle_aged", "senior"]).optional(),
      device: z.enum(["mobile", "tablet", "desktop"]).optional(),
      max_steps: z.number().optional(),
    },
    async ({ url, name, description, goals, tech_literacy, patience, age_group, device, max_steps }) => {
      const persona = createCustomPersona({
        name,
        description,
        goals,
        traits: {
          techLiteracy: tech_literacy ?? "intermediate",
          patience: patience ?? "moderate",
          ageGroup: age_group ?? "adult",
          devicePreference: device ?? "desktop",
          accessibilityNeeds: ["none"],
          domainKnowledge: 5,
          attentionToDetail: 5,
        },
      });

      const session = await walkFlow(url, persona, { maxSteps: max_steps });
      const report = generateSessionReport(session);

      return { content: [{ type: "text", text: report }] };
    }
  );

  // ── export_report ──────────────────────────────────────────────
  server.tool(
    "export_report",
    "Run a simulation and export the results as a standalone HTML report file.",
    {
      url: z.string().url().describe("The URL to test"),
      persona: z.string().optional().describe("Persona name (default: 'Alex')"),
      max_steps: z.number().optional(),
    },
    async ({ url, persona: personaName, max_steps }) => {
      const persona = resolvePersona(personaName ?? "Alex") ?? PERSONA_PRESETS[0];
      const session = await walkFlow(url, persona, { maxSteps: max_steps });
      const html = generateHtmlReport(session);

      return {
        content: [{ type: "text", text: html }],
      };
    }
  );

  // ── list_personas ──────────────────────────────────────────────
  server.tool(
    "list_personas",
    "List all available built-in personas with their traits and descriptions.",
    {},
    async () => {
      const lines = PERSONA_PRESETS.map((p) => [
        `### ${p.name}`,
        `*${p.description}*`,
        ``,
        `> ${p.background}`,
        ``,
        `- **Tech:** ${p.traits.techLiteracy} | **Patience:** ${p.traits.patience} | **Age:** ${p.traits.ageGroup} | **Device:** ${p.traits.devicePreference}`,
        `- **Goals:** ${p.goals.join(", ")}`,
        `- **Accessibility:** ${p.traits.accessibilityNeeds.join(", ")}`,
        ``,
      ].join("\n"));

      return {
        content: [{ type: "text", text: `# Available Personas\n\n${lines.join("\n")}` }],
      };
    }
  );

  return server;
}
