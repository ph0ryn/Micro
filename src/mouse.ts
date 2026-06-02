import { Button, Point as NutPoint, mouse, straightTo } from "@nut-tree-fork/nut-js";

import type { Point } from "./types.ts";
import type { Automation } from "./window.ts";

const toNutPoint = (target: Point): NutPoint => new NutPoint(target.x, target.y);

let mouseOperation = Promise.resolve();

const runMouseOperation = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
  const current = mouseOperation.then(operation, operation);

  mouseOperation = current.then(
    () => undefined,
    () => undefined,
  );

  return current;
};

export const mouseAutomation: Automation = {
  async click(): Promise<void> {
    await runMouseOperation(() => mouse.leftClick());
  },

  async getCursor(): Promise<Point> {
    return runMouseOperation(() => mouse.getPosition());
  },

  async mouseDown(): Promise<void> {
    await runMouseOperation(() => mouse.pressButton(Button.LEFT));
  },

  async mouseUp(): Promise<void> {
    await runMouseOperation(() => mouse.releaseButton(Button.LEFT));
  },

  async move(target: Point, durationMs: number): Promise<void> {
    await runMouseOperation(async () => {
      const nutTarget = toNutPoint(target);

      if (durationMs === 0) {
        await mouse.setPosition(nutTarget);

        return;
      }

      const path = await straightTo(nutTarget);

      if (path.length === 0) {
        return;
      }

      const previousSpeed = mouse.config.mouseSpeed;

      try {
        mouse.config.mouseSpeed = (path.length * 1000) / durationMs;
        await mouse.move(path);
      } finally {
        mouse.config.mouseSpeed = previousSpeed;
      }
    });
  },
};
