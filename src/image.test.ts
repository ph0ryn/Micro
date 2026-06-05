import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getImageTemplateData, loadImage, unwrapImage } from "./image.ts";

const FIXTURES = {
  fullyTransparent:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgZGJmAAAAFQAHLKogTgAAAABJRU5ErkJggg==",
  halfTransparent:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgZGJuAAAAlQCHE8j2iQAAAABJRU5ErkJggg==",
  transparentPixel:
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGNgZGJmYGFl+w8AAVsBFbp8cSsAAAAASUVORK5CYII=",
  valid:
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z+Dwn6Hh/38AEvkEvWnRf/QAAAAASUVORK5CYII=",
} as const;

let fixtureDirectory = "";

const writeFixture = async (
  name: string,
  data: string,
  encoding: BufferEncoding = "base64",
): Promise<string> => {
  const path = join(fixtureDirectory, name);

  await writeFile(path, data, encoding);

  return path;
};

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), "micro-image-"));
});

afterAll(async () => {
  await rm(fixtureDirectory, { force: true, recursive: true });
});

describe("loadImage", () => {
  test("loads PNG dimensions and packed buffers without public properties", async () => {
    const path = await writeFixture("valid.png", FIXTURES.valid);
    const image = await loadImage(path);

    expect(Object.keys(image)).toEqual([]);

    expect(unwrapImage(image)).toEqual({
      alphaMask: Buffer.from([1, 1]),
      height: 1,
      rgb: Buffer.from([255, 0, 64, 0, 128, 255]),
      visiblePixels: 2,
      width: 2,
    });

    const template = await getImageTemplateData(image);

    expect(template).toMatchObject({
      height: 1,
      maxSquaredDifference: 2 * 3 * 255 * 255,
      width: 2,
    });

    expect(template.mats.mask).toBeUndefined();
  });

  test("excludes fully transparent pixels from the mask", async () => {
    const path = await writeFixture("transparent-pixel.png", FIXTURES.transparentPixel);

    const image = await loadImage(path);

    expect(unwrapImage(image)).toMatchObject({
      alphaMask: Buffer.from([0, 1]),
      visiblePixels: 1,
    });

    expect((await getImageTemplateData(image)).mats.mask).toBeDefined();
  });

  test("includes half-transparent pixels in the mask", async () => {
    const path = await writeFixture("half-transparent.png", FIXTURES.halfTransparent);

    expect(unwrapImage(await loadImage(path))).toMatchObject({
      alphaMask: Buffer.from([1]),
      visiblePixels: 1,
    });
  });

  test("rejects fully transparent PNG images", async () => {
    const path = await writeFixture("fully-transparent.png", FIXTURES.fullyTransparent);

    expect(loadImage(path)).rejects.toThrow("at least one visible pixel");
  });

  test("rejects non-PNG images", async () => {
    const path = await writeFixture("not-an-image.jpg", "not a PNG", "utf8");

    expect(loadImage(path)).rejects.toThrow("Only PNG images are supported");
  });
});
