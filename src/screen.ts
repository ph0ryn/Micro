import { Region, screen } from "@nut-tree-fork/nut-js";

import type { Bitmap, ScreenCapture } from "./image-finder.ts";

interface NutImage {
  byteWidth: number;
  channels: number;
  colorMode: number;
  data: Buffer;
  height: number;
  pixelDensity: {
    scaleX: number;
    scaleY: number;
  };
  width: number;
}

export const normalizeScreenImage = (image: NutImage): Bitmap => {
  const rgb = Buffer.alloc(image.width * image.height * 3);
  const isRgb = image.colorMode === 1;
  let redOffset = 2;
  let blueOffset = 0;

  if (isRgb) {
    redOffset = 0;
    blueOffset = 2;
  }

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const source = y * image.byteWidth + x * image.channels;
      const target = (y * image.width + x) * 3;

      rgb[target] = image.data[source + redOffset] ?? 0;
      rgb[target + 1] = image.data[source + 1] ?? 0;
      rgb[target + 2] = image.data[source + blueOffset] ?? 0;
    }
  }

  return {
    height: image.height,
    rgb,
    scaleX: image.pixelDensity.scaleX,
    scaleY: image.pixelDensity.scaleY,
    width: image.width,
  };
};

export const nutScreenCapture: ScreenCapture = {
  async grab(bounds): Promise<Bitmap> {
    const image = await screen.grabRegion(
      new Region(bounds.origin.x, bounds.origin.y, bounds.size.width, bounds.size.height),
    );

    return normalizeScreenImage(image);
  },
};
