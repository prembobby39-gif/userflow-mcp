export type { Persona, PersonaTraits, TechLiteracy, PatienceLevel, AgeGroup, DevicePreference, AccessibilityNeed } from "../types.js";

/** Maximum steps a persona will take before giving up, based on patience. */
export const PATIENCE_STEP_LIMITS: Readonly<Record<string, number>> = {
  very_low: 5,
  low: 8,
  moderate: 12,
  high: 18,
  very_high: 25,
};

/** How likely (0-1) a persona is to notice non-obvious UI elements based on tech literacy. */
export const DISCOVERY_PROBABILITY: Readonly<Record<string, number>> = {
  novice: 0.2,
  basic: 0.4,
  intermediate: 0.6,
  advanced: 0.8,
  expert: 0.95,
};

/** Viewport dimensions by device preference. */
export const DEVICE_VIEWPORTS: Readonly<Record<string, { width: number; height: number }>> = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};
