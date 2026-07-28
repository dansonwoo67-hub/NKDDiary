import { createTodayDiaryAction } from "@/features/journal/actions";
import { TodayDiaryEditor } from "@/features/journal/components/TodayDiaryEditor";
import { getChinaDateString } from "@/lib/date/china-day";

export default async function NewTodayDiaryPage({
  searchParams,
}: {
  searchParams?: Promise<{ prompt?: string }>;
}) {
  const prompt = (await searchParams)?.prompt?.slice(0, 500) ?? "";
  return (
    <TodayDiaryEditor
      today={getChinaDateString()}
      action={createTodayDiaryAction}
      initialValues={prompt ? { content: prompt } : undefined}
    />
  );
}
