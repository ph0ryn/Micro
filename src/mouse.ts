import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Point } from "./types.ts";
import type { Automation, AutomationMoveRequest } from "./window.ts";

const execFileAsync = promisify(execFile);
const defaultMoveStepMs = 16;
const maxMoveSteps = 240;

const silentmousePath = (): string => process.env["MICRO_SILENTMOUSE_PATH"] ?? "silentmouse";

const formatCoordinate = (value: number): string => value.toString();

const runSilentmouse = async (args: string[]): Promise<void> => {
  if (process.platform !== "darwin") {
    throw new Error("Micro only supports macOS");
  }

  try {
    await execFileAsync(silentmousePath(), args);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`silentmouse failed: ${error.message}`);
    }

    throw error;
  }
};

const mouseEvent = async (
  event: "down" | "drag" | "move" | "up",
  windowId: number,
  target: Point,
): Promise<void> => {
  await runSilentmouse([
    "mouse",
    event,
    "-w",
    windowId.toString(),
    "-x",
    formatCoordinate(target.x),
    "-y",
    formatCoordinate(target.y),
  ]);
};

const interpolate = (request: { from: Point; step: number; steps: number; to: Point }): Point => {
  const { from, step, steps, to } = request;
  const progress = step / steps;

  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
};

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

export const mouseAutomation: Automation = {
  async click(windowId: number, target: Point): Promise<void> {
    await runSilentmouse([
      "click",
      "-w",
      windowId.toString(),
      "-x",
      formatCoordinate(target.x),
      "-y",
      formatCoordinate(target.y),
    ]);
  },

  async mouseDown(windowId: number, target: Point): Promise<void> {
    await mouseEvent("down", windowId, target);
  },

  async mouseUp(windowId: number, target: Point): Promise<void> {
    await mouseEvent("up", windowId, target);
  },

  async move(request: AutomationMoveRequest): Promise<void> {
    const { durationMs, from, target, windowId } = request;
    let event: "drag" | "move" = "move";

    if (request.dragging) {
      event = "drag";
    }

    if (durationMs === 0 || !from) {
      await mouseEvent(event, windowId, target);

      return;
    }

    const steps = Math.min(maxMoveSteps, Math.max(1, Math.round(durationMs / defaultMoveStepMs)));
    const stepDelay = durationMs / steps;

    for (let step = 1; step <= steps; step += 1) {
      if (step > 1) {
        await sleep(stepDelay);
      }

      await mouseEvent(event, windowId, interpolate({ from, step, steps, to: target }));
    }
  },
};
