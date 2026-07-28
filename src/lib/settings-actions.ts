"use server";

import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, SettingRequest } from "@/lib/settings";

export async function getCurrentSpaceSettings(): Promise<{
  spaceName: string;
  relationshipStartedOn: string;
  pendingRequests: SettingRequest[];
}> {
  const { spaceId, userId } = await requireUser();
  const supabase = await createServerSupabaseClient();

  const [{ data: space }, { data: requests }, { data: profile }] = await Promise.all([
    supabase.from("spaces").select("name").eq("id", spaceId).single(),
    supabase.from("couple_setting_requests")
      .select("*")
      .eq("space_id", spaceId)
      .eq("status", "pending"),
    supabase.from("profiles")
      .select("relationship_started_on")
      .eq("id", userId)
      .single(),
  ]);

  return {
    spaceName: String(space?.name ?? "我们的空间"),
    relationshipStartedOn: String(profile?.relationship_started_on ?? "2024-01-01"),
    pendingRequests: (requests ?? []) as unknown as SettingRequest[],
  };
}

export async function createSettingRequestAction(
  prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const type = String(formData.get("type")) as "space_name" | "relationship_started_on";
  const currentValue = String(formData.get("currentValue"));
  const proposedValue = String(formData.get("proposedValue"));

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("create_couple_setting_request", {
    p_setting_type: type,
    p_current_value: currentValue,
    p_proposed_value: proposedValue,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  return { ok: true, message: "已向对方发出修改邀请" };
}

export async function approveSettingRequestAction(
  prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const requestId = String(formData.get("requestId"));
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("approve_couple_setting_request", {
    p_request_id: requestId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  return { ok: true, message: "已同意修改" };
}

export async function rejectSettingRequestAction(
  prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const requestId = String(formData.get("requestId"));
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("reject_couple_setting_request", {
    p_request_id: requestId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  return { ok: true, message: "已暂不修改" };
}

export async function cancelSettingRequestAction(
  prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const requestId = String(formData.get("requestId"));
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("cancel_couple_setting_request", {
    p_request_id: requestId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  return { ok: true, message: "已取消申请" };
}

export async function updatePartnerNicknameAction(
  prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const nickname = String(formData.get("nickname"));
  
  if (nickname.length < 1 || nickname.length > 12) {
    return { ok: false, message: "爱称需要 1 到 12 个字符" };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("update_partner_nickname", {
    p_nickname: nickname,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/settings");
  return { ok: true, message: "爱称已保存" };
}

