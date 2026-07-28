# NKDDiary Prelaunch Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不大规模重构产品逻辑、不删除信件正文或通知记录的前提下，统一信件状态、闭合通知红点链路、隔离 Susan/Niki 双账号状态，并通过完整上线门禁。

**Architecture:** 继续使用 Next.js App Router、Server Actions、Supabase RLS/RPC。信件打开与撤回由数据库 RPC 原子维护 `journal_entries` 和 `notifications`；页面红点只消费当前用户 active unread notifications。数据库改动采用单个追加式 migration，先静态测试和只读审计，再经单独确认应用到生产。

**Tech Stack:** TypeScript 5、Next.js 16、React 19、Supabase/Postgres 17、Vitest 4、Testing Library、Playwright。

## Global Constraints

- 数据一致性 > 功能正确 > 性能 > UI 优化。
- 已寄出普通信只允许正常和撤回两种业务状态。
- 不维护删除按钮、回收站、`letter_deletions` 或 purge 流程。
- `notifications` 是所有红点的唯一来源。
- 不直接删除任何现有信件正文、评论或通知记录。
- 不引入新的状态管理、缓存或消息队列架构。
- 每个生产行为先写失败测试并确认 RED，再写最小实现。
- 未实际运行的命令不得声明通过。

---

## 阶段一：P0 数据库信件状态统一

### Task 1: 为最终信件状态 migration 建立失败测试

**Files:**
- Create: `supabase/migrations/202607280009_finalize_letter_notification_state.test.ts`
- Create after RED: `supabase/migrations/202607280009_finalize_letter_notification_state.sql`

**Interfaces:**
- Consumes: `journal_entries.withdrawn_at`, `opened_at`, `opened_by`, `notifications.is_read`, `notifications.is_active`
- Produces: `withdraw_letter_diary(uuid)`、`mark_letter_read(uuid)` 的最终定义；退役删除 API

**数据库 migration：**

`202607280009_finalize_letter_notification_state.sql` 必须：

- `drop function if exists public.delete_letter_diary(uuid)`
- `drop function if exists public.purge_letter_diary(uuid)`
- `drop function if exists public.empty_letter_recycle_bin()`
- `drop function if exists public.auto_purge_letter_deletions()`
- `drop table if exists public.letter_deletions`
- 保留 `journal_entries.deleted_at/purge_at`
- 重建撤回和已读 RPC
- 非破坏性地失活撤回信及孤儿信件通知

**测试方案：**

- [ ] **Step 1: 写 migration 静态失败测试**

测试读取目标 SQL，并断言：

```ts
expect(sql).toContain("drop function if exists public.delete_letter_diary(uuid)");
expect(sql).toContain("drop table if exists public.letter_deletions");
expect(withdrawDefinition).toContain("set withdrawn_at = clock_timestamp()");
expect(withdrawDefinition).not.toMatch(/deleted_at\s*=|purge_at\s*=/);
expect(markReadDefinition).toMatch(/set opened_at = coalesce\(opened_at, clock_timestamp\(\)\)/);
expect(markReadDefinition).toMatch(/set is_read = true/);
expect(sql).toMatch(/set is_active = false,\s*is_read = true[\s\S]*withdrawn_at is not null/);
```

- [ ] **Step 2: 验证 RED**

Run:

```powershell
npx vitest run supabase/migrations/202607280009_finalize_letter_notification_state.test.ts
```

Expected: FAIL，因为目标 migration 尚不存在。

- [ ] **Step 3: 创建最小 migration**

撤回 RPC 的最终行为：

```sql
create or replace function public.withdraw_letter_diary(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.journal_entries
  set withdrawn_at = clock_timestamp()
  where id = p_entry_id
    and author_id = auth.uid()
    and withdrawn_at is null
    and clock_timestamp() <= locked_at;

  if not found then
    raise exception 'letter withdraw window closed or already withdrawn'
      using errcode = '42501';
  end if;

  update public.notifications
  set is_active = false, is_read = true
  where source_id = p_entry_id
    and recipient_id <> auth.uid()
    and is_active = true;
end;
$$;
```

已读 RPC 必须幂等，正常信重复打开也成功：

```sql
create or replace function public.mark_letter_read(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.journal_entries
    where id = p_entry_id
      and recipient_id = auth.uid()
      and withdrawn_at is null
  ) into v_exists;

  if not v_exists then
    raise exception 'letter not found or already withdrawn'
      using errcode = 'P0002';
  end if;

  update public.journal_entries
  set opened_at = coalesce(opened_at, clock_timestamp()),
      opened_by = coalesce(opened_by, auth.uid())
  where id = p_entry_id and recipient_id = auth.uid();

  update public.notifications
  set is_read = true
  where source_id = p_entry_id
    and recipient_id = auth.uid()
    and is_active = true
    and is_read = false;
end;
$$;
```

历史通知只做状态规范化：

```sql
update public.notifications as n
set is_active = false, is_read = true
from public.journal_entries as j
where n.source_id = j.id
  and n.type in ('journal_created', 'future_diary_opened')
  and j.withdrawn_at is not null
  and n.is_active = true;

update public.notifications as n
set is_active = false, is_read = true
where n.type in ('journal_created', 'future_diary_opened')
  and n.is_active = true
  and not exists (
    select 1 from public.journal_entries as j where j.id = n.source_id
  );
```

- [ ] **Step 4: 验证 GREEN**

Run:

```powershell
npx vitest run supabase/migrations/202607280009_finalize_letter_notification_state.test.ts
```

Expected: PASS。

- [ ] **Step 5: 扫描删除体系残留**

Run:

```powershell
rg -n "letter_deletions|delete_letter_diary|purge_letter_diary|empty_letter_recycle_bin|auto_purge_letter_deletions" src tests supabase
```

Expected: 仅历史 migration、最终 drop migration 和 migration 测试允许出现。

**回滚风险：**

- 删除 RPC 和表属于 schema 破坏性变更，但目标表当前为 0 行，且产品已明确取消该能力。
- 回滚只能重新部署上一版本 migration 中的函数/表定义；不会恢复已经删除的 `letter_deletions` 行，因此应用前必须再次确认其行数仍为 0。
- `deleted_at/purge_at` 字段保留，降低旧查询与历史记录兼容风险。

---

### Task 2: 生产应用前只读审计与影响报告

**Files:**
- Create: `docs/operations/2026-07-28-letter-notification-data-audit.sql`
- Create: `docs/operations/2026-07-28-letter-notification-data-audit.md`

**Interfaces:**
- Produces: migration 应用前后的可复核计数，不修改数据

**数据库 migration：**

本任务不应用 migration，只执行只读查询。

**测试方案：**

- [ ] **Step 1: 写审计 SQL**

审计以下计数：

```sql
select
  count(*) filter (where withdrawn_at is not null) as withdrawn,
  count(*) filter (where deleted_at is not null) as historical_deleted,
  count(*) filter (where purge_at is not null) as historical_purge,
  count(*) filter (
    where withdrawn_at is not null and deleted_at is not null
  ) as mixed_state
from public.journal_entries;
```

并审计：

- `letter_deletions` 当前行数
- 仍可由 authenticated 执行的删除函数
- active withdrawn notifications
- active orphan journal notifications
- opened letter 对应 unread active notification
- `opened_at/opened_by` 不一致记录

- [ ] **Step 2: 在实际 Supabase 执行只读审计**

使用 Supabase SQL 查询工具执行审计 SQL。

Expected: 返回计数，不产生写入。

- [ ] **Step 3: 保存审计报告**

报告包含执行时间、项目 ref、每项计数和 migration 预计影响行数，不包含正文、邮箱、UUID 或密钥。

- [ ] **Step 4: 应用 migration 前请求单独确认**

只有用户明确同意后，才可对实际 Supabase 执行 migration。

**回滚风险：**

- 只读审计无数据回滚风险。
- 报告不得记录个人正文或直接标识符。

---

## 阶段二：P0 通知红点闭环

### Task 3: 移除通知列表读取时的隐式已读写入

**Files:**
- Modify: `src/features/notifications/selection.ts`
- Modify: `src/features/notifications/selection.test.ts`
- Modify: `src/features/notifications/actions.ts`
- Modify: `src/features/notifications/actions.test.ts`

**Interfaces:**
- Produces: `selectRecentNotifications(items, limit): NotificationItem[]`
- Constraint: 获取通知列表只读，不更新数据库

**数据库 migration：**

无。

**测试方案：**

- [ ] **Step 1: 修改 selection 测试为最终契约**

新增失败断言：

```ts
expect(selectRecentNotifications(items, 5).map((item) => item.id))
  .toEqual(["6", "5", "4", "3", "2"]);
```

删除“超过五条的未读自动 release”的旧契约。

- [ ] **Step 2: 在 actions 测试中断言读取不调用 update**

构造 Supabase mock，使任何 `notifications.update()` 调用抛出：

```ts
const update = vi.fn(() => {
  throw new Error("notification reads must not mutate is_read");
});
```

调用 `getNotificationCenterData()` 应成功，且 `update` 未调用。

- [ ] **Step 3: 验证 RED**

Run:

```powershell
npx vitest run src/features/notifications/selection.test.ts src/features/notifications/actions.test.ts
```

Expected: FAIL，因为当前实现会自动更新 30 天前通知及第 6 条以后的未读通知。

- [ ] **Step 4: 最小实现**

- `selectRecentNotifications` 只排序并 `slice`
- 删除读取时“30 天前标已读”
- 删除 `releaseIds` 和对应 update
- 查询固定增加：

```ts
.eq("recipient_id", userId)
.eq("is_active", true)
```

- 不再使用缺少 `is_active` 的降级查询；schema 不完整应返回稳定错误，而不是扩大到无效通知

- [ ] **Step 5: 验证 GREEN**

Run 同 Step 3，Expected: PASS。

**回滚风险：**

- 移除自动已读后，历史未读数量可能比当前 UI 更多，这是恢复真实状态，不是数据回归。
- 列表仍显示最新 5 条时，较老未读不会显示；计数必须来自完整 active unread 计数，而不能只数这 5 条。

---

### Task 4: 让顶部和收信箱红点统一消费 notifications

**Files:**
- Modify: `src/features/notifications/actions.ts`
- Modify: `src/features/notifications/actions.test.ts`
- Modify: `src/features/journal/letter-repository.ts`
- Modify: `src/features/journal/components/JournalPageClient.tsx`
- Create: `src/features/journal/components/JournalPageClient.test.tsx`
- Modify: `src/app/(app)/journal/page.tsx`

**Interfaces:**
- Add: `getUnreadLetterNotificationSourceIds(): Promise<string[]>`
- Add prop: `unreadLetterIds: string[]`
- Remove UI red-dot dependency on `LetterListItem.openedAt`

**数据库 migration：**

无。依赖阶段一的 `notifications.is_read/is_active`。

**测试方案：**

- [ ] **Step 1: 写 action RED 测试**

断言查询条件：

```ts
expect(eq).toHaveBeenCalledWith("recipient_id", "user-1");
expect(eq).toHaveBeenCalledWith("is_read", false);
expect(eq).toHaveBeenCalledWith("is_active", true);
```

并只返回 `journal_created`/`future_diary_opened` 对应 source ID。

- [ ] **Step 2: 写 JournalPageClient RED 测试**

构造：

- `boxes.inbox[0].openedAt` 已有值
- `unreadLetterIds` 包含该信件

期望仍显示红点；反向构造 `openedAt=null` 但 unread IDs 为空时不得显示红点。

- [ ] **Step 3: 验证 RED**

Run:

```powershell
npx vitest run src/features/notifications/actions.test.ts src/features/journal/components/JournalPageClient.test.tsx
```

- [ ] **Step 4: 最小实现**

- Server Action 查询 active unread 通知 source IDs
- `journal/page.tsx` 与信箱数据并行加载 unread IDs
- `JournalPageClient` 从 prop 初始化并同步 unread Set
- 打开信件时只做临时视觉移除，详情页 RPC 最终确认；失败/返回后通过 `router.refresh()` 恢复服务器事实
- `letter-repository.ts` 的 `openedAt` 保留为信件事实展示字段，但不再用于红点

- [ ] **Step 5: 验证 GREEN**

Run 同 Step 3。

**回滚风险：**

- 若阶段一 migration 未应用，历史 active withdrawn/orphan 通知仍会被计数；因此部署顺序必须是 migration → 应用。
- 查询 notification enum 时不要使用数据库不存在的枚举值。

---

### Task 5: 通知点击失败回滚与稳定导航

**Files:**
- Modify: `src/features/notifications/actions.ts`
- Modify: `src/features/notifications/components/NotificationCenterClient.tsx`
- Create: `src/features/notifications/components/NotificationCenterClient.test.tsx`

**Interfaces:**
- `markNotificationReadAction(id)` 返回稳定 `ActionResult`
- 通知点击先标记已读；失败回滚；成功后导航
- 移除 `validateJournalEntryForUser` 预校验和重复查询

**数据库 migration：**

无。

**测试方案：**

- [ ] **Step 1: 写 RED 组件测试**

覆盖：

1. 成功：红点消失且 `router.push(item.href)`
2. 失败：红点恢复、显示中文错误、不得导航
3. withdrawn 深链：直接导航 `/journal/{sourceId}`，由详情/RLS展示撤回状态

- [ ] **Step 2: 验证 RED**

Run:

```powershell
npx vitest run src/features/notifications/components/NotificationCenterClient.test.tsx
```

- [ ] **Step 3: 最小实现**

点击流程：

```ts
const previous = items;
markLocalRead(item.id);
const result = await markNotificationReadAction(item.id);
if (!result.ok) {
  restore(previous);
  setErrorMessage("消息暂时无法标记已读，请稍后再试。");
  return;
}
router.push(item.href);
```

移除 `validateJournalEntryForUser` 及其客户端调用。

- [ ] **Step 4: 验证 GREEN**

Run 同 Step 2。

**回滚风险：**

- 导航会等待一次 Server Action，弱网下略有延迟；使用 pending 样式，不引入复杂队列。
- 移除预校验后，真正不存在的手工 URL 仍为 404；active 孤儿通知由 migration 失活，因此通知入口不会指向它们。

---

### Task 6: 信件直接打开的已读闭环

**Files:**
- Modify: `src/features/journal/letter-actions.ts`
- Create: `src/features/journal/letter-actions.test.ts`
- Modify: `src/features/journal/components/LetterReaderV1.tsx`
- Create: `src/features/journal/components/LetterReaderV1.test.tsx`

**Interfaces:**
- `markLetterReadAction(entryId)` 返回稳定 `ActionResult`
- 接收方正常信首次渲染调用一次；失败显示提示且不 Runtime Error

**数据库 migration：**

使用阶段一最终 `mark_letter_read` RPC。

**测试方案：**

- [ ] **Step 1: 写 action RED 测试**

覆盖非法 UUID、RPC 成功、RPC 失败稳定消息，并断言不泄漏数据库 error。

- [ ] **Step 2: 写组件 RED 测试**

覆盖：

- 接收方正常信调用 `markLetterReadAction`
- 作者不调用
- 已撤回信不调用
- RPC 失败显示非阻塞错误

- [ ] **Step 3: 验证 RED**

Run:

```powershell
npx vitest run src/features/journal/letter-actions.test.ts src/features/journal/components/LetterReaderV1.test.tsx
```

- [ ] **Step 4: 最小实现**

在 effect 内 await ActionResult；失败写入 `message`，成功 `router.refresh()` 使通知计数回到服务器事实。

- [ ] **Step 5: 验证 GREEN**

Run 同 Step 3。

**回滚风险：**

- React Strict Mode 开发环境可能执行两次 effect；数据库 RPC 必须幂等。
- `router.refresh()` 可能增加一次服务端请求，但只在首次正常打开后执行。

---

## 阶段三：P0 双账号状态隔离

### Task 7: 通知组件在账号数据变化时重置状态

**Files:**
- Modify: `src/features/notifications/components/NotificationBell.tsx`
- Modify: `src/features/notifications/components/NotificationCenterClient.tsx`
- Modify: `src/features/notifications/components/NotificationCenterClient.test.tsx`

**Interfaces:**
- Add prop: `userId: string`
- `NotificationCenterClient` 在 `userId` 改变时同步 inbox/activity、关闭弹层、清除错误

**数据库 migration：**

无。

**测试方案：**

- [ ] **Step 1: 写 RED 测试**

先以 Susan props 渲染未读通知，再 rerender 为 Niki 空通知：

```ts
rerender(<NotificationCenterClient userId="niki" inbox={[]} activity={[]} />);
expect(screen.queryByText("Susan 的旧通知")).not.toBeInTheDocument();
expect(screen.queryByText("1")).not.toBeInTheDocument();
```

- [ ] **Step 2: 验证 RED**

Run:

```powershell
npx vitest run src/features/notifications/components/NotificationCenterClient.test.tsx
```

- [ ] **Step 3: 最小实现**

`NotificationBell` 从服务端数据获得 `userId`；client effect 在 userId 或 server arrays 变化时替换本地状态。

- [ ] **Step 4: 验证 GREEN**

Run 同 Step 2。

**回滚风险：**

- 同账号 `router.refresh()` 时也会同步服务器数组，这是期望行为。
- effect 不得因数组引用变化形成更新循环；只更新本地 state，不触发路由刷新。

---

### Task 8: 草稿和账号退出隔离审查

**Files:**
- Modify if test fails: `src/features/journal/components/JournalPageClient.tsx`
- Modify if test fails: `src/features/journal/components/RichLetterComposer.tsx`
- Modify if test fails: `src/features/journal/components/CapsuleLetterComposer.tsx`
- Create: `src/features/journal/components/draft-storage.test.ts`

**Interfaces:**
- 草稿 key 必须是 `prefix_userId`
- 旧无用户 key 仅在 `authorId` 与当前用户匹配时迁移

**数据库 migration：**

无。

**测试方案：**

- [ ] **Step 1: 写 Susan/Niki localStorage 隔离测试**

写入 Susan 草稿后，以 Niki 加载必须返回 null，且不得覆盖 Susan key。

- [ ] **Step 2: 验证 RED 或确认当前行为已满足**

若测试立即通过，记录为现状刻画测试，不修改生产代码；TDD 修复仅在确有失败时进行。

- [ ] **Step 3: 若失败，做最小修复并验证 GREEN**

Run:

```powershell
npx vitest run src/features/journal/components/draft-storage.test.ts
```

**回滚风险：**

- 错误清理共享旧 key 可能丢失未发送草稿；只删除确认属于另一用户的旧格式数据，不清除分用户 key。

---

## 阶段四：P1 详情页、撤回展示和错误边界

### Task 9: 撤回信详情不展示正文或评论

**Files:**
- Modify: `src/app/(app)/journal/[id]/page.test.tsx`
- Modify: `src/features/journal/components/LetterReaderV1.test.tsx`
- Modify if needed: `src/app/(app)/journal/[id]/page.tsx`
- Modify if needed: `src/features/journal/components/LetterReaderV1.tsx`

**Interfaces:**
- 接收方撤回页固定文案：“这封信已经被对方撤回”
- withdrawn 时评论查询次数为 0

**数据库 migration：**

依赖阶段一 RLS，允许接收方读取撤回状态。

**测试方案：**

- [ ] **Step 1: 写 RED 集成测试**

断言：

- 页面包含准确撤回文案
- DOM 不含 `plainText` 或 `richHtml`
- 不渲染 `CommentSection`
- client `.from("journal_comments")` 未调用

- [ ] **Step 2: 验证 RED**

Run:

```powershell
npx vitest run "src/app/(app)/journal/[id]/page.test.tsx" src/features/journal/components/LetterReaderV1.test.tsx
```

- [ ] **Step 3: 最小修复**

仅修正文案、数据传递和 withdrawn 分支，不重构详情页。

- [ ] **Step 4: 验证 GREEN**

Run 同 Step 2。

**回滚风险：**

- 作者撤回后仍需查看自己正文，条件必须是 `isWithdrawn && !isAuthor`，不能全局隐藏。

---

### Task 10: 用户操作失败不得产生 Runtime Error

**Files:**
- Create: `src/app/(app)/error.tsx`
- Create: `src/app/(app)/error.test.tsx`
- Modify targeted actions only where failing tests prove leakage:
  - `src/features/notifications/actions.ts`
  - `src/features/journal/letter-actions.ts`
  - `src/features/journal/draft-actions.ts`

**Interfaces:**
- App route error boundary 提供重试和返回首页
- 可预期 mutation 失败返回 `{ok:false,message}`，不 throw

**数据库 migration：**

无。

**测试方案：**

- [ ] **Step 1: 写 error boundary RED 测试**

断言中文稳定提示、重试按钮调用 `reset()`、首页链接存在。

- [ ] **Step 2: 验证 RED**

Run:

```powershell
npx vitest run "src/app/(app)/error.test.tsx"
```

- [ ] **Step 3: 实现最小 error boundary**

不展示 stack、Supabase message 或用户数据。

- [ ] **Step 4: 验证 GREEN**

Run 同 Step 2。

**回滚风险：**

- Error boundary 只能兜底不可预期错误，不能吞掉 redirect/notFound。
- 不批量改变所有 action 的错误语义，只修核心链路和已有失败证据。

---

## 阶段五：现有失败测试清零

### Task 11: 分类并修复 25 个现有失败测试

**Files:**
- Test environment:
  - Modify: `vitest.config.ts`
  - Create: `src/test/setup.ts`
- Contract drift candidates:
  - `src/features/journal/actions.ts`
  - `src/features/journal/actions.test.ts`
  - `src/features/memories/actions.ts`
  - `src/features/memories/actions.test.ts`
  - `src/features/mood/actions.ts`
  - `src/features/mood/actions.test.ts`
  - `src/features/home/components/MonthHeatmap.tsx`
  - `src/features/home/components/MonthHeatmap.test.tsx`
  - `src/features/distance/components/LocationDistancePanel.tsx`
  - `src/features/distance/components/LocationDistancePanel.test.tsx`
  - `src/features/memories/components/MemoryTimeline.tsx`
  - `src/features/memories/components/MemoryTimeline.test.tsx`
  - `src/features/media/actions.ts`
  - `src/features/media/actions.test.ts`

**Interfaces:**
- 测试环境提供稳定的 `IntersectionObserver` polyfill 和 Next router mock
- 产品契约以已批准设计和当前页面真实需求为准

**数据库 migration：**

无。

**测试方案：**

- [ ] **Step 1: 重新运行全量测试保存最新失败清单**

```powershell
npm test
```

- [ ] **Step 2: 将失败分为环境、过期测试、真实回归**

每项记录“生产改动会让测试失败的具体行为”。禁止仅为变绿删除断言。

- [ ] **Step 3: 先修测试环境**

`src/test/setup.ts` 提供最小 `IntersectionObserver`，`vitest.config.ts` 使用 `setupFiles`。修复 Windows `import.meta.url` 用法时使用 `fileURLToPath`。

- [ ] **Step 4: 对每个真实回归逐一执行 RED/GREEN**

每次只运行对应测试文件；修复后运行相关 feature 测试。

- [ ] **Step 5: 全量验证**

```powershell
npm test
```

Expected: 0 failed tests。若仍失败，保留真实输出并继续定位，不进入“完成”状态。

**回滚风险：**

- 最大风险是把过期实现当成正确契约，或反过来仅修改测试迁就缺陷。
- 每个不一致必须以设计、数据库约束或用户可见行为作为裁决依据。

---

## 阶段六：P2 低复杂度工程和性能优化

### Task 12: 清理无效代码与 lint warning

**Files:**
- Modify only files reported by current `npm run lint`
- Delete after reference scan:
  - `src/features/distance/components.tmp`
  - `src/features/memories/repository.ts.tmp`

**Interfaces:**
- 不改变业务行为

**数据库 migration：**

无。

**测试方案：**

- [ ] **Step 1: 记录 lint 基线**

```powershell
npm run lint
```

- [ ] **Step 2: 使用 `rg` 证明临时文件无引用**

```powershell
rg -n "components\\.tmp|repository\\.ts\\.tmp" .
```

- [ ] **Step 3: 分模块清理未使用 import/state 和无效表达式**

Hook dependency 警告必须通过稳定 callback 或明确生命周期修复，不使用批量 disable。

- [ ] **Step 4: 验证**

```powershell
npm run lint
npm test
```

Expected: lint 0 errors，warning 数显著下降；目标为 0 warning。测试仍全绿。

**回滚风险：**

- 删除看似未使用的函数可能被数据库 trigger 或动态路径引用；仅清理 TypeScript 静态无引用项和明确 `.tmp` 文件。

---

### Task 13: 信箱查询和图片的低风险优化

**Files:**
- Modify: `src/features/journal/letter-repository.ts`
- Modify: `src/features/journal/letter-repository.test.ts`
- Modify selected image components reported by lint:
  - `src/features/profile/components/ProfileHeaderLink.tsx`
  - `src/features/distance/components/LocationDistancePanel.tsx`
  - `src/features/memories/components/MemoryTimeline.tsx`

**Interfaces:**
- `listLetterBoxes` 返回结构不变
- 图片保持私有签名 URL，不暴露 storage path

**数据库 migration：**

仅当当前 schema 无法安全聚合评论数时，新增独立只读 RPC migration；不得在应用层拉取全部评论 ID。

**测试方案：**

- [ ] **Step 1: 写 repository RED 测试**

断言信箱只查询一次 `journal_entries`，且不读取全部 `journal_comments.entry_id` 来计数。

- [ ] **Step 2: 验证 RED**

```powershell
npx vitest run src/features/journal/letter-repository.test.ts
```

- [ ] **Step 3: 最小查询优化**

将 today/future 合并为一个按用户过滤的查询；评论数使用已有可用聚合或窄 RPC。

- [ ] **Step 4: 图片优化**

为外部/签名 URL 使用 `next/image` 时配置 `unoptimized` 或安全 loader，明确 `width/height`；不可扩大 `next.config.ts` 远程域名到任意来源。

- [ ] **Step 5: 验证**

```powershell
npx vitest run src/features/journal/letter-repository.test.ts
npm run lint
npm run build
```

**回滚风险：**

- 合并查询可能把未开启的 future 信暴露给接收方；必须依赖 RLS并保留 entry type/开放状态测试。
- 私有签名 URL 与 Next Image 优化代理可能不兼容；出现访问问题时保留明确尺寸和 lazy loading，不强制代理。

---

## 阶段七：真实双账号 E2E 与上线门禁

### Task 14: Susan/Niki 核心链路 Playwright 测试

**Files:**
- Create: `tests/e2e/letter-notification-lifecycle.spec.ts`
- Modify if required: `scripts/playwright-e2e-config.ts`

**Interfaces:**
- 使用 `.env.local` 中既有双账号 E2E 凭据
- 测试生成的信件带唯一时间戳前缀，不删除数据

**数据库 migration：**

测试开始前只读确认最终 migration 已应用：

- 删除函数不存在
- `letter_deletions` 不存在
- `is_active/is_read` 存在

**测试方案：**

- [ ] **Step 1: 写 E2E RED 测试**

场景：

1. Susan 登录并发送唯一内容普通信。
2. Niki 登录，看见收信未读红点。
3. Niki 打开信，正文可见，返回后红点消失。
4. Susan 登录，在 24 小时内撤回该信。
5. Niki 直接访问保存的详情 URL，只看见撤回提示且看不到正文。
6. Susan → Niki → Susan 轮换登录，断言通知内容不串号。
7. 点击所有可见 active 信件通知，响应 URL 不得是 `/_not-found`。

- [ ] **Step 2: 验证 RED**

```powershell
npx playwright test tests/e2e/letter-notification-lifecycle.spec.ts
```

Expected: 在 migration/代码尚未完成时至少一个核心断言失败。

- [ ] **Step 3: 只修被 E2E 证明的剩余缺陷**

每次修复后重新运行该 spec。

- [ ] **Step 4: 验证 GREEN**

Run 同 Step 2，Expected: PASS。

**回滚风险：**

- E2E 会创建一封真实测试信和对应通知；不做清理以遵守“不直接删除数据”，测试内容必须可识别。
- 撤回是不可逆业务状态，测试信不得复用现有用户内容。

---

### Task 15: 完整上线门禁与最终审计

**Files:**
- Update: `docs/operations/deployment-checklist.md`
- Create: `docs/operations/2026-07-28-prelaunch-verification.md`

**Interfaces:**
- 最终报告使用用户要求的 A-I 格式

**数据库 migration：**

应用后只读审计必须证明：

- `letter_deletions` 不存在
- 删除/purge RPC 不存在
- active withdrawn journal notifications = 0
- active orphan journal notifications = 0
- opened letter + unread active notification = 0
- `opened_at/opened_by` 不一致 = 0
- 历史 `deleted_at/purge_at` 行仍保留且未删除

**测试方案：**

- [ ] **Step 1: 运行单元/组件/迁移测试**

```powershell
npm test
```

- [ ] **Step 2: 运行 lint**

```powershell
npm run lint
```

- [ ] **Step 3: 运行生产 build**

```powershell
npm run build
```

- [ ] **Step 4: 运行完整真实 E2E**

```powershell
npm run test:e2e
```

- [ ] **Step 5: 记录每个命令的退出码、错误和 warning**

任何失败都保留真实输出、回到对应任务修复，并重新运行完整门禁。不得把部分 spec 通过当成全量通过。

- [ ] **Step 6: 最终只读数据库审计**

保存计数和时间，不保存正文或密钥。

- [ ] **Step 7: 输出 A-I 最终报告**

包括：

- A. 项目健康状态
- B. P0/P1/P2
- C. 修复顺序
- D. 已修复内容
- E. 修改文件列表
- F. 数据库变化
- G. lint 结果
- H. build 结果
- I. 上线风险

**回滚风险：**

- 若 migration 已应用但应用部署失败，旧前端仍可读取保留字段，但调用已删除删除 RPC 的旧隐藏路径会失败；上线时 migration 与应用应在同一维护窗口部署。
- 回滚应用版本不应自动重建已退役删除 API。需要回滚时优先修复前端部署，不恢复违反最终产品规则的删除能力。

---

## 计划自检

- P0 信件状态统一：Task 1、2、9。
- P0 通知红点闭环：Task 3–6。
- P0 双账号隔离：Task 7、8、14。
- 历史脏数据不删除：Task 1、2、15。
- 用户操作失败不 Runtime Error：Task 5、6、10。
- 现有失败测试不跳过：Task 11、15。
- 性能和工程优化：Task 12、13。
- `npm test`、lint、build、E2E 真实执行：Task 15。
- 无新增复杂架构或大规模产品重构。
