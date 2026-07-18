export type RectLike = { left: number; right: number; top: number; bottom: number };
export type SizeLike = { width: number; height: number };
export type ViewportLike = { offsetLeft: number; offsetTop: number; width: number; height: number };

const MARGIN = 8;
const GAP = 12;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function placeFloatingMenu(rect: RectLike, menu: SizeLike, viewport: ViewportLike) {
  const minLeft = viewport.offsetLeft + MARGIN;
  const maxLeft = viewport.offsetLeft + viewport.width - MARGIN - menu.width;
  const minTop = viewport.offsetTop + MARGIN;
  const maxTop = viewport.offsetTop + viewport.height - MARGIN - menu.height;
  const left = clamp((rect.left + rect.right - menu.width) / 2, minLeft, maxLeft);
  const preferredTop = rect.top - menu.height - GAP;
  const canFitAbove = preferredTop >= minTop;
  const preferredBottom = rect.bottom + GAP;
  const top = canFitAbove
    ? clamp(preferredTop, minTop, maxTop)
    : clamp(preferredBottom, minTop, maxTop);
  return { left, top, placement: canFitAbove ? "top" as const : "bottom" as const };
}
