import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Window as ScreenshotWindow } from "node-screenshots";

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
    pid: target.unixId(),
    origin: { x: position[0], y: position[1] },
    size: { width: size[0], height: size[1] },
  });
}
`;

const focusAndGetWindowBoundsScript = String.raw`
${findTargetScript}

function run(argv) {
  const target = findTarget(JSON.parse(argv[0]));

  target.frontmost = true;

  const position = target.windows()[0].position();
  const size = target.windows()[0].size();

  return JSON.stringify({
    pid: target.unixId(),
    origin: { x: position[0], y: position[1] },
    size: { width: size[0], height: size[1] },
  });
}
`;

export type WindowTarget = { bundleId: string; name?: never } | { bundleId?: never; name: string };

export interface WindowBounds {
  origin: Point;
  size: Size;
  windowId?: number;
}

export interface WindowBoundsProvider {
  focusAndGet(target: WindowTarget): Promise<WindowBounds>;
  get(target: WindowTarget): Promise<WindowBounds>;
}

export interface WindowDescription {
  height: number;
  id: number;
  pid: number;
  width: number;
  x: number;
  y: number;
  z: number;
}

interface TargetWindowBounds {
  origin: Point;
  pid: number;
  size: Size;
}

export interface MacWindowBoundsProviderDependencies {
  listWindows(): WindowDescription[];
  runBoundsScript(script: string, target: WindowTarget): Promise<TargetWindowBounds>;
}

const serializeWindowTarget = (target: WindowTarget): string => JSON.stringify(target);

const closeEnough = (left: number, right: number): boolean => Math.abs(left - right) <= 1;

const resolveWindowId = (target: TargetWindowBounds, windows: WindowDescription[]): number => {
  const candidates = windows
    .filter(
      (window) =>
        window.pid === target.pid &&
        closeEnough(window.x, target.origin.x) &&
        closeEnough(window.y, target.origin.y) &&
        closeEnough(window.width, target.size.width) &&
        closeEnough(window.height, target.size.height),
    )
    .sort((left, right) => left.z - right.z);

  const [candidate] = candidates;

  if (!candidate) {
    throw new Error(`CGWindowID not found for pid ${target.pid}`);
  }

  return candidate.id;
};

const withWindowId = (target: TargetWindowBounds, windows: WindowDescription[]): WindowBounds => ({
  origin: target.origin,
  size: target.size,
  windowId: resolveWindowId(target, windows),
});

const runBoundsScript = async (
  script: string,
  target: WindowTarget,
): Promise<TargetWindowBounds> => {
  const { stdout } = await execFileAsync("osascript", [
    "-l",
    "JavaScript",
    "-e",
    script,
    "--",
    serializeWindowTarget(target),
  ]);

  return JSON.parse(stdout) as TargetWindowBounds;
};

const defaultDependencies: MacWindowBoundsProviderDependencies = {
  listWindows: () =>
    ScreenshotWindow.all().map((window) => ({
      height: window.height(),
      id: window.id(),
      pid: window.pid(),
      width: window.width(),
      x: window.x(),
      y: window.y(),
      z: window.z(),
    })),
  runBoundsScript,
};

export const createMacWindowBoundsProvider = (
  dependencies: MacWindowBoundsProviderDependencies = defaultDependencies,
): WindowBoundsProvider => ({
  async focusAndGet(target: WindowTarget): Promise<WindowBounds> {
    if (process.platform !== "darwin") {
      throw new Error("Micro only supports macOS");
    }

    return withWindowId(
      await dependencies.runBoundsScript(focusAndGetWindowBoundsScript, target),
      dependencies.listWindows(),
    );
  },

  async get(target: WindowTarget): Promise<WindowBounds> {
    if (process.platform !== "darwin") {
      throw new Error("Micro only supports macOS");
    }

    return withWindowId(
      await dependencies.runBoundsScript(windowBoundsScript, target),
      dependencies.listWindows(),
    );
  },
});

export const macWindowBoundsProvider = createMacWindowBoundsProvider();
