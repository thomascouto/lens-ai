import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileScope = "system" | "user" | "project" | "projectLocal";

/** Precedence order: later scopes override earlier ones. */
const SCOPE_PRECEDENCE: FileScope[] = ["system", "user", "project", "projectLocal"];

export interface ScopedFile {
  scope: FileScope;
  filePath: string;
  exists: boolean;
  data: Record<string, unknown>;
}

export interface FileConfigValue {
  scope: FileScope;
  filePath: string;
  value: unknown;
}

export interface FileConfigEntry {
  key: string;
  /** All scopes that define this key, in precedence order. */
  values: FileConfigValue[];
  effectiveValue: unknown;
  effectiveScope: FileScope;
}

export interface EngineFileConfig {
  engineId: string;
  /** Every scoped file path (including non-existent ones, for UI purposes). */
  scopedFiles: ScopedFile[];
  entries: FileConfigEntry[];
}

// ---------------------------------------------------------------------------
// Cross-platform helpers
// ---------------------------------------------------------------------------

function isWindows(): boolean {
  return process.platform === "win32";
}

function isMac(): boolean {
  return process.platform === "darwin";
}

/** %APPDATA% on Windows, ~/Library/Application Support on Mac, ~/.config on Linux. */
function appConfigDir(...segments: string[]): string {
  if (isWindows()) {
    const base = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(base, ...segments);
  }
  if (isMac()) {
    return join(homedir(), "Library", "Application Support", ...segments);
  }
  return join(homedir(), ".config", ...segments);
}

// ---------------------------------------------------------------------------
// File definition registry
// ---------------------------------------------------------------------------

type FileDef = {
  scope: FileScope;
  resolvePath: (workspaceRoot?: string) => string | undefined;
};

const ENGINE_FILE_DEFS: Partial<Record<string, FileDef[]>> = {
  // ── Claude Code ──────────────────────────────────────────────────────────
  "claude-code": [
    {
      scope: "system",
      resolvePath: () => {
        if (isWindows()) return undefined; // no system scope on Windows
        return "/etc/claude/settings.json";
      },
    },
    {
      scope: "user",
      resolvePath: () => {
        // Windows: %APPDATA%\Claude\settings.json
        // Mac/Linux: ~/.claude/settings.json
        if (isWindows()) return join(appConfigDir("Claude"), "settings.json");
        return join(homedir(), ".claude", "settings.json");
      },
    },
    {
      scope: "project",
      resolvePath: (root) => (root ? join(root, ".claude", "settings.json") : undefined),
    },
    {
      scope: "projectLocal",
      resolvePath: (root) => (root ? join(root, ".claude", "settings.local.json") : undefined),
    },
  ],

  // ── Continue.dev ─────────────────────────────────────────────────────────
  continue: [
    {
      scope: "user",
      resolvePath: () => join(homedir(), ".continue", "config.json"),
    },
    {
      scope: "project",
      resolvePath: (root) => (root ? join(root, ".continue", "config.json") : undefined),
    },
  ],

  // ── Cline ────────────────────────────────────────────────────────────────
  cline: [
    {
      scope: "user",
      resolvePath: () => {
        if (isWindows())
          return join(
            appConfigDir("Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
            "settings",
            "cline_mcp_settings.json",
          );
        if (isMac())
          return join(
            homedir(),
            "Library",
            "Application Support",
            "Code",
            "User",
            "globalStorage",
            "saoudrizwan.claude-dev",
            "settings",
            "cline_mcp_settings.json",
          );
        return join(
          homedir(),
          ".config",
          "Code",
          "User",
          "globalStorage",
          "saoudrizwan.claude-dev",
          "settings",
          "cline_mcp_settings.json",
        );
      },
    },
  ],

  // ── Roo Code ─────────────────────────────────────────────────────────────
  "roo-code": [
    {
      scope: "user",
      resolvePath: () => {
        if (isWindows())
          return join(
            appConfigDir("Code", "User", "globalStorage", "RooVeterinaryInc.roo-cline"),
            "settings",
            "cline_mcp_settings.json",
          );
        if (isMac())
          return join(
            homedir(),
            "Library",
            "Application Support",
            "Code",
            "User",
            "globalStorage",
            "RooVeterinaryInc.roo-cline",
            "settings",
            "cline_mcp_settings.json",
          );
        return join(
          homedir(),
          ".config",
          "Code",
          "User",
          "globalStorage",
          "RooVeterinaryInc.roo-cline",
          "settings",
          "cline_mcp_settings.json",
        );
      },
    },
    {
      scope: "project",
      resolvePath: (root) => (root ? join(root, ".roo", "config.json") : undefined),
    },
  ],

  // ── Codeium ──────────────────────────────────────────────────────────────
  codeium: [
    {
      scope: "user",
      resolvePath: () => {
        if (isWindows()) return join(appConfigDir("Codeium"), "config.json");
        if (isMac())
          return join(homedir(), "Library", "Application Support", "Codeium", "config.json");
        return join(homedir(), ".codeium", "config.json");
      },
    },
  ],

  // ── Sourcegraph Cody ─────────────────────────────────────────────────────
  cody: [
    {
      scope: "user",
      resolvePath: () => {
        if (isWindows()) return join(appConfigDir("Sourcegraph", "Cody"), "config.json");
        if (isMac())
          return join(
            homedir(),
            "Library",
            "Application Support",
            "Sourcegraph",
            "Cody",
            "config.json",
          );
        return join(homedir(), ".config", "sourcegraph", "cody.json");
      },
    },
  ],

  // ── Amazon Q ─────────────────────────────────────────────────────────────
  "amazon-q": [
    {
      scope: "user",
      resolvePath: () => join(homedir(), ".aws", "amazonq", "profileconfig.json"),
    },
    {
      scope: "project",
      resolvePath: (root) => (root ? join(root, ".amazonq", "config.json") : undefined),
    },
  ],

  // ── Gemini Code Assist ───────────────────────────────────────────────────
  gemini: [
    {
      scope: "user",
      resolvePath: () => {
        if (isWindows()) return join(appConfigDir("Google", "gemini-code-assist"), "config.json");
        if (isMac())
          return join(
            homedir(),
            "Library",
            "Application Support",
            "Google",
            "gemini-code-assist",
            "config.json",
          );
        return join(homedir(), ".config", "google", "gemini-code-assist", "config.json");
      },
    },
    {
      scope: "project",
      resolvePath: (root) => (root ? join(root, ".gemini", "settings.json") : undefined),
    },
  ],

  // ── Gemini CLI ───────────────────────────────────────────────────────────
  "gemini-cli": [
    {
      scope: "user",
      resolvePath: () => join(homedir(), ".gemini", "settings.json"),
    },
    {
      scope: "project",
      resolvePath: (root) => (root ? join(root, ".gemini", "settings.json") : undefined),
    },
  ],

  // ── Codex CLI ────────────────────────────────────────────────────────────
  "codex-cli": [
    {
      scope: "user",
      resolvePath: () => {
        if (isWindows()) return join(appConfigDir("OpenAI", "Codex"), "config.json");
        return join(homedir(), ".codex", "config.json");
      },
    },
  ],

  // ── Tabnine ──────────────────────────────────────────────────────────────
  tabnine: [
    {
      scope: "user",
      resolvePath: () => join(homedir(), ".tabnine", "tabnine_config.json"),
    },
  ],

  // ── Supermaven ───────────────────────────────────────────────────────────
  supermaven: [
    {
      scope: "user",
      resolvePath: () => {
        if (isWindows()) return join(appConfigDir("supermaven"), "config.json");
        return join(homedir(), ".supermaven", "config.json");
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Type guards + JSON reader
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// FileConfigReader
// ---------------------------------------------------------------------------

export class FileConfigReader {
  constructor(private readonly workspaceRoot?: string) {}

  readEngineConfig(engineId: string): EngineFileConfig | null {
    const defs = ENGINE_FILE_DEFS[engineId];
    if (!defs) return null;

    const scopedFiles: ScopedFile[] = [];
    for (const def of defs) {
      const filePath = def.resolvePath(this.workspaceRoot);
      if (!filePath) continue;

      const exists = existsSync(filePath);
      const data = exists ? (readJson(filePath) ?? {}) : {};
      scopedFiles.push({ scope: def.scope, filePath, exists, data });
    }

    return {
      engineId,
      scopedFiles,
      entries: this.mergeScopes(scopedFiles),
    };
  }

  readAllEngineConfigs(): EngineFileConfig[] {
    return Object.keys(ENGINE_FILE_DEFS)
      .map((id) => this.readEngineConfig(id))
      .filter((cfg): cfg is EngineFileConfig => cfg !== null);
  }

  getSupportedEngineIds(): string[] {
    return Object.keys(ENGINE_FILE_DEFS);
  }

  private mergeScopes(scopedFiles: ScopedFile[]): FileConfigEntry[] {
    const flatByScope = new Map<FileScope, { flat: Record<string, unknown>; filePath: string }>();
    const allKeys = new Set<string>();

    for (const sf of scopedFiles) {
      if (!sf.exists) continue;
      const flat = flattenObject(sf.data);
      flatByScope.set(sf.scope, { flat, filePath: sf.filePath });
      Object.keys(flat).forEach((k) => allKeys.add(k));
    }

    const entries: FileConfigEntry[] = [];

    for (const key of allKeys) {
      const values: FileConfigValue[] = [];

      // Collect values in ascending precedence order
      for (const scope of SCOPE_PRECEDENCE) {
        const entry = flatByScope.get(scope);
        if (!entry) continue;
        if (key in entry.flat) {
          values.push({ scope, filePath: entry.filePath, value: entry.flat[key] });
        }
      }

      // Last in precedence order wins
      const effective = values[values.length - 1];
      entries.push({
        key,
        values,
        effectiveValue: effective.value,
        effectiveScope: effective.scope,
      });
    }

    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }
}
