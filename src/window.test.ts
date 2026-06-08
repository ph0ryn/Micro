import { describe, expect, test } from "bun:test";

import { type Automation, Window } from "./window.ts";

import type { ImageFinder } from "./image-finder.ts";
import type { Image } from "./image.ts";
import type { Match } from "./types.ts";
import type { WindowFrame, WindowFrameProvider, WindowTarget } from "./window-frame.ts";

const target: WindowTarget = {
  bundleId: "com.google.Chrome",
};

const frame: WindowFrame = {
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

const frameProvider: WindowFrameProvider = {
  async focusAndGet(): Promise<WindowFrame> {
    return frame;
  },
  async get(): Promise<WindowFrame> {
    return frame;
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

const searchRegion = {
  origin: {
    x: 10,
    y: 20,
  },
  size: {
    height: 200,
    width: 100,
  },
};

const createImageFinder = () => {
  const calls: unknown[][] = [];
  const imageFinder: ImageFinder = {
    async find(request) {
      const { confidence, frame, image: needle, region } = request;

      calls.push(["find", needle, frame, region, confidence]);

      return match;
    },
    async findAll(request) {
      const { confidence, frame, image: needle, region } = request;

      calls.push(["findAll", needle, frame, region, confidence]);

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
  test("uses initial frame for synchronous size reads", async () => {
    const { automation, calls } = createAutomation();
    let getCalls = 0;
    const window = new Window(target, {
      automation,
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
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
        async get(): Promise<WindowFrame> {
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

  test("refreshes cached frame explicitly", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
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
        async get(): Promise<WindowFrame> {
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

    expect(await window.refreshFrame()).toEqual({
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
      frame,
      frameProvider,
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
      frame,
      frameProvider,
    });

    const elapsed = await measureElapsed(() => window.move({ x: 20, y: 30 }, 0, false));

    expect(calls).toEqual([
      ["move", 123, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
    ]);

    expect(elapsed).toBeLessThan(90);
  });

  test("can refresh frame before moving", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
          return frame;
        },
        async get(): Promise<WindowFrame> {
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

    await window.move({ x: 20, y: 30 }, 0, { refreshFrame: true, safeWait: false });

    expect(calls).toEqual([
      ["move", 456, { x: 20, y: 30 }, 0, { dragging: false, from: undefined }],
    ]);
  });

  test("focuses the target application window and refreshes frame", async () => {
    const { automation, calls: automationCalls } = createAutomation();
    const calls: WindowTarget[] = [];
    const window = new Window(target, {
      automation,
      frame,
      frameProvider: {
        async focusAndGet(windowTarget): Promise<WindowFrame> {
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
        async get(): Promise<WindowFrame> {
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

  test("refreshes frame for window-relative clicking", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
          return frame;
        },
        async get(): Promise<WindowFrame> {
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

  test("can use cached frame for window-relative clicking", async () => {
    const { automation, calls } = createAutomation();
    let getCalls = 0;
    const window = new Window(target, {
      automation,
      cacheFrame: true,
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
          return frame;
        },
        async get(): Promise<WindowFrame> {
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
      frame,
      frameProvider,
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
      frame,
      frameProvider,
      random: () => randomValues.shift() ?? 0,
    });

    const elapsed = await measureElapsed(() => window.fclick({ x: 2, y: 598 }, 10));

    expect(calls).toEqual([
      ["move", 123, { x: 0, y: 599 }, 0, { dragging: false, from: undefined }],
      ["click", 123, { x: 0, y: 599 }],
    ]);

    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  test("uses freshly fetched frame consistently for fuzzy clicks", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
          return frame;
        },
        async get(): Promise<WindowFrame> {
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
      frame,
      frameProvider,
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
      frame,
      frameProvider,
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
      frame,
      frameProvider,
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
      frame,
      frameProvider,
    });

    await window.move({ x: 50, y: 60 }, 0, false);

    expect(window.cursor).toEqual({ x: 50, y: 60 });
  });

  test("throws when the tracked cursor position is not initialized", () => {
    const { automation } = createAutomation();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider,
    });

    expect(() => window.cursor).toThrow("Cursor position is not initialized");
  });

  test("returns the window size", () => {
    const { automation } = createAutomation();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider,
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
      frame,
      frameProvider,
    });

    expect(window.move({ x: 800, y: 0 }, 0)).rejects.toThrow("outside the window");
  });

  test("finds images with a default confidence in the requested range", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider,
      imageFinder,
    });

    expect(await window.find(image, findOptions)).toEqual(offsetMatch);
    expect(calls).toEqual([["find", image, frame, searchRegion, 0.99]]);
  });

  test("defaults missing find range endpoints to the window edges", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider,
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
        frame,
        {
          origin: {
            x: 0,
            y: 0,
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
        frame,
        {
          origin: {
            x: 10,
            y: 20,
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
        frame,
        {
          origin: {
            x: 0,
            y: 0,
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

  test("refreshes frame before finding images in the requested range", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const refreshedFrame: WindowFrame = {
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
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
          return frame;
        },
        async get(): Promise<WindowFrame> {
          return refreshedFrame;
        },
      },
      imageFinder,
    });

    expect(await window.find(image, findOptions)).toEqual(offsetMatch);

    expect(calls).toEqual([
      [
        "find",
        image,
        refreshedFrame,
        {
          origin: {
            x: 10,
            y: 20,
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

  test("uses cached frame for image search when configured", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    let getCalls = 0;
    const window = new Window(target, {
      automation,
      cacheFrame: true,
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
          return frame;
        },
        async get(): Promise<WindowFrame> {
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

    expect(await window.find(image, findOptions)).toEqual(offsetMatch);
    expect(getCalls).toBe(0);
    expect(calls).toEqual([["find", image, frame, searchRegion, 0.99]]);
  });

  test("can refresh frame for one search when cached frame are configured", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const refreshedFrame: WindowFrame = {
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
      cacheFrame: true,
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
          return frame;
        },
        async get(): Promise<WindowFrame> {
          return refreshedFrame;
        },
      },
      imageFinder,
    });

    expect(await window.find(image, { ...findOptions, refreshFrame: true })).toEqual(offsetMatch);

    expect(calls).toEqual([
      [
        "find",
        image,
        refreshedFrame,
        {
          origin: {
            x: 10,
            y: 20,
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

  test("can skip frame refresh for one search", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    let getCalls = 0;
    const window = new Window(target, {
      automation,
      frame,
      frameProvider: {
        async focusAndGet(): Promise<WindowFrame> {
          return frame;
        },
        async get(): Promise<WindowFrame> {
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

    expect(await window.find(image, { ...findOptions, refreshFrame: false })).toEqual(offsetMatch);
    expect(getCalls).toBe(0);
    expect(calls).toEqual([["find", image, frame, searchRegion, 0.99]]);
  });

  test("returns null for a missing image", async () => {
    const { automation } = createAutomation();
    const calls: unknown[][] = [];
    const imageFinder: ImageFinder = {
      async find(request) {
        const { confidence, frame, image: needle, region } = request;

        calls.push(["find", needle, frame, region, confidence]);

        return null;
      },
      async findAll() {
        return [];
      },
    };
    const window = new Window(target, {
      automation,
      frame,
      frameProvider,
      imageFinder,
    });

    expect(await window.find(image, findOptions)).toBeNull();
    expect(calls).toEqual([["find", image, frame, searchRegion, 0.99]]);
  });

  test("finds all images with an explicit confidence", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider,
      imageFinder,
    });

    expect(await window.findAll(image, { ...findOptions, confidence: 0.9 })).toEqual([offsetMatch]);
    expect(calls).toEqual([["findAll", image, frame, searchRegion, 0.9]]);
  });

  test("rejects invalid confidence", () => {
    const { automation } = createAutomation();
    const { imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider,
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
      frame,
      frameProvider,
      imageFinder,
    });

    expect(window.find(image, 0.9 as never)).rejects.toThrow("find options must be an object");
  });

  test("rejects invalid refreshFrame options", () => {
    const { automation } = createAutomation();
    const { imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider,
      imageFinder,
    });

    expect(window.find(image, { refreshFrame: "false" } as never)).rejects.toThrow(
      "refreshFrame must be a boolean",
    );
  });

  test("rejects invalid find ranges", () => {
    const { automation } = createAutomation();
    const { imageFinder } = createImageFinder();
    const window = new Window(target, {
      automation,
      frame,
      frameProvider,
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
