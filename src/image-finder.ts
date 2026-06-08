import type { Image } from "./image.ts";
import type { Match, Point, Size } from "./types.ts";
import type { WindowFrame } from "./window-frame.ts";

export interface Bitmap {
  height: number;
  rgb: Buffer;
  scaleX: number;
  scaleY: number;
  width: number;
}

export interface PixelMatch {
  confidence: number;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CaptureRegion {
  origin: Point;
  size: Size;
}

export interface ScreenCapture {
  grab(frame: WindowFrame, region: CaptureRegion): Promise<Bitmap>;
}

export interface TemplateMatcher {
  find(haystack: Bitmap, needle: Image, confidence: number): Promise<PixelMatch | null>;
  findAll(haystack: Bitmap, needle: Image, confidence: number): Promise<PixelMatch[]>;
}

export interface ImageFinder {
  find(request: ImageFindRequest): Promise<Match | null>;
  findAll(request: ImageFindRequest): Promise<Match[]>;
}

export interface ImageFindRequest {
  confidence: number;
  frame: WindowFrame;
  image: Image;
  region: CaptureRegion;
}

const toLogicalMatch = (match: PixelMatch, bitmap: Bitmap): Match => {
  const origin = {
    x: match.x / bitmap.scaleX,
    y: match.y / bitmap.scaleY,
  };
  const size = {
    height: match.height / bitmap.scaleY,
    width: match.width / bitmap.scaleX,
  };

  return {
    center: {
      x: origin.x + size.width / 2,
      y: origin.y + size.height / 2,
    },
    confidence: match.confidence,
    origin,
    size,
  };
};

export const createImageFinder = (
  screenCapture: ScreenCapture,
  templateMatcher: TemplateMatcher,
): ImageFinder => ({
  async find(request): Promise<Match | null> {
    const { confidence, frame, image, region } = request;
    const bitmap = await screenCapture.grab(frame, region);
    const match = await templateMatcher.find(bitmap, image, confidence);

    if (!match) {
      return null;
    }

    return toLogicalMatch(match, bitmap);
  },

  async findAll(request): Promise<Match[]> {
    const { confidence, frame, image, region } = request;
    const bitmap = await screenCapture.grab(frame, region);
    const matches = await templateMatcher.findAll(bitmap, image, confidence);

    return matches.map((match) => toLogicalMatch(match, bitmap));
  },
});
