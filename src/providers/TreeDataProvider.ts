import { existsSync, statSync } from "fs";
import { basename, join } from "path";

import {
  EventEmitter,
  Range,
  ThemeColor,
  ThemeIcon,
  type TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  type TreeItemLabel,
  Uri,
  workspace,
} from "vscode";

import { type AiEngine, type ConfigEntry, ConfigInspector } from "../services/ConfigInspector";
import {
  type FileConfigEntry,
  FileConfigReader,
  type FileScope,
  type ScopedFile,
} from "../services/FileConfigReader";
import { type SecurityFinding, SecurityScanner } from "../utils/SecurityScanner";

// ---------------------------------------------------------------------------
// Tree Item Types
// ---------------------------------------------------------------------------

type LensItemKind =
  | "engine"
  | "engineProp"
  | "configNamespace"
  | "configEntry"
  | "vscodeScopeGroup"
  | "vscodeScopeEntry"
  | "auditScopeGroup"
  | "fileScopeGroup"
  | "fileEntry"
  | "rulesFile"
  | "securityAlert"
  | "empty";

export class LensTreeItem extends TreeItem {
  constructor(
    label: string | TreeItemLabel,
    collapsibleState: TreeItemCollapsibleState,
    public readonly kind: LensItemKind,
    public readonly meta?: unknown,
  ) {
    super(label, collapsibleState);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isAiEngine(value: unknown): value is AiEngine {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "label" in value &&
    "isInstalled" in value &&
    "isEnabled" in value
  );
}

function isFileScopeGroupMeta(value: unknown): value is FileScopeGroupMeta {
  return typeof value === "object" && value !== null && "scopedFile" in value && "entries" in value;
}

function isVSCodeScopeGroupMeta(value: unknown): value is VSCodeScopeGroupMeta {
  return (
    typeof value === "object" && value !== null && "vscodeScope" in value && "entries" in value
  );
}

function isAuditScopeGroupMeta(value: unknown): value is AuditScopeGroupMeta {
  return typeof value === "object" && value !== null && "auditScope" in value && "entries" in value;
}

// ---------------------------------------------------------------------------
// Active Engines Provider
// ---------------------------------------------------------------------------

export class EnginesTreeProvider implements TreeDataProvider<LensTreeItem> {
  private readonly _onDidChangeTreeData = new EventEmitter<LensTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly inspector = new ConfigInspector();

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: LensTreeItem): LensTreeItem {
    return element;
  }

  getChildren(element?: LensTreeItem): LensTreeItem[] {
    if (!element) {
      return this.getRootEngines();
    }
    if (element.kind === "engine" && isAiEngine(element.meta)) {
      return this.getEngineProps(element.meta);
    }
    if (element.kind === "vscodeScopeGroup" && isVSCodeScopeGroupMeta(element.meta)) {
      return this.getVSCodeScopeEntries(element.meta);
    }
    if (element.kind === "fileScopeGroup" && isFileScopeGroupMeta(element.meta)) {
      return this.getFileScopeEntries(element.meta);
    }
    return [];
  }

  private getRootEngines(): LensTreeItem[] {
    const engines = this.inspector.detectInstalledEngines();
    const items = engines.map((engine) => {
      const state = engine.isInstalled
        ? TreeItemCollapsibleState.Collapsed
        : TreeItemCollapsibleState.None;

      const item = new LensTreeItem(engine.label, state, "engine", engine);

      if (engine.isInstalled && engine.isEnabled) {
        item.iconPath = new ThemeIcon("circle-filled", new ThemeColor("testing.iconPassed"));
        item.description = engine.model ?? "active";
      } else if (engine.isInstalled) {
        item.iconPath = new ThemeIcon("circle-outline", new ThemeColor("disabledForeground"));
        item.description = "inactive";
      } else {
        item.iconPath = new ThemeIcon("circle-slash", new ThemeColor("disabledForeground"));
        item.description = "not installed";
        item.tooltip = `Install ${engine.extensionId} from the marketplace`;
      }

      return item;
    });

    if (items.length === 0) {
      const empty = new LensTreeItem(
        "No AI extensions detected",
        TreeItemCollapsibleState.None,
        "empty",
      );
      empty.iconPath = new ThemeIcon("info");
      return [empty];
    }

    return items;
  }

  private getEngineProps(engine: AiEngine): LensTreeItem[] {
    const vsEntries = this.inspector.getEntriesForEngine(engine.id);
    const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
    const fileConfig = new FileConfigReader(workspaceRoot).readEngineConfig(engine.id);

    const items: LensTreeItem[] = [
      ...this.buildVSCodeScopeGroups(vsEntries),
      ...(fileConfig?.scopedFiles.map((sf) => this.buildFileScopeGroup(sf, fileConfig.entries)) ??
        []),
    ];

    if (items.length === 0) {
      const none = new LensTreeItem("No inspectable keys", TreeItemCollapsibleState.None, "empty");
      none.iconPath = new ThemeIcon("dash");
      return [none];
    }

    return items;
  }

  private buildVSCodeScopeGroups(entries: ConfigEntry[]): LensTreeItem[] {
    if (entries.length === 0) return [];

    const defs: Array<{
      vscodeScope: VSCodeScopeGroupMeta["vscodeScope"];
      label: string;
      icon: string;
    }> = [
      { vscodeScope: "global", label: "User (Global)", icon: "account" },
      { vscodeScope: "workspace", label: "Workspace", icon: "folder" },
      { vscodeScope: "workspaceFolder", label: "Workspace Folder", icon: "folder-opened" },
    ];

    return defs.map(({ vscodeScope, label, icon }) => {
      const scopeEntries = entries.filter((e) => {
        if (vscodeScope === "global") return e.scope.globalValue !== undefined;
        if (vscodeScope === "workspace") return e.scope.workspaceValue !== undefined;
        return e.scope.workspaceFolderValue !== undefined;
      });

      const meta: VSCodeScopeGroupMeta = { vscodeScope, label, entries: scopeEntries };
      const hasEntries = scopeEntries.length > 0;
      const item = new LensTreeItem(
        label,
        hasEntries ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
        "vscodeScopeGroup",
        meta,
      );
      item.iconPath = new ThemeIcon(icon);
      item.description = hasEntries ? `${scopeEntries.length.toString()} key(s)` : "no overrides";
      item.tooltip = hasEntries
        ? `${label} — ${scopeEntries.length.toString()} key(s) explicitly set`
        : `${label} — no settings overridden at this scope`;
      return item;
    });
  }

  private getVSCodeScopeEntries(meta: VSCodeScopeGroupMeta): LensTreeItem[] {
    if (meta.entries.length === 0) {
      const none = new LensTreeItem(
        "No overrides at this scope",
        TreeItemCollapsibleState.None,
        "empty",
      );
      none.iconPath = new ThemeIcon("dash");
      return [none];
    }

    return meta.entries.map((entry) => {
      const scopedValue =
        meta.vscodeScope === "global"
          ? entry.scope.globalValue
          : meta.vscodeScope === "workspace"
            ? entry.scope.workspaceValue
            : entry.scope.workspaceFolderValue;

      const value = formatValue(scopedValue);
      const isEffective = entry.scope.effectiveScope === meta.vscodeScope;

      const item = new LensTreeItem(
        entry.key,
        TreeItemCollapsibleState.None,
        "vscodeScopeEntry",
        entry,
      );
      item.description = value;
      item.iconPath = isEffective
        ? new ThemeIcon("circle-filled", new ThemeColor("testing.iconPassed"))
        : new ThemeIcon("circle-outline");
      item.tooltip = [
        `Key: ${entry.fullKey}`,
        `Value here: ${value}`,
        isEffective
          ? "✓ This scope wins (effective value)"
          : `Overridden by: ${entry.scope.effectiveScope}`,
      ].join("\n");
      item.command = {
        command: "workbench.action.openSettings",
        title: "Open Settings",
        arguments: [entry.fullKey],
      };
      return item;
    });
  }

  private buildFileScopeGroup(sf: ScopedFile, allEntries: FileConfigEntry[]): LensTreeItem {
    const SCOPE_LABELS: Record<FileScope, string> = {
      system: "System",
      user: "User",
      project: "Project",
      projectLocal: "Project Local",
    };
    const SCOPE_ICONS: Record<FileScope, string> = {
      system: "server",
      user: "home",
      project: "folder",
      projectLocal: "folder-opened",
    };

    const label = SCOPE_LABELS[sf.scope];
    const keysInScope = allEntries.filter((e) => e.values.some((v) => v.scope === sf.scope));
    const hasEntries = sf.exists && keysInScope.length > 0;

    const meta: FileScopeGroupMeta = { scopedFile: sf, entries: allEntries };
    const item = new LensTreeItem(
      label,
      hasEntries ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
      "fileScopeGroup",
      meta,
    );
    item.iconPath = new ThemeIcon(SCOPE_ICONS[sf.scope]);
    item.description = sf.exists ? sf.filePath : `${sf.filePath} (not found)`;
    item.tooltip = sf.exists
      ? `${label} · ${keysInScope.length.toString()} key(s)\n${sf.filePath}`
      : `File not found:\n${sf.filePath}`;

    if (sf.exists) {
      item.command = {
        command: "vscode.open",
        title: "Open Config File",
        arguments: [Uri.file(sf.filePath)],
      };
    }

    return item;
  }

  private getFileScopeEntries(meta: FileScopeGroupMeta): LensTreeItem[] {
    const { scopedFile, entries } = meta;
    const scopeEntries = entries.filter((e) => e.values.some((v) => v.scope === scopedFile.scope));

    if (scopeEntries.length === 0) {
      const none = new LensTreeItem(
        "No keys at this scope",
        TreeItemCollapsibleState.None,
        "empty",
      );
      none.iconPath = new ThemeIcon("dash");
      return [none];
    }

    return scopeEntries.map((entry) => {
      const valueInScope = entry.values.find((v) => v.scope === scopedFile.scope);
      const value = formatValue(valueInScope?.value);
      const isEffective = entry.effectiveScope === scopedFile.scope;

      const item = new LensTreeItem(entry.key, TreeItemCollapsibleState.None, "fileEntry", entry);
      item.description = value;
      item.iconPath = isEffective
        ? new ThemeIcon("circle-filled", new ThemeColor("testing.iconPassed"))
        : new ThemeIcon("circle-outline");
      item.tooltip = [
        `Key: ${entry.key}`,
        `Value here: ${value}`,
        isEffective
          ? "✓ This scope wins (effective value)"
          : `Overridden by: ${entry.effectiveScope}`,
      ].join("\n");
      item.command = {
        command: "vscode.open",
        title: "Open Config File",
        arguments: [Uri.file(scopedFile.filePath)],
      };
      return item;
    });
  }
}

interface VSCodeScopeGroupMeta {
  vscodeScope: "global" | "workspace" | "workspaceFolder";
  label: string;
  entries: ConfigEntry[];
}

interface FileScopeGroupMeta {
  scopedFile: ScopedFile;
  entries: FileConfigEntry[];
}

// ---------------------------------------------------------------------------
// Effective Configs Provider — cross-engine override audit
// ---------------------------------------------------------------------------

export class ConfigsTreeProvider implements TreeDataProvider<LensTreeItem> {
  private readonly _onDidChangeTreeData = new EventEmitter<LensTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly inspector = new ConfigInspector();

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: LensTreeItem): LensTreeItem {
    return element;
  }

  getChildren(element?: LensTreeItem): LensTreeItem[] {
    if (!element) {
      return this.getAuditScopeGroups();
    }
    if (element.kind === "auditScopeGroup" && isAuditScopeGroupMeta(element.meta)) {
      return this.getAuditEntries(element.meta);
    }
    return [];
  }

  private getAuditScopeGroups(): LensTreeItem[] {
    const allEntries = this.inspector.getAllConfigEntries();

    const defs: Array<{
      auditScope: AuditScopeGroupMeta["auditScope"];
      label: string;
      icon: string;
    }> = [
      { auditScope: "global", label: "User (Global)", icon: "account" },
      { auditScope: "workspace", label: "Workspace", icon: "folder" },
      { auditScope: "workspaceFolder", label: "Workspace Folder", icon: "folder-opened" },
    ];

    return defs.map(({ auditScope, label, icon }) => {
      const scopeEntries = allEntries.filter((e) => {
        if (auditScope === "global") return e.scope.globalValue !== undefined;
        if (auditScope === "workspace") return e.scope.workspaceValue !== undefined;
        return e.scope.workspaceFolderValue !== undefined;
      });

      const meta: AuditScopeGroupMeta = { auditScope, label, entries: scopeEntries };
      const hasEntries = scopeEntries.length > 0;

      const item = new LensTreeItem(
        label,
        hasEntries ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None,
        "auditScopeGroup",
        meta,
      );
      item.iconPath = new ThemeIcon(icon);
      item.description = hasEntries
        ? `${scopeEntries.length.toString()} override(s)`
        : "no overrides";
      item.tooltip = hasEntries
        ? `${label} — ${scopeEntries.length.toString()} key(s) overridden across all engines`
        : `${label} — nothing overridden at this scope`;
      return item;
    });
  }

  private getAuditEntries(meta: AuditScopeGroupMeta): LensTreeItem[] {
    if (meta.entries.length === 0) {
      const none = new LensTreeItem("No overrides", TreeItemCollapsibleState.None, "empty");
      none.iconPath = new ThemeIcon("dash");
      return [none];
    }

    return meta.entries.map((entry) => {
      const scopedValue =
        meta.auditScope === "global"
          ? entry.scope.globalValue
          : meta.auditScope === "workspace"
            ? entry.scope.workspaceValue
            : entry.scope.workspaceFolderValue;

      const value = formatValue(scopedValue);
      const isEffective = entry.scope.effectiveScope === meta.auditScope;

      const item = new LensTreeItem(
        `${entry.namespace}  ·  ${entry.key}`,
        TreeItemCollapsibleState.None,
        "configEntry",
        entry,
      );
      item.description = value;
      item.iconPath = isEffective
        ? new ThemeIcon("circle-filled", new ThemeColor("testing.iconPassed"))
        : new ThemeIcon("circle-outline", new ThemeColor("disabledForeground"));
      item.tooltip = [
        `Key: ${entry.fullKey}`,
        `Value at this scope: ${value}`,
        `Default: ${formatValue(entry.scope.defaultValue)}`,
        isEffective
          ? "✓ This scope wins (effective value)"
          : `Overridden by: ${entry.scope.effectiveScope}`,
      ].join("\n");
      item.command = {
        command: "workbench.action.openSettings",
        title: "Open Settings",
        arguments: [entry.fullKey],
      };
      return item;
    });
  }
}

interface AuditScopeGroupMeta {
  auditScope: "global" | "workspace" | "workspaceFolder";
  label: string;
  entries: ConfigEntry[];
}

// ---------------------------------------------------------------------------
// Instruction Files Provider
// ---------------------------------------------------------------------------

const RULES_FILENAMES = [
  ".github/copilot-instructions.md",
  ".instructions.md",
  ".cursorrules",
  ".clinerules",
  ".roomodes",
  "CLAUDE.md",
  ".claude/CLAUDE.md",
  ".windsurfrules",
  ".aiderrules",
  "AGENTS.md",
  // Gemini CLI
  "GEMINI.md",
  ".gemini/GEMINI.md",
];

export class RulesTreeProvider implements TreeDataProvider<LensTreeItem> {
  private readonly _onDidChangeTreeData = new EventEmitter<LensTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly securityScanner = new SecurityScanner();
  private securityFindings: SecurityFinding[] = [];

  refresh(): void {
    void this.securityScanner.scanWorkspace().then((findings) => {
      this.securityFindings = findings;
      this._onDidChangeTreeData.fire(undefined);
    });
  }

  getTreeItem(element: LensTreeItem): LensTreeItem {
    return element;
  }

  getChildren(element?: LensTreeItem): LensTreeItem[] {
    if (element) {
      return [];
    }
    return [...this.getSecurityAlerts(), ...this.getRulesFiles()];
  }

  private getSecurityAlerts(): LensTreeItem[] {
    return this.securityFindings.slice(0, 10).map((finding) => {
      const item = new LensTreeItem(
        `⚠ ${finding.pattern}`,
        TreeItemCollapsibleState.None,
        "securityAlert",
        finding,
      );
      item.description = `${basename(finding.file)}:${finding.line.toString()} — ${finding.masked}`;
      item.iconPath = new ThemeIcon("warning", new ThemeColor("problemsWarningIcon.foreground"));
      item.tooltip = `Possible exposed secret in ${finding.file} at line ${finding.line.toString()}`;
      item.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [
          Uri.file(finding.file),
          { selection: new Range(finding.line - 1, 0, finding.line - 1, 0) },
        ],
      };
      return item;
    });
  }

  private getRulesFiles(): LensTreeItem[] {
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders) {
      const empty = new LensTreeItem("No workspace open", TreeItemCollapsibleState.None, "empty");
      empty.iconPath = new ThemeIcon("info");
      return [empty];
    }

    const found: LensTreeItem[] = [];

    for (const folder of workspaceFolders) {
      for (const filename of RULES_FILENAMES) {
        const fullPath = join(folder.uri.fsPath, filename);
        if (existsSync(fullPath)) {
          const stat = statSync(fullPath);
          const item = new LensTreeItem(
            filename,
            TreeItemCollapsibleState.None,
            "rulesFile",
            fullPath,
          );
          item.description = `${Math.ceil(stat.size / 1024).toString()}KB`;
          item.iconPath = new ThemeIcon("file-text");
          item.tooltip = fullPath;
          item.command = {
            command: "vscode.open",
            title: "Open File",
            arguments: [Uri.file(fullPath)],
          };
          found.push(item);
        }
      }
    }

    if (found.length === 0) {
      const empty = new LensTreeItem(
        "No instruction files found",
        TreeItemCollapsibleState.None,
        "empty",
      );
      empty.iconPath = new ThemeIcon("info");
      empty.tooltip = `Looking for: ${RULES_FILENAMES.join(", ")}`;
      return [empty];
    }

    return found;
  }
}
