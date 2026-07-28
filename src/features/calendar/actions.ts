"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import { getChinaDateString } from "@/lib/date/china-day";
import { getEventOccurrenceInMonth, type CalendarRecurrence } from "./recurrence";
import { deriveCalendarLetterStatus } from "./letter-status";
import type { CalendarEventInput, MonthCalendarState, YearCalendarState } from "./types";

const RECURRENCE_VALUES = new Set(["none", "monthly", "yearly"]);
const COLOR_VALUES = new Set(["rose", "gold", "blue", "green", "purple"]);
const EVENT_TYPE_VALUES = new Set(["date", "anniversary", "birthday", "travel", "todo", "other"]);

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
  if (!EVENT_TYPE_VALUES.has(input.eventType)) {
    return { ok: false, message: "事件类型无效。" };
  }
  if (input.endDate && input.endDate < input.eventDate) {
    return { ok: false, message: "结束日期不能早于开始日期。" };
  }
  if ((input.description ?? "").length > 1000) {
    return { ok: false, message: "事件描述不能超过 1000 个字符。" };
  }

  const { error } = await supabase.rpc("create_space_calendar_event_v2", {
    p_space_id: spaceId,
    p_name: name,
    p_event_date: input.eventDate,
    p_end_date: input.endDate || null,
    p_event_type: input.eventType,
    p_recurrence: input.recurrence,
    p_is_important: input.isImportant,
    p_description: (input.description ?? "").trim(),
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
    endDate: String(formData.get("endDate") ?? ""),
    eventType: String(formData.get("eventType") ?? "date") as CalendarEventInput["eventType"],
    recurrence: String(formData.get("recurrence") ?? "none") as CalendarEventInput["recurrence"],
    isImportant: formData.get("isImportant") === "on",
    description: String(formData.get("description") ?? ""),
    icon: String(formData.get("icon") ?? "🌹"),
    color: String(formData.get("color") ?? "rose") as CalendarEventInput["color"],
  });
}

export async function getMonthCalendarState(year:number, month:number):Promise<MonthCalendarState>{
  const {spaceId,userId}=await requireUser(); const supabase=await createServerSupabaseClient();
  const dayCount=new Date(Date.UTC(year,month,0)).getUTCDate(); const startDate=`${year}-${String(month).padStart(2,"0")}-01`; const endDate=`${year}-${String(month).padStart(2,"0")}-${dayCount}`;
  const [journals,events,moods,memories,notes]=await Promise.all([
    supabase.from("journal_entries").select("id,author_id,recipient_id,entry_type,entry_date,open_at,title").eq("space_id",spaceId).neq("author_id",userId),
    supabase.from("calendar_events").select("id,name,event_date,recurrence,icon,color,event_type,is_important,description").eq("space_id",spaceId).order("event_date",{ascending:true}),
    supabase.from("mood_entries").select("id,author_id,body,created_at").eq("space_id",spaceId).neq("author_id",userId).gte("created_at",`${startDate}T00:00:00+08:00`).lte("created_at",`${endDate}T23:59:59+08:00`),
    supabase.from("memory_entries").select("id,author_id,title,occurred_on").eq("space_id",spaceId).neq("author_id",userId).gte("occurred_on",startDate).lte("occurred_on",endDate),
    supabase.from("notifications").select("source_id,type").eq("recipient_id",userId).eq("is_read",false).eq("is_active",true)
  ]);
  for(const r of [journals,events,moods,memories,notes]) if(r.error) throw new Error(r.error.message);
  const letterNotificationTypes=new Set(["journal_created","future_diary_opened"]);
  type NoteRow = { type: string; source_id: string };
  const unreadLetterIds=new Set((notes.data??[] as NoteRow[]).filter(n=>letterNotificationTypes.has(String(n.type))).map(n=>String(n.source_id)));
  const lettersBy=new Map<string,MonthCalendarLetter[]>(); const today=getChinaDateString();
  for(const j of journals.data??[]){ const future=String(j.entry_type)==="future"; if(future&&String(j.recipient_id)!==userId)continue; const date=future?getChinaDateString(new Date(String(j.open_at))):String(j.entry_date); if(date<startDate||date>endDate)continue; const sealed=future&&date>today; const status=deriveCalendarLetterStatus({sealed,hasUnreadNotification:unreadLetterIds.has(String(j.id))}); const item={id:String(j.id),label:String(j.title||"对方寄来一封信"),href:`/journal/${j.id}?letter=1`,status,isFuture:future} as MonthCalendarLetter; lettersBy.set(date,[...(lettersBy.get(date)??[]),item]); }
  const contentBy=new Map<string,MonthCalendarContent[]>();
  for(const x of moods.data??[]){const date=getChinaDateString(new Date(String(x.created_at)));contentBy.set(date,[...(contentBy.get(date)??[]),{id:String(x.id),kind:"mood",icon:"✦",label:String(x.body),href:`/memories?focus=${x.id}&kind=mood`}]);}
  for(const x of memories.data??[]){const date=String(x.occurred_on);contentBy.set(date,[...(contentBy.get(date)??[]),{id:String(x.id),kind:"memory",icon:"♡",label:String(x.title),href:`/memories?focus=${x.id}&kind=memory`}]);}
  const eventsBy=new Map<string,CalendarEventChip[]>();
  for(const e of events.data??[]){const date=getEventOccurrenceInMonth(String(e.event_date),String(e.recurrence) as CalendarRecurrence,year,month);if(!date)continue;eventsBy.set(date,[...(eventsBy.get(date)??[]),{id:String(e.id),name:String(e.name),icon:String(e.icon),color:String(e.color) as CalendarEventChip["color"],eventType:String(e.event_type),isImportant:Boolean(e.is_important),description:String(e.description??"")}]);}
  const days=[] as MonthCalendarDay[]; for(let d=1;d<=dayCount;d++){const date=`${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;days.push({date,dayOfMonth:d,isToday:date===today,letters:lettersBy.get(date)??[],content:contentBy.get(date)??[],events:eventsBy.get(date)??[]});}
  return {year,month,days};
}

export async function getYearCalendarState(year: number): Promise<YearCalendarState> {
  const { spaceId, userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  
  const [journals, events, moods, memories] = await Promise.all([
    supabase.from("journal_entries").select("id,author_id,recipient_id,entry_type,entry_date,open_at").eq("space_id", spaceId).neq("author_id", userId),
    supabase.from("calendar_events").select("id,name,event_date,recurrence,icon,event_type,is_important").eq("space_id", spaceId),
    supabase.from("mood_entries").select("id,author_id,created_at").eq("space_id", spaceId).neq("author_id", userId),
    supabase.from("memory_entries").select("id,author_id,occurred_on").eq("space_id", spaceId).neq("author_id", userId),
  ]);
  
  for (const r of [journals, events, moods, memories]) {
    if (r.error) {
      console.error("Year calendar data error:", r.error.message);
    }
  }
  
  const counts = new Map<string, number>();
  
  for (const j of journals.data ?? []) {
    const future = String(j.entry_type) === "future";
    const date = future ? getChinaDateString(new Date(String(j.open_at))) : String(j.entry_date);
    if (date >= startDate && date <= endDate) {
      counts.set(date, (counts.get(date) ?? 0) + 2);
    }
  }
  
  for (const e of events.data ?? []) {
    const recurrence = String(e.recurrence) as CalendarRecurrence;
    const eventDate = String(e.event_date);
    const isImportant = Boolean(e.is_important) || ["anniversary", "birthday"].includes(String(e.event_type));
    
    const dates: string[] = [];
    if (recurrence === "yearly") {
      const [, month, day] = eventDate.split("-");
      const yearlyDate = `${year}-${month}-${day}`;
      if (yearlyDate >= startDate && yearlyDate <= endDate) {
        dates.push(yearlyDate);
      }
    } else if (recurrence === "monthly") {
      const [, , day] = eventDate.split("-");
      for (let m = 1; m <= 12; m++) {
        const daysInMonth = new Date(year, m, 0).getDate();
        if (parseInt(day) <= daysInMonth) {
          dates.push(`${year}-${String(m).padStart(2, "0")}-${day}`);
        }
      }
    } else {
      if (eventDate >= startDate && eventDate <= endDate) {
        dates.push(eventDate);
      }
    }
    
    for (const date of dates) {
      counts.set(date, (counts.get(date) ?? 0) + (isImportant ? 3 : 1));
    }
  }
  
  for (const x of moods.data ?? []) {
    const date = getChinaDateString(new Date(String(x.created_at)));
    if (date >= startDate && date <= endDate) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  
  for (const x of memories.data ?? []) {
    const date = String(x.occurred_on);
    if (date >= startDate && date <= endDate) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  
  const days: YearCalendarState["days"] = [];
  for (let m = 1; m <= 12; m++) {
    const dayCount = new Date(year, m, 0).getDate();
    for (let d = 1; d <= dayCount; d++) {
      const date = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const count = counts.get(date) ?? 0;
      let level = 0;
      if (count > 0) level = 1;
      if (count >= 2) level = 2;
      if (count >= 4) level = 3;
      if (count >= 6) level = 4;
      days.push({ date, count, level });
    }
  }
  
  const importantDates: YearCalendarState["importantDates"] = [];
  for (const e of events.data ?? []) {
    const isImportant = Boolean(e.is_important) || ["anniversary", "birthday", "travel"].includes(String(e.event_type));
    if (!isImportant) continue;
    
    const recurrence = String(e.recurrence) as CalendarRecurrence;
    const eventDate = String(e.event_date);
    
    let date: string | null = null;
    if (recurrence === "yearly") {
      const [, month, day] = eventDate.split("-");
      date = `${year}-${month}-${day}`;
    } else if (recurrence === "monthly") {
      date = eventDate;
    } else {
      if (eventDate >= startDate && eventDate <= endDate) {
        date = eventDate;
      }
    }
    
    if (date) {
      importantDates.push({
        date,
        name: String(e.name),
        icon: String(e.icon),
        eventType: String(e.event_type),
        isImportant: true,
      });
    }
  }
  
  importantDates.sort((a, b) => a.date.localeCompare(b.date));
  
  return { year, days, importantDates };
}

// Internal types used in functions
type MonthCalendarLetter = { id:string; label:string; href:string; status:"sealed"|"unread"|"read"; isFuture:boolean; };
type MonthCalendarContent = { id:string; kind:"mood"|"memory"; icon:string; label:string; href:string; };
type MonthCalendarDay = { date:string; dayOfMonth:number; isToday?:boolean; letters?:MonthCalendarLetter[]; content?:MonthCalendarContent[]; events:CalendarEventChip[]; recordCount?:number; };
type CalendarEventChip = { id:string; name:string; icon:string; color:"rose"|"gold"|"blue"|"green"|"purple"; eventType:string; isImportant:boolean; description:string; };
