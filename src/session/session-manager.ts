import type { Page } from "puppeteer-core";
import type { Persona, PageSnapshot, UserSession, FrictionPoint, AccessibilityReport, StorageData, NetworkSummary } from "../types.js";
import type { LiveSession, StepInput, StepResult } from "./types.js";
import type { HarLog } from "../utils/network-monitor.js";
import { getBrowser } from "../utils/browser.js";
import { extractPageSnapshot } from "../utils/page-snapshot.js";
import { executeAction } from "../utils/actions.js";
import { SessionRecorder } from "../walker/session-recorder.js";
import { resolvePersona } from "../personas/engine.js";
import { getViewport } from "../personas/engine.js";
import { NetworkMonitor } from "../utils/network-monitor.js";
import { ConsoleMonitor } from "../utils/console-monitor.js";
import { injectPerformanceObservers } from "../utils/performance.js";
import { runAccessibilityAudit } from "../utils/accessibility.js";
import { inspectStorage } from "../utils/storage-inspector.js";
import { randomUUID } from "node:crypto";

const NAVIGATION_TIMEOUT = 30_000;
const DEFAULT_SCALE_FACTOR = 2;
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONCURRENT_SESSIONS = 5;

/**
 * Manages live browser sessions for step-by-step user flow simulation.
 * Each session holds a persistent Puppeteer page that survives across tool calls.
 */
class SessionManager {
  private readonly sessions = new Map<string, LiveSession>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Auto-cleanup stale sessions every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 60_000);
  }

  /**
   * Create a new session: open browser, navigate to URL, return initial snapshot.
   */
  async createSession(
    url: string,
    personaNameOrId?: string,
    viewport?: { readonly width?: number; readonly height?: number },
    deviceScaleFactor?: number
  ): Promise<{ readonly sessionId: string; readonly persona: Persona | null; readonly page: PageSnapshot }> {
    // Enforce max concurrent sessions
    if (this.sessions.size >= MAX_CONCURRENT_SESSIONS) {
      this.cleanupStaleSessions();
      if (this.sessions.size >= MAX_CONCURRENT_SESSIONS) {
        throw new Error(`Maximum ${MAX_CONCURRENT_SESSIONS} concurrent sessions. Close an existing session first.`);
      }
    }

    // Resolve persona
    const persona = personaNameOrId ? resolvePersona(personaNameOrId) ?? null : null;

    // Determine viewport
    const personaViewport = persona ? getViewport(persona) : { width: 1440, height: 900 };
    const finalViewport = {
      width: viewport?.width ?? personaViewport.width,
      height: viewport?.height ?? personaViewport.height,
    };

    // Create browser page
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({
      width: finalViewport.width,
      height: finalViewport.height,
      deviceScaleFactor: deviceScaleFactor ?? DEFAULT_SCALE_FACTOR,
    });

    // Attach monitors BEFORE navigation so they capture everything
    const networkMonitor = new NetworkMonitor();
    networkMonitor.attach(page);

    const consoleMonitor = new ConsoleMonitor();
    consoleMonitor.attach(page);

    // Inject performance observers before navigation
    await injectPerformanceObservers(page);

    // Navigate to starting URL
    await page.goto(url, { waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT });

    // Create session
    const sessionId = randomUUID();
    const placeholderPersona: Persona = persona ?? {
      id: "anonymous",
      name: "Anonymous User",
      description: "No persona selected — Claude decides how to behave",
      background: "",
      goals: [],
      traits: {
        techLiteracy: "intermediate",
        patience: "moderate",
        ageGroup: "adult",
        devicePreference: "desktop",
        accessibilityNeeds: ["none"],
        domainKnowledge: 5,
        attentionToDetail: 5,
      },
      behaviorNotes: [],
    };

    const recorder = new SessionRecorder(placeholderPersona, url);

    const session: LiveSession = {
      id: sessionId,
      page,
      recorder,
      persona,
      viewport: finalViewport,
      createdAt: new Date().toISOString(),
      locked: false,
      networkMonitor,
      consoleMonitor,
    };

    this.sessions.set(sessionId, session);

    // Extract initial snapshot (full audit on first page)
    const snapshot = await extractPageSnapshot(page, {
      networkMonitor,
      consoleMonitor,
    });

    return { sessionId, persona, page: snapshot };
  }

  /**
   * Execute a step in an existing session.
   * Claude provides the action + optional metadata (thought, emotion, friction).
   */
  async executeStep(sessionId: string, input: StepInput): Promise<StepResult> {
    const session = this.getSessionOrThrow(sessionId);

    // Simple lock to prevent concurrent steps
    if (session.locked) {
      throw new Error("Session is busy — wait for the previous step to complete");
    }
    session.locked = true;

    try {
      const stepStart = Date.now();

      // Execute the action
      const actionResult = await executeAction(session.page, {
        type: input.action,
        target: input.target,
        value: input.value,
        scrollAmount: input.scrollAmount,
      });

      // Extract new page state (lightweight for step speed — no a11y/storage per step)
      const snapshot = await extractPageSnapshot(session.page, {
        networkMonitor: session.networkMonitor,
        consoleMonitor: session.consoleMonitor,
        lightweight: true,
      });

      // Build friction points from Claude's notes
      const frictionPoints: FrictionPoint[] = (input.frictionNotes ?? []).map((note, i) => ({
        id: `step-${session.recorder.getStepCount()}-friction-${i}`,
        severity: note.severity,
        description: note.description,
        location: snapshot.url,
        suggestion: note.suggestion,
        stepIndex: session.recorder.getStepCount(),
      }));

      // Record the step
      session.recorder.recordStep({
        page: snapshot,
        action: {
          type: input.action as any,
          target: input.target,
          value: input.value,
          reasoning: input.thought ?? "",
        },
        thought: input.thought ?? "",
        emotionalState: input.emotionalState ?? "neutral",
        frictionPoints,
        timeSpentMs: Date.now() - stepStart,
      });

      return {
        success: actionResult.success,
        error: actionResult.error,
        page: snapshot,
        stepIndex: session.recorder.getStepCount() - 1,
      };
    } finally {
      session.locked = false;
    }
  }

  /**
   * Get the current page state without performing any action.
   */
  async getPageState(sessionId: string, fullPage?: boolean): Promise<PageSnapshot> {
    const session = this.getSessionOrThrow(sessionId);
    return extractPageSnapshot(session.page, {
      fullPage,
      networkMonitor: session.networkMonitor,
      consoleMonitor: session.consoleMonitor,
    });
  }

  /**
   * End a session: close the browser page, finalize the session, return transcript.
   */
  async endSession(
    sessionId: string,
    goalAchieved?: boolean,
    summaryNotes?: string
  ): Promise<UserSession> {
    const session = this.getSessionOrThrow(sessionId);

    // Detach monitors before closing
    session.networkMonitor.detach();
    session.consoleMonitor.detach();

    try {
      // Close the browser page
      if (!session.page.isClosed()) {
        await session.page.close();
      }
    } catch {
      // Page may already be closed
    }

    // Finalize the session
    const userSession = session.recorder.finalize(goalAchieved ?? false);

    // Remove from active sessions
    this.sessions.delete(sessionId);

    return userSession;
  }

  /**
   * Get a session or throw if not found.
   */
  private getSessionOrThrow(sessionId: string): LiveSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found. It may have expired or been closed.`);
    }
    return session;
  }

  /**
   * Close sessions older than TTL.
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      const age = now - new Date(session.createdAt).getTime();
      if (age > SESSION_TTL_MS) {
        try {
          if (!session.page.isClosed()) {
            session.page.close().catch(() => {});
          }
        } catch {
          // ignore
        }
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Run an accessibility audit on the current page of a session.
   */
  async runAccessibilityAudit(
    sessionId: string,
    wcagLevel?: "wcag2a" | "wcag2aa" | "wcag2aaa"
  ): Promise<AccessibilityReport> {
    const session = this.getSessionOrThrow(sessionId);
    return runAccessibilityAudit(session.page, { wcagLevel });
  }

  /**
   * Inspect browser storage (cookies, localStorage, sessionStorage) for a session.
   */
  async inspectStorage(sessionId: string): Promise<StorageData> {
    const session = this.getSessionOrThrow(sessionId);
    return inspectStorage(session.page);
  }

  /**
   * Get network summary for a session.
   */
  getNetworkSummary(sessionId: string): NetworkSummary {
    const session = this.getSessionOrThrow(sessionId);
    return session.networkMonitor.getSummary();
  }

  /**
   * Export HAR log for a session's network activity.
   */
  exportHar(sessionId: string): HarLog {
    const session = this.getSessionOrThrow(sessionId);
    return session.networkMonitor.toHAR();
  }

  /**
   * Get count of active sessions (for diagnostics).
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Destroy all sessions (for cleanup).
   */
  async destroyAll(): Promise<void> {
    for (const [id, session] of this.sessions) {
      try {
        if (!session.page.isClosed()) {
          await session.page.close();
        }
      } catch {
        // ignore
      }
    }
    this.sessions.clear();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
