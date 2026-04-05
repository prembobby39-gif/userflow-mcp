import type { Persona, PersonaTraits } from "../types.js";
import { PERSONA_PRESETS, getPresetByName, getPresetById } from "./presets.js";
import { PATIENCE_STEP_LIMITS, DISCOVERY_PROBABILITY, DEVICE_VIEWPORTS } from "./types.js";

export { PERSONA_PRESETS, getPresetByName, getPresetById };

/**
 * Create a custom persona from user-provided parameters.
 * Merges provided traits with sensible defaults.
 */
export function createCustomPersona(params: {
  readonly name: string;
  readonly description: string;
  readonly background?: string;
  readonly goals: readonly string[];
  readonly traits?: Partial<PersonaTraits>;
  readonly behaviorNotes?: readonly string[];
}): Persona {
  const defaultTraits: PersonaTraits = {
    techLiteracy: "intermediate",
    patience: "moderate",
    ageGroup: "adult",
    devicePreference: "desktop",
    accessibilityNeeds: ["none"],
    domainKnowledge: 5,
    attentionToDetail: 5,
  };

  return {
    id: `custom-${params.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    name: params.name,
    description: params.description,
    background: params.background ?? `Custom persona: ${params.description}`,
    goals: params.goals,
    traits: { ...defaultTraits, ...params.traits },
    behaviorNotes: params.behaviorNotes ?? [],
  };
}

/**
 * Resolve a persona from a name/id string. Checks presets first, returns undefined if not found.
 */
export function resolvePersona(nameOrId: string): Persona | undefined {
  return getPresetByName(nameOrId) ?? getPresetById(nameOrId);
}

/**
 * Get the maximum steps this persona will take before giving up.
 */
export function getMaxSteps(persona: Persona): number {
  return PATIENCE_STEP_LIMITS[persona.traits.patience] ?? 12;
}

/**
 * Get the probability (0-1) this persona discovers a non-obvious UI element.
 */
export function getDiscoveryProbability(persona: Persona): number {
  return DISCOVERY_PROBABILITY[persona.traits.techLiteracy] ?? 0.5;
}

/**
 * Get viewport dimensions for this persona's device preference.
 */
export function getViewport(persona: Persona): { readonly width: number; readonly height: number } {
  return DEVICE_VIEWPORTS[persona.traits.devicePreference] ?? DEVICE_VIEWPORTS.desktop;
}

/**
 * List all available preset persona names.
 */
export function listPresetNames(): readonly string[] {
  return PERSONA_PRESETS.map((p) => p.name);
}
