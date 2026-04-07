# Lens AI

> Agnostic configuration & scope inspector for AI coding tools in VS Code.

Lens AI is a Visual Studio Code extension that acts as a diagnostic lens for your AI tooling. With the proliferation of tools like Copilot, Cursor, Continue, Cline, and Claude Code, configuration becomes fragmented across global settings, workspace files, and rule documents. Lens AI consolidates everything into a single, unified view.

---

## Features

### Active Engines
Detects installed AI extensions and CLI tools, showing their current status and active model at a glance.

| Engine | Detection |
|--------|-----------|
| GitHub Copilot & Copilot Chat | VS Code extension |
| Continue.dev | VS Code extension + `~/.continue/config.json` |
| Cline | VS Code extension |
| Roo Code | VS Code extension |
| Codeium | VS Code extension |
| Amazon Q | VS Code extension |
| Tabnine | VS Code extension |
| Supermaven | VS Code extension |
| Sourcegraph Cody | VS Code extension |
| Gemini Code Assist | VS Code extension |
| Claude Code | CLI (`~/.claude` directory) |
| Gemini CLI | CLI (`~/.gemini` directory) |
| Codex CLI | CLI (`~/.codex` directory) |

Each engine shows a live status indicator: **active**, **inactive**, or **not installed**.

### Scope Sub-trees (per engine)
Expand any engine to see its configuration organized by scope — the same consistent structure for all AI tools:

**VS Code-based engines** (Copilot, Cline, Tabnine…):
```
▼ GitHub Copilot  ·  gpt-4o
    ▶ User (Global)       2 key(s)
    ▷ Workspace           no overrides
    ▷ Workspace Folder    no overrides
```

**File-based engines** (Claude Code):
```
▼ Claude Code  ·  claude-sonnet-4-6
    ▷ System         /etc/claude/settings.json (not found)
    ▶ User           ~/.claude/settings.json   3 key(s)
    ▶ Project        .claude/settings.json     1 key
    ▷ Project Local  .claude/settings.local.json (not found)
```

**Hybrid engines** (Continue.dev, Cline, Roo Code…):
```
▼ Continue.dev  ·  claude-3-5-sonnet
    ▶ User (Global)    1 key(s)
    ▷ Workspace        no overrides
    ▷ Workspace Folder no overrides
    ▶ User             ~/.continue/config.json  5 key(s)
    ▷ Project          .continue/config.json (not found)
```

Inside each scope group, `●` green = this scope wins (effective value), `○` = overridden by another scope. Click any entry to open the settings file or config file directly.

### File-based Config Scopes
For engines that store config in files (not only VS Code settings), Lens AI reads and resolves scope precedence across:

| Scope | Claude Code | Continue.dev | Cline / Roo Code | Amazon Q | Gemini CLI | Codex CLI |
|-------|------------|--------------|------------------|----------|------------|-----------|
| System | `/etc/claude/settings.json` | — | — | — | — | — |
| User | `~/.claude/settings.json` | `~/.continue/config.json` | VS Code globalStorage | `~/.aws/amazonq/` | `~/.gemini/settings.json` | `~/.codex/config.json` |
| Project | `.claude/settings.json` | `.continue/config.json` | `.roo/config.json` | `.amazonq/config.json` | `.gemini/settings.json` | — |
| Project Local | `.claude/settings.local.json` | — | — | — | — | — |

Paths are resolved per platform (Windows, macOS, Linux).

### Effective Configs
Cross-engine override audit grouped by where settings live. Only shows keys that have been explicitly set — no noise from defaults.

```
▼ User (Global)        3 override(s)
    ● github.copilot  ·  enable              true
    ● github.copilot  ·  advanced.model      gpt-4o
    ○ continue        ·  telemetryEnabled    false   ← overridden by Workspace
▼ Workspace            1 override(s)
    ● continue        ·  telemetryEnabled    true
▷ Workspace Folder     no overrides
```

`●` green = this scope wins, `○` grey = overridden elsewhere. Click any entry to open it in VS Code settings.

### Instruction Files
Scans the workspace root for AI rule and instruction files. Click any file to open it directly.

| File | Tool |
|------|------|
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.instructions.md` | Copilot |
| `.cursorrules` | Cursor |
| `.clinerules` | Cline |
| `.roomodes` | Roo Code |
| `CLAUDE.md` / `.claude/CLAUDE.md` | Claude Code |
| `.windsurfrules` | Windsurf |
| `.aiderrules` | Aider |
| `AGENTS.md` | OpenAI Codex CLI |
| `GEMINI.md` / `.gemini/GEMINI.md` | Gemini CLI |

### Scope Matrix
Open a rich table view (`Lens AI: Open Scope Matrix`) showing every inspected key across all scope columns side by side — including a dedicated **File-based Configs** section with System · User · Project · Local columns.

- **Effective values** are highlighted in cyan
- **Overridden values** appear with `line-through` styling
- Click any row to jump to that setting

### Security Scanner
A passive, local-only scanner that checks config and instruction files for exposed API key patterns.

| Provider | Pattern |
|----------|---------|
| OpenAI | `sk-...` |
| Anthropic | `sk-ant-...` |
| Google | `AIza...` |
| GitHub | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` |
| AWS | `AKIA...` |
| Hugging Face | `hf_...` |
| Generic Bearer | `bearer <token>` |

Findings appear at the top of the **Instruction Files** panel. Secrets are masked. No data ever leaves your machine.

---

## Usage

### Sidebar
Click the Lens AI icon in the Activity Bar. Three panels are available:

- **Active Engines** — expand any engine to see its scoped configuration sub-tree
- **Effective Configs** — cross-engine override audit grouped by scope (User, Workspace, Folder)
- **Instruction Files** — rule files and security alerts

Use the **refresh** button (↺) in any panel header to rescan.

### Scope Matrix
Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

```
Lens AI: Open Scope Matrix
```

Or click the table icon in the **Effective Configs** panel header.

---

## Privacy

All scanning is performed locally using the VS Code API and Node.js `fs`. No configuration data, file contents, or secrets are sent to any external server. There is no telemetry.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Architecture

```
src/
├── extension.ts                 # Activation, command registration
├── configScanner.ts             # Public API (re-exports + rule file detection)
├── providers/
│   ├── TreeDataProvider.ts      # EnginesTreeProvider, ConfigsTreeProvider, RulesTreeProvider
│   └── WebviewProvider.ts       # Scope Matrix webview (HTML/CSS)
├── services/
│   ├── ConfigInspector.ts       # VS Code config resolver, model detection per engine
│   └── FileConfigReader.ts      # File-based config reader (system/user/project/local scopes)
└── utils/
    └── SecurityScanner.ts       # Regex-based secret detection
```

---

## License

MIT
