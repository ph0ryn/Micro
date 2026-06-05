import loadOpenCv from "opencv-js-wasm";

import { unwrapImage, type Image } from "./image.ts";

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
    mask?: OpenCvMat,
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

interface TemplateMats {
  mask?: OpenCvMat;
  needle: OpenCvMat;
}

interface TemplateData {
  height: number;
  mats: TemplateMats;
  maxSquaredDifference: number;
  width: number;
}

const templateCache = new WeakMap<Image, Promise<TemplateData>>();
let templateFinalizer: FinalizationRegistry<TemplateMats> | undefined = undefined;

if (typeof FinalizationRegistry !== "undefined") {
  templateFinalizer = new FinalizationRegistry<TemplateMats>((mats) => {
    mats.needle.delete();
    mats.mask?.delete();
  });
}

const createTemplateData = async (image: Image): Promise<TemplateData> => {
  const needle = unwrapImage(image);
  const cv = await getOpenCv();
  const needleMat = createMat(cv, {
    columns: needle.width,
    data: needle.rgb,
    rows: needle.height,
    type: cv.CV_8UC3,
  });
  let maskMat: OpenCvMat | undefined = undefined;

  if (needle.visiblePixels !== needle.width * needle.height) {
    maskMat = createMat(cv, {
      columns: needle.width,
      data: needle.alphaMask,
      rows: needle.height,
      type: cv.CV_8UC1,
    });
  }

  const mats = {
    mask: maskMat,
    needle: needleMat,
  };

  templateFinalizer?.register(image, mats);

  return {
    height: needle.height,
    mats,
    maxSquaredDifference: needle.visiblePixels * 3 * 255 * 255,
    width: needle.width,
  };
};

const getTemplateData = (image: Image): Promise<TemplateData> => {
  const cached = templateCache.get(image);

  if (cached) {
    return cached;
  }

  const created = createTemplateData(image);

  templateCache.set(image, created);

  return created;
};

class MatchBuckets {
  private readonly buckets = new Map<string, PixelMatch[]>();
  private readonly height: number;
  private readonly width: number;

  constructor(width: number, height: number) {
    this.height = height;
    this.width = width;
  }

  add(match: PixelMatch): void {
    const key = this.keyFor(match.x, match.y);
    const bucket = this.buckets.get(key);

    if (bucket) {
      bucket.push(match);

      return;
    }

    this.buckets.set(key, [match]);
  }

  hasOverlap(match: PixelMatch): boolean {
    const bucketX = Math.floor(match.x / this.width);
    const bucketY = Math.floor(match.y / this.height);

    for (let y = bucketY - 1; y <= bucketY + 1; y += 1) {
      for (let x = bucketX - 1; x <= bucketX + 1; x += 1) {
        const bucket = this.buckets.get(this.key(x, y));

        if (bucket?.some((existing) => overlaps(existing, match))) {
          return true;
        }
      }
    }

    return false;
  }

  private keyFor(x: number, y: number): string {
    return this.key(Math.floor(x / this.width), Math.floor(y / this.height));
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }
}

class OverlapTracker {
  private buckets?: MatchBuckets;
  private readonly height: number;
  private readonly matches: PixelMatch[];
  private readonly width: number;

  constructor(matches: PixelMatch[], width: number, height: number) {
    this.height = height;
    this.matches = matches;
    this.width = width;
  }

  add(match: PixelMatch): void {
    this.buckets?.add(match);
    this.matches.push(match);

    if (!this.buckets && this.matches.length >= 32) {
      this.buckets = new MatchBuckets(this.width, this.height);

      for (const existing of this.matches) {
        this.buckets.add(existing);
      }
    }
  }

  hasOverlap(match: PixelMatch): boolean {
    if (this.buckets) {
      return this.buckets.hasOverlap(match);
    }

    return this.matches.some((existing) => overlaps(existing, match));
  }
}

interface MatchTemplateResult {
  maxSquaredDifference: number;
  needleHeight: number;
  needleWidth: number;
  resultData: Float32Array;
  resultHeight: number;
  resultWidth: number;
}

const findMatches = async <Result>(
  haystack: Parameters<TemplateMatcher["findAll"]>[0],
  image: Parameters<TemplateMatcher["findAll"]>[1],
  callback: (result: MatchTemplateResult) => Result,
): Promise<Result> => {
  const template = await getTemplateData(image);

  if (template.width > haystack.width || template.height > haystack.height) {
    return callback({
      maxSquaredDifference: 0,
      needleHeight: template.height,
      needleWidth: template.width,
      resultData: new Float32Array(),
      resultHeight: 0,
      resultWidth: 0,
    });
  }

  const cv = await getOpenCv();
  const haystackMat = createMat(cv, {
    columns: haystack.width,
    data: haystack.rgb,
    rows: haystack.height,
    type: cv.CV_8UC3,
  });
  const resultMat = new cv.Mat();

  try {
    if (template.mats.mask) {
      cv.matchTemplate(
        haystackMat,
        template.mats.needle,
        resultMat,
        cv.TM_SQDIFF,
        template.mats.mask,
      );
    } else {
      cv.matchTemplate(haystackMat, template.mats.needle, resultMat, cv.TM_SQDIFF);
    }

    return callback({
      maxSquaredDifference: template.maxSquaredDifference,
      needleHeight: template.height,
      needleWidth: template.width,
      resultData: resultMat.data32F,
      resultHeight: haystack.height - template.height + 1,
      resultWidth: haystack.width - template.width + 1,
    });
  } finally {
    haystackMat.delete();
    resultMat.delete();
  }
};

export const opencvMatcher: TemplateMatcher = {
  async find(haystack, image, confidence): Promise<PixelMatch | null> {
    return findMatches(haystack, image, (result) => {
      const thresholdScore = (1 - confidence) * result.maxSquaredDifference;

      for (let y = 0; y < result.resultHeight; y += 1) {
        for (let x = 0; x < result.resultWidth; x += 1) {
          const score = result.resultData[y * result.resultWidth + x];

          if (score !== undefined && Number.isFinite(score) && score <= thresholdScore) {
            return {
              confidence: Math.min(1, Math.max(0, 1 - score / result.maxSquaredDifference)),
              height: result.needleHeight,
              width: result.needleWidth,
              x,
              y,
            };
          }
        }
      }

      return null;
    });
  },

  async findAll(haystack, image, confidence): Promise<PixelMatch[]> {
    return findMatches(haystack, image, (result) => {
      const thresholdScore = (1 - confidence) * result.maxSquaredDifference;
      const matches: PixelMatch[] = [];
      const overlapTracker = new OverlapTracker(matches, result.needleWidth, result.needleHeight);

      for (let y = 0; y < result.resultHeight; y += 1) {
        for (let x = 0; x < result.resultWidth; x += 1) {
          const score = result.resultData[y * result.resultWidth + x];

          if (score !== undefined && Number.isFinite(score) && score <= thresholdScore) {
            const match = {
              confidence: Math.min(1, Math.max(0, 1 - score / result.maxSquaredDifference)),
              height: result.needleHeight,
              width: result.needleWidth,
              x,
              y,
            };

            if (!overlapTracker.hasOverlap(match)) {
              overlapTracker.add(match);
            }
          }
        }
      }

      return matches;
    });
  },
};
