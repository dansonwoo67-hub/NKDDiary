"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import { selectRecentNotifications } from "./selection";
import { listActiveSpaceProfiles } from "@/features/profile/repository";
import { buildNotificationHref, resolveLetterNotificationTarget } from "./target";

export type NotificationItem = { 
  id:string; 
  title:string; 
  body:string; 
  href:string; 
  createdAt:string; 
  type:string; 
  isRead:boolean; 
  sourceId:string; 
  actorName:string;
  relatedEntryId?:string;
  metadata?: Record<string, unknown>;
};

// Type for raw notification data from Supabase
type RawNotification = {
  id: string;
  type: string;
  source_id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  actor_id?: string;
  related_entry_id?: string;
  metadata?: Record<string, unknown>;
};

const LETTER_TYPES = new Set(["journal_created", "future_diary_opened"]);
function isLetterType(type:string){ return LETTER_TYPES.has(type); }

// Types that should appear in activity (新动态), not inbox
const ACTIVITY_TYPES = new Set([
  "memory_created", 
  "memory_updated",
  "mood_created", 
  "mood_updated",
  "calendar_event", 
  "calendar_event_created", 
  "calendar_event_updated", 
  "journal_comment_created", 
  "journal_reply_created",
  "avatar_updated",
  "profile_updated",
  "profile_avatar_updated",
  "profile_nickname_updated",
  "name_updated"
]);

export type UnreadNotificationState = {
  inboxCount: number;
  activityCount: number;
  unreadLetterSourceIds: string[];
};

export async function getUnreadNotificationState(): Promise<UnreadNotificationState> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("type,source_id")
    .eq("recipient_id", userId)
    .eq("is_read", false)
    .eq("is_active", true);

  if (error) {
    throw new Error("Unable to load unread notification state");
  }

  const unreadLetterSourceIds = new Set<string>();
  let inboxCount = 0;
  let activityCount = 0;

  for (const notification of data ?? []) {
    const type = String(notification.type);
    if (isLetterType(type)) {
      inboxCount += 1;
      unreadLetterSourceIds.add(String(notification.source_id));
    } else if (ACTIVITY_TYPES.has(type)) {
      activityCount += 1;
    }
  }

  return {
    inboxCount,
    activityCount,
    unreadLetterSourceIds: [...unreadLetterSourceIds],
  };
}

export async function getNotificationCenterData(): Promise<{ inbox: NotificationItem[]; activity: NotificationItem[] }> {
  const { userId, spaceId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const cutoff = new Date(Date.now()-30*86400000).toISOString();
  
  // Get partner's display_name as fallback
  const partnerNamePromise = (async () => {
    try {
      const profiles = await listActiveSpaceProfiles(supabase, spaceId);
      const partner = profiles.find(p => String(p.id) !== userId);
      return partner ? String(partner.display_name) : "对方";
    } catch {
      return "对方";
    }
  })();
  
  const notificationPromise = supabase.from("notifications")
    .select("id,type,source_id,title,body,is_read,created_at,actor_id,related_entry_id,metadata,is_active")
    .eq("recipient_id",userId)
    .gte("created_at",cutoff)
    .eq("is_active",true)
    .order("created_at",{ascending:false})
    .limit(60);

  const [partnerName, { data: rawData, error }] = await Promise.all([
    partnerNamePromise,
    notificationPromise,
  ]);

  if(error){
    throw new Error("Unable to load notifications");
  }
  const data = rawData as RawNotification[] | null;
  
  // Get actor display names
  const names = new Map<string, string>();
  const actorIds = [...new Set((data ?? []).map((x: RawNotification) => String(x.actor_id)).filter(Boolean))];

  const journalIds = new Set<string>();
  const calendarIds = new Set<string>();
  (data??[]).forEach((x: RawNotification) => {
    const type = String(x.type);
    if(isLetterType(type)){
      journalIds.add(String(x.source_id));
    } else if(type.includes("journal_comment") || type.includes("journal_reply")){
      if(x.related_entry_id){
        journalIds.add(String(x.related_entry_id));
      } else if(x.source_id) {
        journalIds.add(String(x.source_id));
      }
    } else if(type.includes("calendar")){
      calendarIds.add(String(x.source_id));
    }
  });

  const journalDates = new Map<string, string>();
  const calendarEvents = new Map<string, { eventDate: string; eventType: string; titleSnapshot: string }>();

  const [profilesResult, journalsResult, calendarResult] = await Promise.all([
    actorIds.length
      ? supabase.from("profiles").select("id,display_name").in("id",actorIds)
      : Promise.resolve({ data: [], error: null }),
    journalIds.size
      ? supabase.from("journal_entries").select("id,entry_date,open_at").in("id",[...journalIds])
      : Promise.resolve({ data: [], error: null }),
    calendarIds.size
      ? supabase.from("calendar_events").select("id,event_date,event_type,name").in("id",[...calendarIds])
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) {
    console.warn("Failed to get actor display names, using fallback", profilesResult.error);
  } else {
    for (const profile of profilesResult.data ?? []) names.set(String(profile.id), String(profile.display_name));
  }
  for (const journal of journalsResult.data ?? []) {
    journalDates.set(String(journal.id), String(journal.entry_date ?? journal.open_at ?? ""));
  }
  if (calendarIds.size) {
    const { data: ce, error: ceError } = calendarResult;
    if (ceError) {
      console.error("Failed to query calendar_events:", ceError.message, ceError.code);
    } else if (ce && ce.length > 0) {
      for(const x of ce) {
        const eventDateRaw = x.event_date;
        const eventDateStr = typeof eventDateRaw === 'string' ? eventDateRaw.split('T')[0] : String(eventDateRaw ?? "");
        calendarEvents.set(String(x.id), {
          eventDate: eventDateStr,
          eventType: String(x.event_type ?? ""),
          titleSnapshot: String(x.name ?? "")
        });
      }
    }
  }

  const mapItem = (x: RawNotification): NotificationItem => { 
    const type = String(x.type), 
          sourceId = String(x.source_id), 
          actorName = names.get(String(x.actor_id)) ?? partnerName,
          relatedEntryId = x.related_entry_id ? String(x.related_entry_id) : undefined,
          metadata = x.metadata || undefined;
    
    let href = "/";
    
    if(isLetterType(type)){ 
      href = `/journal/${sourceId}`; 
    }
    else if(type.includes("memory")) href = `/memories?focus=${sourceId}&kind=memory`;
    else if(type.includes("mood")) href = `/memories?focus=${sourceId}&kind=mood`;
    else if(type.includes("calendar")) {
      // Build calendar URL with event date
      // Priority: 1. metadata.event_date, 2. calendar_events.event_date
      let dateParam = "";
      if (metadata && metadata.event_date) {
        dateParam = `&date=${metadata.event_date}`;
      } else {
        const eventInfo = calendarEvents.get(sourceId);
        if (eventInfo && eventInfo.eventDate) {
          dateParam = `&date=${eventInfo.eventDate}`;
        } else if (process.env.NODE_ENV === "development") {
          console.error("Calendar event date not found for source_id:", sourceId);
        }
      }
      href = `/calendar?view=month&event=${sourceId}${dateParam}`;
    }
    else if(type === "journal_comment_created" || type === "journal_reply_created"){
      if(relatedEntryId){
        href = `/journal/${relatedEntryId}#comment-${sourceId}`;
      } else {
        href = "/journal";
      }
    }
    else if(type.includes("comment")||type.includes("annotation")) href = `/journal?comment=${sourceId}`;
    else if(type.includes("profile")||type.includes("avatar")||type.includes("name")) href = "/settings?partnerUpdate=1";
    
    return {
      id: String(x.id),
      title: String(x.title),
      body: String(x.body),
      href,
      createdAt: String(x.created_at),
      type,
      isRead: Boolean(x.is_read),
      sourceId,
      actorName,
      relatedEntryId,
      metadata
    }; 
  };

  const items = (data??[])
    .filter((x: RawNotification) => !x.actor_id || String(x.actor_id) !== userId)
    .map(mapItem);
  
  // Filter: inbox = letter types, activity = explicitly defined activity types
  // This ensures journal_created never appears in activity
  const inboxItems = items.filter(x => isLetterType(x.type));
  const activityItems = items.filter(x => ACTIVITY_TYPES.has(x.type));
  
  return {
    inbox: selectRecentNotifications(inboxItems, 5),
    activity: selectRecentNotifications(activityItems, 5),
  };
}

export async function markNotificationReadAction(id:string):Promise<ActionResult>{ 
  const {userId}=await requireUser(); 
  const supabase=await createServerSupabaseClient(); 
  const {data,error}=await supabase
    .from("notifications")
    .update({is_read:true})
    .eq("id",id)
    .eq("recipient_id",userId)
    .select("id")
    .maybeSingle();
  if(error || !data) {
    console.error("markNotificationReadAction failed:", {
      code: error?.code,
      message: error?.message,
      matched: Boolean(data),
    });
    return{ok:false,message:"通知状态更新失败，请稍后重试。"};
  }
  revalidatePath("/"); 
  return{ok:true,message:"已读。"}; 
}

export async function resolveLetterNotificationAction(id: string): Promise<{
  ok: boolean;
  href?: string;
  message: string;
}> {
  await requireUser();
  const supabase = await createServerSupabaseClient();
  try {
    const target = await resolveLetterNotificationTarget(supabase, id);
    if (!target) return { ok: false, message: "这条提醒已失效。" };
    return { ok: true, href: buildNotificationHref(target), message: "" };
  } catch {
    return { ok: false, message: "暂时无法打开这封信，请稍后重试。" };
  }
}

export async function getUnreadNotifications() {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("notifications").select("id,type,source_id,title,body,created_at").eq("recipient_id", userId).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((item) => ({
    id: String(item.id), type: String(item.type), sourceId: String(item.source_id), title: String(item.title), body: String(item.body), createdAt: String(item.created_at),
    href: String(item.type).includes("future_diary") ? "/journal/future" : `/journal/${String(item.source_id)}`,
  }));
}

export async function validateJournalEntryForUser(sourceId: string): Promise<{ ok: boolean; message: string }> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .select("id, author_id, recipient_id, deleted_at, withdrawn_at")
    .eq("id", sourceId)
    .maybeSingle();
  
  if (error) {
    console.error("validateJournalEntryForUser error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: "这封信暂时没有找到。" };
  }
  
  if (!data) {
    const { data: withdrawalStatus, error: withdrawalError } = await supabase.rpc(
      "get_letter_withdrawal_status",
      { p_entry_id: sourceId },
    );
    if (
      !withdrawalError
      && Array.isArray(withdrawalStatus)
      && withdrawalStatus.length > 0
    ) {
      return { ok: true, message: "" };
    }
    return { ok: false, message: "这封信暂时没有找到。" };
  }
  
  const isRecipient = String(data.recipient_id) === userId;
  const isAuthor = String(data.author_id) === userId;
  
  if (!isRecipient && !isAuthor) {
    return { ok: false, message: "这封信暂时没有找到。" };
  }
  
  // Recipient can still open a withdrawn letter — the detail page shows the withdrawn message
  if (data.withdrawn_at && !isAuthor) {
    return { ok: true, message: "" };
  }
  
  return { ok: true, message: "" };
}
