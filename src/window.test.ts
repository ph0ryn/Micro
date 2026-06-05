import { describe, expect, test } from "bun:test";

import { type Automation, Window } from "./window.ts";

import type { ImageFinder } from "./image-finder.ts";
import type { Image } from "./image.ts";
import type { Match, Point } from "./types.ts";
import type { WindowBounds, WindowBoundsProvider, WindowTarget } from "./window-bounds.ts";

const target: WindowTarget = {
  bundleId: "com.google.Chrome",
};

const bounds: WindowBounds = {
  origin: {
    x: 100,
    y: 200,
  },
  size: {
    height: 600,
    width: 800,
  },
};

const boundsProvider: WindowBoundsProvider = {
  async focusAndGet(): Promise<WindowBounds> {
    return bounds;
  },
  async get(): Promise<WindowBounds> {
    return bounds;
  },
};

const createAutomation = () => {
  const calls: unknown[][] = [];
  const automation: Automation = {
    async click(): Promise<void> {
      calls.push(["click"]);
    },
    async getCursor(): Promise<Point> {
      calls.push(["cursor"]);

      return {
        x: 150,
        y: 260,
      };
    },
    async mouseDown(): Promise<void> {
      calls.push(["mouseDown"]);
    },
    async mouseUp(): Promise<void> {
      calls.push(["mouseUp"]);
    },
    async move(target, durationMs): Promise<void> {
      calls.push(["move", target, durationMs]);
    },
  };

  return {
    automation,
    calls,
  };
};

const image = {} as Image;
const match: Match = {
  center: {
    x: 30,
    y: 50,
  },
  confidence: 0.995,
  origin: {
    x: 20,
    y: 40,
  },
  size: {
    height: 20,
    width: 20,
  },
};

const createImageFinder = () => {
  const calls: unknown[][] = [];
  const imageFinder: ImageFinder = {
    async find(needle, searchBounds, confidence) {
      calls.push(["find", needle, searchBounds, confidence]);

      return match;
    },
    async findAll(needle, searchBounds, confidence) {
      calls.push(["findAll", needle, searchBounds, confidence]);

      return [match];
    },
  };

  return {
    calls,
    imageFinder,
  };
};

const measureElapsed = async (operation: () => Promise<void>): Promise<number> => {
  const start = performance.now();

  await operation();

  return performance.now() - start;
};

describe("Window", () => {
  test("uses initial bounds for synchronous size reads", async () => {
    const { automation, calls } = createAutomation();
    let getCalls = 0;
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider: {
        async focusAndGet(): Promise<WindowBounds> {
          getCalls += 1;

          return {
            origin: {
              x: 300,
              y: 400,
            },
            size: {
              height: 700,
              width: 900,
            },
          };
        },
        async get(): Promise<WindowBounds> {
          getCalls += 1;

          return {
            origin: {
              x: 300,
              y: 400,
            },
            size: {
              height: 700,
              width: 900,
            },
          };
        },
      },
    });

    expect(window.size).toEqual({
      height: 600,
      width: 800,
    });

    expect(calls).toEqual([]);
    expect(getCalls).toBe(0);
  });

  test("refreshes cached bounds explicitly", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider: {
        async focusAndGet(): Promise<WindowBounds> {
          return {
            origin: {
              x: 300,
              y: 400,
            },
            size: {
              height: 700,
              width: 900,
            },
          };
        },
        async get(): Promise<WindowBounds> {
          return {
            origin: {
              x: 300,
              y: 400,
            },
            size: {
              height: 700,
              width: 900,
            },
          };
        },
      },
    });

    expect(await window.refreshBounds()).toEqual({
      origin: {
        x: 300,
        y: 400,
      },
      size: {
        height: 700,
        width: 900,
      },
    });

    await window.click({ x: 20, y: 30 });

    expect(calls).toEqual([["move", { x: 320, y: 430 }, 0], ["click"]]);
  });

  test("waits after moving by default", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    const elapsed = await measureElapsed(() => window.move({ x: 20, y: 30 }, 0));

    expect(calls).toEqual([["move", { x: 120, y: 230 }, 0]]);
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  test("can skip waiting after moving", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    const elapsed = await measureElapsed(() => window.move({ x: 20, y: 30 }, 0, false));

    expect(calls).toEqual([["move", { x: 120, y: 230 }, 0]]);
    expect(elapsed).toBeLessThan(90);
  });

  test("focuses the target application window and refreshes bounds", async () => {
    const { automation, calls: automationCalls } = createAutomation();
    const calls: WindowTarget[] = [];
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider: {
        async focusAndGet(windowTarget): Promise<WindowBounds> {
          calls.push(windowTarget);

          return {
            origin: {
              x: 300,
              y: 400,
            },
            size: {
              height: 700,
              width: 900,
            },
          };
        },
        async get(): Promise<WindowBounds> {
          return {
            origin: {
              x: 300,
              y: 400,
            },
            size: {
              height: 700,
              width: 900,
            },
          };
        },
      },
    });

    await window.focus();
    await window.click({ x: 20, y: 30 });

    expect(calls).toEqual([target]);
    expect(automationCalls).toEqual([["move", { x: 320, y: 430 }, 0], ["click"]]);
  });

  test("refreshes bounds for window-relative clicking", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider: {
        async focusAndGet(): Promise<WindowBounds> {
          return bounds;
        },
        async get(): Promise<WindowBounds> {
          return {
            origin: {
              x: 300,
              y: 400,
            },
            size: {
              height: 700,
              width: 900,
            },
          };
        },
      },
    });

    const elapsed = await measureElapsed(() => window.click({ x: 20, y: 30 }));

    expect(calls).toEqual([["move", { x: 320, y: 430 }, 0], ["click"]]);
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  test("clicks at the current cursor position without a target", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    const elapsed = await measureElapsed(() => window.click());

    expect(calls).toEqual([["click"]]);
    expect(elapsed).toBeLessThan(90);
  });

  test("clamps fuzzy clicks to the window", async () => {
    const { automation, calls } = createAutomation();
    const randomValues = [0, 1];
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      random: () => randomValues.shift() ?? 0,
    });

    const elapsed = await measureElapsed(() => window.fclick({ x: 2, y: 598 }, 10));

    expect(calls).toEqual([["move", { x: 100, y: 799 }, 0], ["click"]]);
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  test("uses freshly fetched bounds consistently for fuzzy clicks", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider: {
        async focusAndGet(): Promise<WindowBounds> {
          return bounds;
        },
        async get(): Promise<WindowBounds> {
          return {
            origin: {
              x: 300,
              y: 400,
            },
            size: {
              height: 700,
              width: 900,
            },
          };
        },
      },
      random: () => 0.5,
    });

    await window.fclick({ x: 20, y: 30 }, 10);
    await window.click({ x: 21, y: 31 });

    expect(calls).toEqual([
      ["move", { x: 320, y: 430 }, 0],
      ["click"],
      ["move", { x: 321, y: 431 }, 0],
      ["click"],
    ]);
  });

  test("keeps mouse down and mouse up as separate operations", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    const elapsed = await measureElapsed(() => window.mouseDown({ x: 10, y: 20 }));

    await window.mouseUp();

    expect(calls).toEqual([["move", { x: 110, y: 220 }, 0], ["mouseDown"], ["mouseUp"]]);
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  test("presses the mouse at the current cursor position without a target", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    await window.mouseDown();

    expect(calls).toEqual([["mouseDown"]]);
  });

  test("keeps concurrent click sequences together", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    await Promise.all([window.click({ x: 10, y: 20 }), window.click({ x: 30, y: 40 })]);

    expect(calls).toEqual([
      ["move", { x: 110, y: 220 }, 0],
      ["click"],
      ["move", { x: 130, y: 240 }, 0],
      ["click"],
    ]);
  });

  test("returns the cursor position relative to the window", async () => {
    const { automation } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    expect(await window.cursor()).toEqual({
      x: 50,
      y: 60,
    });
  });

  test("returns the window size", () => {
    const { automation } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    expect(window.size).toEqual({
      height: 600,
      width: 800,
    });
  });

  test("rejects invalid coordinates", async () => {
    const { automation } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    expect(window.move({ x: 800, y: 0 }, 0)).rejects.toThrow("outside the window");
  });

  test("finds images with a default confidence", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      imageFinder,
    });

    expect(await window.find(image)).toEqual(match);
    expect(calls).toEqual([["find", image, bounds, 0.99]]);
  });

  test("refreshes bounds before finding images", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const refreshedBounds: WindowBounds = {
      origin: {
        x: 300,
        y: 400,
      },
      size: {
        height: 700,
        width: 900,
      },
    };
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider: {
        async focusAndGet(): Promise<WindowBounds> {
          return bounds;
        },
        async get(): Promise<WindowBounds> {
          return refreshedBounds;
        },
      },
      imageFinder,
    });

    expect(await window.find(image)).toEqual(match);
    expect(calls).toEqual([["find", image, refreshedBounds, 0.99]]);
  });

  test("returns null for a missing image", async () => {
    const { automation } = createAutomation();
    const calls: unknown[][] = [];
    const imageFinder: ImageFinder = {
      async find(needle, searchBounds, confidence) {
        calls.push(["find", needle, searchBounds, confidence]);

        return null;
      },
      async findAll() {
        return [];
      },
    };
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      imageFinder,
    });

    expect(await window.find(image)).toBeNull();
    expect(calls).toEqual([["find", image, bounds, 0.99]]);
  });

  test("finds all images with an explicit confidence", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      imageFinder,
    });

    expect(await window.findAll(image, 0.9)).toEqual([match]);
    expect(calls).toEqual([["findAll", image, bounds, 0.9]]);
  });

  test("rejects invalid confidence", () => {
    const { automation } = createAutomation();
    const { imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      imageFinder,
    });

    expect(window.find(image, 2)).rejects.toThrow("confidence must be between 0 and 1");
    expect(window.findAll(image, Number.NaN)).rejects.toThrow("confidence must be between 0 and 1");
  });
});
