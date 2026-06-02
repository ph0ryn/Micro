import { open } from "node:fs/promises";

import { loadImage as loadNutImage } from "@nut-tree-fork/nut-js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ImageData {
  readonly width: number;
  readonly height: number;
  readonly rgb: Buffer;
  readonly alphaMask: Buffer;
  readonly visiblePixels: number;
}

const imageData = new WeakMap<Image, ImageData>();

const assertPng = async (imagePath: string): Promise<void> => {
  const file = await open(imagePath, "r");

  try {
    const signature = Buffer.alloc(PNG_SIGNATURE.length);
    const { bytesRead } = await file.read(signature, 0, signature.length, 0);

    for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
      if (signature[index] !== PNG_SIGNATURE[index]) {
        throw new Error(`Only PNG images are supported: ${imagePath}`);
      }
    }

    if (bytesRead !== signature.length) {
      throw new Error(`Only PNG images are supported: ${imagePath}`);
    }
  } finally {
    await file.close();
  }
};

export class Image {
  private constructor(data: ImageData) {
    imageData.set(this, data);
  }
}

export const createImage = (data: ImageData): Image => Reflect.construct(Image, [data]) as Image;

export const unwrapImage = (image: Image): ImageData => {
  const data = imageData.get(image);

  if (data === undefined) {
    throw new Error("Invalid Image");
  }

  return data;
};

export const loadImage = async (imagePath: string): Promise<Image> => {
  await assertPng(imagePath);

  const decoded = await loadNutImage(imagePath);
  const pixelCount = decoded.width * decoded.height;
  const rgb = Buffer.alloc(pixelCount * 3);
  const alphaMask = Buffer.alloc(pixelCount);
  let visiblePixels = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const decodedOffset = pixel * 4;
    const rgbOffset = pixel * 3;
    const alpha = decoded.data[decodedOffset + 3]!;

    rgb[rgbOffset] = decoded.data[decodedOffset + 2]!;
    rgb[rgbOffset + 1] = decoded.data[decodedOffset + 1]!;
    rgb[rgbOffset + 2] = decoded.data[decodedOffset]!;

    if (alpha !== 0) {
      alphaMask[pixel] = 1;
      visiblePixels += 1;
    }
  }

  if (visiblePixels === 0) {
    throw new Error(`Image must contain at least one visible pixel: ${imagePath}`);
  }

  return createImage({
    alphaMask,
    height: decoded.height,
    rgb,
    visiblePixels,
    width: decoded.width,
  });
};
