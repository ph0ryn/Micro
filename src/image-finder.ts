import type { Image } from "./image.ts";
import type { Match } from "./types.ts";
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

export interface ScreenCapture {
  grab(frame: WindowFrame): Promise<Bitmap>;
}

export interface TemplateMatcher {
  find(haystack: Bitmap, needle: Image, confidence: number): Promise<PixelMatch | null>;
  findAll(haystack: Bitmap, needle: Image, confidence: number): Promise<PixelMatch[]>;
}

export interface ImageFinder {
  find(image: Image, frame: WindowFrame, confidence: number): Promise<Match | null>;
  findAll(image: Image, frame: WindowFrame, confidence: number): Promise<Match[]>;
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
  async find(image, frame, confidence): Promise<Match | null> {
    const bitmap = await screenCapture.grab(frame);
    const match = await templateMatcher.find(bitmap, image, confidence);

    if (!match) {
      return null;
    }

    return toLogicalMatch(match, bitmap);
  },

  async findAll(image, frame, confidence): Promise<Match[]> {
    const bitmap = await screenCapture.grab(frame);
    const matches = await templateMatcher.findAll(bitmap, image, confidence);

    return matches.map((match) => toLogicalMatch(match, bitmap));
  },
});
