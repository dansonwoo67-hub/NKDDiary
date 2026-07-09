"use client";

import { useState, useTransition } from "react";
import { EventDialog } from "@/features/calendar/components/EventDialog";
import { saveLetterAction, type EditorLetterState } from "@/features/letters/actions";
import { LetterSliders, type LetterSliderValues } from "@/features/letters/components/LetterSliders";

function defaultSliders(): LetterSliderValues {
  return {
    selfMoodValue: 3,
    mealValue: 3,
    healthValue: 3,
  };
}

async function getLocationSnapshot() {
  if (!("geolocation" in navigator)) {
    return {};
  }

  return new Promise<{ latitude?: number; longitude?: number; locationRecordedAt?: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          locationRecordedAt: new Date().toISOString(),
        }),
      () => resolve({}),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

export function LetterEditor({ state }: { state: EditorLetterState }) {
  const [sliders, setSliders] = useState<LetterSliderValues>(
    state.letter
      ? {
          selfMoodValue: state.letter.selfMoodValue,
          mealValue: state.letter.mealValue,
          healthValue: state.letter.healthValue,
        }
      : defaultSliders(),
  );
  const [body, setBody] = useState(state.letter?.body ?? "");
  const [sevenCharLine, setSevenCharLine] = useState(state.letter?.sevenCharLine ?? "");
  const [message, setMessage] = useState(state.lockedMessage ?? "");
  const [isPending, startTransition] = useTransition();
  const disabled = !state.canEdit || isPending;

  function handleSave() {
    startTransition(async () => {
      setMessage("仅用于计算今日距离，不展示具体位置。");
      const location = await getLocationSnapshot();
      const result = await saveLetterAction({
        body,
        sevenCharLine,
        ...sliders,
        ...location,
      });

      setMessage(result.message);
    });
  }

  return (
    <div className="grid gap-6">
      <section className="hand-card rounded-[2rem] p-6">
        <p className="text-sm tracking-[0.3em] text-[var(--muted-ink)]">{state.today}</p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">写今天的信</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
          保存后 24 小时内可以继续编辑，超过 24 小时就会封存为回忆。日记不支持删除。
        </p>
      </section>

      <section className="hand-card rounded-[2rem] p-6">
        <LetterSliders values={sliders} disabled={disabled} onChange={setSliders} />

        <label className="mt-6 block text-sm text-[var(--ink)]">
          正文
          <textarea
            value={body}
            disabled={disabled}
            onChange={(event) => setBody(event.target.value)}
            rows={10}
            placeholder="今天想慢慢写给对方看的话……"
            className="mt-2 w-full rounded-[1.5rem] border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 leading-7 outline-none"
          />
        </label>

        <div className="mt-6">
          <EventDialog defaultDate={state.today} />
        </div>

        <label className="mt-6 block text-sm text-[var(--ink)]">
          今日七字信
          <input
            value={sevenCharLine}
            disabled={disabled}
            maxLength={7}
            onChange={(event) => setSevenCharLine(event.target.value)}
            placeholder="最多七个字"
            className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 outline-none"
          />
        </label>

        {message ? <p className="mt-4 rounded-2xl bg-white/60 px-4 py-3 text-sm text-[var(--muted-ink)]">{message}</p> : null}

        <button disabled={disabled} onClick={handleSave} className="mt-6 rounded-full bg-[var(--ink)] px-6 py-3 text-white disabled:opacity-50">
          {isPending ? "保存中..." : state.canEdit ? "保存今天的信" : "已封存"}
        </button>
      </section>
    </div>
  );
}
