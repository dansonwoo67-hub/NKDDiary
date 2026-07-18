import type { RectLike, SizeLike, ViewportLike } from "./selection-menu-geometry";

const MARGIN = 8;
const GAP = 12;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function placeCommentPopover(anchor: RectLike, dialog: SizeLike, viewport: ViewportLike) {
  const maxWidth = Math.max(0, viewport.width - MARGIN * 2);
  const maxHeight = Math.max(0, viewport.height - MARGIN * 2);
  const effectiveDialog = {
    width: Math.min(dialog.width, maxWidth),
    height: Math.min(dialog.height, maxHeight),
  };
  const minLeft = viewport.offsetLeft + MARGIN;
  const maxLeft = viewport.offsetLeft + viewport.width - MARGIN - effectiveDialog.width;
  const minTop = viewport.offsetTop + MARGIN;
  const maxTop = viewport.offsetTop + viewport.height - MARGIN - effectiveDialog.height;
  const left = clamp(anchor.left, minLeft, maxLeft);
  const preferredBottom = anchor.bottom + GAP;
  const preferredTop = anchor.top - effectiveDialog.height - GAP;
  const canFitBelow = preferredBottom <= maxTop;
  const canFitAbove = preferredTop >= minTop;
  const placement = canFitBelow || !canFitAbove ? "bottom" as const : "top" as const;
  const top = placement === "bottom"
    ? clamp(preferredBottom, minTop, maxTop)
    : clamp(preferredTop, minTop, maxTop);

  return { left, top, placement, maxWidth, maxHeight };
}
