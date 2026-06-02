import loadOpenCv from "opencv-js-wasm";

import { unwrapImage } from "./image.ts";

import type { PixelMatch, TemplateMatcher } from "./image-finder.ts";

interface OpenCvMat {
  data32F: Float32Array;
  data8U: Uint8Array;
  delete(): void;
}

interface OpenCv {
  CV_8UC1: number;
  CV_8UC3: number;
  Mat: new (rows?: number, columns?: number, type?: number) => OpenCvMat;
  TM_SQDIFF: number;
  matFromArray(rows: number, columns: number, type: number, data: ArrayLike<number>): OpenCvMat;
  matchTemplate(
    haystack: OpenCvMat,
    needle: OpenCvMat,
    result: OpenCvMat,
    method: number,
    mask: OpenCvMat,
  ): void;
}

let openCvPromise: Promise<OpenCv> | undefined = undefined;

const getOpenCv = (): Promise<OpenCv> => {
  openCvPromise ??= loadOpenCv() as unknown as Promise<OpenCv>;

  return openCvPromise;
};

const overlaps = (left: PixelMatch, right: PixelMatch): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

interface MatData {
  columns: number;
  data: ArrayLike<number>;
  rows: number;
  type: number;
}

const createMat = (cv: OpenCv, input: MatData): OpenCvMat =>
  cv.matFromArray(input.rows, input.columns, input.type, input.data);

export const opencvMatcher: TemplateMatcher = {
  async findAll(haystack, image, confidence): Promise<PixelMatch[]> {
    const needle = unwrapImage(image);

    if (needle.width > haystack.width || needle.height > haystack.height) {
      return [];
    }

    const cv = await getOpenCv();
    const haystackMat = createMat(cv, {
      columns: haystack.width,
      data: haystack.rgb,
      rows: haystack.height,
      type: cv.CV_8UC3,
    });
    const needleMat = createMat(cv, {
      columns: needle.width,
      data: needle.rgb,
      rows: needle.height,
      type: cv.CV_8UC3,
    });
    const maskMat = createMat(cv, {
      columns: needle.width,
      data: needle.alphaMask,
      rows: needle.height,
      type: cv.CV_8UC1,
    });
    const resultMat = new cv.Mat();

    try {
      cv.matchTemplate(haystackMat, needleMat, resultMat, cv.TM_SQDIFF, maskMat);

      const resultWidth = haystack.width - needle.width + 1;
      const resultHeight = haystack.height - needle.height + 1;
      const maxSquaredDifference = needle.visiblePixels * 3 * 255 * 255;
      const matches: PixelMatch[] = [];

      for (let y = 0; y < resultHeight; y += 1) {
        for (let x = 0; x < resultWidth; x += 1) {
          const score = resultMat.data32F[y * resultWidth + x];

          if (score !== undefined && Number.isFinite(score)) {
            const match = {
              confidence: Math.min(1, Math.max(0, 1 - score / maxSquaredDifference)),
              height: needle.height,
              width: needle.width,
              x,
              y,
            };

            if (
              match.confidence >= confidence &&
              !matches.some((existing) => overlaps(existing, match))
            ) {
              matches.push(match);
            }
          }
        }
      }

      return matches;
    } finally {
      haystackMat.delete();
      needleMat.delete();
      maskMat.delete();
      resultMat.delete();
    }
  },
};
