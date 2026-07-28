# 信件与通知上线前只读审计

- 审计时间：2026-07-28 11:19:46 +08:00
- Supabase 项目：NKDDiary
- 项目 ref：仅在连接配置中核验，报告不记录
- 执行方式：Supabase 只读聚合 SQL
- 数据写入：无
- Migration 执行：无

## 审计结果

| 检查项 | 结果 |
| --- | ---: |
| `letter_deletions` 当前行数 | 0 |
| 删除相关 RPC 数量 | 3 |
| active withdrawn notifications | 2 |
| orphan notifications | 4 |
| opened 信件但 active notification 未读 | 0 |
| withdrawn + deleted mixed state 信件 | 2 |

仍存在的删除相关 RPC：

- `delete_letter_diary`
- `empty_letter_recycle_bin`
- `purge_letter_diary`

`auto_purge_letter_deletions` 当前不存在。

## Migration 预计影响

若应用 `202607280009_finalize_letter_notification_state.sql`：

- 删除 3 个现存删除/回收站 RPC。
- 删除 0 行的 `letter_deletions` 表。
- 将 2 条已撤回信件对应的 active 通知规范化为 inactive + read。
- 将 4 条指向不存在信件的 active 通知规范化为 inactive + read。
- 不删除通知记录。
- 不删除信件、正文或评论。
- 2 条 mixed state 信件保持原记录，本 migration 不清除其历史字段。

## 结论

数据库当前仍不满足最终信件规则，主要差异是删除 RPC 仍可用，以及 6 条
active 信件通知需要非破坏性失活。`letter_deletions` 为空，满足删除该空表的
前置条件。opened 信件与 active unread notification 当前没有不一致记录。

在获得明确确认前，不执行数据库 migration。

## Migration 执行与 Postflight

- 执行时间：2026-07-28 11:52:54 +08:00
- Migration：`finalize_letter_notification_state`
- Supabase 返回：`success: true`

执行后对象状态：

| 检查项 | Postflight |
| --- | ---: |
| `letter_deletions` 是否存在 | 否 |
| 删除相关 RPC 数量 | 0 |
| `withdraw_letter_diary` 是否存在 | 是 |
| `mark_letter_read` 是否存在 | 是 |
| `get_letter_withdrawal_status` 是否存在 | 是 |
| `deleted_at` 字段是否存在 | 是 |
| `purge_at` 字段是否存在 | 是 |

执行后数据审计：

| 检查项 | Baseline | Postflight |
| --- | ---: | ---: |
| `journal_entries` 行数 | 15 | 15 |
| `notifications` 行数 | 35 | 35 |
| `journal_comments` 行数 | 9 | 9 |
| active withdrawn notifications | 2 | 0 |
| orphan notifications | 4 | 0 |
| opened 信件但 active notification 未读 | 0 | 0 |
| withdrawn + deleted mixed state 信件 | 2 | 2 |

通知状态规范化结果：

- `is_active=false, is_read=true`：6 条
- `is_active=false, is_read=false`：0 条

权限和 RLS：

- 三个保留 RPC 仅允许 authenticated 执行，anon 均无执行权限。
- `journal_entries` RLS 要求接收方读取的行 `withdrawn_at is null`。
- 接收方查询撤回状态须使用只返回 `id/withdrawn_at` 的窄 RPC。

Postflight 证明核心表行数未减少，历史字段和 2 条 mixed state 记录保持不变。
