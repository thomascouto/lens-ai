import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecurityScanner } from "../utils/SecurityScanner";

const mockFolders = vi.hoisted(() => [] as Array<{ uri: { fsPath: string } }>);

vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return mockFolders.length > 0 ? mockFolders : undefined;
    },
  },
}));

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `lens-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("SecurityScanner", () => {
  let tmpDir: string;
  let scanner: SecurityScanner;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    mockFolders.length = 0;
    mockFolders.push({ uri: { fsPath: tmpDir } });
    scanner = new SecurityScanner();
  });

  afterEach(() => {
    mockFolders.length = 0;
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // scanWorkspace — no workspace
  // ---------------------------------------------------------------------------

  describe("when there are no workspace folders", () => {
    it("returns an empty array", async () => {
      mockFolders.length = 0;
      const findings = await scanner.scanWorkspace();
      expect(findings).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // scanWorkspace — no secrets
  // ---------------------------------------------------------------------------

  describe("when files contain no secrets", () => {
    it("returns empty findings for benign JSON", async () => {
      writeFileSync(
        join(tmpDir, "config.json"),
        JSON.stringify({ model: "gpt-4o", temperature: 0.5 }),
      );
      const findings = await scanner.scanWorkspace();
      expect(findings).toEqual([]);
    });

    it("returns empty findings for benign env file", async () => {
      writeFileSync(join(tmpDir, "config.env"), "NODE_ENV=production\nPORT=3000");
      const findings = await scanner.scanWorkspace();
      expect(findings).toEqual([]);
    });

    it("does not scan .ts source files", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "extension.ts"), `const key = "${secret}";`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toEqual([]);
    });

    it("does not scan .js files", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "bundle.js"), `const key = "${secret}";`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // scanWorkspace — secret detection per pattern
  // ---------------------------------------------------------------------------

  describe("OpenAI API key detection", () => {
    it("detects sk- key with 48 alphanumeric chars", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "config.json"), `{"api_key": "${secret}"}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
      expect(findings[0].pattern).toBe("OpenAI API Key");
      expect(findings[0].file).toContain("config.json");
      expect(findings[0].line).toBe(1);
    });

    it("masks the detected key", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "config.json"), `{"api_key": "${secret}"}`);
      const findings = await scanner.scanWorkspace();
      expect(findings[0].masked).toBe(
        `${secret.substring(0, 6)}...${secret.substring(secret.length - 4)}`,
      );
    });
  });

  describe("Anthropic API key detection", () => {
    it("detects sk-ant- key with 50+ chars", async () => {
      const secret = "sk-ant-" + "b".repeat(50);
      // Note: `.env` as dotfile has no extension; use a scannable extension instead
      writeFileSync(join(tmpDir, "secrets.txt"), `ANTHROPIC_KEY=${secret}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
      expect(findings[0].pattern).toBe("Anthropic API Key");
    });
  });

  describe("Google API key detection", () => {
    it("detects AIza key with 35 chars", async () => {
      const secret = "AIza" + "C".repeat(35);
      writeFileSync(join(tmpDir, "config.yaml"), `api_key: ${secret}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
      expect(findings[0].pattern).toBe("Google API Key");
    });
  });

  describe("GitHub token detection", () => {
    it("detects ghp_ token with 36 chars", async () => {
      const secret = "ghp_" + "X".repeat(36);
      writeFileSync(join(tmpDir, "settings.json"), `{"token": "${secret}"}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
      expect(findings[0].pattern).toBe("GitHub Token");
    });

    it("detects ghs_ server token", async () => {
      const secret = "ghs_" + "Y".repeat(36);
      writeFileSync(join(tmpDir, "config.yml"), `token: ${secret}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
      expect(findings[0].pattern).toBe("GitHub Token");
    });
  });

  describe("AWS access key detection", () => {
    it("detects AKIA key with 16 uppercase alphanumeric chars", async () => {
      const secret = "AKIA" + "0".repeat(16);
      writeFileSync(join(tmpDir, "credentials.txt"), secret);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
      expect(findings[0].pattern).toBe("AWS Access Key");
    });
  });

  describe("Hugging Face token detection", () => {
    it("detects hf_ token with 34+ chars", async () => {
      const secret = "hf_" + "z".repeat(34);
      writeFileSync(join(tmpDir, "config.toml"), `token = "${secret}"`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
      expect(findings[0].pattern).toBe("Hugging Face Token");
    });
  });

  describe("Generic bearer token detection", () => {
    it("detects Bearer token with 40+ chars", async () => {
      const token = "a".repeat(40);
      writeFileSync(join(tmpDir, "config.json"), `{"auth": "Bearer ${token}"}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
      expect(findings[0].pattern).toBe("Generic Bearer Token");
    });
  });

  // ---------------------------------------------------------------------------
  // scanWorkspace — file scanned as rule file
  // ---------------------------------------------------------------------------

  describe("rule file scanning", () => {
    it("scans .cursorrules", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, ".cursorrules"), `api_key = ${secret}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
    });

    it("scans copilot-instructions.md", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "copilot-instructions.md"), `api_key: ${secret}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // scanWorkspace — directory traversal
  // ---------------------------------------------------------------------------

  describe("directory traversal", () => {
    it("skips .git directories", async () => {
      const gitDir = join(tmpDir, ".git");
      mkdirSync(gitDir, { recursive: true });
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(gitDir, "config.json"), `{"key": "${secret}"}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toEqual([]);
    });

    it("skips node_modules directories", async () => {
      const nmDir = join(tmpDir, "node_modules");
      mkdirSync(nmDir, { recursive: true });
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(nmDir, "config.json"), `{"key": "${secret}"}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toEqual([]);
    });

    it("scans files in nested subdirectories", async () => {
      const subDir = join(tmpDir, "nested", "deep");
      mkdirSync(subDir, { recursive: true });
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(subDir, "config.json"), `{"key": "${secret}"}`);
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
    });

    it("reports the correct line number for multi-line files", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "config.json"), `line1\n{"key": "${secret}"}\nline3`);
      const findings = await scanner.scanWorkspace();
      expect(findings[0].line).toBe(2);
    });

    it("resets findings between scans", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "config.json"), `{"key": "${secret}"}`);
      await scanner.scanWorkspace();
      // second scan should not accumulate
      const findings = await scanner.scanWorkspace();
      expect(findings).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // hasFindings / getFindings
  // ---------------------------------------------------------------------------

  describe("hasFindings", () => {
    it("returns false before any scan", () => {
      expect(scanner.hasFindings()).toBe(false);
    });

    it("returns false after a scan with no secrets", async () => {
      writeFileSync(join(tmpDir, "config.json"), '{"safe": true}');
      await scanner.scanWorkspace();
      expect(scanner.hasFindings()).toBe(false);
    });

    it("returns true after detecting a secret", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "config.json"), `{"key": "${secret}"}`);
      await scanner.scanWorkspace();
      expect(scanner.hasFindings()).toBe(true);
    });
  });

  describe("getFindings", () => {
    it("returns an empty array before scanning", () => {
      expect(scanner.getFindings()).toEqual([]);
    });

    it("returns a copy (not the internal reference)", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "config.json"), `{"key": "${secret}"}`);
      await scanner.scanWorkspace();
      const a = scanner.getFindings();
      const b = scanner.getFindings();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it("includes all finding fields", async () => {
      const secret = "sk-" + "a".repeat(48);
      writeFileSync(join(tmpDir, "config.json"), `{"key": "${secret}"}`);
      await scanner.scanWorkspace();
      const [finding] = scanner.getFindings();
      expect(finding).toHaveProperty("file");
      expect(finding).toHaveProperty("line");
      expect(finding).toHaveProperty("pattern");
      expect(finding).toHaveProperty("masked");
    });
  });
});
