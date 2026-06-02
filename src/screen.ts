import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { loadImage } from "@nut-tree-fork/nut-js";

import type { Bitmap, ScreenCapture } from "./image-finder.ts";
import type { WindowBounds } from "./window-bounds.ts";

const execFileAsync = promisify(execFile);

export interface NutImage {
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

export interface MacScreenCaptureDependencies {
  capture(bounds: WindowBounds, path: string): Promise<void>;
  load(path: string): Promise<NutImage>;
  makeDirectory(): Promise<string>;
  removeDirectory(path: string): Promise<void>;
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

const defaultDependencies: MacScreenCaptureDependencies = {
  async capture(bounds, path): Promise<void> {
    await execFileAsync("/usr/sbin/screencapture", [
      "-x",
      `-R${bounds.origin.x},${bounds.origin.y},${bounds.size.width},${bounds.size.height}`,
      path,
    ]);
  },
  load: loadImage,
  async makeDirectory(): Promise<string> {
    return mkdtemp(join(tmpdir(), "micro-screen-"));
  },
  async removeDirectory(path): Promise<void> {
    await rm(path, { force: true, recursive: true });
  },
};

export const createMacScreenCapture = (
  dependencies: MacScreenCaptureDependencies = defaultDependencies,
): ScreenCapture => ({
  async grab(bounds): Promise<Bitmap> {
    if (process.platform !== "darwin") {
      throw new Error("Micro only supports macOS");
    }

    const directory = await dependencies.makeDirectory();
    const path = join(directory, "capture.png");

    try {
      await dependencies.capture(bounds, path);

      const bitmap = normalizeScreenImage(await dependencies.load(path));

      return {
        ...bitmap,
        scaleX: bitmap.width / bounds.size.width,
        scaleY: bitmap.height / bounds.size.height,
      };
    } finally {
      await dependencies.removeDirectory(directory);
    }
  },
});

export const macScreenCapture = createMacScreenCapture();
