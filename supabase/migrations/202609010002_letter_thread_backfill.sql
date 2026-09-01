with batch as (
  select id
  from public.journal_entries
  where recipient_id is not null
    and entry_type in ('today', 'future')
    and thread_id is null
  order by id
  limit 1000
  for update skip locked
)
update public.journal_entries as entry
set thread_id = entry.id,
    reply_to_id = null
from batch
where entry.id = batch.id;
