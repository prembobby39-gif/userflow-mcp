import type { Page, HTTPRequest, HTTPResponse } from "puppeteer-core";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NetworkEntry {
  url: string;
  method: string;
  resourceType: string;
  status: number;
  statusText: string;
  mimeType: string;
  responseSize: number;
  startTime: number;   // ms since epoch
  endTime: number;     // ms since epoch
  duration: number;    // ms
  failed: boolean;
  errorText?: string;
}

export interface NetworkSummary {
  totalRequests: number;
  failedRequests: number;
  blockedRequests: number;
  totalTransferSize: number;
  byResourceType: Record<string, number>;
  byStatus: Record<string, number>;
  slowestRequests: NetworkEntry[];
  averageResponseTime: number;
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: { name: string; value: string }[];
    queryString: { name: string; value: string }[];
    cookies: [];
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: { name: string; value: string }[];
    cookies: [];
    content: { size: number; mimeType: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
}

export interface HarLog {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: HarEntry[];
  };
}

// ---------------------------------------------------------------------------
// Internal tracking map  (request url+id → partial entry)
// ---------------------------------------------------------------------------

interface PendingEntry {
  url: string;
  method: string;
  resourceType: string;
  startTime: number;
}

// ---------------------------------------------------------------------------
// NetworkMonitor
// ---------------------------------------------------------------------------

/**
 * Attaches to a Puppeteer Page and records all network activity.
 *
 * Usage:
 *   const monitor = new NetworkMonitor();
 *   monitor.attach(page);
 *   // … run your flow …
 *   const summary = monitor.getSummary();
 *   monitor.detach();
 */
export class NetworkMonitor {
  private readonly entries: NetworkEntry[] = [];
  private readonly pending = new Map<HTTPRequest, PendingEntry>();

  private page: Page | null = null;

  // Bound listener references – required so we can remove them in detach().
  private readonly onRequest: (req: HTTPRequest) => void;
  private readonly onResponse: (res: HTTPResponse) => void;
  private readonly onRequestFailed: (req: HTTPRequest) => void;

  constructor() {
    this.onRequest = (req) => this.handleRequest(req);
    this.onResponse = (res) => this.handleResponse(res);
    this.onRequestFailed = (req) => this.handleRequestFailed(req);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Start listening to network events on the given page. */
  attach(page: Page): void {
    if (this.page) {
      this.detach();
    }
    this.page = page;
    page.on("request", this.onRequest);
    page.on("response", this.onResponse);
    page.on("requestfailed", this.onRequestFailed);
  }

  /** Stop listening and remove all event listeners. */
  detach(): void {
    if (!this.page) return;
    this.page.off("request", this.onRequest);
    this.page.off("response", this.onResponse);
    this.page.off("requestfailed", this.onRequestFailed);
    this.page = null;
    this.pending.clear();
  }

  // ---------------------------------------------------------------------------
  // Data accessors
  // ---------------------------------------------------------------------------

  /** All captured requests (completed + failed). */
  getRequests(): NetworkEntry[] {
    return [...this.entries];
  }

  /** Only requests that returned a 4xx or 5xx status, or that failed outright. */
  getFailedRequests(): NetworkEntry[] {
    return this.entries.filter((e) => e.failed);
  }

  /**
   * Requests whose round-trip time exceeded the threshold.
   * @param thresholdMs – Default 3000 ms.
   */
  getSlowRequests(thresholdMs = 3_000): NetworkEntry[] {
    return this.entries
      .filter((e) => e.duration >= thresholdMs)
      .sort((a, b) => b.duration - a.duration);
  }

  /** Aggregated summary across all captured requests. */
  getSummary(): NetworkSummary {
    const byResourceType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalTransferSize = 0;
    let totalDuration = 0;
    let failedCount = 0;
    let blockedCount = 0;

    for (const entry of this.entries) {
      // Resource type counts
      byResourceType[entry.resourceType] =
        (byResourceType[entry.resourceType] ?? 0) + 1;

      // Status bucket (use "failed" for network-level failures)
      const statusKey =
        entry.status === 0 ? "failed" : String(entry.status);
      byStatus[statusKey] = (byStatus[statusKey] ?? 0) + 1;

      totalTransferSize += entry.responseSize;
      totalDuration += entry.duration;

      if (entry.failed) failedCount++;
      // Treat status 0 with no errorText as blocked (e.g. ad-blocker, CSP)
      if (entry.status === 0 && !entry.errorText) blockedCount++;
    }

    const count = this.entries.length;
    const averageResponseTime = count > 0 ? totalDuration / count : 0;

    const slowestRequests = [...this.entries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    return {
      totalRequests: count,
      failedRequests: failedCount,
      blockedRequests: blockedCount,
      totalTransferSize,
      byResourceType,
      byStatus,
      slowestRequests,
      averageResponseTime,
    };
  }

  /** Export all captured requests as a HAR 1.2 log. */
  toHAR(): HarLog {
    const harEntries: HarEntry[] = this.entries.map((entry) => {
      const startedDateTime = new Date(entry.startTime).toISOString();
      const queryString = this.parseQueryString(entry.url);

      return {
        startedDateTime,
        time: entry.duration,
        request: {
          method: entry.method,
          url: entry.url,
          httpVersion: "HTTP/1.1",
          headers: [],
          queryString,
          cookies: [],
          headersSize: -1,
          bodySize: -1,
        },
        response: {
          status: entry.status,
          statusText: entry.statusText,
          httpVersion: "HTTP/1.1",
          headers: [],
          cookies: [],
          content: {
            size: entry.responseSize,
            mimeType: entry.mimeType,
          },
          redirectURL: "",
          headersSize: -1,
          bodySize: entry.responseSize,
        },
        cache: {},
        timings: {
          send: 0,
          wait: entry.duration,
          receive: 0,
        },
      };
    });

    return {
      log: {
        version: "1.2",
        creator: { name: "userflow-mcp", version: "0.3.0" },
        entries: harEntries,
      },
    };
  }

  /** Reset all captured data (does not detach listeners). */
  clear(): void {
    this.entries.length = 0;
    this.pending.clear();
  }

  // ---------------------------------------------------------------------------
  // Private event handlers
  // ---------------------------------------------------------------------------

  private handleRequest(req: HTTPRequest): void {
    this.pending.set(req, {
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      startTime: Date.now(),
    });
  }

  private handleResponse(res: HTTPResponse): void {
    const req = res.request();
    const pending = this.pending.get(req);
    if (!pending) return;

    const endTime = Date.now();
    const status = res.status();
    const headers = res.headers();
    const mimeType = headers["content-type"]?.split(";")[0]?.trim() ?? "";
    const contentLength = parseInt(headers["content-length"] ?? "0", 10);
    const responseSize = isNaN(contentLength) ? 0 : contentLength;

    const entry: NetworkEntry = {
      url: pending.url,
      method: pending.method,
      resourceType: pending.resourceType,
      status,
      statusText: res.statusText(),
      mimeType,
      responseSize,
      startTime: pending.startTime,
      endTime,
      duration: endTime - pending.startTime,
      failed: status >= 400,
    };

    this.entries.push(entry);
    this.pending.delete(req);
  }

  private handleRequestFailed(req: HTTPRequest): void {
    const pending = this.pending.get(req);
    const endTime = Date.now();

    const startTime = pending?.startTime ?? endTime;
    const errorText = req.failure()?.errorText ?? "Unknown network error";

    const entry: NetworkEntry = {
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      status: 0,
      statusText: "",
      mimeType: "",
      responseSize: 0,
      startTime,
      endTime,
      duration: endTime - startTime,
      failed: true,
      errorText,
    };

    this.entries.push(entry);
    this.pending.delete(req);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private parseQueryString(rawUrl: string): { name: string; value: string }[] {
    try {
      const { searchParams } = new URL(rawUrl);
      return Array.from(searchParams.entries()).map(([name, value]) => ({
        name,
        value,
      }));
    } catch {
      return [];
    }
  }
}
