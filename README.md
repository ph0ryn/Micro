# Micro

Small macOS automation helpers for TypeScript.

Micro wraps [`@nut-tree-fork/nut-js`](https://www.npmjs.com/package/@nut-tree-fork/nut-js)
with window-relative mouse operations. Coordinates are relative to the top-left
corner of the selected application window, so scripts keep working when the
window moves.

## Requirements

- macOS
- Bun
- Accessibility permission for the terminal or application running the script
- Screen Recording permission for the terminal or application running the
  script when using image search

The selected window must be visible on a display.

## Install

```sh
pnpm add @ph0ryn/micro
```

## Usage

```ts
import { checkRequirements, getWindow, point } from "@ph0ryn/micro";

await checkRequirements();

const chrome = await getWindow({ bundleId: "com.google.Chrome" });

await chrome.focus();
await chrome.move(point(100, 200), 300);
await chrome.click(point(100, 200));
await chrome.click();
await chrome.fclick(point(100, 200), 10);

await chrome.mouseDown(point(100, 200));
await chrome.move(point(500, 600), 800);
await chrome.mouseUp();

const cursor = await chrome.cursor();
const size = await chrome.size();
```

Move durations are in milliseconds. `click()` and `mouseDown()` use the current
cursor position when called without a target. `fclick()` uses the final argument
as a pixel radius and clamps the generated point to the window. `cursor()`
returns window-relative coordinates even when the cursor is currently outside
the window. `size()` returns the current window width and height.

To list bundle IDs for visible applications:

```sh
osascript -l JavaScript -e '
const se = Application("System Events");

se.applicationProcesses
  .whose({ visible: true })()
  .map((process) => `${process.name()}\t${process.bundleIdentifier()}`)
  .sort()
  .join("\n");
'
```

### Image Search

```ts
import { getWindow, loadImage } from "@ph0ryn/micro";

const chrome = await getWindow({ bundleId: "com.google.Chrome" });
const button = await loadImage("assets/button.png");

const match = await chrome.find(button);
if (match) {
  await chrome.click(match.center);
}

const matches = await chrome.findAll(button, 0.95);
```

`loadImage()` loads a reusable opaque `Image` from a PNG template. Transparent
template pixels are excluded from matching. `find()` returns the first
top-left threshold match, or `null` if no match is found. `findAll()` returns
non-overlapping threshold matches in top-left order, or an empty array if none
are found. Both methods use a default confidence threshold of `0.99`. Invalid
confidence values, missing image search configuration, and capture failures
still throw.

Each `Match` exposes `confidence`, `origin`, `size`, and `center`. Coordinates
and sizes are window-relative logical pixels and may be fractional.

Image search currently does not support multi-scale matching or rotation.
Templates should be captured at the scale of the display where they are used.
Windows spanning displays with different scales are not supported.

Use `checkRequirements({ screenRecording: true })` before image search when you
want to check Screen Recording permission as well as the default macOS and
Accessibility requirements.
If a required permission is missing, Micro opens the matching macOS Settings
pane and throws an error.
