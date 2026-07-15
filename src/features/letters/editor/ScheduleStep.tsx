"use client";

import { useState } from "react";

function nextDate(today: string) {
  const date = new Date(`${today}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function ScheduleStep({
  today,
  error,
  onContinue,
}: {
  today: string;
  error?: string;
  onContinue: (value: string) => void;
}) {
  const minimum = `${nextDate(today)}T00:00`;
  const [value, setValue] = useState(minimum);
  const errorId = "scheduled-for-error";

  return (
    <div className="letter-step">
      <p className="text-sm font-medium tracking-[0.22em] text-[var(--rose-ink)]">时间胶囊</p>
      <h2 className="mt-3 text-2xl font-semibold leading-tight text-[var(--ink)] sm:text-3xl">
        这封信，想在哪天送达？
      </h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
        将在所选时间自动送达并向对方公开；送达前仅你可见，也可以随时撤回或放回草稿箱。
      </p>

      <label className="mt-8 block text-sm font-medium text-[var(--ink)]" htmlFor="scheduled-for">
        送达日期和时间
      </label>
      <input
        id="scheduled-for"
        aria-label="送达日期"
        type="datetime-local"
        min={minimum}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => setValue(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_22%)] bg-white/70 px-4 py-3.5 text-[var(--ink)] outline-none transition focus:border-[var(--focus-ring)] focus:ring-4 focus:ring-[rgb(229_139_143_/_18%)]"
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-3 text-sm font-medium text-[#8d2631]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!value}
        onClick={() => onContinue(`${value}:00+08:00`)}
        className="mt-8 w-full rounded-full bg-[var(--rose)] px-6 py-3.5 font-semibold text-[#3f2928] shadow-[0_10px_28px_rgb(152_74_79_/_18%)] transition hover:-translate-y-0.5 hover:bg-[#df7c82] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none"
      >
        确认送达时间
      </button>
    </div>
  );
}
