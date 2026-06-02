import type { Point, Size } from "./types.ts";

export interface NativeImage {
  width: number;
  height: number;
}

const nativeImages = new WeakMap<Image, NativeImage>();

export class Image {
  constructor(native: NativeImage) {
    nativeImages.set(this, native);
  }

  get size(): Size {
    const native = unwrapImage(this);

    return {
      height: native.height,
      width: native.width,
    };
  }

  get center(): Point {
    const native = unwrapImage(this);

    return {
      x: Math.floor(native.width / 2),
      y: Math.floor(native.height / 2),
    };
  }
}

export const unwrapImage = (image: Image): NativeImage => {
  const native = nativeImages.get(image);

  if (!native) {
    throw new Error("Invalid image");
  }

  return native;
};
