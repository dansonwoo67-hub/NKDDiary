"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { createMoodFromForm } from "@/features/mood/actions";
import { countGraphemes } from "@/features/mood/rules";
import type { ActionResult } from "@/features/profile/actions";

type MoodComposerAction = (previousState: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function MoodComposer({ action = createMoodFromForm }: { action?: MoodComposerAction }) {
  const [content, setContent] = useState("");
  const [burst, setBurst] = useState(false);
  const [result, formAction, pending] = useActionState(action, null);
  const [showResult, setShowResult] = useState(false);
  const length = countGraphemes(content.trim());
  const overLimit = length > 15;
  const valid = length > 0 && !overLimit;

  // 可见的提交结果：基于 result 和 showResult
  const visibleResult = showResult ? result : null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!valid) {
      event.preventDefault();
      return;
    }
    // 在表单提交时就清理 content 和设置 burst，避免 useEffect 中同步 setState
    setContent("");
    setBurst(true);
  };

  useEffect(() => {
    if (!result) return;
    
    // 使用 timeout 避免同步 setState in effect
    const showTimer = window.setTimeout(() => {
      setShowResult(true);
    }, 0);

    const hideTimer = window.setTimeout(() => {
      setShowResult(false);
    }, 5000);
    
    if (result.ok) {
      const burstTimer = window.setTimeout(() => setBurst(false), 1700);
      return () => { 
        window.clearTimeout(showTimer);
        window.clearTimeout(hideTimer);
        window.clearTimeout(burstTimer); 
      };
    } else {
      return () => { 
        window.clearTimeout(showTimer); 
        window.clearTimeout(hideTimer); 
      };
    }
  }, [result]);

  return (
    <form action={formAction} onSubmit={handleSubmit} className={`cos-card mood-compose-card p-4 sm:p-5 ${burst ? "is-celebrating" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-medium text-[var(--ink)]"><Sparkles aria-hidden="true" size={18} className="text-[var(--orange)]" />记录此刻心情</p>
        <span className={overLimit ? "text-xs text-[var(--rose)]/75" : "text-xs text-[var(--muted-ink)]"}>{length}/15</span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input name="content" value={content} onChange={(event) => setContent(event.target.value)} aria-label="此刻心情" aria-invalid={overLimit} disabled={pending} className={`cos-input flex-1 px-4 py-3 outline-none disabled:opacity-60 ${overLimit ? "mood-input-over" : ""}`} placeholder="一个表情、一句话，或者两者一起…" />
        <button type="submit" disabled={!valid || pending} className="cos-button-primary min-w-[7rem] px-5 disabled:cursor-not-allowed disabled:opacity-45">{pending ? "正在保存…" : "记下心情"}</button>
      </div>
      {overLimit ? <p className="mt-2 text-xs text-[var(--rose)]/75">纸短情长，15 个字刚刚好。</p> : null}
      {visibleResult ? <p role="status" className={visibleResult.ok ? "mt-3 flex items-center gap-2 text-sm text-emerald-700" : "mt-3 text-sm text-[var(--rose)]/80"}>{visibleResult.ok ? <CheckCircle2 aria-hidden="true" size={16} /> : null}{visibleResult.message}</p> : null}
      {burst ? <div aria-hidden="true" className="mood-love-burst"><span>♡</span><span>✦</span><span>♡</span><span>✧</span></div> : null}
    </form>
  );
}
