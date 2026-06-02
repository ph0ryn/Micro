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
- Screen Recording permission when using image search

The selected window must be visible on the main display.

## Install

```sh
pnpm install
```

## Usage

```ts
import { getWindow, loadImage, point } from "micro";

const chrome = await getWindow("Chrome");
const button = await loadImage("assets/button.png");

await chrome.move(point(100, 200), 300);
await chrome.click(point(100, 200), 300);
await chrome.fclick(point(100, 200), 300, 10);

await chrome.mouseDown(point(100, 200), 300);
await chrome.move(point(500, 600), 800);
await chrome.mouseUp();

const cursor = await chrome.cursor();
const topLeft = await chrome.find(button, 0.9);

await chrome.click(point(topLeft.x + button.center.x, topLeft.y + button.center.y), 300);
```

All durations are in milliseconds. `fclick()` uses the final argument as a
pixel radius and clamps the generated point to the window. `find()` searches
only within the selected window and returns the relative top-left coordinate of
the first match.

Images are loaded explicitly so repeated calls to `find()` reuse the same image
data:

```ts
const button = await loadImage("assets/button.png");

await chrome.find(button);
await chrome.find(button);
```

The default image match confidence is `0.99`.

## Scripts

| Command           | Description                                      |
| ----------------- | ------------------------------------------------ |
| `pnpm install`    | Install dependencies and configure Git hooks.    |
| `pnpm run lint`   | Run Oxlint type-aware linting and type checking. |
| `pnpm run format` | Run lint fixes, oxfmt, and ESLint fixes.         |
| `pnpm run test`   | Run Bun unit tests.                              |
