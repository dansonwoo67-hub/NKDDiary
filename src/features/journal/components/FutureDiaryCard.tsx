"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FutureDiaryState } from "@/features/journal/domain";
import { FutureDiaryCountdown } from "./FutureDiaryCountdown";
import { OpenFutureDiaryButton } from "./OpenFutureDiaryButton";

type SharedEntry = {
  id: string;
  state: FutureDiaryState;
  sealedAt: string;
  openAt: string;
  openedAt: string | null;
};

type FutureDiaryCardProps =
  | { role: "recipient"; entry: SharedEntry & { authorName: string } }
  | { role: "author"; entry: SharedEntry & { recipientName: string; title: string; excerpt: string } };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

// 在页面加载时触发胶囊信发送检查
async function triggerCapsuleDelivery() {
  try {
    await fetch("/api/send-capsule-letters");
  } catch (error) {
    console.debug("Capsule delivery check failed (may be offline):", error);
  }
}

export function FutureDiaryCard(props: FutureDiaryCardProps) {
  const router = useRouter();
  const [locallyReady, setLocallyReady] = useState(props.entry.state === "ready");
  
  // 胶囊信到期后自动刷新页面以获取最新状态
  useEffect(() => {
    const openTime = new Date(props.entry.openAt).getTime();
    const now = Date.now();
    
    if (now >= openTime && props.entry.state !== "opened") {
      // 触发胶囊信发送检查
      triggerCapsuleDelivery();
      // 延迟刷新页面，让服务端有时间处理
      const timer = setTimeout(() => {
        router.refresh();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [props.entry.openAt, props.entry.state, router]);

  if (props.role === "author") {
    const entry = props.entry;
    return (
      <article className="hand-card rounded-[1.75rem] p-5">
        <p className="text-sm text-[var(--muted-ink)]">写给 {entry.recipientName}</p>
        <h2 className="mt-3 text-xl font-semibold text-[var(--ink)]">{entry.title}</h2>
        <p className="mt-3 line-clamp-3 whitespace-pre-wrap leading-7 text-[var(--muted-ink)]">{entry.excerpt}</p>
        <p className="mt-3 text-xs text-[var(--muted-ink)]">约定开启：{formatDateTime(entry.openAt)}</p>
        <Link className="mt-4 inline-flex rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--ink)]" href={`/journal/${entry.id}`}>
          回看日记
        </Link>
      </article>
    );
  }

  const entry = props.entry;
  const isOpened = entry.state === "opened";

  return (
    <article className="hand-card rounded-[1.75rem] p-5">
      <p className="text-sm text-[var(--muted-ink)]">{entry.authorName}留给你一颗时间胶囊</p>
      <dl className="mt-3 grid gap-1 text-xs text-[var(--muted-ink)]">
        <div><dt className="inline">封存于：</dt><dd className="inline">{formatDateTime(entry.sealedAt)}</dd></div>
        <div><dt className="inline">约定开启：</dt><dd className="inline">{formatDateTime(entry.openAt)}</dd></div>
      </dl>
      {isOpened ? (
        <Link className="mt-4 inline-flex rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white" href={`/journal/${entry.id}`}>
          阅读日记
        </Link>
      ) : (
        <>
          <FutureDiaryCountdown openAt={entry.openAt} onReady={() => setLocallyReady(true)} />
          {locallyReady ? <OpenFutureDiaryButton entryId={entry.id} /> : null}
        </>
      )}
    </article>
  );
}
