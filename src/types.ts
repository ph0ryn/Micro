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

export interface FindOptions {
  confidence?: number;
  end?: Point;
  start?: Point;
}

export const point = (x: number, y: number): Point => ({ x, y });
