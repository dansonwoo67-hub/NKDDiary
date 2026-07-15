"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Heart, MessagesSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { InlineCommentPopover } from "@/features/annotations/components/InlineCommentPopover";
import { InlineSelectionMenu } from "@/features/annotations/components/InlineSelectionMenu";
import type { RectLike } from "@/features/annotations/components/selection-menu-geometry";
import type { SelectionAnchor } from "@/features/annotations/selection-anchor";
import { toggleWholeLetterBookmarkAction } from "@/features/bookmarks/actions";
import type { ReaderLetter } from "@/features/letters/actions";
import { SevenCharGate } from "@/features/letters/components/SevenCharGate";
import { RichLetterBody } from "@/features/letters/components/RichLetterBody";

const MOOD_LABELS = ["心碎小狗 🐶💧", "委屈趴窝 🥺", "原地待机 😐", "尾巴摇摇 🙂", "快乐转圈 😆"];
const MEAL_LABELS = ["空盘哭哭 🍽️", "垫了一口 🥐", "认真干饭 🍚", "吃好啦 🍲", "圆滚滚 🐹"];
const HEALTH_LABELS = ["没动静 🚫", "蓄势待发 🫣", "一坨达成 💩", "双倍顺畅 💩💩", "串稀警报 🌊"];

export function LetterReader({ letter }: { letter: ReaderLetter }) {
  const [opened, setOpened] = useState(letter.hasOpened);
  const [bookmarked, setBookmarked] = useState(letter.isBookmarked);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [popover, setPopover] = useState<{
    mode:
      | { kind: "create"; letterId: string; anchor: SelectionAnchor }
      | { kind: "thread"; annotationId: string; annotationIds: string[] | null };
    anchorRect: RectLike | null;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const bookmarkSubmittingRef = useRef(false);
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const bodyRootId = `letter-body-${letter.id}`;

  useEffect(() => {
    if (!bookmarkSubmittingRef.current) setBookmarked(letter.isBookmarked);
  }, [letter.isBookmarked]);

  if (!opened) {
    return (
      <SevenCharGate
        letterId={letter.id}
        authorName={letter.authorName}
        authorAvatarUrl={letter.authorAvatarUrl}
        sevenCharLine={letter.sevenCharLine}
        onOpened={() => setOpened(true)}
      />
    );
  }

  function snapshotRect(rect?: DOMRect): RectLike | null {
    return rect
      ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
      : null;
  }

  function openThread(annotationId: string, annotationIds: string[] | null = null, rect?: DOMRect) {
    if (!letter.annotations.some((item) => item.id === annotationId)) return;
    setPopover({
      mode: { kind: "thread", annotationId, annotationIds },
      anchorRect: snapshotRect(rect),
    });
  }

  const threadDescriptor = popover?.mode.kind === "thread" ? popover.mode : null;
  const resolvedPopoverMode = popover?.mode.kind === "create"
    ? popover.mode
    : threadDescriptor
      ? (() => {
          const annotation = letter.annotations.find((item) => item.id === threadDescriptor.annotationId);
          if (!annotation) return null;
          const threads = threadDescriptor.annotationIds === null
            ? letter.annotations
            : letter.annotations.filter((item) => threadDescriptor.annotationIds?.includes(item.id));
          return { kind: "thread" as const, annotation, threads };
        })()
      : null;

  async function toggleBookmark() {
    if (bookmarkSubmittingRef.current) return;
    bookmarkSubmittingRef.current = true;
    setBookmarkBusy(true);
    try {
      const result = await toggleWholeLetterBookmarkAction({ letterId: letter.id });
      setMessage(result.message);
      if (result.ok) setBookmarked(result.bookmarked);
    } catch {
      setMessage("收藏失败，请稍后再试。");
    } finally {
      bookmarkSubmittingRef.current = false;
      setBookmarkBusy(false);
    }
  }

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 20, rotateX: -8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="hand-card rounded-[2rem] p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-xl shadow-sm">
            {letter.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={letter.authorAvatarUrl} alt={letter.authorName} className="h-full w-full object-cover" />
            ) : (
              "♡"
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-[var(--muted-ink)]">{letter.letterDate}</p>
            <h2 className="truncate text-xl font-semibold">{letter.authorName} 的信</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {letter.annotations.length > 0 ? (
            <button
              type="button"
              onClick={(event) => openThread(
                letter.annotations[0].id,
                null,
                event.currentTarget.getBoundingClientRect(),
              )}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-[var(--muted-ink)] outline-none hover:bg-white/65 focus-visible:ring-2 focus-visible:ring-[var(--rose)]"
            >
              <MessagesSquare aria-hidden="true" size={17} />评点 {letter.annotations.length}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={bookmarked ? "取消整封信收藏" : "收藏整封信"}
            aria-pressed={bookmarked}
            disabled={bookmarkBusy}
            onClick={toggleBookmark}
            className="grid h-11 w-11 place-items-center rounded-full text-[var(--muted-ink)] outline-none hover:bg-white/65 focus-visible:ring-2 focus-visible:ring-[var(--rose)] disabled:opacity-55"
          >
            <Heart aria-hidden="true" size={20} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {letter.openResponseText ? (
        <p className="mt-4 rounded-2xl bg-white/60 px-4 py-3 text-sm text-[var(--muted-ink)]">你的回应：{letter.openResponseText}</p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StateBadge label="爱自己" value={MOOD_LABELS[letter.selfMoodValue - 1]} />
        <StateBadge label="爱生活" value={MEAL_LABELS[letter.mealValue - 1]} />
        <StateBadge label="爱健康" value={HEALTH_LABELS[letter.healthValue - 1]} />
      </div>

      <RichLetterBody
        rootRef={rootRef}
        rootId={bodyRootId}
        bodyJson={letter.bodyJson}
        bodyText={letter.body}
        annotations={letter.annotations}
        onAnnotationClick={openThread}
      />
      <InlineSelectionMenu
        letterId={letter.id}
        rootRef={rootRef}
        onComment={(anchor, anchorRect) => setPopover({
          mode: { kind: "create", letterId: letter.id, anchor },
          anchorRect,
        })}
      />
      {popover && resolvedPopoverMode ? (
        <InlineCommentPopover
          mode={resolvedPopoverMode}
          anchorRect={popover.anchorRect}
          onClose={() => setPopover(null)}
          onSaved={() => router.refresh()}
        />
      ) : null}
      {message ? <p role="status" className="mt-2 text-right text-xs text-[var(--muted-ink)]">{message}</p> : null}
    </motion.article>
  );
}

function StateBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/55 p-4">
      <p className="text-xs tracking-[0.2em] text-[var(--muted-ink)]">{label}</p>
      <p className="mt-2 text-sm text-[var(--ink)]">{value}</p>
    </div>
  );
}
