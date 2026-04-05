import { commands, Uri, ViewColumn, type Webview, type WebviewPanel, window } from "vscode";

import { type ConfigEntry, ConfigInspector } from "../services/ConfigInspector";

const VIEW_TYPE = "lensMatrix";
let currentPanel: WebviewPanel | undefined;

export function createOrShow(extensionUri: Uri): void {
  const column = window.activeTextEditor?.viewColumn;

  if (currentPanel) {
    currentPanel.reveal(column);
    updateWebview(currentPanel.webview);
    return;
  }

  const panel = window.createWebviewPanel(
    VIEW_TYPE,
    "Lens AI — Scope Matrix",
    column ?? ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [Uri.joinPath(extensionUri, "resources")],
    },
  );

  currentPanel = panel;
  updateWebview(panel.webview);

  panel.onDidDispose(() => {
    currentPanel = undefined;
  });

  panel.webview.onDidReceiveMessage((message: { command: string; key?: string }) => {
    if (message.command === "openSettings" && message.key) {
      void commands.executeCommand("workbench.action.openSettings", message.key);
    }
  });
}

function updateWebview(webview: Webview): void {
  const inspector = new ConfigInspector();
  const entries = inspector.getAllConfigEntries();
  const engines = inspector.detectInstalledEngines();
  webview.html = buildHtml(
    entries,
    engines.filter((e) => e.isInstalled),
  );
}

function serialiseValue(value: NonNullable<unknown>): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  return JSON.stringify(value);
}

function buildHtml(
  entries: ConfigEntry[],
  installedEngines: ReturnType<ConfigInspector["detectInstalledEngines"]>,
): string {
  const rows = entries.map((entry) => buildRow(entry)).join("");
  const engineBadges =
    installedEngines.length > 0
      ? installedEngines
          .map(
            (e) =>
              `<span class="engine-badge ${e.isEnabled ? "active" : "inactive"}">${e.label}${e.model ? ` · ${e.model}` : ""}</span>`,
          )
          .join("")
      : '<span class="engine-badge inactive">No engines detected</span>';

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Lens AI — Scope Matrix</title>
<style>
  :root {
    --cyan: #00FFFF;
    --blue: #4A9EFF;
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border, #333);
    --header-bg: var(--vscode-editorGroupHeader-tabsBackground, #1e1e1e);
    --row-hover: var(--vscode-list-hoverBackground, #2a2a2a);
    --tag-bg: var(--vscode-badge-background, #333);
    --tag-fg: var(--vscode-badge-foreground, #aaa);
    --font: var(--vscode-editor-font-family, 'Courier New', monospace);
    --ui-font: var(--vscode-font-family, -apple-system, sans-serif);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--ui-font);
    font-size: 13px;
    padding: 16px 20px;
    min-height: 100vh;
  }

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  header h1 {
    font-size: 18px;
    font-weight: 600;
    background: linear-gradient(90deg, var(--cyan), var(--blue));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .engines-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
  }

  .engine-badge {
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.3px;
  }
  .engine-badge.active {
    background: rgba(0, 255, 255, 0.12);
    border: 1px solid rgba(0, 255, 255, 0.4);
    color: var(--cyan);
  }
  .engine-badge.inactive {
    background: var(--tag-bg);
    border: 1px solid var(--border);
    color: var(--tag-fg);
  }

  .legend {
    display: flex;
    gap: 16px;
    margin-bottom: 14px;
    font-size: 11px;
    color: var(--tag-fg);
  }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot-effective { background: var(--cyan); }
  .dot-override { background: #f0a030; }
  .dot-default { background: #666; }

  .matrix-wrapper {
    overflow-x: auto;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .matrix {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font);
    font-size: 12px;
  }

  .matrix thead tr { background: var(--header-bg); }

  .matrix th {
    padding: 9px 14px;
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    font-weight: 600;
    color: var(--tag-fg);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .matrix th.col-effective { color: var(--cyan); }

  .matrix tbody tr {
    border-bottom: 1px solid rgba(255,255,255,0.05);
    cursor: pointer;
    transition: background 0.12s;
  }

  .matrix tbody tr:hover { background: var(--row-hover); }

  .matrix td { padding: 8px 14px; vertical-align: middle; }

  .col-key { font-weight: 500; color: var(--blue); white-space: nowrap; }
  .col-ns { color: var(--tag-fg); font-size: 10px; white-space: nowrap; }
  .val { color: var(--fg); }
  .val-overridden { text-decoration: line-through; opacity: 0.45; color: var(--tag-fg); }
  .val-empty { color: #555; font-style: italic; }
  .val-effective { color: var(--cyan); font-weight: 600; }

  .scope-badge {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.4px;
    margin-right: 4px;
    text-transform: uppercase;
  }
  .scope-U { background: rgba(74,158,255,0.15); color: var(--blue); }
  .scope-W { background: rgba(240,160,48,0.15); color: #f0a030; }
  .scope-F { background: rgba(100,220,100,0.15); color: #64dc64; }
  .scope-D { background: rgba(128,128,128,0.10); color: #888; }
  .scope-eff { background: rgba(0,255,255,0.15); color: var(--cyan); }

  .empty-state { text-align: center; padding: 48px 20px; color: var(--tag-fg); }
  .empty-state p { margin-top: 8px; font-size: 12px; }

  footer { margin-top: 20px; font-size: 11px; color: #555; text-align: right; }
</style>
</head>
<body>
<header>
  <h1>⬡ Lens AI — Scope Matrix</h1>
</header>

<div class="engines-bar">${engineBadges}</div>

<div class="legend">
  <span class="legend-item"><span class="dot dot-effective"></span>Effective value</span>
  <span class="legend-item"><span class="dot dot-override"></span>Workspace override</span>
  <span class="legend-item"><span class="dot dot-default"></span>Default / global</span>
  <span style="margin-left:auto">Click any row to open settings</span>
</div>

<div class="matrix-wrapper">
  <table class="matrix">
    <thead>
      <tr>
        <th>Property</th>
        <th>Default</th>
        <th>User (Global)</th>
        <th>Workspace</th>
        <th class="col-effective">Effective Value</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length > 0
          ? rows
          : `<tr><td colspan="5" class="empty-state">
          <div>No configurable AI extensions detected.</div>
          <p>Install GitHub Copilot, Continue.dev, Cline, or Codeium to see their scope matrix here.</p>
        </td></tr>`
      }
    </tbody>
  </table>
</div>

<footer>Lens AI · All data is local · No telemetry</footer>

<script>
  (function() {
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('tbody tr[data-key]').forEach(function(row) {
      row.addEventListener('click', function() {
        const key = this.getAttribute('data-key');
        if (key) { vscode.postMessage({ command: 'openSettings', key: key }); }
      });
    });
  })();
</script>
</body>
</html>`;
}

function buildRow(entry: ConfigEntry): string {
  const { scope } = entry;
  const isWorkspaceOverride =
    scope.workspaceValue !== undefined || scope.workspaceFolderValue !== undefined;

  const fmtDefault = renderVal(scope.defaultValue, false);
  const fmtGlobal = renderVal(
    scope.globalValue,
    isWorkspaceOverride && scope.globalValue !== undefined,
  );
  const fmtWorkspace = renderVal(scope.workspaceValue, false, "W");
  const fmtEffective = renderEffective(scope.effectiveValue, scope.effectiveScope);

  return `
<tr data-key="${esc(entry.fullKey)}" title="Click to open ${esc(entry.fullKey)} in settings">
  <td>
    <div class="col-key">${esc(entry.key)}</div>
    <div class="col-ns">${esc(entry.namespace)}</div>
  </td>
  <td>${fmtDefault}</td>
  <td>${fmtGlobal}</td>
  <td>${fmtWorkspace}</td>
  <td>${fmtEffective}</td>
</tr>`;
}

function renderVal(value: unknown, strikethrough: boolean, scope?: string): string {
  const badge = scope ? `<span class="scope-badge scope-${scope}">${scope}</span>` : "";
  if (value === undefined || value === null) {
    return `<span class="val-empty">—</span>`;
  }
  const text = esc(serialiseValue(value));
  return `${badge}<span class="${strikethrough ? "val-overridden" : "val"}">${text}</span>`;
}

function renderEffective(
  value: unknown,
  effectiveScope: ConfigEntry["scope"]["effectiveScope"],
): string {
  const scopeMap: Record<typeof effectiveScope, string> = {
    workspaceFolder: "F",
    workspace: "W",
    global: "U",
    default: "D",
  };
  const badge = `<span class="scope-badge scope-eff">${scopeMap[effectiveScope]}</span>`;
  if (value === undefined || value === null) {
    return `${badge}<span class="val-empty">—</span>`;
  }
  return `${badge}<span class="val-effective">${esc(serialiseValue(value))}</span>`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
