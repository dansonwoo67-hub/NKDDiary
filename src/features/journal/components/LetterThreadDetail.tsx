"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, RotateCcw } from "lucide-react";
import {
  replyToLetterAction,
  resendWithdrawnLetterAction,
  withdrawLetterAction,
} from "../letter-actions";
import type { LetterThreadDetailItem } from "../thread-repository";
import { CommentSection } from "./CommentSection";
import { FutureDiaryCountdown } from "./FutureDiaryCountdown";
import { OpenFutureDiaryButton } from "./OpenFutureDiaryButton";

type CommentItem = {
  id: string;
  entry_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  editable_until: string | null;
  withdrawn_at: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | { display_name: string | null; avatar_url: string | null }[] | null;
};

type ComposerState = {
  mode: "reply" | "resend";
  target: LetterThreadDetailItem;
};

const timeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatLetterTime(value: string) {
  const parts = Object.fromEntries(
    timeFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function visibleHtml(letter: LetterThreadDetailItem) {
  if (!letter.bodyVisible || letter.withdrawnAt) return null;
  const html = letter.richContent?.html;
  return typeof html === "string" ? html : null;
}

function quoteFor(letter: LetterThreadDetailItem) {
  return (letter.excerpt || letter.plainText || "一封信").trim().slice(0, 60);
}

function htmlFromText(text: string) {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  return escaped.split(/\r?\n/).map((line) => `<p>${line || "<br>"}</p>`).join("");
}

function ThreadComposer({ state, counterpartName, onClose }: {
  state: ComposerState;
  counterpartName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const initialText = state.mode === "resend" ? state.target.plainText ?? "" : "";
  const [text, setText] = useState(initialText);
  const [theme, setTheme] = useState(state.target.stationeryTheme ?? "cream");
  const [mood, setMood] = useState(state.target.moodEmoji ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const submitLock = useRef(false);

  async function submit() {
    const normalized = text.trim();
    if (submitLock.current || !normalized || Array.from(normalized).length > 5000) return;
    submitLock.current = true;
    setPending(true);
    setMessage("");
    const input = {
      html: htmlFromText(normalized),
      text: normalized,
      stationeryTheme: theme,
      moodEmoji: mood || undefined,
    };
    try {
      const result = state.mode === "reply"
        ? await replyToLetterAction(state.target.letterId, input)
        : await resendWithdrawnLetterAction(state.target.letterId, input);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setMessage("这封信暂时无法寄出，请稍后再试。");
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="thread-composer-title" className="fixed inset-0 z-[100] grid place-items-center bg-black/30 p-3 sm:p-6">
      <section className="flex max-h-[min(760px,calc(100vh-24px))] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-[var(--paper)] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4 sm:px-7">
          <div>
            <h2 id="thread-composer-title" className="font-serif text-xl font-semibold">
              {state.mode === "reply" ? `回信给 ${counterpartName}` : `重新发送给 ${counterpartName}`}
            </h2>
            <p className="mt-2 line-clamp-2 text-sm text-[var(--muted-ink)]">「{quoteFor(state.target)}」</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭写信" className="h-10 w-10 rounded-full bg-white text-xl">×</button>
        </header>
        <div className={`stationery stationery-${theme} min-h-0 flex-1 overflow-y-auto p-5 sm:p-7`}>
          <label className="text-xs font-medium text-[var(--muted-ink)]" htmlFor="thread-letter-body">信件内容</label>
          <textarea
            id="thread-letter-body"
            aria-label="信件内容"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="mt-2 min-h-64 w-full resize-y rounded-2xl border border-black/10 bg-white/60 p-4 leading-8 outline-none focus:border-[var(--rose)]"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-xs text-[var(--muted-ink)]" htmlFor="thread-theme">信纸</label>
            <select id="thread-theme" value={theme} onChange={(event) => setTheme(event.target.value)} className="rounded-full bg-white px-3 py-2 text-sm">
              {[
                ["cream", "奶油素纸"], ["rose", "玫瑰花纹"], ["moon", "星月手帐"],
                ["vintage", "复古邮笺"], ["sakura", "樱花手绘"], ["lined", "简约横线"],
              ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label className="text-xs text-[var(--muted-ink)]" htmlFor="thread-mood">心情</label>
            <select id="thread-mood" value={mood} onChange={(event) => setMood(event.target.value)} className="rounded-full bg-white px-3 py-2 text-sm">
              <option value="">不选择</option>
              {["😊", "💕", "🥺", "😤", "😴", "🤔", "😌", "😭"].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <p className="mt-3 text-xs text-[var(--muted-ink)]">{Array.from(text).length} / 5000</p>
          {message ? <p role="alert" className="mt-3 text-sm text-red-600">{message}</p> : null}
        </div>
        <footer className="flex justify-end gap-3 border-t border-black/5 bg-white px-5 py-4 sm:px-7">
          <button type="button" onClick={onClose} className="rounded-full bg-stone-100 px-5 py-2.5 text-sm">取消</button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !text.trim() || Array.from(text.trim()).length > 5000}
            className="rounded-full bg-[var(--ink)] px-6 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {pending ? "寄送中…" : state.mode === "reply" ? "寄出回信" : "重新发送"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SealedCapsuleControls({ letter, currentTime, mine }: {
  letter: LetterThreadDetailItem;
  currentTime: string;
  mine: boolean;
}) {
  const [ready, setReady] = useState(() => (
    !letter.openAt || Date.parse(currentTime) >= Date.parse(letter.openAt)
  ));

  return (
    <>
      {letter.openAt && !ready ? (
        <FutureDiaryCountdown openAt={letter.openAt} onReady={() => setReady(true)} />
      ) : null}
      {ready && !mine ? <OpenFutureDiaryButton entryId={letter.letterId} /> : null}
    </>
  );
}

export function LetterThreadDetail({
  threadId,
  viewerId,
  counterpartName,
  letters,
  imageUrls,
  commentsByLetter,
  focusLetterId,
  currentTime,
}: {
  threadId: string;
  viewerId: string;
  counterpartName: string;
  letters: LetterThreadDetailItem[];
  imageUrls: Record<string, string | null>;
  commentsByLetter: Record<string, CommentItem[]>;
  focusLetterId?: string;
  currentTime: string;
}) {
  const router = useRouter();
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<LetterThreadDetailItem | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState("");
  const withdrawLock = useRef(false);

  useEffect(() => {
    if (!focusLetterId) return;
    document.getElementById(`letter-${focusLetterId}`)?.scrollIntoView({ block: "center" });
  }, [focusLetterId]);

  const threadCount = letters[0]?.threadCount ?? 0;

  async function confirmWithdrawal() {
    if (!withdrawTarget || withdrawLock.current) return;
    withdrawLock.current = true;
    try {
      const result = await withdrawLetterAction(withdrawTarget.letterId);
      setMessage(result.message);
      if (result.ok) {
        setWithdrawTarget(null);
        router.refresh();
      }
    } catch {
      setMessage("撤回失败，请稍后再试。");
    } finally {
      withdrawLock.current = false;
    }
  }

  return (
    <div data-thread-id={threadId} className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden pb-12">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--paper)]/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
        <button type="button" onClick={() => router.push("/journal")} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm">
          <ArrowLeft size={16} /> 返回信箱
        </button>
        <div className="text-right">
          <h1 className="font-serif text-xl font-semibold">与 {counterpartName} 的往来</h1>
          <p className="text-sm text-[var(--muted-ink)]">往来 {threadCount} 封</p>
        </div>
      </header>

      {letters.map((letter) => {
        const mine = letter.authorId === viewerId;
        const withdrawn = Boolean(letter.withdrawnAt);
        const sealedCapsule = letter.entryType === "future" && !letter.bodyVisible;
        const canWithdraw = mine
          && letter.entryType === "today"
          && !withdrawn
          && !letter.openedAt
          && Date.parse(currentTime) <= Date.parse(letter.publishedAt) + 24 * 60 * 60 * 1000;
        const showWithdrawnBody = mine && withdrawn && expanded.has(letter.letterId);
        const html = visibleHtml(letter);
        const imageUrl = imageUrls[letter.letterId];
        return (
          <article
            id={`letter-${letter.letterId}`}
            data-testid="thread-letter"
            key={letter.letterId}
            className={`stationery stationery-${letter.stationeryTheme ?? "cream"} relative overflow-hidden rounded-[2rem] border p-5 shadow-md sm:p-8 ${mine ? "ml-auto border-rose-100" : "mr-auto border-amber-100"} w-full sm:w-[92%]`}
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 pb-4">
              <div>
                <p className="font-medium">{mine ? "我写的" : `${counterpartName} 写的`}</p>
                <time dateTime={letter.publishedAt} className="mt-1 block text-xs text-[var(--muted-ink)]">{formatLetterTime(letter.publishedAt)}</time>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {letter.entryType === "future" ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">胶囊原信</span> : null}
                {withdrawn ? <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">已撤回</span> : null}
              </div>
            </header>

            {withdrawn ? (
              mine ? (
                <div className="py-7">
                  <p className="font-medium">这封信已撤回</p>
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(letter.letterId)) next.delete(letter.letterId); else next.add(letter.letterId);
                      return next;
                    })}
                    className="mt-3 rounded-full bg-white px-4 py-2 text-sm"
                  >{showWithdrawnBody ? "收起原文" : "查看原文"}</button>
                  {showWithdrawnBody ? (
                    <div className="mt-5">
                      {typeof letter.richContent?.html === "string"
                        ? <div className="rich-letter-editor" dangerouslySetInnerHTML={{ __html: letter.richContent.html }} />
                        : <p className="whitespace-pre-wrap break-words">{letter.plainText}</p>}
                      {imageUrl ? <Image src={imageUrl} alt="撤回信件图片" width={1200} height={900} className="mt-5 h-auto max-w-full rounded-2xl object-contain" /> : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-44 flex-col items-center justify-center py-8 text-center">
                  <Mail className="mb-3 text-[var(--muted-ink)]" />
                  <p className="font-medium">对方撤回了一封信</p>
                </div>
              )
            ) : sealedCapsule ? (
              <div className="py-7 text-center">
                <p className="font-medium">这封胶囊信还在等待开启</p>
                <SealedCapsuleControls letter={letter} currentTime={currentTime} mine={mine} />
              </div>
            ) : (
              <div className="py-6">
                {html
                  ? <div className="rich-letter-editor break-words" dangerouslySetInnerHTML={{ __html: html }} />
                  : <p className="whitespace-pre-wrap break-words leading-8">{letter.plainText}</p>}
                {imageUrl ? <Image src={imageUrl} alt="信件图片" width={1200} height={900} className="mt-5 h-auto max-w-full rounded-2xl object-contain" /> : null}
              </div>
            )}

            <footer className="flex flex-wrap gap-3 border-t border-black/10 pt-4">
              {letter.replyAllowed ? (
                <button type="button" onClick={() => setComposer({ mode: "reply", target: letter })} className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm text-white">立即回信</button>
              ) : null}
              {canWithdraw ? (
                <button type="button" onClick={() => setWithdrawTarget(letter)} className="rounded-full border border-red-200 bg-white px-5 py-2.5 text-sm text-red-600">撤回</button>
              ) : null}
              {mine && withdrawn && letter.resendAllowed ? (
                <button type="button" onClick={() => setComposer({ mode: "resend", target: letter })} className="flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm text-white"><RotateCcw size={15} />重新编辑并发送</button>
              ) : null}
            </footer>

            {!withdrawn && letter.bodyVisible ? (
              <div className="mt-6 border-t border-black/10 pt-5">
                <CommentSection entryId={letter.letterId} initialComments={commentsByLetter[letter.letterId] ?? []} userId={viewerId} />
              </div>
            ) : null}
          </article>
        );
      })}

      {message ? <p role="status" className="rounded-2xl bg-white px-4 py-3 text-sm text-[var(--muted-ink)]">{message}</p> : null}
      {composer ? <ThreadComposer state={composer} counterpartName={counterpartName} onClose={() => setComposer(null)} /> : null}
      {withdrawTarget ? (
        <div role="dialog" aria-modal="true" aria-labelledby="withdraw-title" className="fixed inset-0 z-[110] grid place-items-center bg-black/30 p-4">
          <section className="w-full max-w-md rounded-[2rem] bg-[var(--paper)] p-6 text-center shadow-2xl">
            <h2 id="withdraw-title" className="font-serif text-xl font-semibold">确定撤回这封信吗？</h2>
            <p className="mt-3 text-sm text-[var(--muted-ink)]">对方尚未阅读。<br />撤回后，对方将无法查看这封信的内容。</p>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={() => setWithdrawTarget(null)} className="rounded-full bg-white px-5 py-2.5 text-sm">取消</button>
              <button type="button" onClick={confirmWithdrawal} className="rounded-full bg-red-600 px-5 py-2.5 text-sm text-white">确定撤回</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
