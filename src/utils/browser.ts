import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

let browserInstance: Browser | null = null;

/**
 * Find Chrome/Chromium executable on the system.
 * Checks common installation paths across macOS, Linux, and Windows.
 */
function findChromePath(): string {
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const paths: readonly string[] = [
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    // Windows (WSL)
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
    "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ];

  for (const chromePath of paths) {
    if (existsSync(chromePath)) {
      return chromePath;
    }
  }

  try {
    const result = execSync("which google-chrome || which chromium || which chromium-browser", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (result && existsSync(result)) {
      return result;
    }
  } catch {
    // `which` failed
  }

  throw new Error(
    "Could not find Chrome/Chromium. Install Google Chrome or set CHROME_PATH environment variable.\n" +
    "  macOS: brew install --cask google-chrome\n" +
    "  Linux: sudo apt install google-chrome-stable\n" +
    "  Or set: export CHROME_PATH=/path/to/chrome"
  );
}

/**
 * Get or create a shared browser instance.
 *
 * Connection priority:
 * 1. CHROME_WS_ENDPOINT env var — connect to existing browser via WebSocket
 * 2. CHROME_CDP_URL env var — connect via CDP HTTP endpoint (e.g. http://localhost:9222)
 * 3. Launch a fresh headless Chrome
 *
 * Using options 1 or 2 preserves the user's login sessions and cookies.
 */
export async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  // Option 1: Direct WebSocket endpoint
  const wsEndpoint = process.env.CHROME_WS_ENDPOINT;
  if (wsEndpoint) {
    browserInstance = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
    return browserInstance;
  }

  // Option 2: CDP URL (auto-discovers WebSocket endpoint)
  const cdpUrl = process.env.CHROME_CDP_URL;
  if (cdpUrl) {
    browserInstance = await puppeteer.connect({ browserURL: cdpUrl });
    return browserInstance;
  }

  // Option 3: Launch fresh headless Chrome
  const executablePath = findChromePath();

  browserInstance = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
    ],
  });

  return browserInstance;
}

/**
 * Create a new page with the given viewport settings.
 */
export async function createPage(
  width: number,
  height: number,
  deviceScaleFactor: number = 1
): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor });
  return page;
}

/**
 * Navigate to a URL and wait for the page to be ready.
 */
export async function navigateAndWait(
  page: Page,
  url: string,
  delay: number = 0
): Promise<void> {
  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Close a page safely.
 */
export async function closePage(page: Page): Promise<void> {
  try {
    if (!page.isClosed()) {
      await page.close();
    }
  } catch {
    // Page may already be closed
  }
}

/**
 * Shut down the shared browser instance.
 * If connected via CDP, disconnects without closing the user's browser.
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    const isRemote = !!(process.env.CHROME_WS_ENDPOINT || process.env.CHROME_CDP_URL);
    try {
      if (isRemote) {
        browserInstance.disconnect();
      } else {
        await browserInstance.close();
      }
    } catch {
      // Browser may already be closed/disconnected
    }
    browserInstance = null;
  }
}
