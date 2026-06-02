import { describe, expect, test } from "bun:test";

import { type Automation, Window } from "./window.ts";

import type { Point } from "./types.ts";
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

  test("rejects invalid coordinates", async () => {
    const { automation } = createAutomation();
    const window = new Window("Chrome", {
      automation,
      boundsProvider,
    });

    expect(window.move({ x: 800, y: 0 }, 0)).rejects.toThrow("outside the window");
  });
});
