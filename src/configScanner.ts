/**
 * configScanner.ts
 *
 * Standalone agnostic scanner that:
 *   1. Identifies installed AI engines and their active model/config keys.
 *   2. Detects rule/instruction files in the workspace root.
 *   3. Re-exports the ConfigInspector service for direct use.
 *
 * This module is the flat-structure entry point described in init.md.
 * The underlying logic lives in src/services/ConfigInspector.ts and
 * src/utils/SecurityScanner.ts.
 */
import { existsSync, statSync } from "fs";
import { join } from "path";

import { workspace } from "vscode";

import { type AiEngine, type ConfigEntry, ConfigInspector } from "./services/ConfigInspector";
import {
  type EngineFileConfig,
  type FileConfigEntry,
  FileConfigReader,
  type FileScope,
  type ScopedFile,
} from "./services/FileConfigReader";

export {
  ConfigInspector,
  FileConfigReader,
  type AiEngine,
  type ConfigEntry,
  type EngineFileConfig,
  type FileConfigEntry,
  type FileScope,
  type ScopedFile,
};

// ---------------------------------------------------------------------------
// Rule / Instruction file detection
// ---------------------------------------------------------------------------

const RULE_FILES = [
  // GitHub Copilot
  ".github/copilot-instructions.md",
  ".instructions.md",
  // Cursor
  ".cursorrules",
  // Cline / Roo Code
  ".clinerules",
  ".roomodes",
  // Claude Code
  "CLAUDE.md",
  ".claude/CLAUDE.md",
  // Windsurf
  ".windsurfrules",
  // Aider
  ".aiderrules",
  // OpenAI Codex CLI
  "AGENTS.md",
  // Gemini CLI
  "GEMINI.md",
  ".gemini/GEMINI.md",
];

export interface RuleFile {
  filename: string;
  fullPath: string;
  sizeBytes: number;
}

/**
 * Returns all instruction/rule files found in any workspace folder root.
 */
export function detectRuleFiles(): RuleFile[] {
  const workspaceFolders = workspace.workspaceFolders;
  if (!workspaceFolders) {
    return [];
  }

  const found: RuleFile[] = [];
  for (const folder of workspaceFolders) {
    for (const filename of RULE_FILES) {
      const fullPath = join(folder.uri.fsPath, filename);
      if (existsSync(fullPath)) {
        const stat = statSync(fullPath);
        found.push({ filename, fullPath, sizeBytes: stat.size });
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Convenience: scan all AI namespaces at once
// ---------------------------------------------------------------------------

export interface ScanResult {
  engines: AiEngine[];
  configEntries: ConfigEntry[];
  fileConfigs: EngineFileConfig[];
  ruleFiles: RuleFile[];
}

/**
 * One-call scan: detects engines, VS Code config hierarchy, file-based configs, and rule files.
 */
export function scanWorkspace(): ScanResult {
  const inspector = new ConfigInspector();
  const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
  const fileReader = new FileConfigReader(workspaceRoot);

  return {
    engines: inspector.detectInstalledEngines(),
    configEntries: inspector.getAllConfigEntries(),
    fileConfigs: fileReader.readAllEngineConfigs(),
    ruleFiles: detectRuleFiles(),
  };
}
