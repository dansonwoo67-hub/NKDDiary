import { createCalendarEventFromForm } from "@/features/calendar/actions";

export const EVENT_ICONS = ["🌹", "🎂", "✈️", "💌", "🩸", "⭐", "🍽️", "🏥"];

export function EventDialog({ defaultDate }: { defaultDate: string }) {
  return (
    <details className="cos-card p-4">
      <summary className="cos-button-primary w-fit cursor-pointer list-none px-5 text-sm">添加事件</summary>
      <form action={createCalendarEventFromForm} className="mt-4 grid gap-4">
        <label className="text-sm">
          事件名称
          <input
            name="name"
            required
            maxLength={40}
            placeholder="比如：飞巴黎"
            className="cos-input mt-2 px-4 outline-none"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            开始日期
            <input name="eventDate" type="date" required defaultValue={defaultDate} className="cos-input mt-2 px-4 outline-none" />
          </label>
          <label className="text-sm">
            结束日期（可选）
            <input name="endDate" type="date" min={defaultDate} className="cos-input mt-2 px-4 outline-none" />
          </label>
        </div>

        <label className="text-sm">
          类型
          <select name="eventType" className="cos-input mt-2 px-4">
            <option value="date">约会</option>
            <option value="anniversary">纪念日</option>
            <option value="birthday">生日</option>
            <option value="travel">旅行</option>
            <option value="todo">待办</option>
            <option value="other">其他</option>
          </select>
        </label>

        <label className="text-sm">
          描述（可选）
          <textarea name="description" maxLength={1000} rows={3} className="cos-input mt-2 px-4 py-3" />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            循环
            <select name="recurrence" className="cos-input mt-2 px-4">
              <option value="none">不循环</option>
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
            </select>
          </label>

          <label className="text-sm">
            图标
            <select name="icon" className="cos-input mt-2 px-4">
              {EVENT_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            颜色
            <select name="color" className="cos-input mt-2 px-4">
              <option value="rose">玫瑰</option>
              <option value="gold">星星</option>
              <option value="blue">天空</option>
              <option value="green">星球</option>
              <option value="purple">晚霞</option>
            </select>
          </label>
        </div>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input name="isImportant" type="checkbox" className="h-5 w-5 accent-[var(--rose)]" />
          将待办/其他标为重要，并收进 Memories
        </label>

        <button className="cos-button-primary w-fit px-5 text-sm" type="submit">
          添加事件
        </button>
      </form>
    </details>
  );
}
