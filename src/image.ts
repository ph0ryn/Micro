import { open, readFile } from "node:fs/promises";

import { PNG } from "pngjs";

import { createMat, getOpenCv, type OpenCvMat } from "./opencv-runtime.ts";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ImageData {
  readonly width: number;
  readonly height: number;
  readonly rgb: Buffer;
  readonly alphaMask: Buffer;
  readonly visiblePixels: number;
}

export interface ImageTemplateMats {
  mask?: OpenCvMat;
  needle: OpenCvMat;
}

export interface ImageTemplateData {
  height: number;
  mats: ImageTemplateMats;
  maxSquaredDifference: number;
  width: number;
}

const imageData = new WeakMap<Image, ImageData>();
const imageTemplateData = new WeakMap<Image, Promise<ImageTemplateData>>();

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

const createImageTemplateData = async (data: ImageData): Promise<ImageTemplateData> => {
  const cv = await getOpenCv();
  const needleMat = createMat(cv, {
    columns: data.width,
    data: data.rgb,
    rows: data.height,
    type: cv.CV_8UC3,
  });
  let maskMat: OpenCvMat | undefined = undefined;

  if (data.visiblePixels !== data.width * data.height) {
    maskMat = createMat(cv, {
      columns: data.width,
      data: data.alphaMask,
      rows: data.height,
      type: cv.CV_8UC1,
    });
  }

  const mats = {
    mask: maskMat,
    needle: needleMat,
  };

  return {
    height: data.height,
    mats,
    maxSquaredDifference: data.visiblePixels * 3 * 255 * 255,
    width: data.width,
  };
};

export const getImageTemplateData = (image: Image): Promise<ImageTemplateData> => {
  const cached = imageTemplateData.get(image);

  if (cached) {
    return cached;
  }

  const created = createImageTemplateData(unwrapImage(image));

  imageTemplateData.set(image, created);

  return created;
};

export const loadImage = async (imagePath: string): Promise<Image> => {
  await assertPng(imagePath);

  const decoded = PNG.sync.read(await readFile(imagePath));
  const pixelCount = decoded.width * decoded.height;
  const rgb = Buffer.alloc(pixelCount * 3);
  const alphaMask = Buffer.alloc(pixelCount);
  let visiblePixels = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const decodedOffset = pixel * 4;
    const rgbOffset = pixel * 3;
    const alpha = decoded.data[decodedOffset + 3]!;

    rgb[rgbOffset] = decoded.data[decodedOffset]!;
    rgb[rgbOffset + 1] = decoded.data[decodedOffset + 1]!;
    rgb[rgbOffset + 2] = decoded.data[decodedOffset + 2]!;

    if (alpha !== 0) {
      alphaMask[pixel] = 1;
      visiblePixels += 1;
    }
  }

  if (visiblePixels === 0) {
    throw new Error(`Image must contain at least one visible pixel: ${imagePath}`);
  }

  const image = createImage({
    alphaMask,
    height: decoded.height,
    rgb,
    visiblePixels,
    width: decoded.width,
  });

  return image;
};
