import { describe, expect, test } from "bun:test";

import { createImageFinder } from "./image-finder.ts";

import type { Image } from "./image.ts";
import type { WindowFrame } from "./window-frame.ts";

const frame: WindowFrame = {
  origin: {
    x: 100,
    y: 200,
  },
  size: {
    height: 50,
    width: 80,
  },
};

const image = {} as Image;

describe("createImageFinder", () => {
  test("converts physical pixel matches to relative logical pixels", async () => {
    const calls: unknown[][] = [];
    const finder = createImageFinder(
      {
        async grab(captureFrame) {
          calls.push(["grab", captureFrame]);

          return {
            height: 100,
            rgb: Buffer.alloc(160 * 100 * 3),
            scaleX: 2,
            scaleY: 2,
            width: 160,
          };
        },
      },
      {
        async find(bitmap, needle, confidence) {
          calls.push(["find", bitmap.width, needle, confidence]);

          return {
            confidence: 0.995,
            height: 11,
            width: 21,
            x: 5,
            y: 7,
          };
        },
        async findAll(bitmap, needle, confidence) {
          calls.push(["findAll", bitmap.width, needle, confidence]);

          return [
            {
              confidence: 0.995,
              height: 11,
              width: 21,
              x: 5,
              y: 7,
            },
          ];
        },
      },
    );

    expect(await finder.find(image, frame, 0.99)).toEqual({
      center: {
        x: 7.75,
        y: 6.25,
      },
      confidence: 0.995,
      origin: {
        x: 2.5,
        y: 3.5,
      },
      size: {
        height: 5.5,
        width: 10.5,
      },
    });

    expect(calls).toEqual([
      ["grab", frame],
      ["find", 160, image, 0.99],
    ]);
  });

  test("returns null for a missing single match and returns an empty match list", async () => {
    const finder = createImageFinder(
      {
        async grab() {
          return {
            height: 1,
            rgb: Buffer.alloc(3),
            scaleX: 1,
            scaleY: 1,
            width: 1,
          };
        },
      },
      {
        async find() {
          return null;
        },
        async findAll() {
          return [];
        },
      },
    );

    expect(await finder.find(image, frame, 0.99)).toBeNull();
    expect(await finder.findAll(image, frame, 0.99)).toEqual([]);
  });
});
