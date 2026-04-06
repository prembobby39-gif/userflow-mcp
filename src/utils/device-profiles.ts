/**
 * Device emulation profiles for Puppeteer.
 *
 * Provides pre-defined viewport, user agent, and touch configurations for
 * common mobile, tablet, and desktop form factors. Profiles are keyed by
 * a short lowercase identifier (e.g. "iphone-14-pro").
 */

/** Full description of a device emulation target. */
export interface DeviceProfile {
  /** Human-readable display name. */
  name: string;
  viewport: { width: number; height: number };
  /** Chrome 120+ user agent string. */
  userAgent: string;
  /** CSS device-pixel-ratio (e.g. 3 for iPhone 14 Pro). */
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

/** All built-in profiles, keyed by short identifier. */
export const DEVICE_PROFILES: Record<string, DeviceProfile> = {
  "iphone-14-pro": {
    name: "iPhone 14 Pro",
    viewport: { width: 393, height: 852 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  "iphone-se": {
    name: "iPhone SE",
    viewport: { width: 375, height: 667 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  "pixel-7": {
    name: "Pixel 7",
    viewport: { width: 412, height: 915 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
  "samsung-galaxy-s23": {
    name: "Samsung Galaxy S23",
    viewport: { width: 393, height: 851 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  "galaxy-fold": {
    name: "Galaxy Fold",
    viewport: { width: 280, height: 653 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; SM-F936B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  "ipad-pro-12-9": {
    name: "iPad Pro 12.9",
    viewport: { width: 1024, height: 1366 },
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
  },
  "ipad-mini": {
    name: "iPad Mini",
    viewport: { width: 768, height: 1024 },
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
  },
  "macbook-pro-14": {
    name: 'MacBook Pro 14"',
    viewport: { width: 1512, height: 982 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Safari/537.36",
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
  },
  "desktop-1080p": {
    name: "Desktop 1080p",
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Safari/537.36",
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  "desktop-1440p": {
    name: "Desktop 1440p",
    viewport: { width: 2560, height: 1440 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Safari/537.36",
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
};

/**
 * Returns the profile for a given key, or `undefined` if not found.
 *
 * @param name - Short identifier, e.g. `"iphone-14-pro"`.
 */
export function getDeviceProfile(name: string): DeviceProfile | undefined {
  return DEVICE_PROFILES[name.toLowerCase()];
}

/** Returns all built-in profiles as a flat array. */
export function listDeviceProfiles(): DeviceProfile[] {
  return Object.values(DEVICE_PROFILES);
}

/**
 * Resolves a device profile from a loose persona preference string.
 *
 * Accepts an exact key, a partial case-insensitive name match, or the
 * category shortcuts `"mobile"`, `"tablet"`, and `"desktop"`.
 * Falls back to `"desktop-1080p"` when nothing matches.
 *
 * @param devicePreference - Loose preference, e.g. `"mobile"`, `"iphone"`, `"ipad-pro-12-9"`.
 */
export function getProfileForPersona(devicePreference: string): DeviceProfile {
  const pref = devicePreference.toLowerCase();

  // Exact key match first.
  const exact = DEVICE_PROFILES[pref];
  if (exact) return exact;

  // Category shortcuts.
  if (pref === "mobile") return DEVICE_PROFILES["iphone-14-pro"]!;
  if (pref === "tablet") return DEVICE_PROFILES["ipad-pro-12-9"]!;
  if (pref === "desktop") return DEVICE_PROFILES["desktop-1080p"]!;

  // Partial name/key match.
  const partial = Object.entries(DEVICE_PROFILES).find(
    ([key, profile]) =>
      key.includes(pref) || profile.name.toLowerCase().includes(pref),
  );
  if (partial) return partial[1];

  // Safe fallback.
  return DEVICE_PROFILES["desktop-1080p"]!;
}
