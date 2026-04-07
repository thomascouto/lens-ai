import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigInspector } from "../services/ConfigInspector";

// ---------------------------------------------------------------------------
// VS Code mock — hoisted so the factory can reference these maps
// ---------------------------------------------------------------------------

const { configGetMap, configInspectMap, extensionMap } = vi.hoisted(() => ({
  configGetMap: new Map<string, Record<string, unknown>>(),
  configInspectMap: new Map<string, Record<string, unknown>>(),
  extensionMap: new Map<string, { isActive: boolean; packageJSON?: unknown }>(),
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: (ns: string) => ({
      get: (key: string) => configGetMap.get(ns)?.[key],
      inspect: (key: string) => configInspectMap.get(ns)?.[key],
    }),
  },
  extensions: {
    getExtension: (id: string) => extensionMap.get(id),
  },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: (p: string) => (p.includes(".continue") ? false : actual.existsSync(p)),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setGet(ns: string, key: string, value: unknown) {
  if (!configGetMap.has(ns)) configGetMap.set(ns, {});
  const nsConfig = configGetMap.get(ns);
  if (nsConfig) nsConfig[key] = value;
}

function setInspect(
  ns: string,
  key: string,
  value: {
    defaultValue?: unknown;
    globalValue?: unknown;
    workspaceValue?: unknown;
    workspaceFolderValue?: unknown;
  },
) {
  if (!configInspectMap.has(ns)) configInspectMap.set(ns, {});
  const nsConfig = configInspectMap.get(ns);
  if (nsConfig) nsConfig[key] = value;
}

function installExtension(id: string, isActive = true, packageJSON?: unknown) {
  extensionMap.set(id, { isActive, packageJSON });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConfigInspector", () => {
  let inspector: ConfigInspector;

  beforeEach(() => {
    configGetMap.clear();
    configInspectMap.clear();
    extensionMap.clear();
    inspector = new ConfigInspector();
  });

  // -------------------------------------------------------------------------
  // inspectKey
  // -------------------------------------------------------------------------

  describe("inspectKey", () => {
    it("returns null when inspect returns undefined", () => {
      const result = inspector.inspectKey("unknown.ns", "someKey");
      expect(result).toBeNull();
    });

    it("returns a ConfigScope when inspection data exists", () => {
      setInspect("github.copilot", "enable", { defaultValue: true });
      const result = inspector.inspectKey("github.copilot", "enable");
      expect(result).toMatchObject({
        defaultValue: true,
        effectiveValue: true,
        effectiveScope: "default",
      });
    });

    it("resolves effectiveScope to 'global' when globalValue is set", () => {
      setInspect("github.copilot", "enable", { defaultValue: true, globalValue: false });
      const result = inspector.inspectKey("github.copilot", "enable");
      expect(result).toMatchObject({ effectiveScope: "global", effectiveValue: false });
    });

    it("resolves effectiveScope to 'workspace' when workspaceValue is set", () => {
      setInspect("github.copilot", "enable", {
        defaultValue: true,
        globalValue: false,
        workspaceValue: true,
      });
      const result = inspector.inspectKey("github.copilot", "enable");
      expect(result).toMatchObject({ effectiveScope: "workspace", effectiveValue: true });
    });

    it("resolves effectiveScope to 'workspaceFolder' when workspaceFolderValue is set", () => {
      setInspect("github.copilot", "enable", {
        defaultValue: true,
        globalValue: false,
        workspaceValue: true,
        workspaceFolderValue: false,
      });
      const result = inspector.inspectKey("github.copilot", "enable");
      expect(result).toMatchObject({ effectiveScope: "workspaceFolder", effectiveValue: false });
    });

    it("exposes all scope levels in the returned object", () => {
      setInspect("continue", "telemetryEnabled", {
        defaultValue: true,
        globalValue: false,
        workspaceValue: true,
        workspaceFolderValue: undefined,
      });
      const result = inspector.inspectKey("continue", "telemetryEnabled");
      expect(result).toMatchObject({
        defaultValue: true,
        globalValue: false,
        workspaceValue: true,
        workspaceFolderValue: undefined,
      });
    });
  });

  // -------------------------------------------------------------------------
  // detectInstalledEngines
  // -------------------------------------------------------------------------

  describe("detectInstalledEngines", () => {
    it("returns all 14 engine definitions", () => {
      const engines = inspector.detectInstalledEngines();
      expect(engines).toHaveLength(14);
    });

    it("marks extension as not installed when getExtension returns undefined", () => {
      const engines = inspector.detectInstalledEngines();
      const copilot = engines.find((e) => e.id === "copilot");
      expect(copilot).toMatchObject({ isInstalled: false, isEnabled: false });
    });

    it("marks extension as installed and enabled when active", () => {
      installExtension("GitHub.copilot");
      const engines = inspector.detectInstalledEngines();
      const copilot = engines.find((e) => e.id === "copilot");
      expect(copilot).toMatchObject({ isInstalled: true, isEnabled: true });
    });

    it("marks extension as installed but not enabled when inactive", () => {
      installExtension("GitHub.copilot", false);
      const engines = inspector.detectInstalledEngines();
      const copilot = engines.find((e) => e.id === "copilot");
      expect(copilot).toMatchObject({ isInstalled: true, isEnabled: false });
    });

    it("resolves copilot model from selectedCompletionModel setting", () => {
      installExtension("GitHub.copilot");
      setGet("github.copilot", "selectedCompletionModel", "gpt-4o");
      const engines = inspector.detectInstalledEngines();
      const copilot = engines.find((e) => e.id === "copilot");
      expect(copilot?.model).toBe("gpt-4o");
    });

    it("resolves continue model from VS Code setting", () => {
      installExtension("Continue.continue");
      setGet("continue", "defaultModel", "claude-3.5-sonnet");
      const engines = inspector.detectInstalledEngines();
      const cont = engines.find((e) => e.id === "continue");
      expect(cont?.model).toBe("claude-3.5-sonnet");
    });

    it("resolves cline model from vsCodeLmModelSelector", () => {
      installExtension("saoudrizwan.claude-dev");
      setGet("cline", "vsCodeLmModelSelector", { vendor: "anthropic", family: "claude-3.5" });
      const engines = inspector.detectInstalledEngines();
      const cline = engines.find((e) => e.id === "cline");
      expect(cline?.model).toBe("anthropic/claude-3.5");
    });

    it("returns undefined model when cline selector has no vendor/family", () => {
      installExtension("saoudrizwan.claude-dev");
      setGet("cline", "vsCodeLmModelSelector", {});
      const engines = inspector.detectInstalledEngines();
      const cline = engines.find((e) => e.id === "cline");
      expect(cline?.model).toBeUndefined();
    });

    it("uses fallbackModel for engines without a dedicated resolver (codeium)", () => {
      installExtension("Codeium.codeium");
      setInspect("codeium", "model", { defaultValue: "gpt-4" });
      const engines = inspector.detectInstalledEngines();
      const codeium = engines.find((e) => e.id === "codeium");
      expect(codeium?.model).toBe("gpt-4");
    });

    it("returns undefined model when no resolver and no fallback config", () => {
      installExtension("Codeium.codeium");
      const engines = inspector.detectInstalledEngines();
      const codeium = engines.find((e) => e.id === "codeium");
      expect(codeium?.model).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getAllConfigEntries
  // -------------------------------------------------------------------------

  describe("getAllConfigEntries", () => {
    it("returns an empty array when all inspect calls return undefined", () => {
      const entries = inspector.getAllConfigEntries();
      expect(entries).toEqual([]);
    });

    it("returns entries for configured keys", () => {
      setInspect("github.copilot", "enable", { defaultValue: true });
      const entries = inspector.getAllConfigEntries();
      expect(entries.length).toBeGreaterThan(0);
      const entry = entries.find((e) => e.fullKey === "github.copilot.enable");
      expect(entry).toBeDefined();
      expect(entry?.namespace).toBe("github.copilot");
      expect(entry?.key).toBe("enable");
    });

    it("assembles fullKey as namespace.key", () => {
      setInspect("continue", "telemetryEnabled", { defaultValue: false });
      const entries = inspector.getAllConfigEntries();
      const entry = entries.find((e) => e.key === "telemetryEnabled");
      expect(entry?.fullKey).toBe("continue.telemetryEnabled");
    });
  });

  // -------------------------------------------------------------------------
  // getEntriesForEngine
  // -------------------------------------------------------------------------

  describe("getEntriesForEngine", () => {
    it("returns an empty array for an unknown engine id", () => {
      const entries = inspector.getEntriesForEngine("nonexistent");
      expect(entries).toEqual([]);
    });

    it("returns entries only for the requested engine", () => {
      setInspect("github.copilot", "enable", { defaultValue: true });
      setInspect("continue", "telemetryEnabled", { defaultValue: false });

      const entries = inspector.getEntriesForEngine("copilot");
      expect(entries.every((e) => e.namespace === "github.copilot")).toBe(true);
    });

    it("returns empty array when engine keys have no inspection data", () => {
      const entries = inspector.getEntriesForEngine("cline");
      expect(entries).toEqual([]);
    });

    it("returns multiple entries for an engine with multiple keys", () => {
      setInspect("github.copilot", "enable", { defaultValue: true });
      setInspect("github.copilot", "editor.enableAutoCompletions", { defaultValue: true });
      const entries = inspector.getEntriesForEngine("copilot");
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });
  });
});
