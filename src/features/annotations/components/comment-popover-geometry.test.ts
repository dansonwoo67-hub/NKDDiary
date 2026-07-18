import { describe, expect, it } from "vitest";
import { placeCommentPopover } from "./comment-popover-geometry";

describe("placeCommentPopover", () => {
  it("clamps a 384px dialog to a zoomed visual viewport with offsets", () => {
    expect(placeCommentPopover(
      { left: 380, right: 410, top: 300, bottom: 320 },
      { width: 384, height: 300 },
      { offsetLeft: 100, offsetTop: 200, width: 320, height: 480 },
    )).toEqual({ left: 108, top: 332, placement: "bottom", maxWidth: 304, maxHeight: 464 });
  });

  it("constrains the actual dialog size inside a zoomed narrow visual viewport", () => {
    const result = placeCommentPopover(
      { left: 380, right: 410, top: 300, bottom: 320 },
      { width: 384, height: 700 },
      { offsetLeft: 100, offsetTop: 200, width: 320, height: 480 },
    );

    expect(result.maxWidth).toBe(304);
    expect(result.maxHeight).toBe(464);
    expect(result.left + result.maxWidth).toBeLessThanOrEqual(412);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(672);
  });

  it("places above near the bottom and reclamps for a resized viewport", () => {
    const anchor = { left: 740, right: 780, top: 500, bottom: 520 };
    const dialog = { width: 384, height: 400 };
    expect(placeCommentPopover(anchor, dialog, { offsetLeft: 0, offsetTop: 0, width: 800, height: 600 }))
      .toEqual({ left: 408, top: 88, placement: "top", maxWidth: 784, maxHeight: 584 });
    expect(placeCommentPopover(anchor, dialog, { offsetLeft: 40, offsetTop: 80, width: 600, height: 420 }))
      .toEqual({ left: 248, top: 88, placement: "top", maxWidth: 584, maxHeight: 404 });
  });
});
