import { Monitor } from "node-screenshots";

import type { Bitmap, ScreenCapture } from "./image-finder.ts";
import type { WindowBounds } from "./window-bounds.ts";

export interface CapturedImage {
  height: number;
  width: number;
  cropSync(x: number, y: number, width: number, height: number): CapturedImage;
  toRawSync(copyOutputData?: boolean | null): Buffer;
}

export interface ScreenMonitor {
  captureImageSync(): CapturedImage;
  scaleFactor(): number;
  x(): number;
  y(): number;
}

export interface MacScreenCaptureDependencies {
  findMonitor(x: number, y: number): ScreenMonitor | null;
}

const rgbaToRgb = (image: CapturedImage): Buffer => {
  const raw = image.toRawSync(false);
  const pixelCount = image.width * image.height;
  const rgb = Buffer.alloc(pixelCount * 3);

  for (let source = 0, target = 0; source < pixelCount * 4; source += 4, target += 3) {
    rgb[target] = raw[source] ?? 0;
    rgb[target + 1] = raw[source + 1] ?? 0;
    rgb[target + 2] = raw[source + 2] ?? 0;
  }

  return rgb;
};

const cropBounds = (
  monitor: ScreenMonitor,
  bounds: WindowBounds,
): {
  height: number;
  width: number;
  x: number;
  y: number;
} => {
  const scale = monitor.scaleFactor();

  return {
    height: Math.round(bounds.size.height * scale),
    width: Math.round(bounds.size.width * scale),
    x: Math.round((bounds.origin.x - monitor.x()) * scale),
    y: Math.round((bounds.origin.y - monitor.y()) * scale),
  };
};

export const createBitmap = (image: CapturedImage, bounds: WindowBounds): Bitmap => {
  const scaleX = image.width / bounds.size.width;
  const scaleY = image.height / bounds.size.height;

  return {
    height: image.height,
    rgb: rgbaToRgb(image),
    scaleX,
    scaleY,
    width: image.width,
  };
};

const assertCapturedSize = (image: CapturedImage, width: number, height: number): void => {
  if (image.width !== width || image.height !== height) {
    throw new Error("Capture bounds must be inside a single monitor");
  }
};

const defaultDependencies: MacScreenCaptureDependencies = {
  findMonitor: (x, y) => Monitor.fromPoint(x, y),
};

export const createMacScreenCapture = (
  dependencies: MacScreenCaptureDependencies = defaultDependencies,
): ScreenCapture => ({
  async grab(bounds): Promise<Bitmap> {
    if (process.platform !== "darwin") {
      throw new Error("Micro only supports macOS");
    }

    const monitor = dependencies.findMonitor(bounds.origin.x, bounds.origin.y);

    if (!monitor) {
      throw new Error("Capture bounds must start inside a monitor");
    }

    const source = monitor.captureImageSync();
    const crop = cropBounds(monitor, bounds);
    const image = source.cropSync(crop.x, crop.y, crop.width, crop.height);

    assertCapturedSize(image, crop.width, crop.height);

    return createBitmap(image, bounds);
  },
});

export const macScreenCapture = createMacScreenCapture();
