# V7.4 inbox read-state hotfix

- 收信箱展示最近 30 天内按时间倒序的最新 5 封来信，不再把未读强行排到已读前面。
- 角标只统计这 5 条中的真实未读。
- 超出最新 5 条的旧未读自动释放为已读，但原始信件不删除。
- 历史补录信件默认按已读写入，避免读过的旧信重新出现红点。
- 首次升级请在 Supabase SQL Editor 执行：
  `supabase/migrations/202607260006_inbox_read_baseline.sql`
