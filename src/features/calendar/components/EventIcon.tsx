import type { CalendarEventChip } from "@/features/calendar/types";

const COLOR_CLASS: Record<CalendarEventChip["color"], string> = {
  rose: "bg-[rgb(229_139_143_/_28%)]",
  gold: "bg-[rgb(247_204_107_/_34%)]",
  blue: "bg-[rgb(185_211_232_/_34%)]",
  green: "bg-[rgb(216_231_204_/_42%)]",
  purple: "bg-[rgb(190_164_210_/_30%)]",
};

export function EventIcon({ event }: { event: CalendarEventChip }) {
  return (
    <span title={event.name} className={`grid h-6 w-6 place-items-center rounded-full text-xs ${COLOR_CLASS[event.color]}`}>
      {event.icon}
    </span>
  );
}
