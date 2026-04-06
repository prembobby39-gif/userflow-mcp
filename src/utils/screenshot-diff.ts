/**
 * Visual screenshot comparison using pixelmatch and pngjs.
 *
 * Accepts two base64-encoded PNG screenshots, optionally pads the smaller
 * one to match dimensions, computes a pixel-level diff, and returns match
 * statistics together with a base64-encoded diff-overlay image.
 */

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** Result of a pixel-level screenshot comparison. */
export interface ScreenshotDiff {
  /** Percentage of matching pixels (0 = no match, 100 = identical). */
  matchPercentage: number;
  /** Number of pixels that differ beyond the threshold. */
  diffPixels: number;
  /** Total number of pixels in the (possibly padded) canvas. */
  totalPixels: number;
  dimensions: { width: number; height: number };
  /** Base64-encoded PNG highlighting differing pixels in red. */
  diffImage: string;
}

/** Decodes a base64 PNG string into a `pngjs` `PNG` object. */
function decodePng(base64: string): PNG {
  const buffer = Buffer.from(base64, "base64");
  return PNG.sync.read(buffer);
}

/**
 * Pads a PNG canvas to the target dimensions by copying pixels into a new,
 * zero-initialised (transparent black) buffer. Returns the original PNG
 * unchanged when it already matches the target size.
 */
function padPng(png: PNG, width: number, height: number): PNG {
  if (png.width === width && png.height === height) return png;

  const padded = new PNG({ width, height });
  // Zero-fill guarantees transparent black padding pixels.
  padded.data.fill(0);

  PNG.bitblt(png, padded, 0, 0, Math.min(png.width, width), Math.min(png.height, height), 0, 0);
  return padded;
}

/**
 * Compares two base64-encoded PNG screenshots and produces a visual diff.
 *
 * When the images have different dimensions the smaller one is padded with
 * transparent pixels so both canvases share the same bounding box before
 * comparison.
 *
 * @param screenshot1 - Base64-encoded PNG (first / "before" image).
 * @param screenshot2 - Base64-encoded PNG (second / "after" image).
 * @param threshold   - Per-channel colour tolerance in [0, 1]. Defaults to 0.1.
 * @returns Diff statistics and a base64 diff-overlay image.
 */
export async function compareScreenshots(
  screenshot1: string,
  screenshot2: string,
  threshold = 0.1,
): Promise<ScreenshotDiff> {
  const png1 = decodePng(screenshot1);
  const png2 = decodePng(screenshot2);

  // Compute the bounding box that encloses both images.
  const width = Math.max(png1.width, png2.width);
  const height = Math.max(png1.height, png2.height);

  const padded1 = padPng(png1, width, height);
  const padded2 = padPng(png2, width, height);

  const diff = new PNG({ width, height });
  const totalPixels = width * height;

  const diffPixels = pixelmatch(
    padded1.data,
    padded2.data,
    diff.data,
    width,
    height,
    { threshold, includeAA: false },
  );

  const matchPercentage = parseFloat(
    (((totalPixels - diffPixels) / totalPixels) * 100).toFixed(2),
  );

  const diffImage = PNG.sync.write(diff).toString("base64");

  return {
    matchPercentage,
    diffPixels,
    totalPixels,
    dimensions: { width, height },
    diffImage,
  };
}
