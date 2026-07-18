import { describe, expect, it } from "vitest";
import { placeFloatingMenu } from "./selection-menu-geometry";

describe("placeFloatingMenu", () => {
  const viewport = { offsetLeft: 100, offsetTop: 200, width: 320, height: 480 };
  const menu = { width: 132, height: 44 };

  it("centers above a selection in visual viewport coordinates", () => {
    expect(placeFloatingMenu({ left: 220, right: 300, top: 340, bottom: 360 }, menu, viewport))
      .toEqual({ left: 194, top: 284, placement: "top" });
  });

  it("clamps horizontal placement and falls below when top space is unsafe", () => {
    expect(placeFloatingMenu({ left: 90, right: 115, top: 205, bottom: 230 }, menu, viewport))
      .toEqual({ left: 108, top: 242, placement: "bottom" });
    expect(placeFloatingMenu({ left: 405, right: 450, top: 400, bottom: 420 }, menu, viewport).left)
      .toBe(280);
  });

  it("keeps an oversized menu inside the viewport instead of producing negative geometry", () => {
    expect(placeFloatingMenu(
      { left: 200, right: 210, top: 250, bottom: 260 },
      { width: 500, height: 700 },
      viewport,
    )).toEqual({ left: 108, top: 208, placement: "bottom" });
  });
});
