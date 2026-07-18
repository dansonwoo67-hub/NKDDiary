"use client";

import { Bookmark, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createBookmarkAction } from "@/features/bookmarks/actions";
import { anchorFromSelection, type SelectionAnchor } from "@/features/annotations/selection-anchor";
import { placeFloatingMenu, type RectLike, type ViewportLike } from "./selection-menu-geometry";

type Position = { left: number; top: number };

function currentViewport(): ViewportLike {
  const viewport = window.visualViewport;
  return viewport
    ? { offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop, width: viewport.width, height: viewport.height }
    : { offsetLeft: 0, offsetTop: 0, width: window.innerWidth, height: window.innerHeight };
}

export function InlineSelectionMenu({
  letterId,
  rootRef,
  onComment,
}: {
  letterId: string;
  rootRef: RefObject<HTMLDivElement | null>;
  onComment: (anchor: SelectionAnchor, anchorRect: RectLike) => void;
}) {
  const [menu, setMenu] = useState<{ anchor: SelectionAnchor; position: Position; touch: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [messagePosition, setMessagePosition] = useState<Position | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const selectionRectRef = useRef<RectLike | null>(null);
  const pointerTypeRef = useRef("mouse");
  const rafRef = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const messageTimerRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    rangeRef.current = null;
    selectionRectRef.current = null;
    setMenu(null);
  }, []);

  const currentSelectionRect = useCallback((): RectLike | null => {
    const range = rangeRef.current;
    if (range && typeof range.getBoundingClientRect === "function") {
      try {
        const rect = range.getBoundingClientRect();
        if ([rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)) {
          const next = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          selectionRectRef.current = next;
          return next;
        }
      } catch {
        // A detached range can briefly fail while navigation or selection cleanup is in progress.
      }
    }
    return selectionRectRef.current;
  }, []);

  const repositionMenu = useCallback(() => {
    const element = menuRef.current;
    const selectionRect = currentSelectionRect();
    if (!element || !selectionRect) return;
    const measured = element.getBoundingClientRect();
    const width = measured.width > 0 ? measured.width : element.offsetWidth;
    const height = measured.height > 0 ? measured.height : element.offsetHeight;
    if (!(width > 0) || !(height > 0)) return;
    const next = placeFloatingMenu(selectionRect, { width, height }, currentViewport());
    setMenu((current) => {
      if (!current || current.touch ||
        (current.position.left === next.left && current.position.top === next.top)) return current;
      return { ...current, position: { left: next.left, top: next.top } };
    });
  }, [currentSelectionRect]);

  const captureSelection = useCallback((touch = pointerTypeRef.current === "touch") => {
    const selection = window.getSelection();
    const root = rootRef.current;
    if (!selection || selection.rangeCount === 0 || !root) {
      dismiss();
      return false;
    }
    const range = selection.getRangeAt(0);
    const result = anchorFromSelection(range, root);
    if (!result.ok) {
      dismiss();
      return false;
    }
    const rect = range.getBoundingClientRect();
    if (![rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)) {
      dismiss();
      return false;
    }
    rangeRef.current = range.cloneRange();
    selectionRectRef.current = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    const viewport = currentViewport();
    setMessage("");
    setMenu({
      anchor: result.anchor,
      position: { left: viewport.offsetLeft, top: viewport.offsetTop },
      touch,
    });
    return true;
  }, [dismiss, rootRef]);

  const shouldPositionMenu = Boolean(menu && !menu.touch);
  useEffect(() => {
    if (shouldPositionMenu) repositionMenu();
  }, [menu?.anchor, repositionMenu, shouldPositionMenu]);

  const scheduleCapture = useCallback(() => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      captureSelection();
    });
  }, [captureSelection]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onPointerDown = (event: PointerEvent) => {
      pointerTypeRef.current = event.pointerType || "mouse";
    };
    const onPointerUp = () => scheduleCapture();
    const onContextMenu = (event: MouseEvent) => {
      const touch = pointerTypeRef.current === "touch";
      const valid = captureSelection(touch);
      if (valid && !touch) event.preventDefault();
    };
    const onSelectionChange = () => scheduleCapture();
    const onViewportChange = () => repositionMenu();
    const onOutsidePointer = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (root.contains(event.target as Node)) return;
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        pointerTypeRef.current = "keyboard";
      }
      if (event.key === "Escape") dismiss();
    };

    const visualViewport = window.visualViewport;

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onOutsidePointer, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("popstate", dismiss);
    visualViewport?.addEventListener("resize", onViewportChange);
    visualViewport?.addEventListener("scroll", onViewportChange);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onOutsidePointer, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("popstate", dismiss);
      visualViewport?.removeEventListener("resize", onViewportChange);
      visualViewport?.removeEventListener("scroll", onViewportChange);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    };
  }, [captureSelection, dismiss, repositionMenu, rootRef, scheduleCapture]);

  async function bookmark() {
    if (!menu || submittingRef.current) return;
    submittingRef.current = true;
    let succeeded = false;
    let feedback = "收藏失败，请稍后再试。";
    try {
      const result = await createBookmarkAction({ letterId, ...menu.anchor });
      feedback = result.message;
      succeeded = result.ok;
    } catch {
      // Keep the selection menu open so the user can retry without reselecting.
    } finally {
      submittingRef.current = false;
    }
    setMessage(feedback);
    setMessagePosition(menu.position);
    if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => {
      setMessage("");
      setMessagePosition(null);
      messageTimerRef.current = null;
    }, 1_800);
    if (succeeded) dismiss();
  }

  function preserveRange(event: React.PointerEvent) {
    event.preventDefault();
    const selection = window.getSelection();
    if (selection && rangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(rangeRef.current);
    }
  }

  return (
    <>
      {menu ? (
        <div
          ref={menuRef}
          data-testid="inline-selection-menu"
          data-touch={menu.touch ? "true" : "false"}
          role="toolbar"
          aria-label="选中文字操作"
          style={menu.touch ? undefined : { left: menu.position.left, top: menu.position.top }}
          className={menu.touch
            ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex min-h-12 max-w-xs items-center justify-center gap-1 rounded-full border border-[rgb(71_56_45_/_14%)] bg-[var(--paper)] p-1.5 shadow-[0_14px_38px_rgb(120_68_76_/_20%)]"
            : "fixed z-40 flex min-h-11 items-center gap-1 rounded-full border border-[rgb(71_56_45_/_14%)] bg-[var(--paper)] p-1 shadow-[0_12px_32px_rgb(120_68_76_/_18%)]"}
        >
          <button
            type="button"
            onPointerDown={preserveRange}
            onClick={() => {
              const selectionRect = currentSelectionRect();
              if (selectionRect) onComment(menu.anchor, selectionRect);
              dismiss();
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[var(--ink)] outline-none hover:bg-white/75 focus-visible:ring-2 focus-visible:ring-[var(--rose)]"
          >
            <MessageCircle aria-hidden="true" size={16} />评论
          </button>
          <button
            type="button"
            onPointerDown={preserveRange}
            onClick={bookmark}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[var(--ink)] outline-none hover:bg-white/75 focus-visible:ring-2 focus-visible:ring-[var(--rose)]"
          >
            <Bookmark aria-hidden="true" size={16} />收藏
          </button>
        </div>
      ) : null}
      {message ? (
        <p
          role="status"
          style={messagePosition ? { left: messagePosition.left, top: messagePosition.top } : undefined}
          className="fixed z-40 rounded-full border border-[rgb(71_56_45_/_12%)] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[var(--ink)] shadow-[0_10px_28px_rgb(120_68_76_/_16%)]"
        >{message}</p>
      ) : null}
    </>
  );
}
