"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  const avatar = formData.get("avatar");

  if (displayName.length < 1 || displayName.length > 24) {
    return { ok: false, message: "昵称需要 1 到 24 个字。" };
  }

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
  }

  const { error } = await supabase.from("profiles").update(updatePayload).eq("id", userId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/");
  revalidatePath("/settings");

  return { ok: true, message: "资料已保存。" };
}

export async function recordLoginLocationAction(input: { latitude: number; longitude: number }): Promise<ActionResult> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();

  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    return { ok: false, message: "定位数据无效。" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      last_login_at: new Date().toISOString(),
      last_login_latitude: input.latitude,
      last_login_longitude: input.longitude,
    })
    .eq("id", userId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "位置已更新。" };
}
