import { describe, expect, test } from "bun:test";

import {
  createBitmap,
  createMacScreenCapture,
  type CapturedImage,
  type MacScreenCaptureDependencies,
  type ScreenMonitor,
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

const createMonitor = (
  image: CapturedImage,
  options: {
    scale: number;
    x: number;
    y: number;
  },
): ScreenMonitor => ({
  captureImageSync: () => image,
  scaleFactor: () => options.scale,
  x: () => options.x,
  y: () => options.y,
});

describe("createBitmap", () => {
  test("converts RGBA screenshot data to RGB while deriving density", () => {
    expect(
      createBitmap(
        new TestImage(
          2,
          2,
          Buffer.from([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]),
        ),
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
  test("captures negative desktop coordinates from the containing monitor", async () => {
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
      findMonitor(x, y): ScreenMonitor {
        calls.push(["findMonitor", x, y]);

        return createMonitor(image, {
          scale: 1,
          x: -10,
          y: -5,
        });
      },
    };

    expect(
      await createMacScreenCapture(dependencies).grab({
        origin: {
          x: -9,
          y: -4,
        },
        size: {
          height: 2,
          width: 2,
        },
      }),
    ).toEqual({
      height: 2,
      rgb: Buffer.from([15, 16, 17, 18, 19, 20, 27, 28, 29, 30, 31, 32]),
      scaleX: 1,
      scaleY: 1,
      width: 2,
    });

    expect(calls).toEqual([["findMonitor", -9, -4]]);
  });

  test("applies monitor scale before cropping", async () => {
    const raw = Array.from({ length: 6 * 6 * 4 }).map((unused, index) => {
      void unused;

      if (index % 4 === 3) {
        return 255;
      }

      return index;
    });
    const image = new TestImage(6, 6, Buffer.from(raw));

    const bitmap = await createMacScreenCapture({
      findMonitor: () =>
        createMonitor(image, {
          scale: 2,
          x: 10,
          y: 20,
        }),
    }).grab({
      origin: {
        x: 11,
        y: 21,
      },
      size: {
        height: 1,
        width: 1,
      },
    });

    expect(bitmap.width).toBe(2);
    expect(bitmap.height).toBe(2);
    expect(bitmap.scaleX).toBe(2);
    expect(bitmap.scaleY).toBe(2);
  });

  test("rejects captures that extend beyond the selected monitor", async () => {
    const image = new TestImage(2, 2, Buffer.alloc(2 * 2 * 4));

    expect(
      createMacScreenCapture({
        findMonitor: () =>
          createMonitor(image, {
            scale: 1,
            x: 0,
            y: 0,
          }),
      }).grab({
        origin: {
          x: 1,
          y: 1,
        },
        size: {
          height: 2,
          width: 2,
        },
      }),
    ).rejects.toThrow("Capture bounds must be inside a single monitor");
  });

  test("rejects captures that start outside all monitors", async () => {
    expect(
      createMacScreenCapture({
        findMonitor: () => null,
      }).grab({
        origin: {
          x: 0,
          y: 0,
        },
        size: {
          height: 1,
          width: 1,
        },
      }),
    ).rejects.toThrow("Capture bounds must start inside a monitor");
  });
});
