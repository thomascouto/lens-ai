import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { extensions, workspace } from "vscode";

export interface ConfigScope {
  defaultValue: unknown;
  globalValue: unknown;
  workspaceValue: unknown;
  workspaceFolderValue: unknown;
  effectiveValue: unknown;
  effectiveScope: "default" | "global" | "workspace" | "workspaceFolder";
}

export interface ConfigEntry {
  namespace: string;
  key: string;
  fullKey: string;
  scope: ConfigScope;
}

export interface AiEngine {
  id: string;
  label: string;
  extensionId: string;
  namespace: string;
  isInstalled: boolean;
  isEnabled: boolean;
  model?: string;
  keys: string[];
}

// ---------------------------------------------------------------------------
// Engine definitions
// ---------------------------------------------------------------------------

const AI_ENGINES: Omit<AiEngine, "isInstalled" | "isEnabled">[] = [
  {
    id: "copilot",
    label: "GitHub Copilot",
    extensionId: "GitHub.copilot",
    namespace: "github.copilot",
    keys: ["enable", "editor.enableAutoCompletions", "editor.enableCodeActions"],
  },
  {
    id: "copilot-chat",
    label: "GitHub Copilot Chat",
    extensionId: "GitHub.copilot-chat",
    namespace: "github.copilot.chat",
    keys: ["welcomeMessage", "localeOverride", "followUps"],
  },
  {
    id: "continue",
    label: "Continue.dev",
    extensionId: "Continue.continue",
    namespace: "continue",
    keys: ["telemetryEnabled", "enableTabAutocomplete", "showInlineTip", "remoteConfigServerUrl"],
  },
  {
    id: "cline",
    label: "Cline",
    extensionId: "saoudrizwan.claude-dev",
    namespace: "cline",
    keys: ["vsCodeLmModelSelector", "enableCheckpoints"],
  },
  {
    id: "codeium",
    label: "Codeium",
    extensionId: "Codeium.codeium",
    namespace: "codeium",
    keys: ["enableConfig", "enableSearch", "enableCodeLens"],
  },
];

// ---------------------------------------------------------------------------
// Model resolvers — one per engine id
// ---------------------------------------------------------------------------

type ModelResolver = () => string | undefined;

const MODEL_RESOLVERS: Partial<Record<string, ModelResolver>> = {
  copilot: resolveCopilotModel,
  "copilot-chat": resolveCopilotModel,
  continue: resolveContinueModel,
  cline: resolveClineModel,
};

/**
 * GitHub Copilot exposes the selected model through several possible keys
 * depending on the extension version. We try them all in priority order.
 */
function resolveCopilotModel(): string | undefined {
  const candidates: Array<[string, string]> = [
    // Copilot ≥ 1.200 (2024+)
    ["github.copilot.selectedCompletionModel", ""],
    ["github.copilot.advanced", "model"],
    // Copilot Chat
    ["github.copilot.chat", "defaultModel"],
    ["github.copilot.chat", "model"],
  ];

  for (const [ns, key] of candidates) {
    if (key === "") {
      // flat key — the namespace IS the full dotted key
      const dotIndex = ns.lastIndexOf(".");
      if (dotIndex === -1) {
        continue;
      }
      const parentNs = ns.substring(0, dotIndex);
      const lastKey = ns.substring(dotIndex + 1);
      const val = workspace.getConfiguration(parentNs).get<string>(lastKey);
      if (val) {
        return val;
      }
    } else {
      const val = workspace.getConfiguration(ns).get<string>(key);
      if (val) {
        return val;
      }
    }
  }

  // Fallback: read the extension's package.json for the default model value
  const ext = extensions.getExtension("GitHub.copilot");
  if (ext) {
    try {
      interface CopilotPkg {
        contributes?: {
          configuration?: {
            properties?: {
              "github.copilot.advanced"?: {
                properties?: { model?: { default?: string } };
              };
            };
          };
        };
      }
      const pkg = ext.packageJSON as CopilotPkg;
      const pkgModel =
        pkg.contributes?.configuration?.properties?.["github.copilot.advanced"]?.properties?.model
          ?.default;
      if (pkgModel) {
        return `${pkgModel} (default)`;
      }
    } catch {
      /* ignore */
    }
  }

  return undefined;
}

/**
 * Continue.dev stores its active model in ~/.continue/config.json.
 * We parse that file to extract the first/default model name.
 */
function resolveContinueModel(): string | undefined {
  // 1. Try VS Code setting (newer Continue versions)
  const settingModel = workspace.getConfiguration("continue").get<string>("defaultModel");
  if (settingModel) {
    return settingModel;
  }

  // 2. Parse ~/.continue/config.json
  const configPaths = [
    join(homedir(), ".continue", "config.json"),
    join(homedir(), ".continue", "config.ts"), // TS version — skip parsing
  ];

  for (const cfgPath of configPaths) {
    if (!existsSync(cfgPath) || cfgPath.endsWith(".ts")) {
      continue;
    }
    try {
      const raw = readFileSync(cfgPath, "utf8");
      const cfg = JSON.parse(raw) as {
        models?: Array<{ model?: string; title?: string }>;
        defaultModel?: string;
        tabAutocompleteModel?: { model?: string };
      };

      if (cfg.defaultModel) {
        return cfg.defaultModel;
      }
      if (cfg.models && cfg.models.length > 0) {
        const first = cfg.models[0];
        return first.title ?? first.model;
      }
    } catch {
      /* malformed JSON — skip */
    }
  }

  return undefined;
}

/**
 * Cline exposes the selected model via the vsCodeLmModelSelector setting.
 */
function resolveClineModel(): string | undefined {
  const selector = workspace
    .getConfiguration("cline")
    .get<{ vendor?: string; family?: string }>("vsCodeLmModelSelector");

  if (selector) {
    const parts = [selector.vendor, selector.family].filter(Boolean);
    if (parts.length > 0) {
      return parts.join("/");
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// ConfigInspector
// ---------------------------------------------------------------------------

export class ConfigInspector {
  detectInstalledEngines(): AiEngine[] {
    return AI_ENGINES.map((def) => {
      const ext = extensions.getExtension(def.extensionId);
      const isInstalled = ext !== undefined;
      const isEnabled = isInstalled && ext.isActive;

      const engine: AiEngine = { ...def, isInstalled, isEnabled };

      if (isInstalled) {
        const resolver = MODEL_RESOLVERS[def.id];
        engine.model = resolver?.() ?? this.fallbackModel(def.namespace);
      }

      return engine;
    });
  }

  private fallbackModel(namespace: string): string | undefined {
    for (const key of ["model", "defaultModel", "selectedModel"]) {
      const val = this.inspectKey(namespace, key)?.effectiveValue;
      if (typeof val === "string" && val) {
        return val;
      }
    }
    return undefined;
  }

  inspectKey(namespace: string, key: string): ConfigScope | null {
    try {
      const config = workspace.getConfiguration(namespace);
      const inspection = config.inspect(key);

      if (inspection === undefined) {
        return null;
      }

      const effectiveValue =
        inspection.workspaceFolderValue ??
        inspection.workspaceValue ??
        inspection.globalValue ??
        inspection.defaultValue;

      let effectiveScope: ConfigScope["effectiveScope"] = "default";
      if (inspection.workspaceFolderValue !== undefined) {
        effectiveScope = "workspaceFolder";
      } else if (inspection.workspaceValue !== undefined) {
        effectiveScope = "workspace";
      } else if (inspection.globalValue !== undefined) {
        effectiveScope = "global";
      }

      return {
        defaultValue: inspection.defaultValue,
        globalValue: inspection.globalValue,
        workspaceValue: inspection.workspaceValue,
        workspaceFolderValue: inspection.workspaceFolderValue,
        effectiveValue,
        effectiveScope,
      };
    } catch {
      return null;
    }
  }

  getAllConfigEntries(): ConfigEntry[] {
    const entries: ConfigEntry[] = [];
    for (const engine of AI_ENGINES) {
      for (const key of engine.keys) {
        const scope = this.inspectKey(engine.namespace, key);
        if (scope !== null) {
          entries.push({
            namespace: engine.namespace,
            key,
            fullKey: `${engine.namespace}.${key}`,
            scope,
          });
        }
      }
    }
    return entries;
  }

  getEntriesForEngine(engineId: string): ConfigEntry[] {
    const engine = AI_ENGINES.find((e) => e.id === engineId);
    if (!engine) {
      return [];
    }

    return engine.keys.reduce<ConfigEntry[]>((acc, key) => {
      const scope = this.inspectKey(engine.namespace, key);
      if (scope !== null) {
        acc.push({
          namespace: engine.namespace,
          key,
          fullKey: `${engine.namespace}.${key}`,
          scope,
        });
      }
      return acc;
    }, []);
  }
}
