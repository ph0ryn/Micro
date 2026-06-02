import { describe, expect, test } from "bun:test";

import {
  createMacScreenCapture,
  type MacScreenCaptureDependencies,
  normalizeScreenImage,
} from "./screen.ts";

describe("normalizeScreenImage", () => {
  test("packs BGR screenshot rows while respecting stride and density", () => {
    expect(
      normalizeScreenImage({
        byteWidth: 12,
        channels: 4,
        colorMode: 0,
        data: Buffer.from([
          30, 20, 10, 255, 60, 50, 40, 255, 0, 0, 0, 0, 90, 80, 70, 255, 120, 110, 100, 255, 0, 0,
          0, 0,
        ]),
        height: 2,
        pixelDensity: {
          scaleX: 2,
          scaleY: 2,
        },
        width: 2,
      }),
    ).toEqual({
      height: 2,
      rgb: Buffer.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
      scaleX: 2,
      scaleY: 2,
      width: 2,
    });
  });

  test("preserves RGB channel order", () => {
    expect(
      normalizeScreenImage({
        byteWidth: 3,
        channels: 3,
        colorMode: 1,
        data: Buffer.from([10, 20, 30]),
        height: 1,
        pixelDensity: {
          scaleX: 1,
          scaleY: 1,
        },
        width: 1,
      }).rgb,
    ).toEqual(Buffer.from([10, 20, 30]));
  });
});

describe("createMacScreenCapture", () => {
  test("passes negative desktop coordinates and derives density from the PNG size", async () => {
    const calls: unknown[][] = [];
    const dependencies: MacScreenCaptureDependencies = {
      async capture(bounds, path): Promise<void> {
        calls.push(["capture", bounds, path]);
      },
      async load(path) {
        calls.push(["load", path]);

        return {
          byteWidth: 8,
          channels: 4,
          colorMode: 0,
          data: Buffer.alloc(16),
          height: 2,
          pixelDensity: {
            scaleX: 1,
            scaleY: 1,
          },
          width: 2,
        };
      },
      async makeDirectory(): Promise<string> {
        calls.push(["makeDirectory"]);

        return "/tmp/micro-screen-test";
      },
      async removeDirectory(path): Promise<void> {
        calls.push(["removeDirectory", path]);
      },
    };
    const bounds = {
      origin: {
        x: -1920,
        y: -94,
      },
      size: {
        height: 1,
        width: 1,
      },
    };

    expect(await createMacScreenCapture(dependencies).grab(bounds)).toEqual({
      height: 2,
      rgb: Buffer.alloc(12),
      scaleX: 2,
      scaleY: 2,
      width: 2,
    });

    expect(calls).toEqual([
      ["makeDirectory"],
      ["capture", bounds, "/tmp/micro-screen-test/capture.png"],
      ["load", "/tmp/micro-screen-test/capture.png"],
      ["removeDirectory", "/tmp/micro-screen-test"],
    ]);
  });

  test("removes the temporary directory when capture fails", async () => {
    const calls: unknown[][] = [];
    const dependencies: MacScreenCaptureDependencies = {
      async capture(): Promise<void> {
        throw new Error("capture failed");
      },
      async load() {
        throw new Error("unexpected load");
      },
      async makeDirectory(): Promise<string> {
        return "/tmp/micro-screen-test";
      },
      async removeDirectory(path): Promise<void> {
        calls.push(["removeDirectory", path]);
      },
    };

    expect(
      createMacScreenCapture(dependencies).grab({
        origin: {
          x: -1,
          y: 0,
        },
        size: {
          height: 1,
          width: 1,
        },
      }),
    ).rejects.toThrow("capture failed");

    expect(calls).toEqual([["removeDirectory", "/tmp/micro-screen-test"]]);
  });
});
