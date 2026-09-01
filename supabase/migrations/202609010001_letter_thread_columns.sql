alter table public.journal_entries
  add column if not exists thread_id uuid,
  add column if not exists reply_to_id uuid;
