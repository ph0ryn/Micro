import { describe, expect, test } from "bun:test";

import { type Automation, Window } from "./window.ts";

import type { ImageFinder } from "./image-finder.ts";
import type { Image } from "./image.ts";
import type { Match, Point } from "./types.ts";
import type { WindowBounds, WindowBoundsProvider } from "./window-bounds.ts";

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
  async focus(): Promise<void> {},
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

describe("Window", () => {
  test("focuses the target application window", async () => {
    const { automation } = createAutomation();
    const calls: string[] = [];
    const window = new Window("Chrome", {
      automation,
      boundsProvider: {
        async focus(appName): Promise<void> {
          calls.push(appName);
        },
        async get(): Promise<WindowBounds> {
          return bounds;
        },
      },
    });

    await window.focus();

    expect(calls).toEqual(["Chrome"]);
  });

  test("uses window-relative coordinates for movement and clicking", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
    });

    await window.click({ x: 20, y: 30 }, 400);

    expect(calls).toEqual([["move", { x: 120, y: 230 }, 400], ["click"]]);
  });

  test("clamps fuzzy clicks to the window", async () => {
    const { automation, calls } = createAutomation();
    const randomValues = [0, 1];
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
      random: () => randomValues.shift() ?? 0,
    });

    await window.fclick({ x: 2, y: 598 }, 200, 10);

    expect(calls).toEqual([["move", { x: 100, y: 799 }, 200], ["click"]]);
  });

  test("keeps mouse down and mouse up as separate operations", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
    });

    await window.mouseDown({ x: 10, y: 20 }, 300);
    await window.mouseUp();

    expect(calls).toEqual([["move", { x: 110, y: 220 }, 300], ["mouseDown"], ["mouseUp"]]);
  });

  test("keeps concurrent click sequences together", async () => {
    const { automation, calls } = createAutomation();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
    });

    await Promise.all([window.click({ x: 10, y: 20 }, 300), window.click({ x: 30, y: 40 }, 500)]);

    expect(calls).toEqual([
      ["move", { x: 110, y: 220 }, 300],
      ["click"],
      ["move", { x: 130, y: 240 }, 500],
      ["click"],
    ]);
  });

  test("returns the cursor position relative to the window", async () => {
    const { automation } = createAutomation();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
    });

    expect(await window.cursor()).toEqual({
      x: 50,
      y: 60,
    });
  });

  test("returns the window size", async () => {
    const { automation } = createAutomation();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
    });

    expect(await window.size()).toEqual({
      height: 600,
      width: 800,
    });
  });

  test("rejects invalid coordinates", async () => {
    const { automation } = createAutomation();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
    });

    expect(window.move({ x: 800, y: 0 }, 0)).rejects.toThrow("outside the window");
  });

  test("finds images with a default confidence", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
      imageFinder,
    });

    expect(await window.find(image)).toEqual(match);
    expect(calls).toEqual([["find", image, bounds, 0.99]]);
  });

  test("finds all images with an explicit confidence", async () => {
    const { automation } = createAutomation();
    const { calls, imageFinder } = createImageFinder();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
      imageFinder,
    });

    expect(await window.findAll(image, 0.9)).toEqual([match]);
    expect(calls).toEqual([["findAll", image, bounds, 0.9]]);
  });

  test("rejects invalid confidence", () => {
    const { automation } = createAutomation();
    const { imageFinder } = createImageFinder();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
      imageFinder,
    });

    expect(window.find(image, 2)).rejects.toThrow("confidence must be between 0 and 1");
    expect(window.findAll(image, Number.NaN)).rejects.toThrow("confidence must be between 0 and 1");
  });
});
