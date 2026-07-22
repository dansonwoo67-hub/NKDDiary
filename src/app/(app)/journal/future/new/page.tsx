import { notFound } from "next/navigation";
import { sealFutureDiaryAction } from "@/features/journal/actions";
import { FutureDiaryEditor } from "@/features/journal/components/FutureDiaryEditor";
import { getFutureDiaryRecipient } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NewFutureDiaryPage() {
  const [currentUser, supabase] = await Promise.all([
    requireUser(),
    createServerSupabaseClient(),
  ]);
  const recipient = await getFutureDiaryRecipient(supabase, {
    userId: currentUser.userId,
    spaceId: currentUser.spaceId,
  });
  if (!recipient) notFound();

  return (
    <FutureDiaryEditor
      recipientId={recipient.id}
      recipientName={recipient.displayName}
      action={sealFutureDiaryAction}
    />
  );
}
