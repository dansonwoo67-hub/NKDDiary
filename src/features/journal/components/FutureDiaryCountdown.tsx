"use client";

import { useEffect, useRef, useState } from "react";

type FutureDiaryCountdownProps = {
  openAt: string;
  onReady?: () => void;
};

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}天 ${hours}小时 ${minutes}分 ${seconds}秒`;
}

export function FutureDiaryCountdown({ openAt, onReady }: FutureDiaryCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const onReadyRef = useRef(onReady);
  const announcedReady = useRef(false);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    announcedReady.current = false;
    const target = new Date(openAt).getTime();
    const update = () => {
      const next = Math.max(0, target - Date.now());
      setRemaining(next);
      if (next === 0 && !announcedReady.current) {
        announcedReady.current = true;
        onReadyRef.current?.();
      }
    };
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [openAt]);

  return (
    <p className="mt-3 text-sm text-[var(--muted-ink)]" role="status" aria-live="polite">
      {remaining === null
        ? "正在同步开启时间…"
        : remaining === 0
          ? "已到开启时间，请确认开启。"
          : `距离可开启：${formatRemaining(remaining)}`}
    </p>
  );
}
