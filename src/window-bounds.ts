import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Point, Size } from "./types.ts";

const execFileAsync = promisify(execFile);

export const findTargetScript = String.raw`
function describeTarget(target) {
  if (typeof target.bundleId === "string") {
    return "bundleId: " + target.bundleId;
  }

  return "name: " + target.name;
}

function matchesTarget(process, target) {
  if (typeof target.bundleId === "string") {
    return process.bundleIdentifier() === target.bundleId;
  }

  return process.name() === target.name;
}

function getSystemEvents() {
  if (typeof __microApplication === "function") {
    return __microApplication("System Events");
  }

  return Application("System Events");
}

function findTarget(target) {
  const systemEvents = getSystemEvents();
  const candidates = systemEvents.applicationProcesses.whose({ visible: true })()
    .filter((process) => matchesTarget(process, target));

  if (candidates.length === 0) {
    throw new Error("Application not found for " + describeTarget(target));
  }

  if (candidates.length > 1) {
    throw new Error("Ambiguous application target for " + describeTarget(target));
  }

  const candidate = candidates[0];

  if (candidate.windows().length === 0) {
    throw new Error("Window not found for application: " + candidate.name());
  }

  return candidate;
}
`;

const windowBoundsScript = String.raw`
${findTargetScript}

function run(argv) {
  const target = findTarget(JSON.parse(argv[0]));
  const position = target.windows()[0].position();
  const size = target.windows()[0].size();

  return JSON.stringify({
    origin: { x: position[0], y: position[1] },
    size: { width: size[0], height: size[1] },
  });
}
`;

const focusWindowScript = String.raw`
${findTargetScript}

function run(argv) {
  const target = findTarget(JSON.parse(argv[0]));

  target.frontmost = true;
}
`;

export type WindowTarget = { bundleId: string; name?: never } | { bundleId?: never; name: string };

export interface WindowBounds {
  origin: Point;
  size: Size;
}

export interface WindowBoundsProvider {
  focus(target: WindowTarget): Promise<void>;
  get(target: WindowTarget): Promise<WindowBounds>;
}

const serializeWindowTarget = (target: WindowTarget): string => JSON.stringify(target);

export const macWindowBoundsProvider: WindowBoundsProvider = {
  async focus(target: WindowTarget): Promise<void> {
    if (process.platform !== "darwin") {
      throw new Error("Micro only supports macOS");
    }

    await execFileAsync("osascript", [
      "-l",
      "JavaScript",
      "-e",
      focusWindowScript,
      "--",
      serializeWindowTarget(target),
    ]);
  },

  async get(target: WindowTarget): Promise<WindowBounds> {
    if (process.platform !== "darwin") {
      throw new Error("Micro only supports macOS");
    }

    const { stdout } = await execFileAsync("osascript", [
      "-l",
      "JavaScript",
      "-e",
      windowBoundsScript,
      "--",
      serializeWindowTarget(target),
    ]);

    return JSON.parse(stdout) as WindowBounds;
  },
};
