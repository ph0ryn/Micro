import { describe, expect, test } from "bun:test";

import { sleep } from "./util.ts";

describe("sleep", () => {
  test("waits for approximately the requested duration", async () => {
    const start = performance.now();

    await sleep(100);

    expect(performance.now() - start).toBeGreaterThanOrEqual(90);
  });
});
