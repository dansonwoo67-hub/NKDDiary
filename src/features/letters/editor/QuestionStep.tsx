"use client";

import type { EditorStep } from "./types";

type QuestionName = Extract<EditorStep, "mood" | "meal" | "health">;

const QUESTIONS: Record<
  QuestionName,
  { eyebrow: string; title: string; label: string; options: string[] }
> = {
  mood: {
    eyebrow: "爱自己",
    title: "今天的小狗心情？",
    label: "今天的心情",
    options: ["心碎小狗 🐶💧", "委屈趴窝 🥺", "原地待机 😐", "尾巴摇摇 🙂", "快乐转圈 😆"],
  },
  meal: {
    eyebrow: "爱生活",
    title: "今天吃好了吗？",
    label: "今天的吃饭状态",
    options: ["空盘哭哭 🍽️", "垫了一口 🥐", "认真干饭 🍚", "吃好啦 🍲", "圆滚滚 🐹"],
  },
  health: {
    eyebrow: "爱健康",
    title: "今天通畅吗？",
    label: "今天的通畅状态",
    options: ["没动静 🚫", "蓄势待发 🫣", "一坨达成 💩", "双倍顺畅 💩💩", "串稀警报 🌊"],
  },
};

export function QuestionStep({
  question,
  value,
  onChange,
  onContinue,
}: {
  question: QuestionName;
  value: number;
  onChange: (value: number) => void;
  onContinue: () => void;
}) {
  const content = QUESTIONS[question];

  return (
    <div className="letter-step" key={question}>
      <p className="text-sm font-medium tracking-[0.22em] text-[var(--rose-ink)]">
        {content.eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold leading-tight text-[var(--ink)] sm:text-3xl">
        {content.title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
        没有标准答案，选一个最像今天的你。
      </p>

      <div className="mt-8 rounded-[1.75rem] border border-[rgb(71_56_45_/_12%)] bg-white/55 px-4 py-5 sm:px-6">
        <output
          className="block min-h-8 text-center text-lg font-medium text-[var(--ink)]"
          htmlFor={`${question}-range`}
        >
          {content.options[value - 1]}
        </output>
        <input
          id={`${question}-range`}
          aria-label={content.label}
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-5 w-full cursor-pointer accent-[var(--rose-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
        />
        <div aria-hidden="true" className="mt-3 grid grid-cols-5 text-center text-lg">
          {content.options.map((option) => (
            <span key={option}>{option.split(" ").at(-1)}</span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-8 w-full rounded-full bg-[var(--rose)] px-6 py-3.5 font-semibold text-[#3f2928] shadow-[0_10px_28px_rgb(152_74_79_/_18%)] transition hover:-translate-y-0.5 hover:bg-[#df7c82] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] active:translate-y-0 motion-reduce:transform-none"
      >
        选好了，继续
      </button>
    </div>
  );
}
