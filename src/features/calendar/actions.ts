"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import { resolveRecurringEventDate } from "@/features/calendar/recurrence";

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
  const { userId } = await requireUser();
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

  const { error } = await supabase.from("calendar_events").insert({
    creator_id: userId,
    name,
    event_date: input.eventDate,
    recurrence: input.recurrence,
    icon: input.icon,
    color: input.color,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/");
  revalidatePath("/write");

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

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthBounds(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start, end };
}

function eventOccurrenceDate(eventDate: string, recurrence: string, year: number, month: number) {
  const original = new Date(`${eventDate}T00:00:00+08:00`);

  if (recurrence === "none") {
    return original.getFullYear() === year && original.getMonth() === month - 1 ? toDateString(original) : null;
  }

  if (recurrence === "monthly") {
    return toDateString(resolveRecurringEventDate(original, year, month - 1));
  }

  if (recurrence === "yearly" && original.getMonth() === month - 1) {
    return toDateString(resolveRecurringEventDate(original, year, month - 1));
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
  await requireUser();
  const supabase = await createServerSupabaseClient();
  const { start, end } = monthBounds(year, month);
  const startDate = toDateString(start);
  const endDate = toDateString(end);

  const [{ data: letters, error: lettersError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from("letters").select("letter_date").gte("letter_date", startDate).lte("letter_date", endDate),
    supabase.from("calendar_events").select("id, name, event_date, recurrence, icon, color").order("event_date", { ascending: true }),
  ]);

  if (lettersError) throw new Error(lettersError.message);
  if (eventsError) throw new Error(eventsError.message);

  const recordCounts = new Map<string, number>();
  for (const letter of letters ?? []) {
    const key = String(letter.letter_date);
    recordCounts.set(key, (recordCounts.get(key) ?? 0) + 1);
  }

  const eventsByDate = new Map<string, CalendarEventChip[]>();
  const today = toDateString(new Date());
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
  for (let day = 1; day <= end.getDate(); day += 1) {
    const date = toDateString(new Date(year, month - 1, day));
    days.push({
      date,
      dayOfMonth: day,
      recordCount: recordCounts.get(date) ?? 0,
      events: eventsByDate.get(date) ?? [],
    });
  }

  return { year, month, days };
}
