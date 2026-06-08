import loadOpenCv from "opencv-js-wasm";

export interface OpenCvMat {
  data32F: Float32Array;
  data8U: Uint8Array;
  delete(): void;
}

export interface OpenCv {
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

interface MatData {
  columns: number;
  data: ArrayLike<number>;
  rows: number;
  type: number;
}

const openCvPromiseKey = Symbol.for("micro.openCvPromise");

interface OpenCvGlobal {
  [openCvPromiseKey]?: Promise<OpenCv>;
}

const openCvGlobal = globalThis as OpenCvGlobal;

export const getOpenCv = (): Promise<OpenCv> => {
  openCvGlobal[openCvPromiseKey] ??= loadOpenCv() as unknown as Promise<OpenCv>;

  return openCvGlobal[openCvPromiseKey];
};

export const createMat = (cv: OpenCv, input: MatData): OpenCvMat =>
  cv.matFromArray(input.rows, input.columns, input.type, input.data);
