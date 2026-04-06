import type { Page, ConsoleMessage as PuppeteerConsoleMessage } from "puppeteer-core";

export type ConsoleLevel = "log" | "warn" | "error" | "info" | "debug" | "trace";

export interface ConsoleMessage {
  readonly level: ConsoleLevel;
  readonly text: string;
  readonly timestamp: number;
  readonly url?: string;
  readonly lineNumber?: number;
  readonly columnNumber?: number;
}

export interface PageError {
  readonly message: string;
  readonly stack?: string;
  readonly timestamp: number;
}

export interface ConsoleSummary {
  readonly total: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  readonly pageErrors: number;
  readonly messages: ConsoleMessage[];
  readonly criticalErrors: ConsoleMessage[];
}

const VALID_LEVELS = new Set<ConsoleLevel>(["log", "warn", "error", "info", "debug", "trace"]);

function normalizeLevel(raw: string): ConsoleLevel {
  return VALID_LEVELS.has(raw as ConsoleLevel) ? (raw as ConsoleLevel) : "log";
}

function deduplicateByText(messages: ConsoleMessage[]): ConsoleMessage[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    if (seen.has(m.text)) return false;
    seen.add(m.text);
    return true;
  });
}

/**
 * Attaches to a Puppeteer page and captures all console messages
 * plus uncaught page errors for later inspection.
 */
export class ConsoleMonitor {
  private messages: ConsoleMessage[] = [];
  private pageErrors: PageError[] = [];
  private page: Page | null = null;

  private readonly onConsole = (msg: PuppeteerConsoleMessage): void => {
    const location = msg.location();
    this.messages = [
      ...this.messages,
      {
        level: normalizeLevel(msg.type()),
        text: msg.text(),
        timestamp: Date.now(),
        url: location.url || undefined,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      },
    ];
  };

  private readonly onPageError = (err: unknown): void => {
    const error = err instanceof Error ? err : new Error(String(err));
    this.pageErrors = [
      ...this.pageErrors,
      {
        message: error.message,
        stack: error.stack,
        timestamp: Date.now(),
      },
    ];
  };

  attach(page: Page): void {
    if (this.page) {
      this.detach();
    }
    this.page = page;
    page.on("console", this.onConsole);
    page.on("pageerror", this.onPageError);
  }

  detach(): void {
    if (this.page) {
      this.page.off("console", this.onConsole);
      this.page.off("pageerror", this.onPageError);
      this.page = null;
    }
  }

  getMessages(level?: ConsoleLevel): ConsoleMessage[] {
    return level ? this.messages.filter((m) => m.level === level) : [...this.messages];
  }

  getErrors(): ConsoleMessage[] {
    return this.getMessages("error");
  }

  getWarnings(): ConsoleMessage[] {
    return this.getMessages("warn");
  }

  getPageErrors(): PageError[] {
    return [...this.pageErrors];
  }

  getSummary(): ConsoleSummary {
    return {
      total: this.messages.length,
      errors: this.getErrors().length,
      warnings: this.getWarnings().length,
      infos: this.getMessages("info").length,
      pageErrors: this.pageErrors.length,
      messages: [...this.messages],
      criticalErrors: deduplicateByText(this.getErrors()),
    };
  }

  clear(): void {
    this.messages = [];
    this.pageErrors = [];
  }
}
