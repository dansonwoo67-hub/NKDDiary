import { getTodayLetterForEditor } from "@/features/letters/actions";
import { LetterEditor } from "@/features/letters/components/LetterEditor";

export default async function WritePage() {
  const state = await getTodayLetterForEditor();

  return <LetterEditor state={state} />;
}
