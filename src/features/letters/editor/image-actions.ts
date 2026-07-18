"use server";

import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  completeLetterImageUpload,
  createLetterImageUpload,
  failLetterImageUpload,
  type CompleteLetterImageInput,
  type CreateLetterImageInput,
} from "./image-actions-core";
import { createLetterImageGateway } from "./image-supabase-gateway";

export async function createLetterImageUploadAction(input: CreateLetterImageInput) {
  const [{ userId }, supabase] = await Promise.all([
    requireUser(),
    createServerSupabaseClient(),
  ]);
  return createLetterImageUpload(createLetterImageGateway(supabase), userId, input);
}

export async function completeLetterImageUploadAction(input: CompleteLetterImageInput) {
  const [{ userId }, supabase] = await Promise.all([
    requireUser(),
    createServerSupabaseClient(),
  ]);
  return completeLetterImageUpload(createLetterImageGateway(supabase), userId, input);
}

export async function failLetterImageUploadAction(input: CompleteLetterImageInput) {
  const [{ userId }, supabase] = await Promise.all([
    requireUser(),
    createServerSupabaseClient(),
  ]);
  return failLetterImageUpload(createLetterImageGateway(supabase), userId, input);
}
