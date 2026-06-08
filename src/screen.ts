import { Window as ScreenshotWindow } from "node-screenshots";

import type { Bitmap, CaptureRegion, ScreenCapture } from "./image-finder.ts";
import type { WindowFrame } from "./window-frame.ts";

export interface CapturedImage {
  height: number;
  width: number;
  cropSync(x: number, y: number, width: number, height: number): CapturedImage;
  toRawSync(copyOutputData?: boolean | null): Buffer;
}

export interface CaptureWindow {
  captureImageSync(): CapturedImage;
  id(): number;
}

export interface MacScreenCaptureDependencies {
  listWindows(): CaptureWindow[];
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

const requireWindowId = (frame: WindowFrame): number => {
  if (frame.windowId === undefined) {
    throw new Error("CGWindowID is not initialized");
  }

  return frame.windowId;
};

const cropRegion = (
  image: CapturedImage,
  frame: WindowFrame,
  region: CaptureRegion,
): CapturedImage => {
  const scaleX = image.width / frame.size.width;
  const scaleY = image.height / frame.size.height;
  const crop = {
    height: Math.round(region.size.height * scaleY),
    width: Math.round(region.size.width * scaleX),
    x: Math.round(region.origin.x * scaleX),
    y: Math.round(region.origin.y * scaleY),
  };

  return image.cropSync(crop.x, crop.y, crop.width, crop.height);
};

export const createBitmap = (image: CapturedImage, region: CaptureRegion): Bitmap => ({
  height: image.height,
  rgb: rgbaToRgb(image),
  scaleX: image.width / region.size.width,
  scaleY: image.height / region.size.height,
  width: image.width,
});

const defaultDependencies: MacScreenCaptureDependencies = {
  listWindows: () => ScreenshotWindow.all(),
};

export const createMacScreenCapture = (
  dependencies: MacScreenCaptureDependencies = defaultDependencies,
): ScreenCapture => ({
  async grab(frame, region): Promise<Bitmap> {
    if (process.platform !== "darwin") {
      throw new Error("Micro only supports macOS");
    }

    const windowId = requireWindowId(frame);
    const window = dependencies.listWindows().find((candidate) => candidate.id() === windowId);

    if (!window) {
      throw new Error(`Capture window not found for CGWindowID ${windowId}`);
    }

    const image = cropRegion(window.captureImageSync(), frame, region);

    return createBitmap(image, region);
  },
});

export const macScreenCapture = createMacScreenCapture();
