import { describe, expect, test } from "bun:test";

import { createImage } from "./image.ts";
import { opencvMatcher } from "./opencv.ts";

const bitmap = (width: number, height: number, rgb: number[]) => ({
  height,
  rgb: Buffer.from(rgb),
  scaleX: 1,
  scaleY: 1,
  width,
});

interface ImageInput {
  alphaMask?: number[];
  height: number;
  rgb: number[];
  width: number;
}

const image = ({ alphaMask, height, rgb, width }: ImageInput) =>
  createImage({
    alphaMask: Buffer.from(alphaMask ?? Array.from({ length: width * height }, () => 1)),
    height,
    rgb: Buffer.from(rgb),
    visiblePixels: alphaMask?.filter((alpha) => alpha !== 0).length ?? width * height,
    width,
  });

describe("opencvMatcher", () => {
  test("finds black templates with a non-normalized squared difference", async () => {
    const matches = await opencvMatcher.findAll(
      bitmap(
        3,
        3,
        [
          255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255,
          255, 255, 255, 255, 255, 255, 255, 255,
        ],
      ),
      image({ height: 1, rgb: [0, 0, 0], width: 1 }),
      0.99,
    );

    expect(matches).toHaveLength(1);

    expect(matches[0]).toMatchObject({
      height: 1,
      width: 1,
      x: 1,
      y: 1,
    });

    expect(matches[0]?.confidence).toBeCloseTo(1);
  });

  test("ignores transparent pixels", async () => {
    const matches = await opencvMatcher.findAll(
      bitmap(2, 1, [10, 20, 30, 100, 110, 120]),
      image({ alphaMask: [1, 0], height: 1, rgb: [10, 20, 30, 255, 255, 255], width: 2 }),
      0.99,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.confidence).toBe(1);
  });

  test("reuses opaque templates across searches", async () => {
    const needle = image({ height: 1, rgb: [10, 20, 30], width: 1 });

    expect(await opencvMatcher.find(bitmap(1, 1, [10, 20, 30]), needle, 0.99)).toMatchObject({
      confidence: 1,
      height: 1,
      width: 1,
      x: 0,
      y: 0,
    });

    expect(await opencvMatcher.find(bitmap(1, 1, [100, 110, 120]), needle, 0.99)).toBeNull();
  });

  test("reuses masked templates across searches", async () => {
    const needle = image({
      alphaMask: [1, 0],
      height: 1,
      rgb: [10, 20, 30, 255, 255, 255],
      width: 2,
    });

    expect(
      await opencvMatcher.find(bitmap(2, 1, [10, 20, 30, 100, 110, 120]), needle, 0.99),
    ).toMatchObject({
      confidence: 1,
      height: 1,
      width: 2,
      x: 0,
      y: 0,
    });

    expect(
      await opencvMatcher.find(bitmap(2, 1, [100, 110, 120, 10, 20, 30]), needle, 0.99),
    ).toBeNull();
  });

  test("returns top-left non-overlapping threshold matches", async () => {
    const matches = await opencvMatcher.findAll(
      bitmap(4, 1, [10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30]),
      image({ height: 1, rgb: [10, 20, 30, 10, 20, 30], width: 2 }),
      0.99,
    );

    expect(matches).toEqual([
      {
        confidence: 1,
        height: 1,
        width: 2,
        x: 0,
        y: 0,
      },
      {
        confidence: 1,
        height: 1,
        width: 2,
        x: 2,
        y: 0,
      },
    ]);
  });

  test("returns no matches when the template is larger than the screenshot", async () => {
    expect(
      await opencvMatcher.findAll(
        bitmap(1, 1, [0, 0, 0]),
        image({ height: 1, rgb: [0, 0, 0, 0, 0, 0], width: 2 }),
        0,
      ),
    ).toEqual([]);
  });
});
