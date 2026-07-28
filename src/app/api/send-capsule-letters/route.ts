"use server";

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireUser();
    const client = await createServerSupabaseClient();
    
    const { error } = await client.rpc("send_scheduled_future_diaries");
    
    if (error) {
      console.error("Failed to send scheduled capsule letters:", error);
      return NextResponse.json({ ok: false, message: "胶囊信发送任务执行失败。" }, { status: 500 });
    }
    
    return NextResponse.json({ ok: true, message: "胶囊信发送任务已执行。" });
  } catch (error) {
    console.error("send-capsule-letters error:", error);
    return NextResponse.json({ ok: false, message: "胶囊信发送任务执行失败。" }, { status: 500 });
  }
}
