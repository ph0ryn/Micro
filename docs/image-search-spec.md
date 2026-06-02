# Image Search Specification

## Scope

Image search locates PNG templates inside a selected application window.
Templates are loaded once and reused across searches.

Image search requires Screen Recording permission for the terminal or
application running the script. The selected window must be visible on the
main display.

## API

```ts
type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

type Match = {
  confidence: number;
  origin: Point;
  size: Size;
  center: Point;
};

class Image {
  private constructor();
}

loadImage(imagePath: string): Promise<Image>;

class Window {
  find(image: Image, confidence?: number): Promise<Match>;
  findAll(image: Image, confidence?: number): Promise<Match[]>;
}
```

`Image` is opaque. Callers load it with `loadImage()` and pass it to search
methods without inspecting its internal representation.

## Template Loading

- `loadImage()` accepts PNG templates only.
- Loaded images are reusable across searches.
- Transparent template pixels are excluded from matching.

## Matching Behavior

- `Window.find()` and `Window.findAll()` search inside the selected window.
- `confidence` is an optional threshold from `0` to `1`.
- The default confidence threshold is `0.99`.
- `Window.find()` returns the first threshold match in top-left order.
- `Window.find()` throws if no match meets the threshold.
- `Window.findAll()` returns non-overlapping threshold matches in top-left
  order.
- `Window.findAll()` returns an empty array if no match meets the threshold.

## Match Coordinates

Each `Match` exposes:

- `confidence`: the template match confidence.
- `origin`: the top-left point of the matched region.
- `size`: the width and height of the matched region.
- `center`: the center point of the matched region.

`origin`, `size`, and `center` use window-relative logical pixels. Their values
may be fractional.

## Initial Exclusions

- Multi-scale matching
- Rotated template matching
- Searching windows on subdisplays
