import { notFound } from "next/navigation";
import { updateTodayDiaryAction } from "@/features/journal/actions";
import { TodayDiaryEditor } from "@/features/journal/components/TodayDiaryEditor";
import { canManageTodayDiary } from "@/features/journal/domain";
import { getJournalEntry } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EditTodayDiaryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditTodayDiaryPage({ params }: EditTodayDiaryPageProps) {
  const [{ id }, currentUser, supabase] = await Promise.all([params, requireUser(), createServerSupabaseClient()]);
  const entry = await getJournalEntry(supabase, id);

  if (
    !entry ||
    !canManageTodayDiary(entry, currentUser.userId)
  ) {
    notFound();
  }

  return (
    <TodayDiaryEditor
      today={entry.entryDate ?? ""}
      action={updateTodayDiaryAction.bind(null, entry.id)}
      initialValues={{ title: entry.title, content: entry.content }}
      submitLabel="保存修改"
      lockedAt={entry.lockedAt}
    />
  );
}
