import { describe, expect, it } from "vitest";
import { formatServerTiming, measureServerTiming } from "./server-timing";

describe("server timing", () => {
  it("measures an async server operation without changing its value", async () => {
    const ticks = [10, 27];
    const measured = await measureServerTiming("home snapshot", async () => "ready", () => ticks.shift() ?? 0);

    expect(measured).toEqual({ value: "ready", timing: { name: "home_snapshot", durationMs: 17 } });
    expect(formatServerTiming([measured.timing])).toBe("home_snapshot;dur=17.0");
  });
});
