import { notFound } from "next/navigation";
import { LetterThreadDetail } from "@/features/journal/components/LetterThreadDetail";
import { getJournalEntry } from "@/features/journal/repository";
import { getLetterThreadDetail } from "@/features/journal/thread-repository";
import { getReadableImageUrl } from "@/features/media/actions";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CommentRow = {
  id: string;
  entry_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  editable_until: string | null;
  withdrawn_at: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | { display_name: string | null; avatar_url: string | null }[] | null;
};

export default async function LetterThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ letter?: string }>;
}) {
  const [{ threadId }, query, currentUser, client] = await Promise.all([
    params,
    searchParams,
    requireUser(),
    createServerSupabaseClient(),
  ]);
  const threadLetters = await getLetterThreadDetail(client, threadId);
  const letters = await Promise.all(threadLetters.map(async (letter) => {
    const needsLegacyCapsuleBody = letter.entryType === "future"
      && letter.bodyVisible
      && !letter.withdrawnAt
      && !letter.plainText
      && !letter.richContent;
    if (!needsLegacyCapsuleBody) return letter;

    const legacyEntry = await getJournalEntry(client, letter.letterId);
    if (!legacyEntry) return letter;
    const plainText = legacyEntry.plainText ?? legacyEntry.content;
    return {
      ...letter,
      plainText,
      excerpt: letter.excerpt ?? legacyEntry.excerpt ?? plainText,
    };
  }));
  if (!letters.length) notFound();

  const readableIds = letters
    .filter((letter) => letter.bodyVisible && !letter.withdrawnAt)
    .map((letter) => letter.letterId);
  const { data: commentData } = readableIds.length
    ? await client
      .from("journal_comments")
      .select("id,entry_id,author_id,parent_id,body,created_at,updated_at,editable_until,withdrawn_at,profiles:author_id(display_name,avatar_url)")
      .in("entry_id", readableIds)
      .order("created_at", { ascending: true })
    : { data: [] };

  const commentsByLetter: Record<string, CommentRow[]> = {};
  for (const row of (commentData ?? []) as unknown as CommentRow[]) {
    (commentsByLetter[row.entry_id] ??= []).push(row);
  }

  const imagePairs = await Promise.all(letters.map(async (letter) => {
    if (!letter.bodyVisible || !letter.imagePath) return [letter.letterId, null] as const;
    return [letter.letterId, await getReadableImageUrl(letter.letterId)] as const;
  }));

  return (
    <LetterThreadDetail
      key={`${currentUser.userId}:${threadId}`}
      threadId={threadId}
      viewerId={currentUser.userId}
      counterpartName={String(currentUser.profile.partner_nickname ?? "对方")}
      letters={letters}
      imageUrls={Object.fromEntries(imagePairs)}
      commentsByLetter={commentsByLetter}
      focusLetterId={query.letter}
      currentTime={new Date().toISOString()}
    />
  );
}
