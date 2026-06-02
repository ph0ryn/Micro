# Micro Agent Guide

## Repository Purpose

This repository contains small macOS automation helpers for TypeScript. Keep the
public API compact and focused on window-relative desktop automation.

## Tooling

- Package manager: pnpm only. Do not use npm or yarn.
- Runtime target: Bun ESM on macOS.
- Module system: ESM with `"type": "module"`.
- TypeScript is configured as strict and `noEmit`.
- Linting and type checking are primarily handled by Oxlint, with ESLint used
  for TypeScript naming rules and autofix support.
- Formatting is handled by oxfmt.
- Git hooks are configured automatically during `postinstall`.
- Tests use Bun.

## Common Commands

Run all commands from the repository root.

| Task                 | Command           |
| -------------------- | ----------------- |
| Install dependencies | `pnpm install`    |
| Lint                 | `pnpm run lint`   |
| Format and autofix   | `pnpm run format` |
| Test                 | `pnpm run test`   |

There is currently no `build` or separate `typecheck` script. `pnpm run lint`
already runs Oxlint with `--type-aware --type-check`. Check `package.json`
before adding or running new lifecycle commands.

## Editing Rules

- Keep external code, comments, commit messages, and repository documentation in
  English.
- Preserve pnpm workspace catalog usage in `pnpm-workspace.yaml` when updating dependencies.
- Prefer small, direct changes over new abstractions.
- Keep external APIs focused on the needs of local macOS automation scripts.
- Keep user-facing usage instructions in `README.md`; keep agent workflow notes in this file.

## Validation

For repository changes, run the narrowest relevant checks first. For normal maintenance, use:

```sh
pnpm run format
pnpm run lint
pnpm run test
```
