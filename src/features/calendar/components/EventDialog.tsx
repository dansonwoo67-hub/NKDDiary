import { createCalendarEventFromForm } from "@/features/calendar/actions";

export const EVENT_ICONS = ["🌹", "🎂", "✈️", "💌", "🩸", "⭐", "🍽️", "🏥"];

export function EventDialog({ defaultDate }: { defaultDate: string }) {
  return (
    <details className="rounded-[1.5rem] border border-[rgb(71_56_45_/_14%)] bg-white/45 p-4">
      <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">顺手记到日历</summary>
      <form action={createCalendarEventFromForm} className="mt-4 grid gap-4">
        <label className="text-sm">
          事件名称
          <input
            name="name"
            required
            maxLength={40}
            placeholder="比如：飞巴黎"
            className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 outline-none"
          />
        </label>

        <label className="text-sm">
          日期
          <input
            name="eventDate"
            type="date"
            required
            defaultValue={defaultDate}
            className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 outline-none"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            循环
            <select name="recurrence" className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3">
              <option value="none">不循环</option>
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
            </select>
          </label>

          <label className="text-sm">
            图标
            <select name="icon" className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3">
              {EVENT_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            颜色
            <select name="color" className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3">
              <option value="rose">玫瑰</option>
              <option value="gold">星星</option>
              <option value="blue">天空</option>
              <option value="green">星球</option>
              <option value="purple">晚霞</option>
            </select>
          </label>
        </div>

        <button className="w-fit rounded-full bg-[var(--ink)] px-5 py-2 text-sm text-white" type="submit">
          添加事件
        </button>
      </form>
    </details>
  );
}
