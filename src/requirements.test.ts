import { describe, expect, test } from "bun:test";

import { checkRequirements } from "./requirements.ts";

describe("checkRequirements", () => {
  test("keeps a compatibility preflight API", async () => {
    expect(await checkRequirements()).toBeUndefined();
    expect(await checkRequirements({ screenRecording: true })).toBeUndefined();
  });
});
