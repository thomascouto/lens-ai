# Contributing to Lens AI

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

## Setup

```bash
git clone https://github.com/thomascouto/lens-ai
cd lens-ai
pnpm install
```

Git hooks are configured automatically via Lefthook on `pnpm install`.

## Development

Press **F5** in VS Code to launch an Extension Development Host with Lens AI loaded live.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm compile` | Compile TypeScript to `out/` |
| `pnpm watch` | Watch mode |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | ESLint check |
| `pnpm lint:fix` | ESLint auto-fix |
| `pnpm format` | Prettier check |
| `pnpm format:fix` | Prettier auto-fix |
| `pnpm test` | Run tests |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm package` | Build `.vsix` package |

## Install built extension

```bash
pnpm package
# VS Code: Ctrl+Shift+P → "Extensions: Install from VSIX..."
```

## Git hooks

- **pre-commit** — lints and checks formatting on staged `.ts` files
- **pre-push** — runs full typecheck, lint, and format check

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Run `pnpm typecheck && pnpm lint && pnpm test` before submitting
- Follow the existing code style (no `as` type assertions, type guards preferred)
- Add or update tests for any changed logic in `src/services/`
