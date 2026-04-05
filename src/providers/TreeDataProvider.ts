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
import { type SecurityFinding, SecurityScanner } from "../utils/SecurityScanner";

// ---------------------------------------------------------------------------
// Tree Item Types
// ---------------------------------------------------------------------------

type LensItemKind =
  | "engine"
  | "engineProp"
  | "configNamespace"
  | "configEntry"
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

function scopeBadge(scope: ConfigEntry["scope"]["effectiveScope"]): string {
  switch (scope) {
    case "workspaceFolder":
      return "[F]";
    case "workspace":
      return "[W]";
    case "global":
      return "[U]";
    default:
      return "[D]";
  }
}

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
    if (element.kind === "engine") {
      return this.getEngineProps(element.meta as AiEngine);
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
    const entries = this.inspector.getEntriesForEngine(engine.id);
    if (entries.length === 0) {
      const none = new LensTreeItem("No inspectable keys", TreeItemCollapsibleState.None, "empty");
      none.iconPath = new ThemeIcon("dash");
      return [none];
    }

    return entries.map((entry) => {
      const badge = scopeBadge(entry.scope.effectiveScope);
      const value = formatValue(entry.scope.effectiveValue);
      const item = new LensTreeItem(
        `${badge} ${entry.key}`,
        TreeItemCollapsibleState.None,
        "engineProp",
        entry,
      );
      item.description = value;
      item.tooltip = [
        `Full key: ${entry.fullKey}`,
        `Default: ${formatValue(entry.scope.defaultValue)}`,
        `Global [U]: ${formatValue(entry.scope.globalValue)}`,
        `Workspace [W]: ${formatValue(entry.scope.workspaceValue)}`,
        `Folder [F]: ${formatValue(entry.scope.workspaceFolderValue)}`,
        `Effective: ${value}`,
      ].join("\n");
      item.iconPath = new ThemeIcon("settings");
      item.command = {
        command: "workbench.action.openSettings",
        title: "Open Settings",
        arguments: [entry.fullKey],
      };
      return item;
    });
  }
}

// ---------------------------------------------------------------------------
// Effective Configs Provider
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
      return this.getNamespaceGroups();
    }
    if (element.kind === "configNamespace") {
      return this.getConfigEntries(element.meta as string);
    }
    return [];
  }

  private getNamespaceGroups(): LensTreeItem[] {
    const allEntries = this.inspector.getAllConfigEntries();
    const namespaces = [...new Set(allEntries.map((e) => e.namespace))];

    return namespaces.map((ns) => {
      const item = new LensTreeItem(ns, TreeItemCollapsibleState.Collapsed, "configNamespace", ns);
      const overrides = allEntries.filter(
        (e) =>
          e.namespace === ns &&
          (e.scope.workspaceValue !== undefined || e.scope.workspaceFolderValue !== undefined),
      ).length;
      item.description = overrides > 0 ? `${overrides.toString()} override(s)` : undefined;
      item.iconPath = new ThemeIcon("symbol-namespace");
      return item;
    });
  }

  private getConfigEntries(namespace: string): LensTreeItem[] {
    const entries = this.inspector.getAllConfigEntries().filter((e) => e.namespace === namespace);

    return entries.map((entry) => {
      const badge = scopeBadge(entry.scope.effectiveScope);
      const value = formatValue(entry.scope.effectiveValue);
      const isOverridden =
        entry.scope.workspaceValue !== undefined || entry.scope.workspaceFolderValue !== undefined;

      const item = new LensTreeItem(
        `${badge} ${entry.key}`,
        TreeItemCollapsibleState.None,
        "configEntry",
        entry,
      );
      item.description = value;
      item.iconPath = isOverridden
        ? new ThemeIcon("symbol-property", new ThemeColor("charts.yellow"))
        : new ThemeIcon("symbol-property");
      item.tooltip = [
        `Full key: ${entry.fullKey}`,
        `Default: ${formatValue(entry.scope.defaultValue)}`,
        `Global [U]: ${formatValue(entry.scope.globalValue)}`,
        `Workspace [W]: ${formatValue(entry.scope.workspaceValue)}`,
        `Folder [F]: ${formatValue(entry.scope.workspaceFolderValue)}`,
        `→ Effective: ${value}`,
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

// ---------------------------------------------------------------------------
// Instruction Files Provider
// ---------------------------------------------------------------------------

const RULES_FILENAMES = [
  ".cursorrules",
  ".clinerules",
  ".instructions.md",
  ".github/copilot-instructions.md",
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
