"use client";

import { useState } from "react";

import { countCharacters } from "@/lib/validation/text-limits";

export function validateFinalLine(value: string) {
  const count = countCharacters(value);
  if (count < 1) return "请写下最后想说的话";
  if (count > 7) return "最多写7个字";
  return null;
}

export function FinalLineStep({
  value,
  kind,
  error,
  disabled = false,
  onChange,
  onContinue,
}: {
  value: string;
  kind: "daily" | "time_capsule";
  error: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
  onContinue: () => void;
}) {
  const errorId = "letter-final-line-error";
  const [inputError, setInputError] = useState<string | null>(null);
  const visibleError = error ?? inputError;

  function handleChange(nextValue: string) {
    if (countCharacters(nextValue) > 7) {
      setInputError("最多写7个字");
      return;
    }
    setInputError(null);
    onChange(nextValue);
  }

  return (
    <section className="mt-8 border-t border-[rgb(71_56_45_/_12%)] px-2 pt-7 sm:px-4">
      <label htmlFor="letter-final-line" className="block text-lg font-semibold text-[var(--ink)]">
        总而言之，我想跟你说
      </label>
      <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">把整封信，收进最后七个字里。</p>
      <input
        id="letter-final-line"
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(visibleError)}
        aria-describedby={visibleError ? errorId : undefined}
        onChange={(event) => handleChange(event.target.value)}
        className="mt-4 w-full rounded-2xl border border-[rgb(71_56_45_/_20%)] bg-white/65 px-4 py-3 text-base text-[var(--ink)] outline-none transition focus:border-[var(--focus-ring)] focus:ring-4 focus:ring-[rgb(229_139_143_/_18%)] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      />
      {visibleError ? (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-[#8d2631]">
          {visibleError}
        </p>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={onContinue}
        className="mt-6 w-full rounded-full bg-[var(--rose)] px-6 py-3.5 font-semibold text-[#3f2928] shadow-[0_10px_28px_rgb(152_74_79_/_18%)] transition hover:-translate-y-0.5 hover:bg-[#df7c82] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"
      >
        {kind === "daily" ? "寄出" : "放进时间胶囊"}
      </button>
    </section>
  );
}
