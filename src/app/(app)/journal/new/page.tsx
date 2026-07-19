import { createTodayDiaryAction } from "@/features/journal/actions";
import { TodayDiaryEditor } from "@/features/journal/components/TodayDiaryEditor";
import { getChinaDateString } from "@/lib/date/china-day";

export default function NewTodayDiaryPage() {
  return <TodayDiaryEditor today={getChinaDateString()} action={createTodayDiaryAction} />;
}
