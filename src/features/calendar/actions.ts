"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import { getChinaDateString } from "@/lib/date/china-day";

export type CalendarEventInput = {
  name: string;
  eventDate: string;
  recurrence: "none" | "monthly" | "yearly";
  icon: string;
  color: "rose" | "gold" | "blue" | "green" | "purple";
};

export type CalendarEventChip = {
  id: string;
  name: string;
  icon: string;
  color: "rose" | "gold" | "blue" | "green" | "purple";
};

export type MonthCalendarDay = {
  date: string;
  dayOfMonth: number;
  recordCount: number;
  events: CalendarEventChip[];
};

export type MonthCalendarState = {
  year: number;
  month: number;
  days: MonthCalendarDay[];
};

const RECURRENCE_VALUES = new Set(["none", "monthly", "yearly"]);
const COLOR_VALUES = new Set(["rose", "gold", "blue", "green", "purple"]);

export async function createCalendarEventAction(input: CalendarEventInput): Promise<ActionResult> {
  const { spaceId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const name = input.name.trim();

  if (name.length < 1 || name.length > 40) {
    return { ok: false, message: "事件名称需要 1 到 40 个字。" };
  }

  if (!RECURRENCE_VALUES.has(input.recurrence)) {
    return { ok: false, message: "循环方式无效。" };
  }

  if (!COLOR_VALUES.has(input.color)) {
    return { ok: false, message: "事件颜色无效。" };
  }

  const { error } = await supabase.rpc("create_space_calendar_event", {
    p_space_id: spaceId,
    p_name: name,
    p_event_date: input.eventDate,
    p_recurrence: input.recurrence,
    p_icon: input.icon,
    p_color: input.color,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/memories");

  return { ok: true, message: "事件已记到日历。" };
}

export async function createCalendarEventFromForm(formData: FormData) {
  await createCalendarEventAction({
    name: String(formData.get("name") ?? ""),
    eventDate: String(formData.get("eventDate") ?? ""),
    recurrence: String(formData.get("recurrence") ?? "none") as CalendarEventInput["recurrence"],
    icon: String(formData.get("icon") ?? "🌹"),
    color: String(formData.get("color") ?? "rose") as CalendarEventInput["color"],
  });
}

function eventOccurrenceDate(eventDate: string, recurrence: string, year: number, month: number) {
  const [originalYear, originalMonth, originalDay] = eventDate.split("-").map(Number);
  const targetDay = Math.min(originalDay, new Date(Date.UTC(year, month, 0)).getUTCDate());
  const occurrence = `${year}-${String(month).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;

  if (recurrence === "none") {
    return originalYear === year && originalMonth === month ? eventDate : null;
  }

  if (recurrence === "monthly") {
    return occurrence;
  }

  if (recurrence === "yearly" && originalMonth === month) {
    return occurrence;
  }

  return null;
}

async function ensureTodayEventNotifications(events: Array<{ id: string; name: string; eventDate: string }>) {
  if (events.length === 0) return;

  const supabase = await createServerSupabaseClient();
  await Promise.all(events.map((event) => supabase.rpc("create_legacy_notification", {
    p_kind: "calendar_event",
    p_source_id: event.id,
  })));
}

export async function getMonthCalendarState(year: number, month: number): Promise<MonthCalendarState> {
  const { spaceId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${dayCount}`;

  const [{ data: letters, error: lettersError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from("journal_entries").select("entry_date").eq("space_id", spaceId).eq("entry_type", "today").gte("entry_date", startDate).lte("entry_date", endDate),
    supabase.from("calendar_events").select("id, name, event_date, recurrence, icon, color").eq("space_id", spaceId).order("event_date", { ascending: true }),
  ]);

  if (lettersError) throw new Error(lettersError.message);
  if (eventsError) throw new Error(eventsError.message);

  const recordCounts = new Map<string, number>();
  for (const letter of letters ?? []) {
    const key = String(letter.entry_date);
    recordCounts.set(key, (recordCounts.get(key) ?? 0) + 1);
  }

  const eventsByDate = new Map<string, CalendarEventChip[]>();
  const today = getChinaDateString();
  const dueToday: Array<{ id: string; name: string; eventDate: string }> = [];

  for (const event of events ?? []) {
    const occurrence = eventOccurrenceDate(String(event.event_date), String(event.recurrence), year, month);
    if (!occurrence) continue;

    const chip = {
      id: String(event.id),
      name: String(event.name),
      icon: String(event.icon),
      color: String(event.color) as CalendarEventChip["color"],
    };
    eventsByDate.set(occurrence, [...(eventsByDate.get(occurrence) ?? []), chip]);

    if (occurrence === today) {
      dueToday.push({ id: chip.id, name: chip.name, eventDate: occurrence });
    }
  }

  await ensureTodayEventNotifications(dueToday);

  const days: MonthCalendarDay[] = [];
  for (let day = 1; day <= dayCount; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    days.push({
      date,
      dayOfMonth: day,
      recordCount: recordCounts.get(date) ?? 0,
      events: eventsByDate.get(date) ?? [],
    });
  }

  return { year, month, days };
}
