import { readdirSync, readFileSync, statSync } from "fs";
import type { Dirent } from "fs";
import { basename, extname, join } from "path";

import { workspace } from "vscode";

export interface SecurityFinding {
  file: string;
  line: number;
  pattern: string;
  masked: string;
}

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: "OpenAI API Key", regex: /sk-[a-zA-Z0-9]{48,}/g },
  { name: "Anthropic API Key", regex: /sk-ant-[a-zA-Z0-9-_]{50,}/g },
  { name: "Google API Key", regex: /AIza[0-9A-Za-z-_]{35}/g },
  { name: "GitHub Token", regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/g },
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "Hugging Face Token", regex: /hf_[a-zA-Z0-9]{34,}/g },
  { name: "Generic Bearer Token", regex: /bearer\s+[a-zA-Z0-9\-._~+/]{40,}/gi },
];

const SCAN_EXTENSIONS = [".json", ".env", ".yaml", ".yml", ".toml", ".txt"];

const SCAN_FILENAMES = [
  ".cursorrules",
  ".clinerules",
  ".instructions.md",
  "copilot-instructions.md",
];

export class SecurityScanner {
  private findings: SecurityFinding[] = [];

  async scanWorkspace(): Promise<SecurityFinding[]> {
    this.findings = [];

    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    for (const folder of workspaceFolders) {
      await this.scanDirectory(folder.uri.fsPath);
    }

    return this.findings;
  }

  private async scanDirectory(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".git") || entry.name === "node_modules") {
        continue;
      }

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath);
      } else if (entry.isFile() && this.shouldScanFile(entry.name)) {
        this.scanFile(fullPath);
      }
    }
  }

  private shouldScanFile(filename: string): boolean {
    const ext = extname(filename).toLowerCase();
    return SCAN_EXTENSIONS.includes(ext) || SCAN_FILENAMES.includes(basename(filename));
  }

  private scanFile(filePath: string): void {
    let content: string;
    try {
      const stat = statSync(filePath);
      if (stat.size > 1_000_000) {
        return;
      }
      content = readFileSync(filePath, "utf8");
    } catch {
      return;
    }

    const lines = content.split("\n");
    lines.forEach((line, index) => {
      for (const pattern of SECRET_PATTERNS) {
        for (const match of line.matchAll(pattern.regex)) {
          this.findings.push({
            file: filePath,
            line: index + 1,
            pattern: pattern.name,
            masked: this.maskSecret(match[0]),
          });
        }
      }
    });
  }

  private maskSecret(value: string): string {
    if (value.length <= 8) {
      return "****";
    }
    return `${value.substring(0, 6)}...${value.substring(value.length - 4)}`;
  }

  hasFindings(): boolean {
    return this.findings.length > 0;
  }

  getFindings(): SecurityFinding[] {
    return [...this.findings];
  }
}
