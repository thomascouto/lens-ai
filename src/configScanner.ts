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

export { ConfigInspector, type AiEngine, type ConfigEntry };

// ---------------------------------------------------------------------------
// Rule / Instruction file detection
// ---------------------------------------------------------------------------

const RULE_FILES = [
  ".cursorrules",
  ".clinerules",
  ".instructions.md",
  ".github/copilot-instructions.md",
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
  ruleFiles: RuleFile[];
}

/**
 * One-call scan: detects engines, config hierarchy, and rule files.
 */
export function scanWorkspace(): ScanResult {
  const inspector = new ConfigInspector();
  return {
    engines: inspector.detectInstalledEngines(),
    configEntries: inspector.getAllConfigEntries(),
    ruleFiles: detectRuleFiles(),
  };
}
