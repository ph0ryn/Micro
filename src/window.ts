import { sleep } from "./util.ts";

import type { ImageFinder } from "./image-finder.ts";
import type { Image } from "./image.ts";
import type { BoundsOptions, FindOptions, Match, MoveOptions, Point, Size } from "./types.ts";
import type { WindowBounds, WindowBoundsProvider, WindowTarget } from "./window-bounds.ts";

export interface Automation {
  click(): Promise<void>;
  getCursor(): Promise<Point>;
  mouseDown(): Promise<void>;
  mouseUp(): Promise<void>;
  move(target: Point, durationMs: number): Promise<void>;
}

export interface WindowDependencies {
  automation: Automation;
  bounds: WindowBounds;
  boundsProvider: WindowBoundsProvider;
  cacheBounds?: boolean;
  imageFinder?: ImageFinder;
  random?: () => number;
}

interface ResolvedFindOptions {
  confidence: number;
  end: Point;
  start: Point;
}

interface InternalMoveOptions {
  bounds?: WindowBounds;
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

const assertPointInWindow = (target: Point, bounds: WindowBounds): void => {
  if (
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    target.x < 0 ||
    target.y < 0 ||
    target.x >= bounds.size.width ||
    target.y >= bounds.size.height
  ) {
    throw new Error(`Point (${target.x}, ${target.y}) is outside the window`);
  }
};

const assertRefreshBoundsOption = (options: BoundsOptions): void => {
  if (options.refreshBounds !== undefined && typeof options.refreshBounds !== "boolean") {
    throw new Error("refreshBounds must be a boolean");
  }
};

const toFindOptions = (input: unknown): FindOptions => {
  if (typeof input !== "object" || input === null) {
    throw new Error("find options must be an object");
  }

  const options = input as FindOptions;

  assertRefreshBoundsOption(options);

  return options;
};

const toMoveOptions = (input: boolean | MoveOptions | undefined): MoveOptions => {
  if (typeof input === "boolean") {
    return {
      safeWait: input,
    };
  }

  const options = input ?? {};

  assertRefreshBoundsOption(options);

  return options;
};

const resolveFindOptions = (options: FindOptions, bounds: WindowBounds): ResolvedFindOptions => ({
  confidence: options.confidence ?? 0.99,
  end: options.end ?? {
    x: bounds.size.width,
    y: bounds.size.height,
  },
  start: options.start ?? {
    x: 0,
    y: 0,
  },
});

const assertFindOptions = (options: ResolvedFindOptions, bounds: WindowBounds): void => {
  if (
    !Number.isFinite(options.start.x) ||
    !Number.isFinite(options.start.y) ||
    !Number.isFinite(options.end.x) ||
    !Number.isFinite(options.end.y) ||
    options.start.x < 0 ||
    options.start.y < 0 ||
    options.end.x > bounds.size.width ||
    options.end.y > bounds.size.height ||
    options.end.x <= options.start.x ||
    options.end.y <= options.start.y
  ) {
    throw new Error("Search range must be inside the window with end after start");
  }
};

const toFindBounds = (bounds: WindowBounds, options: ResolvedFindOptions): WindowBounds => ({
  origin: {
    x: bounds.origin.x + options.start.x,
    y: bounds.origin.y + options.start.y,
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
  private readonly boundsProvider: WindowBoundsProvider;
  private readonly cacheBounds: boolean;
  private readonly imageFinder?: ImageFinder;
  private readonly random: () => number;
  private bounds: WindowBounds;

  constructor(target: WindowTarget, dependencies: WindowDependencies) {
    this.target = target;
    this.automation = dependencies.automation;
    this.bounds = dependencies.bounds;
    this.boundsProvider = dependencies.boundsProvider;
    this.cacheBounds = dependencies.cacheBounds ?? false;
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
      const bounds = await this.getOperationBounds(moveOptions, false);

      await this.moveInternal(target, durationMs, {
        bounds,
        safeWait: moveOptions.safeWait,
      });
    });
  }

  async focus(): Promise<void> {
    await runWindowOperation(async () => {
      this.bounds = await this.boundsProvider.focusAndGet(this.target);
    });
  }

  async refreshBounds(): Promise<WindowBounds> {
    return runWindowOperation(() => this.refreshBoundsInternal());
  }

  async click(target?: Point, options: BoundsOptions = {}): Promise<void> {
    await runWindowOperation(async () => {
      if (target) {
        assertRefreshBoundsOption(options);
        const bounds = await this.getOperationBounds(options, true);

        await this.moveInternal(target, 0, { bounds });
      }

      await this.automation.click();
    });
  }

  async fclick(target: Point, fuzzy: number, options: BoundsOptions = {}): Promise<void> {
    await runWindowOperation(async () => {
      if (!Number.isFinite(fuzzy) || fuzzy < 0) {
        throw new Error("fuzzy must be a non-negative finite number");
      }

      assertRefreshBoundsOption(options);
      const bounds = await this.getOperationBounds(options, true);

      assertPointInWindow(target, bounds);

      const fuzzed = {
        x: Math.min(
          Math.max(0, target.x + Math.round((this.random() * 2 - 1) * fuzzy)),
          bounds.size.width - 1,
        ),
        y: Math.min(
          Math.max(0, target.y + Math.round((this.random() * 2 - 1) * fuzzy)),
          bounds.size.height - 1,
        ),
      };

      await this.moveInternal(fuzzed, 0, { bounds });
      await this.automation.click();
    });
  }

  async mouseDown(target?: Point, options: BoundsOptions = {}): Promise<void> {
    await runWindowOperation(async () => {
      if (target) {
        assertRefreshBoundsOption(options);
        const bounds = await this.getOperationBounds(options, true);

        await this.moveInternal(target, 0, { bounds });
      }

      await this.automation.mouseDown();
    });
  }

  async mouseUp(): Promise<void> {
    await runWindowOperation(() => this.automation.mouseUp());
  }

  async cursor(): Promise<Point> {
    const bounds = this.bounds;
    const cursor = await this.automation.getCursor();

    return {
      x: cursor.x - bounds.origin.x,
      y: cursor.y - bounds.origin.y,
    };
  }

  get size(): Size {
    return this.bounds.size;
  }

  async find(image: Image, options: FindOptions = {}): Promise<Match | null> {
    const imageFinder = this.getImageFinder();
    const findOptions = toFindOptions(options);
    const bounds = await this.getOperationBounds(findOptions, true);
    const resolvedOptions = resolveFindOptions(findOptions, bounds);

    assertConfidence(resolvedOptions.confidence);
    assertFindOptions(resolvedOptions, bounds);
    const searchBounds = toFindBounds(bounds, resolvedOptions);
    const match = await imageFinder.find(image, searchBounds, resolvedOptions.confidence);

    if (!match) {
      return null;
    }

    return offsetMatch(match, resolvedOptions.start);
  }

  async findAll(image: Image, options: FindOptions = {}): Promise<Match[]> {
    const imageFinder = this.getImageFinder();
    const findOptions = toFindOptions(options);
    const bounds = await this.getOperationBounds(findOptions, true);
    const resolvedOptions = resolveFindOptions(findOptions, bounds);

    assertConfidence(resolvedOptions.confidence);
    assertFindOptions(resolvedOptions, bounds);
    const searchBounds = toFindBounds(bounds, resolvedOptions);
    const matches = await imageFinder.findAll(image, searchBounds, resolvedOptions.confidence);

    return matches.map((match) => offsetMatch(match, resolvedOptions.start));
  }

  private getImageFinder(): ImageFinder {
    if (!this.imageFinder) {
      throw new Error("Image search is not configured");
    }

    return this.imageFinder;
  }

  private async getOperationBounds(
    options: BoundsOptions,
    defaultRefresh: boolean,
  ): Promise<WindowBounds> {
    if (options.refreshBounds ?? (defaultRefresh && !this.cacheBounds)) {
      return this.refreshBoundsInternal();
    }

    return this.bounds;
  }

  private async refreshBoundsInternal(): Promise<WindowBounds> {
    const bounds = await this.boundsProvider.get(this.target);

    this.bounds = bounds;

    return bounds;
  }

  private async toAbsolute(target: Point, bounds?: WindowBounds): Promise<Point> {
    const resolvedBounds = bounds ?? this.bounds;

    assertPointInWindow(target, resolvedBounds);

    return {
      x: resolvedBounds.origin.x + target.x,
      y: resolvedBounds.origin.y + target.y,
    };
  }

  private async moveInternal(
    target: Point,
    durationMs: number,
    options: InternalMoveOptions = {},
  ): Promise<void> {
    assertDuration(durationMs);

    const { bounds, safeWait = true } = options;
    const absolute = await this.toAbsolute(target, bounds);

    await this.automation.move(absolute, durationMs);

    if (safeWait) {
      await sleep(pointerSettleMs);
    }
  }
}
