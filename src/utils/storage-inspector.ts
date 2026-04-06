/**
 * Browser storage inspector for Puppeteer pages.
 *
 * Collects cookies (via the CDP-backed `page.cookies()`) and
 * localStorage / sessionStorage (via `page.evaluate()`) in a single pass.
 * Identifies third-party / tracking cookies by comparing the cookie domain
 * against the page's own hostname.
 */

import type { Page } from "puppeteer-core";

/** Metadata for a single browser cookie. */
export interface CookieInfo {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  /** SameSite policy string, e.g. `"Strict"`, `"Lax"`, or `"None"`. */
  sameSite: string;
  /** Unix timestamp (seconds) or `null` for session cookies. */
  expires: number | null;
  /** Approximate byte size of the name=value pair. */
  size: number;
}

/** Aggregated storage snapshot for a page. */
export interface StorageData {
  cookies: CookieInfo[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookieCount: number;
  localStorageKeys: number;
  sessionStorageKeys: number;
  /** Cookies whose domain does not match the page hostname (third-party / trackers). */
  trackingCookies: CookieInfo[];
  /** Sum of `size` across all cookies (bytes). */
  totalCookieSize: number;
}

/**
 * Known tracking / analytics cookie-name prefixes used as an additional
 * heuristic on top of the domain-mismatch check.
 */
const TRACKING_PREFIXES = ["_ga", "_gid", "_fbp", "_fbc", "__utm", "_tt_", "ajs_"];

/** Returns `true` when the cookie looks like a third-party or tracker. */
function isTrackingCookie(cookie: CookieInfo, pageHostname: string): boolean {
  const normalised = cookie.domain.replace(/^\./, "");
  const domainMismatch = !pageHostname.endsWith(normalised) && !normalised.endsWith(pageHostname);
  const knownTracker = TRACKING_PREFIXES.some((p) => cookie.name.startsWith(p));
  return domainMismatch || knownTracker;
}

/**
 * Inspects all browser storage for the current page.
 *
 * Must be called after the page has finished navigating; cookies and storage
 * are collected from the page's current origin.
 *
 * @param page - A live Puppeteer `Page` instance.
 * @returns A fully-populated `StorageData` snapshot.
 */
export async function inspectStorage(page: Page): Promise<StorageData> {
  const pageUrl = page.url();
  const pageHostname = new URL(pageUrl).hostname;

  // Collect all cookies visible to the page via CDP.
  const rawCookies = await page.cookies();
  const cookies: CookieInfo[] = rawCookies.map((c) => ({
    name: c.name,
    domain: c.domain ?? "",
    path: c.path ?? "/",
    secure: c.secure ?? false,
    httpOnly: c.httpOnly ?? false,
    sameSite: c.sameSite ?? "None",
    expires: c.expires != null && c.expires > 0 ? c.expires : null,
    size: Buffer.byteLength(`${c.name}=${c.value}`, "utf8"),
  }));

  // Read localStorage and sessionStorage from the page context.
  const [localStorage, sessionStorage] = await page.evaluate(() => {
    const read = (store: Storage): Record<string, string> => {
      const out: Record<string, string> = {};
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key !== null) out[key] = store.getItem(key) ?? "";
      }
      return out;
    };
    return [read(window.localStorage), read(window.sessionStorage)] as const;
  });

  const trackingCookies = cookies.filter((c) => isTrackingCookie(c, pageHostname));
  const totalCookieSize = cookies.reduce((acc, c) => acc + c.size, 0);

  return {
    cookies,
    localStorage,
    sessionStorage,
    cookieCount: cookies.length,
    localStorageKeys: Object.keys(localStorage).length,
    sessionStorageKeys: Object.keys(sessionStorage).length,
    trackingCookies,
    totalCookieSize,
  };
}
