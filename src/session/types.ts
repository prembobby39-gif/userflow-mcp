import type { Page } from "puppeteer-core";
import type { Persona, EmotionalState, FrictionSeverity, PageSnapshot } from "../types.js";
import type { SessionRecorder } from "../walker/session-recorder.js";
import type { NetworkMonitor } from "../utils/network-monitor.js";
import type { ConsoleMonitor } from "../utils/console-monitor.js";

export interface LiveSession {
  readonly id: string;
  readonly page: Page;
  readonly recorder: SessionRecorder;
  readonly persona: Persona | null;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly createdAt: string;
  locked: boolean;
  readonly networkMonitor: NetworkMonitor;
  readonly consoleMonitor: ConsoleMonitor;
}

export interface StepInput {
  readonly action: string;
  readonly target?: string;
  readonly value?: string;
  readonly scrollAmount?: number;
  readonly thought?: string;
  readonly emotionalState?: EmotionalState;
  readonly frictionNotes?: readonly {
    readonly severity: FrictionSeverity;
    readonly description: string;
    readonly suggestion: string;
  }[];
}

export interface StepResult {
  readonly success: boolean;
  readonly error: string | null;
  readonly page: PageSnapshot;
  readonly stepIndex: number;
}
