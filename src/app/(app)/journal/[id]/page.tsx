import { notFound } from "next/navigation";
import { deleteTodayDiaryAction } from "@/features/journal/actions";
import { JournalReader } from "@/features/journal/components/JournalReader";
import { canManageTodayDiary, isTodayDiaryLocked } from "@/features/journal/domain";
import { getJournalEntry } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type JournalEntryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function JournalEntryPage({ params }: JournalEntryPageProps) {
  const [{ id }, currentUser, supabase] = await Promise.all([params, requireUser(), createServerSupabaseClient()]);
  const entry = await getJournalEntry(supabase, id);

  if (!entry) notFound();

  const canManage = canManageTodayDiary(entry, currentUser.userId);
  const todayDiaryState =
    entry.entryType !== "today"
      ? "sealed"
      : canManage
        ? "editable"
        : isTodayDiaryLocked(entry)
          ? "locked"
          : "author-only";

  return (
    <JournalReader
      entry={entry}
      authorName={entry.authorId === currentUser.userId ? currentUser.profile.display_name : "对方"}
      canManageTodayDiary={canManage}
      todayDiaryState={todayDiaryState}
      editHref={canManage ? `/journal/${entry.id}/edit` : undefined}
      deleteAction={canManage ? deleteTodayDiaryAction : undefined}
    />
  );
}
