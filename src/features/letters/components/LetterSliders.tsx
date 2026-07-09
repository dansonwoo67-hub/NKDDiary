"use client";

export type LetterSliderValues = {
  selfMoodValue: number;
  mealValue: number;
  healthValue: number;
};

type SliderKey = keyof LetterSliderValues;

const SLIDER_GROUPS: Array<{
  key: SliderKey;
  title: string;
  options: string[];
}> = [
  {
    key: "selfMoodValue",
    title: "爱自己｜今天笑了吗？",
    options: ["心碎小狗 🐶💧", "委屈趴窝 🥺", "原地待机 😐", "尾巴摇摇 🙂", "快乐转圈 😆"],
  },
  {
    key: "mealValue",
    title: "爱生活｜今天吃好了吗？",
    options: ["空盘哭哭 🍽️", "垫了一口 🥐", "认真干饭 🍚", "吃好啦 🍲", "圆滚滚 🐹"],
  },
  {
    key: "healthValue",
    title: "爱健康｜今天通畅了吗？",
    options: ["没动静 🚫", "蓄势待发 🫣", "一坨达成 💩", "双倍顺畅 💩💩", "串稀警报 🌊"],
  },
];

export function LetterSliders({
  values,
  disabled = false,
  onChange,
}: {
  values: LetterSliderValues;
  disabled?: boolean;
  onChange: (next: LetterSliderValues) => void;
}) {
  return (
    <div className="grid gap-4">
      {SLIDER_GROUPS.map((group) => {
        const value = values[group.key];
        const option = group.options[value - 1];

        return (
          <label key={group.key} className="rounded-[1.5rem] border border-[rgb(71_56_45_/_14%)] bg-white/45 p-4">
            <span className="text-sm font-medium text-[var(--ink)]">{group.title}</span>
            <span className="mt-2 block text-lg">{option}</span>
            <input
              type="range"
              min={1}
              max={5}
              value={value}
              disabled={disabled}
              onChange={(event) => onChange({ ...values, [group.key]: Number(event.target.value) })}
              className="mt-3 w-full accent-[var(--rose)]"
            />
            <div className="mt-2 flex justify-between text-xs text-[var(--muted-ink)]">
              {group.options.map((item, index) => (
                <span key={item} aria-label={item}>
                  {index + 1}
                </span>
              ))}
            </div>
          </label>
        );
      })}
    </div>
  );
}
