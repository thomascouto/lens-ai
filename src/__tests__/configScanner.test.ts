import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectRuleFiles, scanWorkspace } from "../configScanner";

// ---------------------------------------------------------------------------
// VS Code mock
// ---------------------------------------------------------------------------

const mockFolders = vi.hoisted(() => [] as Array<{ uri: { fsPath: string } }>);

vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return mockFolders.length > 0 ? mockFolders : undefined;
    },
    getConfiguration: () => ({
      get: () => undefined,
      inspect: () => undefined,
    }),
  },
  extensions: {
    getExtension: () => undefined,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `lens-cs-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectRuleFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    mockFolders.length = 0;
    mockFolders.push({ uri: { fsPath: tmpDir } });
  });

  afterEach(() => {
    mockFolders.length = 0;
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when no workspace folders exist", () => {
    mockFolders.length = 0;
    expect(detectRuleFiles()).toEqual([]);
  });

  it("returns empty array when no rule files are present", () => {
    expect(detectRuleFiles()).toEqual([]);
  });

  it("detects .cursorrules in workspace root", () => {
    writeFileSync(join(tmpDir, ".cursorrules"), "some cursor rules");
    const result = detectRuleFiles();
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe(".cursorrules");
    expect(result[0].sizeBytes).toBeGreaterThan(0);
    expect(result[0].fullPath).toBe(join(tmpDir, ".cursorrules"));
  });

  it("detects .clinerules in workspace root", () => {
    writeFileSync(join(tmpDir, ".clinerules"), "some cline rules");
    const result = detectRuleFiles();
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe(".clinerules");
  });

  it("detects .instructions.md in workspace root", () => {
    writeFileSync(join(tmpDir, ".instructions.md"), "# Instructions");
    const result = detectRuleFiles();
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe(".instructions.md");
  });

  it("detects .github/copilot-instructions.md", () => {
    const githubDir = join(tmpDir, ".github");
    mkdirSync(githubDir, { recursive: true });
    writeFileSync(join(githubDir, "copilot-instructions.md"), "# Copilot Instructions");
    const result = detectRuleFiles();
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe(".github/copilot-instructions.md");
  });

  it("detects multiple rule files at once", () => {
    writeFileSync(join(tmpDir, ".cursorrules"), "cursor");
    writeFileSync(join(tmpDir, ".clinerules"), "cline");
    const result = detectRuleFiles();
    expect(result).toHaveLength(2);
    const filenames = result.map((r) => r.filename);
    expect(filenames).toContain(".cursorrules");
    expect(filenames).toContain(".clinerules");
  });

  it("reports correct file size", () => {
    const content = "x".repeat(42);
    writeFileSync(join(tmpDir, ".cursorrules"), content);
    const result = detectRuleFiles();
    expect(result[0].sizeBytes).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// scanWorkspace
// ---------------------------------------------------------------------------

describe("scanWorkspace", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    mockFolders.length = 0;
    mockFolders.push({ uri: { fsPath: tmpDir } });
  });

  afterEach(() => {
    mockFolders.length = 0;
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns an object with engines, configEntries, and ruleFiles", () => {
    const result = scanWorkspace();
    expect(result).toHaveProperty("engines");
    expect(result).toHaveProperty("configEntries");
    expect(result).toHaveProperty("ruleFiles");
  });

  it("engines array contains all 5 supported AI engines", () => {
    const { engines } = scanWorkspace();
    expect(engines).toHaveLength(5);
  });

  it("ruleFiles reflects detected rule files in workspace", () => {
    writeFileSync(join(tmpDir, ".cursorrules"), "rules");
    const { ruleFiles } = scanWorkspace();
    expect(ruleFiles).toHaveLength(1);
    expect(ruleFiles[0].filename).toBe(".cursorrules");
  });

  it("configEntries is empty when no VS Code config data is available", () => {
    const { configEntries } = scanWorkspace();
    expect(configEntries).toEqual([]);
  });
});
