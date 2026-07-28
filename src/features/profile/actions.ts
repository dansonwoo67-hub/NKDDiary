"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateSpaceName } from "@/features/profile/rules";
import { isValidCoordinates } from "@/features/distance/distance";

export type ActionResult = {
  ok: boolean;
  message: string;
};

function getAvatarExtension(file: File) {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  throw new Error("头像只支持 JPG、PNG 或 WebP。");
}

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const relationshipStartedOn = String(formData.get("relationshipStartedOn") ?? "");
  const compactCalendar = formData.get("compactCalendar") === "on";
  const spaceName = validateSpaceName(String(formData.get("spaceName") ?? ""));
  const avatar = formData.get("avatar");

  if (displayName.length < 1 || displayName.length > 24) {
    return { ok: false, message: "昵称需要 1 到 24 个字。" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(relationshipStartedOn)) {
    return { ok: false, message: "请选择有效的纪念日。" };
  }
  if (!spaceName) return { ok: false, message: "空间名称需要 1 到 40 个字符。" };

  const oldName = String((await supabase.from("profiles").select("display_name,avatar_url").eq("id",userId).single()).data?.display_name ?? "");
  let avatarChanged = false;
  const updatePayload: { display_name: string; avatar_url?: string } = {
    display_name: displayName,
  };

  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > 2 * 1024 * 1024) {
      return { ok: false, message: "头像不能超过 2MB。" };
    }

    let extension: string;
    try {
      extension = getAvatarExtension(avatar);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "头像格式不支持。" };
    }

    const avatarPath = `${userId}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(avatarPath, avatar, {
      upsert: true,
      contentType: avatar.type,
    });

    if (uploadError) {
      return { ok: false, message: uploadError.message };
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(avatarPath);
    updatePayload.avatar_url = data.publicUrl;
    avatarChanged = true;
  }

  const { error } = await supabase.rpc("update_couple_preferences", {
    p_display_name: updatePayload.display_name,
    p_avatar_url: updatePayload.avatar_url ?? null,
    p_relationship_started_on: relationshipStartedOn,
    p_display_preferences: { compactCalendar },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const { error: spaceError } = await supabase.rpc("update_space_name", {
    p_name: spaceName,
  });
  if (spaceError) return { ok: false, message: spaceError.message };

  if (avatarChanged) await supabase.rpc("notify_partner_profile_change", { p_kind: "avatar" });
  if (oldName !== displayName) await supabase.rpc("notify_partner_profile_change", { p_kind: "name" });

  revalidatePath("/");
  revalidatePath("/settings");

  return { ok: true, message: "资料已保存。" };
}

export async function recordLoginLocationAction(input: {
  latitude: number;
  longitude: number;
  country?: string;
  region?: string;
  city?: string;
  source?: "manual" | "login_confirmed" | "stale_confirmed";
}): Promise<ActionResult> {
  const { spaceId } = await requireUser();
  const supabase = await createServerSupabaseClient();

  if (!isValidCoordinates(input)) return { ok: false, message: "定位数据无效。" };

  const { error } = await supabase.rpc("record_location_history", {
    p_space_id: spaceId,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_country: input.country ?? "",
    p_region: input.region ?? "",
    p_city: input.city ?? "",
    p_source: input.source ?? "manual",
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "位置已更新。" };
}
