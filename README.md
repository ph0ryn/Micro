# Micro

Small macOS automation helpers for TypeScript.

Micro drives [`silentmouse`](https://github.com/ph0ryn/silentmouse) with
window-relative mouse operations. Coordinates are relative to the top-left
corner of the selected application window, so scripts keep working when the
window moves.

## Requirements

- macOS
- Bun
- `silentmouse` on `PATH`, or `MICRO_SILENTMOUSE_PATH` pointing to the binary
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

const chrome = await getWindow({ bundleId: "com.google.Chrome" }, { cacheFrame: true });

await chrome.move(point(100, 200), 300);
await chrome.click(point(100, 200));
await chrome.click();
await chrome.fclick(point(100, 200), 10);

await chrome.mouseDown(point(100, 200));
await chrome.move(point(500, 600), 800);
await chrome.mouseUp();

const cursor = chrome.cursor;
const size = chrome.size;
```

Move durations are in milliseconds. `click()` uses the current cursor position
when called without a target. `mouseDown()` and `mouseUp()` use an explicit
target when provided, otherwise they use Micro's tracked cursor position.
`fclick()` uses the final argument as a pixel radius and clamps the generated
point to the window. `cursor` returns Micro's tracked window-relative cursor
position. `size` returns the cached window width and height. Call
`refreshFrame()` after moving or resizing the window outside Micro.

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
import { getWindow, loadImage, point } from "@ph0ryn/micro";

const chrome = await getWindow({ bundleId: "com.google.Chrome" }, { cacheFrame: true });
const button = await loadImage("assets/button.png");
const searchRange = {
  start: point(100, 200),
  end: point(500, 360),
};

const match = await chrome.find(button, searchRange);
if (match) {
  await chrome.click(match.center);
}

const matches = await chrome.findAll(button, {
  ...searchRange,
  confidence: 0.95,
  refreshFrame: false,
});
```

`loadImage()` loads a reusable opaque `Image` from a PNG template. Transparent
template pixels are excluded from matching. `find()` and `findAll()` search
inside the window-relative range from `start` to `end`. Omitted `start` defaults
to the window top-left corner, and omitted `end` defaults to the window
lower-right edge. `end` may match the window edge. `find()` returns the first
top-left threshold match, or `null` if no match is found. `findAll()` returns
non-overlapping threshold matches in top-left order, or an empty array if none
are found. Both methods use a default confidence threshold of `0.99`. Invalid
confidence values, invalid search ranges, missing image search configuration,
and capture failures still throw.

`getWindow()` refreshes frame once when the window is created. By default,
window-relative operations refresh frame again when they need current window
geometry. Pass `{ cacheFrame: true }` to `getWindow()` to reuse cached frame by
default, or pass `refreshFrame` on a specific `move()`, `click()`, `fclick()`,
`find()`, or `findAll()` call to override that behavior.

Each `Match` exposes `confidence`, `origin`, `size`, and `center`. Coordinates
and sizes are window-relative logical pixels and may be fractional.

Image search currently does not support multi-scale matching or rotation.
Templates should be captured at the scale of the display where they are used.
Windows spanning displays with different scales are not supported.

`checkRequirements()` is kept as a compatibility preflight hook. Accessibility
permission is requested by `silentmouse` on first use, and Screen Recording
permission errors surface when image capture runs.
