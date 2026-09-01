export type LetterKind = "ordinary" | "capsule" | "legacy";
export type LetterState = "active" | "withdrawn";

export type LetterRow = {
  id: string;
  author_id: string;
  recipient_id: string | null;
  entry_type: string;
  created_at: string;
  published_at?: string | null;
  opened_at?: string | null;
  withdrawn_at?: string | null;
  thread_id?: string | null;
  reply_to_id?: string | null;
};

export type LetterDomain = {
  id: string;
  threadId: string;
  replyToId: string | null;
  authorId: string;
  recipientId: string;
  kind: Exclude<LetterKind, "legacy">;
  state: LetterState;
  createdAt: string;
  activityAt: string;
  openedAt: string | null;
  withdrawnAt: string | null;
  unread: boolean;
};

export type LetterThread = {
  threadId: string;
  participants: string[];
  firstLetterId: string;
  latestLetterId: string;
  totalCount: number;
  latestActivityAt: string;
  unread: boolean;
  originType: "ordinary" | "capsule";
  letters: LetterDomain[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
};

export function classifyLetter(row: Pick<LetterRow, "entry_type" | "recipient_id">): LetterKind {
  if (row.entry_type === "today" && row.recipient_id) return "ordinary";
  if (row.entry_type === "future" && row.recipient_id) return "capsule";
  return "legacy";
}

export function mapLetterRow(row: LetterRow, viewerId: string): LetterDomain | null {
  const kind = classifyLetter(row);
  if (kind === "legacy" || !row.recipient_id) return null;
  const withdrawnAt = row.withdrawn_at ?? null;
  const openedAt = row.opened_at ?? null;
  return {
    id: row.id,
    threadId: row.thread_id ?? row.id,
    replyToId: row.reply_to_id ?? null,
    authorId: row.author_id,
    recipientId: row.recipient_id,
    kind,
    state: withdrawnAt ? "withdrawn" : "active",
    createdAt: row.created_at,
    activityAt: row.published_at ?? row.created_at,
    openedAt,
    withdrawnAt,
    unread: row.recipient_id === viewerId && !openedAt && !withdrawnAt,
  };
}

export function buildLetterThreads(rows: LetterRow[], viewerId: string): LetterThread[] {
  const groups = new Map<string, LetterDomain[]>();
  for (const row of rows) {
    const letter = mapLetterRow(row, viewerId);
    if (!letter) continue;
    const group = groups.get(letter.threadId) ?? [];
    group.push(letter);
    groups.set(letter.threadId, group);
  }

  return [...groups.entries()].map(([threadId, unsorted]) => {
    const letters = [...unsorted].sort((left, right) => Date.parse(left.activityAt) - Date.parse(right.activityAt));
    const participants: string[] = [];
    for (const letter of letters) {
      if (!participants.includes(letter.authorId)) participants.push(letter.authorId);
      if (!participants.includes(letter.recipientId)) participants.push(letter.recipientId);
    }
    const first = letters[0];
    const latest = letters[letters.length - 1];
    return {
      threadId,
      participants,
      firstLetterId: first.id,
      latestLetterId: latest.id,
      totalCount: letters.length,
      latestActivityAt: latest.activityAt,
      unread: letters.some((letter) => letter.unread),
      originType: first.kind,
      letters,
      pageInfo: { hasMore: false, nextCursor: null },
    };
  }).sort((left, right) => Date.parse(right.latestActivityAt) - Date.parse(left.latestActivityAt));
}
