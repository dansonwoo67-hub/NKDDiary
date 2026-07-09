"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ReaderLetter } from "@/features/letters/actions";
import { SevenCharGate } from "@/features/letters/components/SevenCharGate";

const MOOD_LABELS = ["心碎小狗 🐶💧", "委屈趴窝 🥺", "原地待机 😐", "尾巴摇摇 🙂", "快乐转圈 😆"];
const MEAL_LABELS = ["空盘哭哭 🍽️", "垫了一口 🥐", "认真干饭 🍚", "吃好啦 🍲", "圆滚滚 🐹"];
const HEALTH_LABELS = ["没动静 🚫", "蓄势待发 🫣", "一坨达成 💩", "双倍顺畅 💩💩", "串稀警报 🌊"];

export function LetterReader({ letter }: { letter: ReaderLetter }) {
  const [opened, setOpened] = useState(letter.hasOpened);

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

  return (
    <motion.article
      initial={{ opacity: 0, y: 20, rotateX: -8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="hand-card rounded-[2rem] p-6"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-white text-xl shadow-sm">
          {letter.authorAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={letter.authorAvatarUrl} alt={letter.authorName} className="h-full w-full object-cover" />
          ) : (
            "♡"
          )}
        </div>
        <div>
          <p className="text-sm text-[var(--muted-ink)]">{letter.letterDate}</p>
          <h2 className="text-xl font-semibold">{letter.authorName} 的信</h2>
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

      <div className="mt-6 whitespace-pre-wrap rounded-[1.5rem] bg-white/55 p-5 leading-8 text-[var(--ink)]">{letter.body}</div>
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
