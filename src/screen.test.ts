import { describe, expect, test } from "bun:test";

import { normalizeScreenImage } from "./screen.ts";

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
