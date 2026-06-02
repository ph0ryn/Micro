import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Point, Size } from "./types.ts";

const execFileAsync = promisify(execFile);

const findTargetScript = String.raw`
function findTarget(appName) {
  const query = appName.toLowerCase();
  const systemEvents = Application("System Events");
  const candidates = systemEvents.applicationProcesses.whose({ visible: true })()
    .filter((process) => process.name().toLowerCase().includes(query));
  const target = candidates.find((process) => process.frontmost()) ?? candidates[0];

  if (!target) {
    throw new Error("Application not found: " + appName);
  }

  if (target.windows().length === 0) {
    throw new Error("Window not found for application: " + target.name());
  }

  return target;
}
`;

const windowBoundsScript = String.raw`
${findTargetScript}

function run(argv) {
  const target = findTarget(argv[0]);
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
  const target = findTarget(argv[0]);

  target.frontmost = true;
}
`;

export interface WindowBounds {
  origin: Point;
  size: Size;
}

export interface WindowBoundsProvider {
  focus(appName: string): Promise<void>;
  get(appName: string): Promise<WindowBounds>;
}

export const macWindowBoundsProvider: WindowBoundsProvider = {
  async focus(appName: string): Promise<void> {
    if (process.platform !== "darwin") {
      throw new Error("Micro only supports macOS");
    }

    await execFileAsync("osascript", ["-l", "JavaScript", "-e", focusWindowScript, "--", appName]);
  },

  async get(appName: string): Promise<WindowBounds> {
    if (process.platform !== "darwin") {
      throw new Error("Micro only supports macOS");
    }

    const { stdout } = await execFileAsync("osascript", [
      "-l",
      "JavaScript",
      "-e",
      windowBoundsScript,
      "--",
      appName,
    ]);

    return JSON.parse(stdout) as WindowBounds;
  },
};
