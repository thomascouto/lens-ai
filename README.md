# Lens AI

> Agnostic configuration & scope inspector for GitHub Copilot, Cursor, and LLMs.

Lens AI is a Visual Studio Code extension that acts as a diagnostic lens for your AI tooling. With the proliferation of tools like Copilot, Cursor, Continue, and Cline, configuration becomes fragmented across global settings, workspace files, and rule documents. Lens AI consolidates everything into a single, unified view.

---

## Features

### Active Engines
Detects installed AI extensions and shows their current status and active model at a glance.

- GitHub Copilot & Copilot Chat
- Continue.dev (reads `~/.continue/config.json` for the active model)
- Cline
- Codeium

Each engine shows a live status indicator: **active**, **inactive**, or **not installed**.

### Effective Configs
Resolves the full configuration hierarchy for every AI namespace using VS Code's native `getConfiguration().inspect()` API.

Each key is labelled with its winning scope:

| Badge | Scope |
|-------|-------|
| `[U]` | User / Global |
| `[W]` | Workspace |
| `[F]` | Folder (multi-root) |
| `[D]` | Default |

Keys with workspace or folder overrides are highlighted so you can instantly see what is being overridden and why.

### Instruction Files
Scans the workspace root for AI rule and instruction files and lists them in the sidebar. Click any file to open it directly.

Detected files:
- `.cursorrules`
- `.clinerules`
- `.instructions.md`
- `.github/copilot-instructions.md`

### Scope Matrix
Open a rich table view (`Lens AI: Open Scope Matrix`) showing every inspected key across all four scope columns side by side.

- **Overridden values** appear with `line-through` styling and reduced opacity
- **Effective values** are highlighted in cyan
- Click any row to jump straight to that setting in VS Code

### Security Scanner
A passive, local-only scanner that checks `.json`, `.env`, `.yaml`, `.yml`, `.toml`, `.txt`, and instruction files for exposed API key patterns.

Detected patterns include:

| Provider | Pattern |
|----------|---------|
| OpenAI | `sk-...` |
| Anthropic | `sk-ant-...` |
| Google | `AIza...` |
| GitHub | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` |
| AWS | `AKIA...` |
| Hugging Face | `hf_...` |
| Generic Bearer | `bearer <token>` |

Findings appear at the top of the **Instruction Files** panel. Secrets are masked (`sk-abc1...ef12`). No data ever leaves your machine.

---

## Usage

### Sidebar
Click the Lens AI icon in the Activity Bar to open the sidebar. Three panels are available:

- **Active Engines** — expand any engine to inspect its individual config keys
- **Effective Configs** — grouped by namespace, with override counts shown
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

## Development

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

### Setup

```bash
git clone https://github.com/thomasswarch/lens-ai
cd lens-ai
pnpm install
```

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm compile` | Compile TypeScript to `out/` |
| `pnpm watch` | Watch mode |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | ESLint check |
| `pnpm lint:fix` | ESLint auto-fix |
| `pnpm format` | Prettier check |
| `pnpm format:fix` | Prettier auto-fix |
| `pnpm package` | Build `.vsix` package |

### Run locally

Open the project in VS Code and press **F5**. This launches an Extension Development Host with Lens AI loaded live.

### Install from VSIX

```bash
pnpm package
# Then in VS Code: Ctrl+Shift+P → "Extensions: Install from VSIX..."
```

### Git hooks

Lefthook is configured automatically on `pnpm install`.

- **pre-commit** — lints and checks formatting on staged `.ts` files
- **pre-push** — runs full typecheck, lint, and format check

---

## Architecture

```
src/
├── extension.ts                 # Activation, command registration
├── configScanner.ts             # Flat-structure public API (re-exports + rule file detection)
├── providers/
│   ├── TreeDataProvider.ts      # EnginesTreeProvider, ConfigsTreeProvider, RulesTreeProvider
│   └── WebviewProvider.ts       # Scope Matrix webview (HTML/CSS)
├── services/
│   └── ConfigInspector.ts       # Agnostic config resolver, model detection per engine
└── utils/
    └── SecurityScanner.ts       # Regex-based secret detection
```

---

## License

MIT
