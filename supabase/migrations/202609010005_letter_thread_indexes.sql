create index concurrently if not exists journal_entries_thread_timeline_idx
on public.journal_entries(space_id, thread_id, published_at, id)
where thread_id is not null;

create index concurrently if not exists journal_entries_reply_to_id_idx
on public.journal_entries(reply_to_id)
where reply_to_id is not null;
