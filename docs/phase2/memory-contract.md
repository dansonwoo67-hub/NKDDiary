# Memory Contract

## Product definition

Phase 2 calls both historical moods and memories “回忆 / Memory”. Storage remains split and no historical rows are changed.

```ts
type MemorySourceType = "legacy_mood" | "legacy_memory" | "memory_v2";

type UnifiedMemory = {
  id: string;
  sourceType: MemorySourceType;
  authorId: string;
  content: string;
  legacyTitle: string | null;
  image: { path: string; url: string | null } | null;
  occurredOn?: string;
  createdAt: string;
  updatedAt: string;
  reactionSummary: { total: number; byReaction: Record<string, number> };
  commentCount: number;
};
```

## Mapping

- `mood_entries.body` → `content`, with `sourceType=legacy_mood`, no title and no image.
- `memory_entries.body` → `content`; historical `title` → `legacyTitle`; `image_path` remains a protected storage reference.
- A future `memory_v2` record may have no title, content up to 120 characters and at most one image. Enforcement is deferred because no v2 publishing UI or schema is part of this batch.

## Compatibility

The existing timeline combines moods, memories and selected calendar events. Calendar records are **timeline compatibility items**, not Memory domain objects, and must not be passed through the new Memory adapters.
