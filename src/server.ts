import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "./session/session-manager.js";
import { walkFlow } from "./walker/flow-walker.js";
import { resolvePersona, createCustomPersona, PERSONA_PRESETS, listPresetNames } from "./personas/engine.js";
import { generateSessionReport } from "./feedback/generator.js";
import { generateHtmlSessionReport } from "./feedback/html-report.js";
import { comparePersonaSessions, generateComparisonReport } from "./feedback/comparison.js";
import { extractPageSnapshot } from "./utils/page-snapshot.js";
import { createPage, navigateAndWait, closePage } from "./utils/browser.js";
import { compareScreenshots } from "./utils/screenshot-diff.js";
import { DEVICE_PROFILES, getDeviceProfile, listDeviceProfiles } from "./utils/device-profiles.js";
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
    // v0.3 metrics summary (compact)
    ...(page.performance ? {
      performance: {
        lcp: page.performance.lcp,
        lcpRating: page.performance.lcpRating,
        cls: page.performance.cls,
        clsRating: page.performance.clsRating,
        fcp: page.performance.fcp,
        ttfb: page.performance.ttfb,
        resourceCount: page.performance.resourceCount,
      },
    } : {}),
    ...(page.console && page.console.errors > 0 ? {
      consoleErrors: page.console.errors,
      consoleWarnings: page.console.warnings,
    } : {}),
    ...(page.network ? {
      networkRequests: page.network.totalRequests,
      networkFailed: page.network.failedRequests,
    } : {}),
    ...(page.accessibility ? {
      a11yScore: page.accessibility.score,
      a11yViolations: page.accessibility.violations.length,
    } : {}),
  }, null, 2);
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "userflow-mcp",
    version: "0.3.1",
  });

  // ═══════════════════════════════════════════════════════════════
  // STEP-BY-STEP TOOLS (Claude drives the simulation)
  // ═══════════════════════════════════════════════════════════════

  // ── start_session ──────────────────────────────────────────────
  server.tool(
    "start_session",
    `Start a user flow session. Opens a browser, navigates to the URL, and returns the first page snapshot with a screenshot plus Core Web Vitals, accessibility score, and network summary. Claude then drives the simulation step-by-step using the "step" tool, roleplaying as the persona.

Workflow: start_session → step (repeat) → end_session

The persona definition is returned so you can roleplay as them — adopt their tech literacy, patience, goals, and behavioral patterns when deciding what to click next.

v0.3: Supports device emulation via device_profile parameter. Use list_devices to see all options.`,
    {
      url: z.string().url().describe("The URL to start the session at"),
      persona: z.string().optional().describe("Persona name (e.g., 'Alex', 'Morgan'). Use list_personas to see all. Omit to be persona-free."),
      viewport_width: z.number().optional().describe("Override viewport width"),
      viewport_height: z.number().optional().describe("Override viewport height"),
      device_profile: z.string().optional().describe("Device emulation profile (e.g., 'iphone-14-pro', 'pixel-7', 'ipad-pro-12-9'). Use list_devices to see all."),
    },
    async ({ url, persona: personaName, viewport_width, viewport_height, device_profile }) => {
      // Resolve device profile if specified
      const device = device_profile ? getDeviceProfile(device_profile) : undefined;

      const viewport = viewport_width || viewport_height
        ? { width: viewport_width, height: viewport_height }
        : device
          ? { width: device.viewport.width, height: device.viewport.height }
          : undefined;

      const scaleFactor = device?.deviceScaleFactor;

      const result = await sessionManager.createSession(url, personaName ?? undefined, viewport, scaleFactor);

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
      const deviceInfo = device ? `\n**Device:** ${device.name} (${device.viewport.width}×${device.viewport.height} @${device.deviceScaleFactor}x)` : "";

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `# Session Started`,
              `**Session ID:** ${result.sessionId}`,
              `**URL:** ${result.page.url}`,
              `**Title:** ${result.page.title}`,
              deviceInfo,
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
            type: "image" as const,
            data: result.page.screenshot,
            mimeType: "image/png" as const,
          },
        ],
      };
    }
  );

  // ── step ───────────────────────────────────────────────────────
  server.tool(
    "step",
    `Execute one step in a session. Tell the MCP what action to take (click, type, scroll, etc.) and optionally record your persona thoughts, emotional state, and any friction you noticed. Returns the resulting page state with a new screenshot.

Actions: click, type, scroll, scroll_up, navigate, select, hover, press_key, wait

v0.3: Smart selector fallback — if your CSS selector fails, the engine will try alternative strategies (data-testid, aria-label, text content) automatically.`,
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
            type: "text" as const,
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
            type: "image" as const,
            data: result.page.screenshot,
            mimeType: "image/png" as const,
          },
        ],
      };
    }
  );

  // ── end_session ────────────────────────────────────────────────
  server.tool(
    "end_session",
    `End a session and get the final report. Closes the browser, computes friction score and emotional arc, and returns the full session transcript with all recorded thoughts, friction points, and recommendations.

v0.3: Report now includes Core Web Vitals, accessibility score, network summary, and console errors.`,
    {
      session_id: z.string().describe("Session ID to close"),
      goal_achieved: z.boolean().optional().describe("Did the persona achieve their goal?"),
      summary: z.string().optional().describe("Your overall summary of the session"),
      format: z.enum(["markdown", "html"]).optional().describe("Report format: 'markdown' (default) or 'html' for a rich standalone report with embedded screenshots"),
    },
    async ({ session_id, goal_achieved, summary, format }) => {
      const session = await sessionManager.endSession(session_id, goal_achieved, summary);

      if (format === "html") {
        const htmlReport = generateHtmlSessionReport(session);
        return {
          content: [{ type: "text" as const, text: htmlReport }],
        };
      }

      const report = generateSessionReport(session);
      return {
        content: [{ type: "text" as const, text: report }],
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
          { type: "text" as const, text: pageState },
          { type: "image" as const, data: snapshot.screenshot, mimeType: "image/png" as const },
        ],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════════
  // v0.3 SESSION TOOLS (new capabilities)
  // ═══════════════════════════════════════════════════════════════

  // ── accessibility_audit ────────────────────────────────────────
  server.tool(
    "accessibility_audit",
    "Run a WCAG accessibility audit on the current page of a session using axe-core. Returns a score (0-100), all violations with WCAG criteria, and actionable fixes.",
    {
      session_id: z.string().describe("Session ID"),
      wcag_level: z.enum(["wcag2a", "wcag2aa", "wcag2aaa"]).optional().describe("WCAG conformance level (default: wcag2aa)"),
    },
    async ({ session_id, wcag_level }) => {
      const report = await sessionManager.runAccessibilityAudit(session_id, wcag_level);

      const lines: string[] = [
        `# Accessibility Audit (${report.wcagLevel})`,
        ``,
        `**Score:** ${report.score}/100`,
        `**Violations:** ${report.violations.length} (${report.violationsByImpact.critical} critical, ${report.violationsByImpact.serious} serious, ${report.violationsByImpact.moderate} moderate, ${report.violationsByImpact.minor} minor)`,
        `**Passes:** ${report.passes} | **Incomplete:** ${report.incomplete}`,
        ``,
      ];

      if (report.violations.length > 0) {
        lines.push(`| Impact | Rule | Description | Affected | WCAG |`);
        lines.push(`|--------|------|-------------|----------|------|`);
        for (const v of report.violations) {
          lines.push(`| ${v.impact} | [${v.id}](${v.helpUrl}) | ${v.description} | ${v.affectedNodes} nodes | ${v.wcagCriteria.join(", ") || "—"} |`);
        }
        lines.push(``);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  // ── inspect_storage ────────────────────────────────────────────
  server.tool(
    "inspect_storage",
    "Inspect cookies, localStorage, and sessionStorage for the current page. Identifies tracking cookies and calculates total cookie size.",
    {
      session_id: z.string().describe("Session ID"),
    },
    async ({ session_id }) => {
      const data = await sessionManager.inspectStorage(session_id);

      const lines: string[] = [
        `# Storage Inspection`,
        ``,
        `| Storage | Count |`,
        `|---------|-------|`,
        `| Cookies | ${data.cookieCount} (${(data.totalCookieSize / 1024).toFixed(1)}KB) |`,
        `| localStorage | ${data.localStorageKeys} keys |`,
        `| sessionStorage | ${data.sessionStorageKeys} keys |`,
        `| Tracking cookies | ${data.trackingCookies.length} |`,
        ``,
      ];

      if (data.cookies.length > 0) {
        lines.push(`## Cookies`);
        lines.push(`| Name | Domain | Secure | HttpOnly | SameSite |`);
        lines.push(`|------|--------|--------|----------|----------|`);
        for (const c of data.cookies.slice(0, 20)) {
          lines.push(`| ${c.name} | ${c.domain} | ${c.secure ? "✅" : "❌"} | ${c.httpOnly ? "✅" : "❌"} | ${c.sameSite} |`);
        }
        if (data.cookies.length > 20) {
          lines.push(`| … | +${data.cookies.length - 20} more | | | |`);
        }
        lines.push(``);
      }

      if (data.trackingCookies.length > 0) {
        lines.push(`## Tracking Cookies`);
        for (const tc of data.trackingCookies) {
          lines.push(`- **${tc.name}** (${tc.domain}) — ${tc.secure ? "secure" : "⚠️ insecure"}`);
        }
        lines.push(``);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  // ── export_har ─────────────────────────────────────────────────
  server.tool(
    "export_har",
    "Export all network requests captured during the session as a HAR 1.2 log. Useful for analyzing network performance, finding slow requests, and debugging API calls.",
    {
      session_id: z.string().describe("Session ID"),
    },
    async ({ session_id }) => {
      const har = sessionManager.exportHar(session_id);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(har, null, 2) }],
      };
    }
  );

  // ── compare_screenshots ────────────────────────────────────────
  server.tool(
    "compare_screenshots",
    "Compare two base64 PNG screenshots pixel-by-pixel. Returns match percentage and a visual diff image highlighting differences. Useful for detecting UI regressions or verifying changes.",
    {
      screenshot1: z.string().describe("First base64-encoded PNG screenshot"),
      screenshot2: z.string().describe("Second base64-encoded PNG screenshot"),
      threshold: z.number().optional().describe("Per-pixel color tolerance 0-1 (default: 0.1)"),
    },
    async ({ screenshot1, screenshot2, threshold }) => {
      const diff = await compareScreenshots(screenshot1, screenshot2, threshold);

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `# Screenshot Comparison`,
              ``,
              `**Match:** ${diff.matchPercentage}%`,
              `**Different pixels:** ${diff.diffPixels.toLocaleString()} / ${diff.totalPixels.toLocaleString()}`,
              `**Canvas size:** ${diff.dimensions.width}×${diff.dimensions.height}`,
            ].join("\n"),
          },
          {
            type: "image" as const,
            data: diff.diffImage,
            mimeType: "image/png" as const,
          },
        ],
      };
    }
  );

  // ── create_persona ─────────────────────────────────────────────
  server.tool(
    "create_persona",
    "Create a custom persona for testing. Define their name, goals, tech literacy, patience, device preference, and accessibility needs. Returns the persona definition to use with start_session.",
    {
      name: z.string().describe("Persona name (e.g., 'Maria')"),
      description: z.string().describe("One-line description (e.g., 'Senior citizen shopping for first smartphone')"),
      goals: z.array(z.string()).min(1).describe("What they want to accomplish"),
      background: z.string().optional().describe("Background story"),
      tech_literacy: z.enum(["novice", "basic", "intermediate", "advanced", "expert"]).optional().describe("Tech literacy level (default: intermediate)"),
      patience: z.enum(["very_low", "low", "moderate", "high", "very_high"]).optional().describe("Patience level (default: moderate)"),
      age_group: z.enum(["teen", "young_adult", "adult", "middle_aged", "senior"]).optional().describe("Age group"),
      device: z.enum(["mobile", "tablet", "desktop"]).optional().describe("Preferred device"),
      accessibility_needs: z.array(z.enum(["none", "low_vision", "screen_reader", "motor_impaired", "cognitive"])).optional().describe("Accessibility needs"),
      behavior_notes: z.array(z.string()).optional().describe("Special behavioral notes"),
    },
    async ({ name, description, goals, background, tech_literacy, patience, age_group, device, accessibility_needs, behavior_notes }) => {
      const persona = createCustomPersona({
        name,
        description,
        background,
        goals,
        traits: {
          ...(tech_literacy ? { techLiteracy: tech_literacy } : {}),
          ...(patience ? { patience } : {}),
          ...(age_group ? { ageGroup: age_group } : {}),
          ...(device ? { devicePreference: device } : {}),
          ...(accessibility_needs ? { accessibilityNeeds: accessibility_needs } : {}),
        },
        behaviorNotes: behavior_notes,
      });

      return {
        content: [{
          type: "text" as const,
          text: [
            `# Custom Persona Created`,
            ``,
            `**${persona.name}** — ${persona.description}`,
            `**ID:** ${persona.id}`,
            ``,
            `**Traits:**`,
            `- Tech: ${persona.traits.techLiteracy}`,
            `- Patience: ${persona.traits.patience}`,
            `- Age: ${persona.traits.ageGroup}`,
            `- Device: ${persona.traits.devicePreference}`,
            `- A11y: ${persona.traits.accessibilityNeeds.join(", ")}`,
            ``,
            `**Goals:** ${persona.goals.join(", ")}`,
            ``,
            `---`,
            `Use the persona name "${persona.name}" with start_session to begin a session as this persona.`,
            ``,
            `\`\`\`json`,
            JSON.stringify(persona, null, 2),
            `\`\`\``,
          ].join("\n"),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════════
  // QUICK TOOLS (stateless, single-page)
  // ═══════════════════════════════════════════════════════════════

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
            { type: "text" as const, text: `# Page Scan: ${snapshot.title}\n**URL:** ${url}\n**Load time:** ${snapshot.loadTimeMs}ms\n\n${pageState}` },
            { type: "image" as const, data: snapshot.screenshot, mimeType: "image/png" as const },
          ],
        };
      } finally {
        await closePage(page);
      }
    }
  );

  // ── list_personas ──────────────────────────────────────────────
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
          type: "text" as const,
          text: `# Available Personas\n\n${markdown}\n\n---\n\`\`\`json\n${JSON.stringify(personas, null, 2)}\n\`\`\``,
        }],
      };
    }
  );

  // ── list_devices ───────────────────────────────────────────────
  server.tool(
    "list_devices",
    "List all available device emulation profiles (phones, tablets, desktops). Use the device key with start_session's device_profile parameter.",
    {},
    async () => {
      const entries = Object.entries(DEVICE_PROFILES);
      const markdown = entries.map(([key, profile]) =>
        `| ${key} | ${profile.name} | ${profile.viewport.width}×${profile.viewport.height} | @${profile.deviceScaleFactor}x | ${profile.isMobile ? "📱" : "🖥️"} | ${profile.hasTouch ? "✅" : "❌"} |`
      ).join("\n");

      return {
        content: [{
          type: "text" as const,
          text: [
            `# Device Profiles`,
            ``,
            `| Key | Name | Viewport | Scale | Type | Touch |`,
            `|-----|------|----------|-------|------|-------|`,
            markdown,
            ``,
            `Use the key (first column) with \`start_session\`'s \`device_profile\` parameter.`,
          ].join("\n"),
        }],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════════
  // AUTO TOOLS (legacy heuristic walker — fast fallback)
  // ═══════════════════════════════════════════════════════════════

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
          content: [{ type: "text" as const, text: `Persona "${personaName}" not found. Available: ${listPresetNames().join(", ")}` }],
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
            content: [{ type: "text" as const, text: `Persona "${name}" not found. Available: ${listPresetNames().join(", ")}` }],
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

      return { content: [{ type: "text" as const, text: report }] };
    }
  );

  return server;
}
