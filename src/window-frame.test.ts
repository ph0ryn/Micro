import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  createMacWindowFrameProvider,
  findTargetScript,
  type WindowTarget,
} from "./window-frame.ts";

const execFileAsync = promisify(execFile);

interface FakeProcess {
  bundleIdentifier: string;
  name: string;
  visible: boolean;
  windows: number;
}

const selectTarget = async (target: WindowTarget, processes: FakeProcess[]): Promise<string> => {
  const script = String.raw`
var fakeProcesses = [];

function createWindow() {
  return {
    position() {
      return [0, 0];
    },
    size() {
      return [1, 1];
    },
  };
}

function createProcess(process) {
  return {
    bundleIdentifier() {
      return process.bundleIdentifier;
    },
    name() {
      return process.name;
    },
    windows() {
      return Array.from({ length: process.windows }, createWindow);
    },
  };
}

var __microApplication = function () {
  return {
    applicationProcesses: {
      whose() {
        return function () {
          return fakeProcesses.filter((process) => process.visible).map(createProcess);
        };
      },
    },
  };
};

${findTargetScript}

function run(argv) {
  fakeProcesses = JSON.parse(argv[1]);

  return findTarget(JSON.parse(argv[0])).name();
}
`;

  const { stdout } = await execFileAsync("osascript", [
    "-l",
    "JavaScript",
    "-e",
    script,
    "--",
    JSON.stringify(target),
    JSON.stringify(processes),
  ]);

  return stdout.trim();
};

const processes: FakeProcess[] = [
  {
    bundleIdentifier: "com.google.Chrome",
    name: "Google Chrome",
    visible: true,
    windows: 1,
  },
  {
    bundleIdentifier: "com.apple.Safari",
    name: "Safari",
    visible: true,
    windows: 1,
  },
];

describe("findTargetScript", () => {
  test("selects an application by exact bundle identifier", async () => {
    expect(await selectTarget({ bundleId: "com.google.Chrome" }, processes)).toBe("Google Chrome");
  });

  test("selects an application by exact process name", async () => {
    expect(await selectTarget({ name: "Google Chrome" }, processes)).toBe("Google Chrome");
  });

  test("does not match partial process names", async () => {
    expect(selectTarget({ name: "Chrome" }, processes)).rejects.toThrow(
      "Application not found for name: Chrome",
    );
  });

  test("does not match names case-insensitively", async () => {
    expect(selectTarget({ name: "google chrome" }, processes)).rejects.toThrow(
      "Application not found for name: google chrome",
    );
  });

  test("throws when a target has multiple matching processes", async () => {
    expect(
      selectTarget({ bundleId: "com.google.Chrome" }, [
        ...processes,
        {
          bundleIdentifier: "com.google.Chrome",
          name: "Google Chrome",
          visible: true,
          windows: 1,
        },
      ]),
    ).rejects.toThrow("Ambiguous application target for bundleId: com.google.Chrome");
  });

  test("throws when the matching application has no windows", async () => {
    expect(
      selectTarget({ bundleId: "com.apple.Music" }, [
        {
          bundleIdentifier: "com.apple.Music",
          name: "Music",
          visible: true,
          windows: 0,
        },
      ]),
    ).rejects.toThrow("Window not found for application: Music");
  });
});

describe("createMacWindowFrameProvider", () => {
  test("resolves a CGWindowID from matching window geometry", async () => {
    const provider = createMacWindowFrameProvider({
      listWindows: () => [
        {
          height: 600,
          id: 111,
          pid: 12,
          width: 800,
          x: 100,
          y: 200,
          z: 1,
        },
        {
          height: 700,
          id: 222,
          pid: 34,
          width: 900,
          x: 300,
          y: 400,
          z: 0,
        },
      ],
      async runFrameScript() {
        return {
          origin: {
            x: 300,
            y: 400,
          },
          pid: 34,
          size: {
            height: 700,
            width: 900,
          },
        };
      },
    });

    expect(await provider.get({ bundleId: "com.google.Chrome" })).toEqual({
      origin: {
        x: 300,
        y: 400,
      },
      size: {
        height: 700,
        width: 900,
      },
      windowId: 222,
    });
  });

  test("throws when the CGWindowID cannot be resolved", async () => {
    const provider = createMacWindowFrameProvider({
      listWindows: () => [],
      async runFrameScript() {
        return {
          origin: {
            x: 300,
            y: 400,
          },
          pid: 34,
          size: {
            height: 700,
            width: 900,
          },
        };
      },
    });

    expect(provider.get({ bundleId: "com.google.Chrome" })).rejects.toThrow(
      "CGWindowID not found for pid 34",
    );
  });
});
