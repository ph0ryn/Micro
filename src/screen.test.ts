import { describe, expect, test } from "bun:test";

import {
  createBitmap,
  createMacScreenCapture,
  type CapturedImage,
  type CaptureWindow,
  type MacScreenCaptureDependencies,
} from "./screen.ts";

class TestImage implements CapturedImage {
  readonly height: number;
  readonly width: number;
  private readonly raw: Buffer;

  constructor(width: number, height: number, raw: Buffer) {
    this.height = height;
    this.raw = raw;
    this.width = width;
  }

  cropSync(...crop: [x: number, y: number, width: number, height: number]): CapturedImage {
    const [x, y, width, height] = crop;
    const croppedWidth = Math.max(0, Math.min(width, this.width - x));
    const croppedHeight = Math.max(0, Math.min(height, this.height - y));
    const raw = Buffer.alloc(croppedWidth * croppedHeight * 4);

    for (let row = 0; row < croppedHeight; row += 1) {
      const source = ((y + row) * this.width + x) * 4;
      const target = row * croppedWidth * 4;

      raw.set(this.raw.subarray(source, source + croppedWidth * 4), target);
    }

    return new TestImage(croppedWidth, croppedHeight, raw);
  }

  toRawSync(): Buffer {
    return this.raw;
  }
}

const createWindow = (id: number, image: CapturedImage, calls: unknown[][]): CaptureWindow => ({
  captureImageSync(): CapturedImage {
    calls.push(["captureWindow", id]);

    return image;
  },
  id: () => id,
});

describe("createBitmap", () => {
  test("converts RGBA screenshot data to RGB while deriving region density", () => {
    expect(
      createBitmap(
        new TestImage(
          2,
          2,
          Buffer.from([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]),
        ),
        {
          origin: {
            x: 4,
            y: 5,
          },
          size: {
            height: 1,
            width: 1,
          },
        },
      ),
    ).toEqual({
      height: 2,
      rgb: Buffer.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
      scaleX: 2,
      scaleY: 2,
      width: 2,
    });
  });
});

describe("createMacScreenCapture", () => {
  test("captures the matching window and crops the requested local region", async () => {
    const calls: unknown[][] = [];
    const image = new TestImage(
      4,
      4,
      Buffer.from([
        0, 1, 2, 255, 3, 4, 5, 255, 6, 7, 8, 255, 9, 10, 11, 255, 12, 13, 14, 255, 15, 16, 17, 255,
        18, 19, 20, 255, 21, 22, 23, 255, 24, 25, 26, 255, 27, 28, 29, 255, 30, 31, 32, 255, 33, 34,
        35, 255, 36, 37, 38, 255, 39, 40, 41, 255, 42, 43, 44, 255, 45, 46, 47, 255,
      ]),
    );
    const dependencies: MacScreenCaptureDependencies = {
      listWindows: () => [
        createWindow(111, new TestImage(1, 1, Buffer.alloc(4)), calls),
        createWindow(123, image, calls),
      ],
    };

    expect(
      await createMacScreenCapture(dependencies).grab(
        {
          origin: {
            x: 100,
            y: 200,
          },
          size: {
            height: 4,
            width: 4,
          },
          windowId: 123,
        },
        {
          origin: {
            x: 1,
            y: 1,
          },
          size: {
            height: 2,
            width: 2,
          },
        },
      ),
    ).toEqual({
      height: 2,
      rgb: Buffer.from([15, 16, 17, 18, 19, 20, 27, 28, 29, 30, 31, 32]),
      scaleX: 1,
      scaleY: 1,
      width: 2,
    });

    expect(calls).toEqual([["captureWindow", 123]]);
  });

  test("applies window capture scale before cropping", async () => {
    const calls: unknown[][] = [];
    const raw = Array.from({ length: 6 * 6 * 4 }).map((unused, index) => {
      void unused;

      if (index % 4 === 3) {
        return 255;
      }

      return index;
    });
    const image = new TestImage(6, 6, Buffer.from(raw));

    const bitmap = await createMacScreenCapture({
      listWindows: () => [createWindow(123, image, calls)],
    }).grab(
      {
        origin: {
          x: 10,
          y: 20,
        },
        size: {
          height: 3,
          width: 3,
        },
        windowId: 123,
      },
      {
        origin: {
          x: 1,
          y: 1,
        },
        size: {
          height: 1,
          width: 1,
        },
      },
    );

    expect(bitmap.width).toBe(2);
    expect(bitmap.height).toBe(2);
    expect(bitmap.scaleX).toBe(2);
    expect(bitmap.scaleY).toBe(2);
  });

  test("rejects captures without a CGWindowID", async () => {
    expect(
      createMacScreenCapture({
        listWindows: () => [],
      }).grab(
        {
          origin: {
            x: 0,
            y: 0,
          },
          size: {
            height: 1,
            width: 1,
          },
        },
        {
          origin: {
            x: 0,
            y: 0,
          },
          size: {
            height: 1,
            width: 1,
          },
        },
      ),
    ).rejects.toThrow("CGWindowID is not initialized");
  });

  test("rejects captures when the target window is missing", async () => {
    expect(
      createMacScreenCapture({
        listWindows: () => [],
      }).grab(
        {
          origin: {
            x: 0,
            y: 0,
          },
          size: {
            height: 1,
            width: 1,
          },
          windowId: 123,
        },
        {
          origin: {
            x: 0,
            y: 0,
          },
          size: {
            height: 1,
            width: 1,
          },
        },
      ),
    ).rejects.toThrow("Capture window not found for CGWindowID 123");
  });
});
