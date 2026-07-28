import { notFound } from "next/navigation";
import { getFutureDiaryRecipient } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CapsuleLetterComposer } from "@/features/journal/components/CapsuleLetterComposer";

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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
      <div className="relative w-full sm:w-[min(1120px,calc(100vw-64px))] h-[calc(100vh-32px)] overflow-hidden sm:rounded-[32px] bg-white shadow-2xl flex flex-col">
        <CapsuleLetterComposer
          recipientId={recipient.id}
          recipientName={recipient.displayName}
        />
      </div>
    </div>
  );
}
