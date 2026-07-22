import { notFound } from "next/navigation";
import Image from "next/image";
import { deleteTodayDiaryAction } from "@/features/journal/actions";
import { JournalReader } from "@/features/journal/components/JournalReader";
import { canManageTodayDiary, isTodayDiaryLocked } from "@/features/journal/domain";
import { toJournalReaderEntry } from "@/features/journal/reader-data";
import { getJournalEntry } from "@/features/journal/repository";
import { getReadableImageUrl } from "@/features/media/actions";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getJournalInteractions } from "@/features/interactions/actions";
import { canInteract } from "@/features/interactions/rules";

type JournalEntryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function JournalEntryPage({ params }: JournalEntryPageProps) {
  const [{ id }, currentUser, supabase] = await Promise.all([params, requireUser(), createServerSupabaseClient()]);
  const entry = await getJournalEntry(supabase, id);

  if (!entry) notFound();

  const imageUrl = entry.imagePath ? await getReadableImageUrl(entry.id) : null;
  const interactionsEnabled = canInteract(
    { entryType: entry.entryType, openedAt: entry.openedAt },
    entry.authorId === currentUser.userId ? "author" : "recipient",
  );
  const interactions = interactionsEnabled ? await getJournalInteractions(entry.id) : undefined;

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
      entry={toJournalReaderEntry(entry)}
      authorName={entry.authorId === currentUser.userId ? currentUser.profile.display_name : "对方"}
      canManageTodayDiary={canManage}
      todayDiaryState={todayDiaryState}
      editHref={canManage ? `/journal/${entry.id}/edit` : undefined}
      deleteAction={canManage ? deleteTodayDiaryAction : undefined}
      image={imageUrl ? (
        <Image
          src={imageUrl}
          alt="日记图片"
          width={1600}
          height={1200}
          unoptimized
          className="max-h-[40rem] w-full rounded-[1.5rem] object-contain"
        />
      ) : undefined}
      interactions={interactions}
    />
  );
}
