import { describe, expect, mock, test } from "bun:test";

import type { AuthType, PermissionType } from "@nut-tree-fork/node-mac-permissions";

type Call = ["ask", "accessibility" | "screen"] | ["status", AuthType];

const loadCheckRequirements = async (
  getStatus: (type: AuthType) => PermissionType | "not determined",
  calls: Call[],
) => {
  await mock.module("@nut-tree-fork/node-mac-permissions", () => ({
    askForAccessibilityAccess(): void {
      calls.push(["ask", "accessibility"]);
    },
    askForScreenCaptureAccess(): void {
      calls.push(["ask", "screen"]);
    },
    getAuthStatus(type: AuthType): PermissionType | "not determined" {
      calls.push(["status", type]);

      return getStatus(type);
    },
  }));

  return import(`./requirements.ts?test=${crypto.randomUUID()}`);
};

describe("checkRequirements", () => {
  test("continues when Accessibility is authorized", async () => {
    const calls: Call[] = [];
    const { checkRequirements } = await loadCheckRequirements(() => "authorized", calls);

    expect(await checkRequirements()).toBeUndefined();

    expect(calls).toEqual([["status", "accessibility"]]);
  });

  test("opens Accessibility settings and throws when Accessibility is missing", async () => {
    const calls: Call[] = [];
    const { checkRequirements } = await loadCheckRequirements(() => "denied", calls);

    expect(checkRequirements({ screenRecording: true })).rejects.toThrow(
      "Accessibility permission is required",
    );

    expect(calls).toEqual([
      ["status", "accessibility"],
      ["ask", "accessibility"],
    ]);
  });

  test("does not check Screen Recording unless requested", async () => {
    const calls: Call[] = [];
    const { checkRequirements } = await loadCheckRequirements(() => "authorized", calls);

    expect(await checkRequirements()).toBeUndefined();

    expect(calls).toEqual([["status", "accessibility"]]);
  });

  test("opens Screen Recording settings and throws when requested permission is missing", async () => {
    const calls: Call[] = [];
    const { checkRequirements } = await loadCheckRequirements((type) => {
      if (type === "accessibility") {
        return "authorized";
      }

      return "not determined";
    }, calls);

    expect(checkRequirements({ screenRecording: true })).rejects.toThrow(
      "Screen Recording permission is required",
    );

    expect(calls).toEqual([
      ["status", "accessibility"],
      ["status", "screen"],
      ["ask", "screen"],
    ]);
  });

  test("opens only Accessibility settings when both permissions are missing", async () => {
    const calls: Call[] = [];
    const { checkRequirements } = await loadCheckRequirements(() => "denied", calls);

    expect(checkRequirements({ screenRecording: true })).rejects.toThrow(
      "Accessibility permission is required",
    );

    expect(calls).toEqual([
      ["status", "accessibility"],
      ["ask", "accessibility"],
    ]);
  });
});
