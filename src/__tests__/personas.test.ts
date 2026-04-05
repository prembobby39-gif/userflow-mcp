import { describe, it, expect } from "vitest";
import {
  resolvePersona,
  createCustomPersona,
  listPresetNames,
  PERSONA_PRESETS,
  getMaxSteps,
  getDiscoveryProbability,
  getViewport,
} from "../personas/engine.js";

describe("Persona Presets", () => {
  it("should have at least 8 built-in presets", () => {
    expect(PERSONA_PRESETS.length).toBeGreaterThanOrEqual(8);
  });

  it("each preset should have required fields", () => {
    for (const persona of PERSONA_PRESETS) {
      expect(persona.id).toBeTruthy();
      expect(persona.name).toBeTruthy();
      expect(persona.description).toBeTruthy();
      expect(persona.background).toBeTruthy();
      expect(persona.goals.length).toBeGreaterThan(0);
      expect(persona.traits).toBeDefined();
      expect(persona.traits.techLiteracy).toBeTruthy();
      expect(persona.traits.patience).toBeTruthy();
      expect(persona.traits.ageGroup).toBeTruthy();
      expect(persona.traits.devicePreference).toBeTruthy();
    }
  });

  it("each preset should have unique id and name", () => {
    const ids = PERSONA_PRESETS.map((p) => p.id);
    const names = PERSONA_PRESETS.map((p) => p.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("should list all preset names", () => {
    const names = listPresetNames();
    expect(names.length).toBe(PERSONA_PRESETS.length);
    expect(names).toContain("Alex");
    expect(names).toContain("Morgan");
    expect(names).toContain("Patricia");
  });
});

describe("resolvePersona", () => {
  it("should resolve by name (case-insensitive)", () => {
    const persona = resolvePersona("Alex");
    expect(persona).toBeDefined();
    expect(persona!.name).toBe("Alex");
  });

  it("should resolve by id", () => {
    const firstPreset = PERSONA_PRESETS[0];
    const persona = resolvePersona(firstPreset.id);
    expect(persona).toBeDefined();
    expect(persona!.id).toBe(firstPreset.id);
  });

  it("should return undefined for unknown persona", () => {
    expect(resolvePersona("nonexistent")).toBeUndefined();
  });
});

describe("createCustomPersona", () => {
  it("should create a persona with provided fields", () => {
    const persona = createCustomPersona({
      name: "Test User",
      description: "A test persona",
      goals: ["test the app"],
    });

    expect(persona.name).toBe("Test User");
    expect(persona.description).toBe("A test persona");
    expect(persona.goals).toEqual(["test the app"]);
    expect(persona.id).toContain("custom-test-user");
  });

  it("should use default traits when not provided", () => {
    const persona = createCustomPersona({
      name: "Default",
      description: "Default traits",
      goals: ["browse"],
    });

    expect(persona.traits.techLiteracy).toBe("intermediate");
    expect(persona.traits.patience).toBe("moderate");
    expect(persona.traits.devicePreference).toBe("desktop");
  });

  it("should override traits when provided", () => {
    const persona = createCustomPersona({
      name: "Custom",
      description: "Custom traits",
      goals: ["test"],
      traits: {
        techLiteracy: "expert",
        patience: "very_low",
        devicePreference: "mobile",
      },
    });

    expect(persona.traits.techLiteracy).toBe("expert");
    expect(persona.traits.patience).toBe("very_low");
    expect(persona.traits.devicePreference).toBe("mobile");
  });
});

describe("Persona Utilities", () => {
  it("getMaxSteps should return patience-based limits", () => {
    const alex = resolvePersona("Alex")!;
    const morgan = resolvePersona("Morgan")!;

    const alexSteps = getMaxSteps(alex);
    const morganSteps = getMaxSteps(morgan);

    expect(alexSteps).toBeGreaterThan(0);
    expect(morganSteps).toBeGreaterThan(0);
    // Alex (moderate patience) should have more steps than Morgan (low patience)
    expect(alexSteps).toBeGreaterThan(morganSteps);
  });

  it("getDiscoveryProbability should vary by tech literacy", () => {
    const alex = resolvePersona("Alex")!; // novice
    const morgan = resolvePersona("Morgan")!; // expert

    const alexProb = getDiscoveryProbability(alex);
    const morganProb = getDiscoveryProbability(morgan);

    expect(morganProb).toBeGreaterThan(alexProb);
    expect(alexProb).toBeGreaterThanOrEqual(0);
    expect(morganProb).toBeLessThanOrEqual(1);
  });

  it("getViewport should return dimensions for device preference", () => {
    const alex = resolvePersona("Alex")!; // mobile
    const morgan = resolvePersona("Morgan")!; // desktop

    const alexViewport = getViewport(alex);
    const morganViewport = getViewport(morgan);

    expect(alexViewport.width).toBeLessThan(morganViewport.width);
    expect(alexViewport.width).toBe(375); // mobile
    expect(morganViewport.width).toBe(1440); // desktop
  });
});
