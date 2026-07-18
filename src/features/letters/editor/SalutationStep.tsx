"use client";

import { countCharacters } from "@/lib/validation/text-limits";

export function SalutationStep({
  value,
  error,
  onChange,
  onContinue,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onContinue: () => void;
}) {
  const length = countCharacters(value);

  return (
    <div className="letter-step">
      <p className="text-sm font-medium tracking-[0.22em] text-[var(--rose-ink)]">落笔之前</p>
      <h2 className="mt-3 text-2xl font-semibold leading-tight text-[var(--ink)] sm:text-3xl">
        今天，你想怎么称呼 TA？
      </h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
        称呼会写在信纸的第一行。
      </p>

      <label htmlFor="letter-salutation" className="mt-8 block text-sm font-medium text-[var(--ink)]">
        称呼
      </label>
      <div className="relative mt-2">
        <input
          id="letter-salutation"
          value={value}
          autoComplete="off"
          aria-invalid={length > 7}
          aria-describedby={length > 7 ? "salutation-length-error" : undefined}
          placeholder="亲爱的老婆"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) onContinue();
          }}
          className="w-full rounded-2xl border border-[rgb(71_56_45_/_22%)] bg-white/70 px-4 py-3.5 pr-16 text-[var(--ink)] outline-none transition placeholder:text-[#766150] focus:border-[var(--focus-ring)] focus:ring-4 focus:ring-[rgb(229_139_143_/_18%)]"
        />
        <span aria-live="polite" className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs ${length > 7 ? "font-semibold text-[#9d3038]" : "text-[var(--muted-ink)]"}`}>
          {length}/7
        </span>
      </div>
      {length > 7 ? (
        <p id="salutation-length-error" role="alert" className="mt-3 text-sm font-medium text-[#9d3038]">
          称呼最多 7 个字
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-[#9d3038]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onContinue}
        disabled={!value.trim() || length > 7}
        className="mt-8 w-full rounded-full bg-[var(--rose)] px-6 py-3.5 font-semibold text-[#3f2928] shadow-[0_10px_28px_rgb(152_74_79_/_18%)] transition hover:-translate-y-0.5 hover:bg-[#df7c82] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none"
      >
        开始写信
      </button>
    </div>
  );
}
