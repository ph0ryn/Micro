export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const point = (x: number, y: number): Point => ({ x, y });
