import { sleep } from "./util.ts";

import type { ImageFinder } from "./image-finder.ts";
import type { Image } from "./image.ts";
import type { FrameOptions, FindOptions, Match, MoveOptions, Point, Size } from "./types.ts";
import type { WindowFrame, WindowFrameProvider, WindowTarget } from "./window-frame.ts";

export interface Automation {
  click(windowId: number, target: Point): Promise<void>;
  mouseDown(windowId: number, target: Point): Promise<void>;
  mouseUp(windowId: number, target: Point): Promise<void>;
  move(request: AutomationMoveRequest): Promise<void>;
}

export interface AutomationMoveRequest {
  dragging?: boolean;
  durationMs: number;
  from?: Point;
  target: Point;
  windowId: number;
}

export interface WindowDependencies {
  automation: Automation;
  frame: WindowFrame;
  frameProvider: WindowFrameProvider;
  cacheFrame?: boolean;
  imageFinder?: ImageFinder;
  random?: () => number;
}

interface ResolvedFindOptions {
  confidence: number;
  end: Point;
  start: Point;
}

interface InternalMoveOptions {
  frame?: WindowFrame;
  safeWait?: boolean;
}

const assertDuration = (durationMs: number): void => {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error("durationMs must be a non-negative finite number");
  }
};

const assertConfidence = (confidence: number): void => {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
};

const assertPointInWindow = (target: Point, frame: WindowFrame): void => {
  if (
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    target.x < 0 ||
    target.y < 0 ||
    target.x >= frame.size.width ||
    target.y >= frame.size.height
  ) {
    throw new Error(`Point (${target.x}, ${target.y}) is outside the window`);
  }
};

const assertRefreshFrameOption = (options: FrameOptions): void => {
  if (options.refreshFrame !== undefined && typeof options.refreshFrame !== "boolean") {
    throw new Error("refreshFrame must be a boolean");
  }
};

const toFindOptions = (input: unknown): FindOptions => {
  if (typeof input !== "object" || input === null) {
    throw new Error("find options must be an object");
  }

  const options = input as FindOptions;

  assertRefreshFrameOption(options);

  return options;
};

const toMoveOptions = (input: boolean | MoveOptions | undefined): MoveOptions => {
  if (typeof input === "boolean") {
    return {
      safeWait: input,
    };
  }

  const options = input ?? {};

  assertRefreshFrameOption(options);

  return options;
};

const resolveFindOptions = (options: FindOptions, frame: WindowFrame): ResolvedFindOptions => ({
  confidence: options.confidence ?? 0.99,
  end: options.end ?? {
    x: frame.size.width,
    y: frame.size.height,
  },
  start: options.start ?? {
    x: 0,
    y: 0,
  },
});

const assertFindOptions = (options: ResolvedFindOptions, frame: WindowFrame): void => {
  if (
    !Number.isFinite(options.start.x) ||
    !Number.isFinite(options.start.y) ||
    !Number.isFinite(options.end.x) ||
    !Number.isFinite(options.end.y) ||
    options.start.x < 0 ||
    options.start.y < 0 ||
    options.end.x > frame.size.width ||
    options.end.y > frame.size.height ||
    options.end.x <= options.start.x ||
    options.end.y <= options.start.y
  ) {
    throw new Error("Search range must be inside the window with end after start");
  }
};

const toFindFrame = (frame: WindowFrame, options: ResolvedFindOptions): WindowFrame => ({
  origin: {
    x: frame.origin.x + options.start.x,
    y: frame.origin.y + options.start.y,
  },
  size: {
    height: options.end.y - options.start.y,
    width: options.end.x - options.start.x,
  },
});

const offsetMatch = (match: Match, offset: Point): Match => ({
  ...match,
  center: {
    x: match.center.x + offset.x,
    y: match.center.y + offset.y,
  },
  origin: {
    x: match.origin.x + offset.x,
    y: match.origin.y + offset.y,
  },
});

const pointerSettleMs = 100;

let windowOperation = Promise.resolve();

const runWindowOperation = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
  const current = windowOperation.then(operation, operation);

  windowOperation = current.then(
    () => undefined,
    () => undefined,
  );

  return current;
};

export class Window {
  private readonly target: WindowTarget;
  private readonly automation: Automation;
  private readonly frameProvider: WindowFrameProvider;
  private readonly cacheFrame: boolean;
  private readonly imageFinder?: ImageFinder;
  private readonly random: () => number;
  private frame: WindowFrame;
  private currentCursor: Point | null = null;
  private mousePressed = false;

  constructor(target: WindowTarget, dependencies: WindowDependencies) {
    this.target = target;
    this.automation = dependencies.automation;
    this.frame = dependencies.frame;
    this.frameProvider = dependencies.frameProvider;
    this.cacheFrame = dependencies.cacheFrame ?? false;
    this.imageFinder = dependencies.imageFinder;
    this.random = dependencies.random ?? Math.random;
  }

  async move(
    target: Point,
    durationMs: number,
    options: boolean | MoveOptions = {},
  ): Promise<void> {
    await runWindowOperation(async () => {
      const moveOptions = toMoveOptions(options);
      const frame = await this.getOperationFrame(moveOptions, false);

      await this.moveInternal(target, durationMs, {
        frame,
        safeWait: moveOptions.safeWait,
      });
    });
  }

  async focus(): Promise<void> {
    await runWindowOperation(async () => {
      this.frame = await this.frameProvider.focusAndGet(this.target);
    });
  }

  async refreshFrame(): Promise<WindowFrame> {
    return runWindowOperation(() => this.refreshFrameInternal());
  }

  async click(target?: Point, options: FrameOptions = {}): Promise<void> {
    await runWindowOperation(async () => {
      let frame = this.frame;

      if (target) {
        assertRefreshFrameOption(options);
        frame = await this.getOperationFrame(options, true);

        await this.moveInternal(target, 0, { frame });
      }

      await this.automation.click(this.requireWindowId(frame), this.requireCursor());
    });
  }

  async fclick(target: Point, fuzzy: number, options: FrameOptions = {}): Promise<void> {
    await runWindowOperation(async () => {
      if (!Number.isFinite(fuzzy) || fuzzy < 0) {
        throw new Error("fuzzy must be a non-negative finite number");
      }

      assertRefreshFrameOption(options);
      const frame = await this.getOperationFrame(options, true);

      assertPointInWindow(target, frame);

      const fuzzed = {
        x: Math.min(
          Math.max(0, target.x + Math.round((this.random() * 2 - 1) * fuzzy)),
          frame.size.width - 1,
        ),
        y: Math.min(
          Math.max(0, target.y + Math.round((this.random() * 2 - 1) * fuzzy)),
          frame.size.height - 1,
        ),
      };

      await this.moveInternal(fuzzed, 0, { frame });
      await this.automation.click(this.requireWindowId(frame), this.requireCursor());
    });
  }

  async mouseDown(target?: Point, options: FrameOptions = {}): Promise<void> {
    await runWindowOperation(async () => {
      let frame = this.frame;

      if (target) {
        assertRefreshFrameOption(options);
        frame = await this.getOperationFrame(options, true);

        await this.moveInternal(target, 0, { frame, safeWait: false });
      }

      await this.automation.mouseDown(this.requireWindowId(frame), this.requireCursor());
      this.mousePressed = true;
    });
  }

  async mouseUp(target?: Point, options: FrameOptions = {}): Promise<void> {
    await runWindowOperation(async () => {
      let frame = this.frame;

      if (target) {
        assertRefreshFrameOption(options);
        frame = await this.getOperationFrame(options, true);

        await this.moveInternal(target, 0, { frame, safeWait: false });
      }

      await this.automation.mouseUp(this.requireWindowId(frame), this.requireCursor());
      this.mousePressed = false;
    });
  }

  get cursor(): Point {
    const cursor = this.requireCursor();

    return { ...cursor };
  }

  get size(): Size {
    return this.frame.size;
  }

  async find(image: Image, options: FindOptions = {}): Promise<Match | null> {
    const imageFinder = this.getImageFinder();
    const findOptions = toFindOptions(options);
    const frame = await this.getOperationFrame(findOptions, true);
    const resolvedOptions = resolveFindOptions(findOptions, frame);

    assertConfidence(resolvedOptions.confidence);
    assertFindOptions(resolvedOptions, frame);
    const searchFrame = toFindFrame(frame, resolvedOptions);
    const match = await imageFinder.find(image, searchFrame, resolvedOptions.confidence);

    if (!match) {
      return null;
    }

    return offsetMatch(match, resolvedOptions.start);
  }

  async findAll(image: Image, options: FindOptions = {}): Promise<Match[]> {
    const imageFinder = this.getImageFinder();
    const findOptions = toFindOptions(options);
    const frame = await this.getOperationFrame(findOptions, true);
    const resolvedOptions = resolveFindOptions(findOptions, frame);

    assertConfidence(resolvedOptions.confidence);
    assertFindOptions(resolvedOptions, frame);
    const searchFrame = toFindFrame(frame, resolvedOptions);
    const matches = await imageFinder.findAll(image, searchFrame, resolvedOptions.confidence);

    return matches.map((match) => offsetMatch(match, resolvedOptions.start));
  }

  private getImageFinder(): ImageFinder {
    if (!this.imageFinder) {
      throw new Error("Image search is not configured");
    }

    return this.imageFinder;
  }

  private async getOperationFrame(
    options: FrameOptions,
    defaultRefresh: boolean,
  ): Promise<WindowFrame> {
    if (options.refreshFrame ?? (defaultRefresh && !this.cacheFrame)) {
      return this.refreshFrameInternal();
    }

    return this.frame;
  }

  private async refreshFrameInternal(): Promise<WindowFrame> {
    const frame = await this.frameProvider.get(this.target);

    this.frame = frame;

    return frame;
  }

  private toWindowPoint(target: Point, frame?: WindowFrame): Point {
    const resolvedFrame = frame ?? this.frame;

    assertPointInWindow(target, resolvedFrame);

    return { ...target };
  }

  private requireCursor(): Point {
    if (!this.currentCursor) {
      throw new Error("Cursor position is not initialized");
    }

    return this.currentCursor;
  }

  private requireWindowId(frame: WindowFrame): number {
    if (frame.windowId === undefined) {
      throw new Error("CGWindowID is not initialized");
    }

    return frame.windowId;
  }

  private async moveInternal(
    target: Point,
    durationMs: number,
    options: InternalMoveOptions = {},
  ): Promise<void> {
    assertDuration(durationMs);

    const { frame, safeWait = true } = options;
    const resolvedFrame = frame ?? this.frame;
    const windowPoint = this.toWindowPoint(target, resolvedFrame);
    const previousCursor = this.currentCursor ?? undefined;

    await this.automation.move({
      dragging: this.mousePressed,
      durationMs,
      from: previousCursor,
      target: windowPoint,
      windowId: this.requireWindowId(resolvedFrame),
    });

    this.currentCursor = windowPoint;

    if (safeWait) {
      await sleep(pointerSettleMs);
    }
  }
}
