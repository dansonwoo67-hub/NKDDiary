"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";

export type CalendarEventInput = {
  name: string;
  eventDate: string;
  recurrence: "none" | "monthly" | "yearly";
  icon: string;
  color: "rose" | "gold" | "blue" | "green" | "purple";
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
