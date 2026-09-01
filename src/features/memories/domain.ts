export type MemorySourceType = "legacy_mood" | "legacy_memory" | "memory_v2";

export type MemoryReactionSummary = {
  total: number;
  byReaction: Record<string, number>;
};

export type UnifiedMemory = {
  id: string;
  sourceType: MemorySourceType;
  authorId: string;
  content: string;
  legacyTitle: string | null;
  image: { path: string; url: string | null } | null;
  occurredOn?: string;
  createdAt: string;
  updatedAt: string;
  reactionSummary: MemoryReactionSummary;
  commentCount: number;
};

export type MemoryChronology = {
  id: string;
  kind: string;
  occurredAt: string;
  createdAt?: string;
};

type SharedRow = {
  id: string;
  author_id: string;
  created_at: string;
  updated_at?: string | null;
  comment_count?: number | null;
  reaction_summary?: MemoryReactionSummary | null;
};

export type LegacyMoodRow = SharedRow & {
  body: string;
  emoji?: string | null;
};

export type LegacyMemoryRow = SharedRow & {
  title: string;
  body: string;
  image_path?: string | null;
  image_url?: string | null;
  occurred_on: string;
};

const EMPTY_REACTIONS: MemoryReactionSummary = { total: 0, byReaction: {} };

function shared(row: SharedRow) {
  return {
    id: row.id,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    reactionSummary: row.reaction_summary ?? EMPTY_REACTIONS,
    commentCount: row.comment_count ?? 0,
  };
}

export function mapLegacyMoodToMemory(row: LegacyMoodRow): UnifiedMemory {
  return {
    ...shared(row),
    sourceType: "legacy_mood",
    content: row.body,
    legacyTitle: null,
    image: null,
  };
}

export function mapLegacyMemoryToMemory(row: LegacyMemoryRow): UnifiedMemory {
  return {
    ...shared(row),
    sourceType: "legacy_memory",
    content: row.body,
    legacyTitle: row.title,
    image: row.image_path ? { path: row.image_path, url: row.image_url ?? null } : null,
    occurredOn: row.occurred_on,
  };
}

function compareText(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareMemoryChronology(left: MemoryChronology, right: MemoryChronology) {
  const occurredAtDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  if (occurredAtDifference) return occurredAtDifference;

  const createdAtDifference = Date.parse(right.createdAt ?? right.occurredAt)
    - Date.parse(left.createdAt ?? left.occurredAt);
  if (createdAtDifference) return createdAtDifference;

  return compareText(left.kind, right.kind) || compareText(left.id, right.id);
}
