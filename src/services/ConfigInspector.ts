import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { extensions, workspace } from "vscode";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

// Internal definition type — allows CLI-only tools that have no VS Code extension.
interface EngineDefinition extends Omit<AiEngine, "isInstalled" | "isEnabled"> {
  /** If provided, replaces the default extension-presence check. */
  cliDetect?: () => boolean;
}

// ---------------------------------------------------------------------------
// Engine definitions
// ---------------------------------------------------------------------------

const AI_ENGINES: EngineDefinition[] = [
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
    id: "roo-code",
    label: "Roo Code",
    extensionId: "RooVeterinaryInc.roo-cline",
    namespace: "roo-cline",
    keys: ["vsCodeLmModelSelector", "enableCheckpoints", "mode"],
  },
  {
    id: "codeium",
    label: "Codeium",
    extensionId: "Codeium.codeium",
    namespace: "codeium",
    keys: ["enableConfig", "enableSearch", "enableCodeLens"],
  },
  {
    id: "amazon-q",
    label: "Amazon Q",
    extensionId: "AmazonWebServices.amazon-q-vscode",
    namespace: "amazonQ",
    keys: ["telemetry", "shareContentWithAWS", "workspaceContext"],
  },
  {
    id: "tabnine",
    label: "Tabnine",
    extensionId: "TabNine.tabnine-vscode",
    namespace: "tabnine",
    keys: ["experimentalAutoImports", "disable"],
  },
  {
    id: "supermaven",
    label: "Supermaven",
    extensionId: "supermaven.supermaven",
    namespace: "supermaven",
    keys: ["enable"],
  },
  {
    id: "cody",
    label: "Sourcegraph Cody",
    extensionId: "sourcegraph.cody-ai",
    namespace: "cody",
    keys: ["enabled", "serverEndpoint", "experimental.chat"],
  },
  {
    id: "gemini",
    label: "Gemini Code Assist",
    extensionId: "google.cloudcode",
    namespace: "cloudcode",
    keys: ["enableCloudCodeCopilot", "duetAI.project"],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    extensionId: "",
    namespace: "claude-code",
    keys: [],
    cliDetect: () => existsSync(join(homedir(), ".claude")),
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    extensionId: "",
    namespace: "gemini-cli",
    keys: [],
    cliDetect: () => existsSync(join(homedir(), ".gemini")),
  },
  {
    id: "codex-cli",
    label: "Codex CLI",
    extensionId: "",
    namespace: "codex-cli",
    keys: [],
    cliDetect: () => existsSync(join(homedir(), ".codex")),
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
  "roo-code": resolveRooCodeModel,
  cody: resolveCodyModel,
  "claude-code": resolveClaudeCodeModel,
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
      // packageJSON is `any` from the VS Code API; go through unknown to avoid unsafe-assignment
      const pkg = ext.packageJSON as unknown as CopilotPkg;
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
      const parsed: unknown = JSON.parse(readFileSync(cfgPath, "utf8"));
      if (!isRecord(parsed)) continue;

      if (typeof parsed["defaultModel"] === "string") {
        return parsed["defaultModel"];
      }
      if (Array.isArray(parsed["models"]) && parsed["models"].length > 0) {
        const first: unknown = parsed["models"][0];
        if (isRecord(first)) {
          const title = typeof first["title"] === "string" ? first["title"] : undefined;
          const model = typeof first["model"] === "string" ? first["model"] : undefined;
          return title ?? model;
        }
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

/**
 * Roo Code is a fork of Cline and uses the same vsCodeLmModelSelector pattern.
 */
function resolveRooCodeModel(): string | undefined {
  const selector = workspace
    .getConfiguration("roo-cline")
    .get<{ vendor?: string; family?: string }>("vsCodeLmModelSelector");

  if (selector) {
    const parts = [selector.vendor, selector.family].filter(Boolean);
    if (parts.length > 0) {
      return parts.join("/");
    }
  }
  return undefined;
}

/**
 * Sourcegraph Cody stores the active model in a chat-specific setting.
 */
function resolveCodyModel(): string | undefined {
  return workspace.getConfiguration("cody").get<string>("chat.models.default");
}

/**
 * Claude Code stores its active model in ~/.claude/settings.json.
 */
function resolveClaudeCodeModel(): string | undefined {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (isRecord(parsed) && typeof parsed["model"] === "string") {
      return parsed["model"];
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// ConfigInspector
// ---------------------------------------------------------------------------

export class ConfigInspector {
  detectInstalledEngines(): AiEngine[] {
    return AI_ENGINES.map((def) => {
      let isInstalled: boolean;
      let isEnabled: boolean;

      if (def.cliDetect) {
        isInstalled = def.cliDetect();
        isEnabled = isInstalled;
      } else {
        const ext = extensions.getExtension(def.extensionId);
        isInstalled = ext !== undefined;
        isEnabled = ext?.isActive ?? false;
      }

      const engine: AiEngine = {
        id: def.id,
        label: def.label,
        extensionId: def.extensionId,
        namespace: def.namespace,
        keys: def.keys,
        isInstalled,
        isEnabled,
      };

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
