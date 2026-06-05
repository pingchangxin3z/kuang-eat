# Kuang Eat CLI Design

## Goal

Build a standalone, installable CLI for the `kuang-eat` ordering workflow without importing any code from the existing frontend. The CLI should let a user:

- authenticate by storing an `openId`
- inspect the menu for a given day and meal
- order one meal by sequence (`A-H`) or by visible menu index
- place lunch orders for a workweek using keyword matching or stock-count filtering

## Architecture

The harness lives under `agent-harness/` as a self-contained Python package exposed through `kuang-eat`. It talks directly to `order.hersweetie.com` over HTTP and bundles its own signing assets:

- bundled WASM copied into the harness package
- bundled Node-based signer bridge that computes `x-sign`/`x-time`
- Python backend client built on `requests`

No runtime import from the React/Vite codebase is allowed. The existing project is only used as a source of API contract knowledge.

## Command Model

The CLI supports both one-shot commands and REPL mode:

- `auth set/show`
- `config show`, `config set-base-url`
- `address list/use`
- `menu`
- `order`
- `week-lunch`
- `undo`, `redo`

If the root command is invoked without a subcommand it starts an interactive REPL and reuses the same session/config state.

## State And Config

Persistent files are stored under `~/.config/kuang-eat/` or `KUANG_EAT_CONFIG_DIR` when set:

- `config.json`: `openId`, base URL, default address
- `session.json`: last menu snapshot plus undo/redo stacks for local config changes

Undo/redo only applies to local configuration changes because the remote ordering backend does not expose a cancel API compatible with safe reversal.

## Testing

Tests stay inside the harness package:

- `test_core.py`: config history, date helpers, matching logic
- `test_full_e2e.py`: subprocess-level CLI flow against a local mock HTTP server

Validation includes editable install plus CLI smoke checks.
