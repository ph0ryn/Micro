import { describe, expect, test } from "bun:test";

import { type Automation, Window } from "./window.ts";

import type { ImageFinder } from "./image-finder.ts";
import type { Image } from "./image.ts";
import type { Match } from "./types.ts";
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
  windowId: 123,
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
    async click(windowId, target): Promise<void> {
      calls.push(["click", windowId, target]);
    },
    async mouseDown(windowId, target): Promise<void> {
      calls.push(["mouseDown", windowId, target]);
    },
    async mouseUp(windowId, target): Promise<void> {
      calls.push(["mouseUp", windowId, target]);
    },
    async move(request): Promise<void> {
      const { dragging, durationMs, from, target, windowId } = request;

      calls.push(["move", windowId, target, durationMs, { dragging, from }]);
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

const findOptions = {
  end: {
    x: 110,
    y: 220,
  },
  start: {
    x: 10,
    y: 20,
  },
};

const offsetMatch: Match = {
  ...match,
  center: {
    x: 40,
    y: 70,
  },
  origin: {
    x: 30,
    y: 60,
  },
};

const searchBounds: WindowBounds = {
  origin: {
    x: 110,
    y: 220,
  },
  size: {
    height: 200,
    width: 100,
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
            windowId: 456,
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
            windowId: 456,
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
            windowId: 456,
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
            windowId: 456,
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
      windowId: 456,
    });

    await window.click({ x: 20, y: 30 });

    expect(calls).toEqual([
      ["move", 456, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
      ["click", 456, { x: 20, y: 30 }],
    ]);
  });

  test("waits after moving by default", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    const elapsed = await measureElapsed(() => window.move({ x: 20, y: 30 }, 0));

    expect(calls).toEqual([
      ["move", 123, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
    ]);

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

    expect(calls).toEqual([
      ["move", 123, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
    ]);

    expect(elapsed).toBeLessThan(90);
  });

  test("can refresh bounds before moving", async () => {
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
            windowId: 456,
          };
        },
      },
    });

    await window.move({ x: 20, y: 30 }, 0, { refreshBounds: true, safeWait: false });

    expect(calls).toEqual([
      ["move", 456, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
    ]);
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
            windowId: 456,
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
            windowId: 456,
          };
        },
      },
    });

    await window.focus();
    await window.click({ x: 20, y: 30 });

    expect(calls).toEqual([target]);

    expect(automationCalls).toEqual([
      ["move", 456, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
      ["click", 456, { x: 20, y: 30 }],
    ]);
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
            windowId: 456,
          };
        },
      },
    });

    const elapsed = await measureElapsed(() => window.click({ x: 20, y: 30 }));

    expect(calls).toEqual([
      ["move", 456, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
      ["click", 456, { x: 20, y: 30 }],
    ]);

    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  test("can use cached bounds for window-relative clicking", async () => {
    const { automation, calls } = createAutomation();
    let getCalls = 0;
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider: {
        async focusAndGet(): Promise<WindowBounds> {
          return bounds;
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
            windowId: 456,
          };
        },
      },
      cacheBounds: true,
    });

    await window.click({ x: 20, y: 30 });

    expect(getCalls).toBe(0);

    expect(calls).toEqual([
      ["move", 123, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
      ["click", 123, { x: 20, y: 30 }],
    ]);
  });

  test("clicks at the tracked cursor position without a target", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    await window.move({ x: 20, y: 30 }, 0, false);

    const elapsed = await measureElapsed(() => window.click());

    expect(calls).toEqual([
      ["move", 123, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
      ["click", 123, { x: 20, y: 30 }],
    ]);

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

    expect(calls).toEqual([
      ["move", 123, { x: 0, y: 599 }, 0, { dragging: false, from: undefined }],
      ["click", 123, { x: 0, y: 599 }],
    ]);

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
            windowId: 456,
          };
        },
      },
      random: () => 0.5,
    });

    await window.fclick({ x: 20, y: 30 }, 10);
    await window.click({ x: 21, y: 31 });

    expect(calls).toEqual([
      ["move", 456, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
      ["click", 456, { x: 20, y: 30 }],
      ["move", 456, { x: 21, y: 31 }, 0, { dragging: false, from: { x: 20, y: 30 } }],
      ["click", 456, { x: 21, y: 31 }],
    ]);
  });

  test("keeps mouse down and mouse up as separate operations", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    const elapsed = await measureElapsed(() => window.mouseDown({ x: 20, y: 30 }));

    await window.mouseUp();

    expect(calls).toEqual([
      ["move", 123, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
      ["mouseDown", 123, { x: 20, y: 30 }],
      ["mouseUp", 123, { x: 20, y: 30 }],
    ]);

    expect(elapsed).toBeLessThan(90);
  });

  test("tracks pressed state and sends drag moves after mouse down", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    await window.mouseDown({ x: 20, y: 30 });
    await window.move({ x: 40, y: 50 }, 0, false);
    await window.mouseUp();

    expect(calls).toEqual([
      ["move", 123, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
      ["mouseDown", 123, { x: 20, y: 30 }],
      ["move", 123, { x: 40, y: 50 }, 0, { dragging: true, from: { x: 20, y: 30 } }],
      ["mouseUp", 123, { x: 40, y: 50 }],
    ]);
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
      ["move", 123, { x: 10, y: 20 }, 0, { dragging: false, from: undefined }],
      ["click", 123, { x: 10, y: 20 }],
      ["move", 123, { x: 30, y: 40 }, 0, { dragging: false, from: { x: 10, y: 20 } }],
      ["click", 123, { x: 30, y: 40 }],
    ]);
  });

  test("returns the tracked cursor position", async () => {
    const { automation } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    await window.move({ x: 50, y: 60 }, 0, false);

    expect(window.cursor).toEqual({ x: 50, y: 60 });
  });

  test("throws when the tracked cursor position is not initialized", () => {
    const { automation } = createAutomation();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
    });

    expect(() => window.cursor).toThrow("Cursor position is not initialized");
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

  test("finds images with a default confidence in the requested range", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      imageFinder,
    });

    expect(await window.find(image, findOptions)).toEqual(offsetMatch);
    expect(calls).toEqual([["find", image, searchBounds, 0.99]]);
  });

  test("defaults missing find range endpoints to the window edges", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      imageFinder,
    });

    expect(await window.find(image, { end: findOptions.end })).toEqual(match);

    expect(await window.findAll(image, { confidence: 0.9, start: findOptions.start })).toEqual([
      offsetMatch,
    ]);

    expect(await window.find(image)).toEqual(match);

    expect(calls).toEqual([
      [
        "find",
        image,
        {
          origin: {
            x: 100,
            y: 200,
          },
          size: {
            height: 220,
            width: 110,
          },
        },
        0.99,
      ],
      [
        "findAll",
        image,
        {
          origin: {
            x: 110,
            y: 220,
          },
          size: {
            height: 580,
            width: 790,
          },
        },
        0.9,
      ],
      [
        "find",
        image,
        {
          origin: {
            x: 100,
            y: 200,
          },
          size: {
            height: 600,
            width: 800,
          },
        },
        0.99,
      ],
    ]);
  });

  test("refreshes bounds before finding images in the requested range", async () => {
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
      windowId: 456,
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

    expect(await window.find(image, findOptions)).toEqual(offsetMatch);

    expect(calls).toEqual([
      [
        "find",
        image,
        {
          origin: {
            x: 310,
            y: 420,
          },
          size: {
            height: 200,
            width: 100,
          },
        },
        0.99,
      ],
    ]);
  });

  test("uses cached bounds for image search when configured", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    let getCalls = 0;
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider: {
        async focusAndGet(): Promise<WindowBounds> {
          return bounds;
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
            windowId: 456,
          };
        },
      },
      cacheBounds: true,
      imageFinder,
    });

    expect(await window.find(image, findOptions)).toEqual(offsetMatch);
    expect(getCalls).toBe(0);
    expect(calls).toEqual([["find", image, searchBounds, 0.99]]);
  });

  test("can refresh bounds for one search when cached bounds are configured", async () => {
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
      windowId: 456,
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
      cacheBounds: true,
      imageFinder,
    });

    expect(await window.find(image, { ...findOptions, refreshBounds: true })).toEqual(offsetMatch);

    expect(calls).toEqual([
      [
        "find",
        image,
        {
          origin: {
            x: 310,
            y: 420,
          },
          size: {
            height: 200,
            width: 100,
          },
        },
        0.99,
      ],
    ]);
  });

  test("can skip bounds refresh for one search", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    let getCalls = 0;
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider: {
        async focusAndGet(): Promise<WindowBounds> {
          return bounds;
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
            windowId: 456,
          };
        },
      },
      imageFinder,
    });

    expect(await window.find(image, { ...findOptions, refreshBounds: false })).toEqual(offsetMatch);
    expect(getCalls).toBe(0);
    expect(calls).toEqual([["find", image, searchBounds, 0.99]]);
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

    expect(await window.find(image, findOptions)).toBeNull();
    expect(calls).toEqual([["find", image, searchBounds, 0.99]]);
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

    expect(await window.findAll(image, { ...findOptions, confidence: 0.9 })).toEqual([offsetMatch]);
    expect(calls).toEqual([["findAll", image, searchBounds, 0.9]]);
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

    expect(window.find(image, { ...findOptions, confidence: 2 })).rejects.toThrow(
      "confidence must be between 0 and 1",
    );

    expect(window.findAll(image, { ...findOptions, confidence: Number.NaN })).rejects.toThrow(
      "confidence must be between 0 and 1",
    );
  });

  test("rejects non-object find options", () => {
    const { automation } = createAutomation();
    const { imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      imageFinder,
    });

    expect(window.find(image, 0.9 as never)).rejects.toThrow("find options must be an object");
  });

  test("rejects invalid refreshBounds options", () => {
    const { automation } = createAutomation();
    const { imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      imageFinder,
    });

    expect(window.find(image, { refreshBounds: "false" } as never)).rejects.toThrow(
      "refreshBounds must be a boolean",
    );
  });

  test("rejects invalid find ranges", () => {
    const { automation } = createAutomation();
    const { imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      bounds,
      boundsProvider,
      imageFinder,
    });

    expect(
      window.find(image, {
        end: {
          x: 10,
          y: 20,
        },
        start: {
          x: 10,
          y: 20,
        },
      }),
    ).rejects.toThrow("Search range must be inside the window");

    expect(
      window.findAll(image, {
        end: {
          x: 801,
          y: 600,
        },
        start: {
          x: 0,
          y: 0,
        },
      }),
    ).rejects.toThrow("Search range must be inside the window");
  });
});
