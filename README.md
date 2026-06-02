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
- Screen Recording permission for the terminal or application running the
  script when using image search

The selected window must be visible on a display.

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
const size = await chrome.size();
```

All durations are in milliseconds. `fclick()` uses the final argument as a
pixel radius and clamps the generated point to the window. `cursor()` returns
window-relative coordinates even when the cursor is currently outside the
window. `size()` returns the current window width and height.

### Image Search

```ts
import { getWindow, loadImage } from "micro";

const chrome = await getWindow("Chrome");
const button = await loadImage("assets/button.png");

const match = await chrome.find(button);
await chrome.click(match.center, 300);

const matches = await chrome.findAll(button, 0.95);
```

`loadImage()` loads a reusable opaque `Image` from a PNG template. Transparent
template pixels are excluded from matching. `find()` returns the first
top-left threshold match and throws if no match is found. `findAll()` returns
non-overlapping threshold matches in top-left order, or an empty array if none
are found. Both methods use a default confidence threshold of `0.99`.

Each `Match` exposes `confidence`, `origin`, `size`, and `center`. Coordinates
and sizes are window-relative logical pixels and may be fractional.

Image search currently does not support multi-scale matching or rotation.
Templates should be captured at the scale of the display where they are used.
Windows spanning displays with different scales are not supported.

## Scripts

| Command           | Description                                      |
| ----------------- | ------------------------------------------------ |
| `pnpm install`    | Install dependencies and configure Git hooks.    |
| `pnpm run lint`   | Run Oxlint type-aware linting and type checking. |
| `pnpm run format` | Run lint fixes, oxfmt, and ESLint fixes.         |
| `pnpm run test`   | Run Bun unit tests.                              |
