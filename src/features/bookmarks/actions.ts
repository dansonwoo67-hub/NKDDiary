"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createExcerptBookmark,
  removeBookmark,
  toggleWholeLetterBookmark,
  type ExcerptBookmarkInput,
} from "./core";
import { createBookmarkGateway } from "./supabase-gateway";

async function actionContext() {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const gateway = createBookmarkGateway(supabase, userId);
  return { userId, gateway };
}

function refreshBookmarks() {
  revalidatePath("/me/bookmarks");
}

export async function createBookmarkAction(input: ExcerptBookmarkInput) {
  const context = await actionContext();
  const result = await createExcerptBookmark(input, context);
  if (result.ok) refreshBookmarks();
  return result;
}

export async function toggleWholeLetterBookmarkAction(input: { letterId: string }) {
  const context = await actionContext();
  const result = await toggleWholeLetterBookmark(input, context);
  if (result.ok) refreshBookmarks();
  return result;
}

export async function removeBookmarkAction(input: { bookmarkId: string }) {
  const context = await actionContext();
  const result = await removeBookmark(input, context);
  if (result.ok) refreshBookmarks();
  return result;
}
