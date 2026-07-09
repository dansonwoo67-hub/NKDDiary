import { describe, expect, it } from "vitest";
import { calculateDistanceKm, getDistanceCopy } from "./distance";

describe("distance", () => {
  it("calculates approximate kilometers", () => {
    const shanghai = { latitude: 31.2304, longitude: 121.4737 };
    const hangzhou = { latitude: 30.2741, longitude: 120.1551 };

    expect(calculateDistanceKm(shanghai, hangzhou)).toBeGreaterThan(150);
  });

  it("returns configured copy", () => {
    expect(getDistanceCopy(null)).toBe("等待星球信号");
    expect(getDistanceCopy(99.9)).toBe("朝夕相伴，暮暮朝朝");
    expect(getDistanceCopy(100)).toBe("相爱隔山海，山海皆可平");
  });
});
