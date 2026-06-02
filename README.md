# Micro

Small macOS automation helpers for TypeScript.

Micro wraps [`@nut-tree-fork/nut-js`](https://www.npmjs.com/package/@nut-tree-fork/nut-js)
with window-relative mouse operations. Coordinates are relative to the top-left
corner of the selected application window, so scripts keep working when the
window moves.

## Requirements

- macOS
- pnpm
- Bun
- Accessibility permission for the terminal or application running the script

The selected window must be visible on the main display.

## Install

```sh
pnpm install
```

## Usage

```ts
import { getWindow, point } from "micro";

const chrome = await getWindow("Chrome");

await chrome.focus();
await chrome.move(point(100, 200), 300);
await chrome.click(point(100, 200), 300);
await chrome.fclick(point(100, 200), 300, 10);

await chrome.mouseDown(point(100, 200), 300);
await chrome.move(point(500, 600), 800);
await chrome.mouseUp();

const cursor = await chrome.cursor();
```

All durations are in milliseconds. `fclick()` uses the final argument as a
pixel radius and clamps the generated point to the window. `cursor()` returns
window-relative coordinates even when the cursor is currently outside the
window.

## Scripts

| Command           | Description                                      |
| ----------------- | ------------------------------------------------ |
| `pnpm install`    | Install dependencies and configure Git hooks.    |
| `pnpm run lint`   | Run Oxlint type-aware linting and type checking. |
| `pnpm run format` | Run lint fixes, oxfmt, and ESLint fixes.         |
| `pnpm run test`   | Run Bun unit tests.                              |
