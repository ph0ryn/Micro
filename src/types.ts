export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Match {
  center: Point;
  confidence: number;
  origin: Point;
  size: Size;
}

export interface BoundsOptions {
  refreshBounds?: boolean;
}

export interface FindOptions extends BoundsOptions {
  confidence?: number;
  end?: Point;
  start?: Point;
}

export interface MoveOptions extends BoundsOptions {
  safeWait?: boolean;
}

export const point = (x: number, y: number): Point => ({ x, y });
