# CoupleOS Core Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重建项目、不删除数据的前提下，把现有双人日记重构分支升级为可在 375px、768px、1440px 使用的 CoupleOS 风格核心版本，并在 2026-07-30 前完成可发布验收。

**Architecture:** 继续使用现有 Next.js App Router + Supabase 架构和 `space_id` 双人隔离模型。日记保持独立；Memories 只聚合 Mood、独立 Memory 和符合规则的日历事件。所有数据能力通过追加式迁移、服务端 action 和 RLS/RPC 扩展，不改写或删除既有数据。

**Tech Stack:** Next.js 16、React 19、TypeScript 5、Tailwind CSS 4、Supabase Postgres/Auth/Storage、Vitest、Testing Library、Playwright。

## Global Constraints

- 实施基线是工作树 `C:\Users\吴丹\Desktop\NKDDiary\.worktrees\couple-diary-rebuild` 的 `codex/couple-diary-rebuild` 分支，不在旧主分支重写。
- 不重新初始化项目，不删除数据库、表、bucket 或现有记录；数据库只允许追加式 migration。
- 只允许登录，不增加注册、邀请、公开分享、下载、社交、AI 或订阅能力。
- Memories 不读取今日记或未来日记；Journal 与 Future Journal 独立保留。
- Mood 是一个同时允许表情和文字的统一输入，最多 15 个 Unicode grapheme。
- Mood 和独立 Memory 仅作者可在创建后 24 小时内编辑或删除；伴侣始终只读。
- 独立 Memory 核心版最多一张图片，使用现有私有 Storage 与签名 URL 方案。
- Calendar 类型为 `date | anniversary | birthday | travel | todo | other`；前三类以及 travel 自动进入 Memories，todo/other 仅 `is_important=true` 时进入。
- 导航固定为 Home、Memories、Journal、Calendar、Settings；Mood 从 Home 和 Memories 进入。
- 375px、768px、1440px 均需功能完整；触控目标至少 44×44px，底部导航不遮挡正文或弹窗。
- 所有用户文案统一为可读 UTF-8 简体中文；先修复当前乱码再做视觉验收。
- 生日仅是项目截止时间，不创建任何生日专属页面、文案或演示数据。

---

## File Map

### Shared shell and visual system

- Modify `src/app/globals.css`: CoupleOS 色彩、字体、卡片、按钮、表单、弹窗和响应式 token。
- Modify `src/app/(app)/layout.tsx`: 桌面顶部辅助区与全端固定底部导航。
- Modify `src/features/home/navigation.ts`: 五项主导航定义，移除 Mood 主导航项。
- Create `src/features/home/components/AppBottomNav.tsx`: 路由感知的底部导航。
- Create `src/features/home/components/AppBottomNav.test.tsx`: 导航结构和可访问性测试。

### Authentication

- Modify `src/app/(auth)/login/page.tsx`: CoupleOS 风格登录页和正确中文。
- Create `src/app/(auth)/login/page.test.tsx`: 无注册入口、错误态和响应式结构测试。

### Mood

- Modify `src/features/mood/rules.ts`: 统一 15-grapheme 校验及 24 小时权限函数。
- Modify `src/features/mood/rules.test.ts`: Unicode、空值和权限边界测试。
- Modify `src/features/mood/actions.ts`: 创建、更新、删除和时间限制。
- Modify `src/features/mood/actions.test.ts`: RPC 参数、revalidate 和错误路径。
- Modify `src/app/(app)/mood/page.tsx`: 统一输入与作者操作。
- Create `src/features/mood/components/MoodComposer.tsx`: 客户端字数提示和提交表单。
- Create `src/features/mood/components/MoodCard.tsx`: 展示、编辑和删除状态。
- Create `supabase/migrations/202607250001_mood_edit_window.sql`: 安全更新/删除 RPC。
- Create `supabase/migrations/202607250001_mood_edit_window.test.ts`: SQL 权限契约。

### Independent memories and aggregation

- Create `supabase/migrations/202607250002_independent_memories.sql`: `memory_entries`、日历分类字段、RLS、RPC、索引。
- Create `supabase/migrations/202607250002_independent_memories.test.ts`: 数据保留和权限契约。
- Modify `src/features/memories/repository.ts`: 仅聚合 Mood、Memory、允许的 Calendar。
- Modify `src/features/memories/repository.test.ts`: 明确排除 Journal/Future Journal。
- Create `src/features/memories/rules.ts`: 日历进入 Memories 的纯函数。
- Create `src/features/memories/rules.test.ts`: 六种事件类型与 important 规则。
- Create `src/features/memories/actions.ts`: Memory 创建、更新、删除。
- Create `src/features/memories/actions.test.ts`: 24 小时和作者权限映射。
- Create `src/features/memories/components/MemoryComposer.tsx`: 单图表单。
- Create `src/features/memories/components/MemoryTimeline.tsx`: 过滤器与时间线。
- Modify `src/app/(app)/memories/page.tsx`: CoupleOS 统计、Mood 快速入口、筛选和空状态。

### Journal and home

- Modify `src/app/(app)/journal/page.tsx`: Journal/Future Journal 双标签、提示词和最近条目。
- Create `src/features/journal/components/JournalTabs.tsx`: 路由标签。
- Create `src/features/journal/components/WritingPrompts.tsx`: 仅作为写作入口，不保存 Mood。
- Modify `src/app/(app)/page.tsx`: CoupleOS 首页信息架构。
- Create `src/features/home/repository.ts`: 首页并行读取和 view model。
- Create `src/features/home/repository.test.ts`: 空态、伙伴态和最近内容排序。
- Create `src/features/home/components/QuickMood.tsx`: 首页 Mood 快速记录。
- Create `src/features/home/components/HomeOverview.tsx`: 在一起天数、伙伴、Memories 和 upcoming 摘要。

### Calendar, settings, verification

- Modify `src/features/calendar/actions.ts`: 新事件类型、important 和 Memories 规则。
- Modify `src/features/calendar/actions.test.ts`: 输入校验和 RPC 参数。
- Modify `src/app/(app)/calendar/page.tsx`: CoupleOS 月历、概览卡和新增事件弹窗。
- Modify `src/app/(app)/settings/page.tsx`: 分区设置页面。
- Modify `src/features/profile/components/ProfileForm.tsx`: 共享站点名、个人主题和账号动作。
- Create `tests/e2e/responsive-core.spec.ts`: 375/768/1440 关键路径。
- Modify `tests/e2e/couple-diary.spec.ts`: 新中文文案与无注册断言。
- Modify `docs/operations/deployment-checklist.md`: 核心版发布门禁。

---

### Task 1: Freeze the Correct Baseline and Repair Text Encoding

**Files:**
- Add from approved spec commit: `docs/superpowers/specs/2026-07-25-coupleos-parity-redesign.md`
- Modify: affected `src/**/*.ts` and `src/**/*.tsx` files containing mojibake
- Test: `tests/e2e/couple-diary.spec.ts`

**Interfaces:**
- Consumes: existing `codex/couple-diary-rebuild` branch and approved design commit `ecb8842`.
- Produces: clean UTF-8 Chinese source and a green baseline before feature work.

- [ ] **Step 1: Verify the worktree and capture the baseline**

Run:

```powershell
git -c safe.directory='C:/Users/吴丹/Desktop/NKDDiary/.worktrees/couple-diary-rebuild' status --short
npm test
npm run lint
```

Expected: worktree has no unknown product-code edits; record any pre-existing test or lint failure without deleting files.

- [ ] **Step 2: Bring the approved spec into this branch**

Run:

```powershell
git -c safe.directory='C:/Users/吴丹/Desktop/NKDDiary/.worktrees/couple-diary-rebuild' cherry-pick ecb8842
```

Expected: the spec exists on the implementation branch; if only documentation conflicts, preserve the newer branch documentation and the complete approved spec.

- [ ] **Step 3: Write a failing UTF-8 smoke assertion**

Update `tests/e2e/couple-diary.spec.ts` to assert:

```ts
await expect(page.getByRole("heading", { name: "欢迎回到我们的空间" })).toBeVisible();
await expect(page.getByRole("button", { name: "进入日记" })).toBeVisible();
await expect(page.locator("body")).not.toContainText("锛");
```

- [ ] **Step 4: Run the smoke test and verify failure**

Run: `npm run test:e2e -- --grep "login"`

Expected: FAIL because current source includes mojibake and old copy.

- [ ] **Step 5: Replace mojibake with final Chinese copy**

Use `rg -n "锛|鐨|鏃|璁|鍥|鎴|绔|馃" src` and correct every matched user-facing string. Do not change identifiers, database values, routes, or behavior in this step.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm test
npm run lint
git add src tests docs/superpowers/specs
git commit -m "fix: restore readable Chinese product copy"
```

Expected: unit suite and lint pass; the commit contains no data deletion or schema rewrite.

### Task 2: Build the Responsive CoupleOS Shell

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/features/home/navigation.ts`
- Create: `src/features/home/components/AppBottomNav.tsx`
- Create: `src/features/home/components/AppBottomNav.test.tsx`

**Interfaces:**
- Consumes: Next.js `usePathname()` and `lucide-react`.
- Produces: `APP_NAVIGATION` with exactly five items and `<AppBottomNav />`.

- [ ] **Step 1: Write failing navigation tests**

Test these exact contracts:

```ts
expect(APP_NAVIGATION.map((item) => item.href)).toEqual([
  "/", "/memories", "/journal", "/calendar", "/settings",
]);
expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
expect(screen.queryByRole("link", { name: "心情" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests**

Run: `npm test -- src/features/home/navigation.test.ts src/features/home/components/AppBottomNav.test.tsx`

Expected: FAIL because Mood is still a sixth navigation item and the component does not exist.

- [ ] **Step 3: Implement the five-item shell**

`AppBottomNav` must render icon + label, `aria-current="page"` for the current route, and classes that enforce:

```css
min-height: 64px;
padding-bottom: env(safe-area-inset-bottom);
```

Add `padding-bottom` to the app content so fixed navigation never overlaps content. At `min-width: 1024px`, keep the same bottom navigation but constrain it to the content width, matching the supplied CoupleOS screenshots.

- [ ] **Step 4: Add shared visual tokens**

Define named variables for cream background, rose primary, orange accent, pale-yellow active navigation, border, text, muted text, radius, and shadow. Add reusable `.cos-card`, `.cos-button-primary`, `.cos-input`, `.cos-modal` classes; keep focus-visible outlines and reduced-motion support.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm test -- src/features/home/navigation.test.ts src/features/home/components/AppBottomNav.test.tsx
npm run lint
git add src/app src/features/home
git commit -m "feat: add responsive CoupleOS app shell"
```

### Task 3: Redesign Login Without Adding Registration

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/page.test.tsx`
- Modify: `tests/e2e/couple-diary.spec.ts`

**Interfaces:**
- Consumes: existing `signInAction` and `searchParams.error`.
- Produces: one login form with `email`, `password`, and no registration path.

- [ ] **Step 1: Write the page contract**

Assert heading “欢迎回到我们的空间”, helper copy “这里只属于我们两个人”, input labels “邮箱”“密码”, submit “进入日记”, and zero links/buttons matching `/注册|sign up/i`.

- [ ] **Step 2: Run and see the old layout fail**

Run: `npm test -- src/app/(auth)/login/page.test.tsx`

Expected: FAIL on copy and new visual structure.

- [ ] **Step 3: Implement the responsive login**

Use a two-column composition at 1024px+ and a single centered card below 1024px. Keep native autocomplete attributes, visible labels, `aria-invalid`, error association, and the existing server action.

- [ ] **Step 4: Verify at three viewport widths**

Run the Playwright test with projects/viewports 375×812, 768×1024, and 1440×900. Expected: no horizontal scroll, no clipped inputs, no registration controls.

- [ ] **Step 5: Commit**

```powershell
git add src/app/'(auth)'/login tests/e2e/couple-diary.spec.ts
git commit -m "feat: redesign private login experience"
```

### Task 4: Make Mood a Unified 15-Grapheme Entry With a 24-Hour Window

**Files:**
- Modify: `src/features/mood/rules.ts`
- Modify/Create: `src/features/mood/rules.test.ts`
- Modify: `src/features/mood/actions.ts`
- Modify: `src/features/mood/actions.test.ts`
- Create: `src/features/mood/components/MoodComposer.tsx`
- Create: `src/features/mood/components/MoodCard.tsx`
- Modify: `src/app/(app)/mood/page.tsx`
- Create: `supabase/migrations/202607250001_mood_edit_window.sql`
- Create: `supabase/migrations/202607250001_mood_edit_window.test.ts`

**Interfaces:**
- Produces:

```ts
export function countGraphemes(value: string): number;
export function validateMoodInput(value: string): { content: string } | null;
export function canAuthorMutate(createdAt: string, now: Date): boolean;
export async function updateMoodAction(input: { id: string; content: string }): Promise<ActionResult>;
export async function deleteMoodAction(id: string): Promise<ActionResult>;
```

- [ ] **Step 1: Test grapheme and time boundaries**

Include `"❤️"` as one grapheme, 15 Chinese characters as valid, 16 as invalid, whitespace-only as invalid, exactly 24 hours as locked, and 23:59:59 as editable.

- [ ] **Step 2: Run tests to confirm current split model fails**

Run: `npm test -- src/features/mood/rules.test.ts`

- [ ] **Step 3: Implement pure rules**

Use `Intl.Segmenter("zh-CN", { granularity: "grapheme" })` with `[...value]` fallback. Store unified content in `body`; pass an empty string to the legacy `emoji` RPC parameter to remain backward compatible.

- [ ] **Step 4: Add secure database mutations**

Migration functions `update_mood_entry(uuid,text)` and `delete_mood_entry(uuid)` must:

```sql
where id = p_id
  and author_id = auth.uid()
  and created_at > now() - interval '24 hours'
```

Revoke table update/delete from authenticated users; grant only RPC execute. Do not alter or delete existing mood rows.

- [ ] **Step 5: Test SQL contracts**

Assert author check, 24-hour predicate, active membership verification, function grants, and absence of `drop table`/`truncate`.

- [ ] **Step 6: Implement composer and cards**

One textarea/input accepts emoji and text together, shows `n/15`, disables submit at 0 or >15, and renders Edit/Delete only for the author inside the window.

- [ ] **Step 7: Verify and commit**

Run:

```powershell
npm test -- src/features/mood supabase/migrations/202607250001_mood_edit_window.test.ts
npm run lint
git add src/features/mood src/app/'(app)'/mood supabase/migrations/202607250001*
git commit -m "feat: add unified time-limited mood entries"
```

### Task 5: Add Independent Memories and Correct the Aggregation Model

**Files:**
- Create: `supabase/migrations/202607250002_independent_memories.sql`
- Create: `supabase/migrations/202607250002_independent_memories.test.ts`
- Create: `src/features/memories/rules.ts`
- Create: `src/features/memories/rules.test.ts`
- Modify: `src/features/memories/repository.ts`
- Modify: `src/features/memories/repository.test.ts`
- Create: `src/features/memories/actions.ts`
- Create: `src/features/memories/actions.test.ts`
- Create: `src/features/memories/components/MemoryComposer.tsx`
- Create: `src/features/memories/components/MemoryTimeline.tsx`
- Modify: `src/app/(app)/memories/page.tsx`

**Interfaces:**
- Produces:

```ts
type CalendarMemoryType = "date" | "anniversary" | "birthday" | "travel" | "todo" | "other";
type MemoryFeedKind = "mood" | "memory" | "calendar";
export function calendarBelongsInMemories(type: CalendarMemoryType, important: boolean): boolean;
export async function createMemoryAction(formData: FormData): Promise<ActionResult>;
```

- [ ] **Step 1: Write aggregation tests**

Test that date/anniversary/birthday/travel are included; todo/other require `important=true`; no repository query reads `journal_entries`; feed kinds never include `"journal"`.

- [ ] **Step 2: Run and confirm the old journal aggregation fails**

Run: `npm test -- src/features/memories`

- [ ] **Step 3: Create the additive schema**

Create `memory_entries(id, space_id, author_id, title, body, occurred_on, image_path, created_at, updated_at)` and append `event_type` plus `is_important` to `calendar_events` with safe defaults. Add indexes and active-space read policy. Write create/update/delete RPCs with author + 24-hour enforcement.

- [ ] **Step 4: Verify migration safety**

Run: `npm test -- supabase/migrations/202607250002_independent_memories.test.ts`

Expected: PASS for `if not exists`/additive columns, RLS, RPC guards, and no destructive SQL.

- [ ] **Step 5: Implement server actions and private image handling**

Reuse the existing image compression/private Storage utilities. Accept zero or one image, persist only the private object path, and generate signed URLs only while reading.

- [ ] **Step 6: Replace the repository feed**

Query only `mood_entries`, `memory_entries`, and `calendar_events`. Return stable reverse chronology with source-specific IDs and filters `all | mood | memory | calendar | photos`.

- [ ] **Step 7: Build the CoupleOS Memories page**

Include summary counts, “记录此刻心情” quick entry, “添加回忆” modal, filter chips, empty state, and timeline cards. Never display Journal or Future Journal here.

- [ ] **Step 8: Verify and commit**

Run:

```powershell
npm test -- src/features/memories supabase/migrations/202607250002_independent_memories.test.ts
npm run lint
git add src/features/memories src/app/'(app)'/memories supabase/migrations/202607250002*
git commit -m "feat: add independent memories timeline"
```

### Task 6: Restructure Journal Without Changing Its Proven Data Model

**Files:**
- Modify: `src/app/(app)/journal/page.tsx`
- Create: `src/features/journal/components/JournalTabs.tsx`
- Create: `src/features/journal/components/JournalTabs.test.tsx`
- Create: `src/features/journal/components/WritingPrompts.tsx`
- Create: `src/features/journal/components/WritingPrompts.test.tsx`
- Modify: `src/features/journal/components/TodayDiaryEditor.tsx`
- Modify: `src/features/journal/components/FutureDiaryEditor.tsx`

**Interfaces:**
- Consumes: existing `/journal`, `/journal/new`, `/journal/future`, `/journal/future/new` routes and repository/actions.
- Produces: presentational tabs and prompt-to-editor query parameter `prompt`.

- [ ] **Step 1: Test route tabs and prompts**

Assert Journal tab links to `/journal`, Future Journal to `/journal/future`, and a prompt links to `/journal/new?prompt=<encoded>`. Assert no Mood field or streak copy exists.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- src/features/journal/components`

- [ ] **Step 3: Implement the CoupleOS journal overview**

Use header + new entry CTA, two tabs, compact statistics excluding streak, prompt cards, recent entries and empty state. Preserve title as optional if the domain already allows it; do not add mood tags.

- [ ] **Step 4: Prefill prompts without persistence coupling**

Read `searchParams.prompt` on the new-entry route and use it only as initial editor content. Publishing continues through the existing journal action and 24-hour rule.

- [ ] **Step 5: Verify existing future journal behavior**

Run:

```powershell
npm test -- src/features/journal src/app/'(app)'/journal
npm run lint
git add src/features/journal src/app/'(app)'/journal
git commit -m "feat: refine journal and future journal workspace"
```

Expected: current open-time, notification, comment and edit-window tests remain green.

### Task 7: Recompose Home, Calendar, and Settings

**Files:**
- Create: `src/features/home/repository.ts`
- Create: `src/features/home/repository.test.ts`
- Create: `src/features/home/components/QuickMood.tsx`
- Create: `src/features/home/components/HomeOverview.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/features/calendar/actions.ts`
- Modify: `src/features/calendar/actions.test.ts`
- Modify: `src/app/(app)/calendar/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/features/profile/components/ProfileForm.tsx`

**Interfaces:**
- Consumes: mood action, memory repository, calendar state, future diary status, profiles.
- Produces: one homepage view model and expanded `CalendarEventInput`:

```ts
type CalendarEventInput = {
  name: string;
  eventDate: string;
  endDate?: string;
  eventType: CalendarMemoryType;
  recurrence: "none" | "monthly" | "yearly";
  isImportant: boolean;
  description?: string;
  color: "rose" | "gold" | "blue" | "green" | "purple";
};
```

- [ ] **Step 1: Write homepage and calendar action tests**

Test empty/paired home states, newest memory/upcoming event ordering, six event types, and `isImportant` forwarding.

- [ ] **Step 2: Run and confirm failures**

Run: `npm test -- src/features/home src/features/calendar/actions.test.ts`

- [ ] **Step 3: Implement the homepage query boundary**

Fetch independent resources in `Promise.all`, return serializable data, and keep all empty states valid when no partner, moods, memories, or events exist.

- [ ] **Step 4: Build the CoupleOS homepage**

Order: greeting/site name, partner status, quick Mood, together/partner/moments summary, profile banner, recent Memories, upcoming events, then shortcuts. Do not show birthday-specific content.

- [ ] **Step 5: Extend calendar actions and UI**

Forward event type, optional end date/description, and important flag through an additive RPC replacement. Render monthly grid on desktop/tablet and a compact agenda-friendly form on 375px. Preserve existing recurring-event behavior and in-app notifications.

- [ ] **Step 6: Expand settings**

Group profile, partner connection (read-only status), theme preference, shared site name, account sign-out, and app information. Destructive account deletion remains absent unless an already-secure existing action is found and explicitly approved.

- [ ] **Step 7: Verify and commit**

Run:

```powershell
npm test -- src/features/home src/features/calendar src/features/profile
npm run lint
git add src/app/'(app)' src/features/home src/features/calendar src/features/profile
git commit -m "feat: complete core CoupleOS page structure"
```

### Task 8: Three-Viewport Release Verification

**Files:**
- Create: `tests/e2e/responsive-core.spec.ts`
- Modify: `scripts/playwright-e2e-config.ts`
- Modify: `scripts/playwright-e2e-config.test.ts`
- Modify: `docs/operations/deployment-checklist.md`

**Interfaces:**
- Consumes: seeded two-user account flow and all prior tasks.
- Produces: repeatable release gate for 375×812, 768×1024, and 1440×900.

- [ ] **Step 1: Define three named Playwright projects**

Use `mobile-375`, `tablet-768`, and `desktop-1440`, each with the exact viewport above. Do not emulate a native app; these are responsive browser checks.

- [ ] **Step 2: Write the core journey**

For each project:

```ts
test("private couple core journey", async ({ page }) => {
  // login
  // submit a <=15 grapheme mood
  // verify it appears in Memories
  // create a journal and verify it does not appear in Memories
  // create an independent memory and verify its timeline card
  // create a calendar todo with important=false and verify exclusion
  // create an important calendar item and verify inclusion
  // open Journal/Future Journal tabs
  // assert bottom navigation and no horizontal overflow
});
```

Use unique timestamped titles and delete only data created by the test through supported product actions; never truncate shared tables.

- [ ] **Step 3: Run unit, lint, build and E2E gates**

Run:

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
```

Expected: all commands exit 0.

- [ ] **Step 4: Perform screenshot comparison**

Capture Home, Memories, Journal, Calendar, Settings and login at all three widths. Compare hierarchy, spacing, active navigation, modal containment, empty states, and touch targets against the supplied CoupleOS references; do not copy trademarks or exact proprietary copy.

- [ ] **Step 5: Update the deployment checklist**

Mark as required: migration applied to staging, RLS smoke checks with both users, private image signed URLs, no registration route, all three viewport journeys, and rollback by reverting application deployment (not by deleting data).

- [ ] **Step 6: Final commit**

```powershell
git add tests/e2e scripts docs/operations/deployment-checklist.md
git commit -m "test: gate CoupleOS core release across three viewports"
```

## Deferred Follow-Up Plans

These are deliberately outside the 2026-07-30 core gate and require separate implementation plans after the core version is stable:

1. richer independent Memory detail editing, albums, multi-image support, and advanced filters;
2. calendar event detail/edit/delete flows beyond the core create-and-view path;
3. notification preference controls and richer notification inbox;
4. native iOS wrapper/App Store work;
5. visual polish experiments beyond the approved CoupleOS-inspired system.

## Self-Review

- Spec coverage: core plan covers responsive shell, login, home, Mood, independent Memory, corrected Memories aggregation, Journal/Future Journal, Calendar, Settings, RLS, private images and release verification.
- Explicit exclusions: no Journal/Future Journal aggregation, no registration/invite/share/download/AI, and no birthday-specific feature.
- Data safety: all schema work is additive; no task contains table deletion, truncation, reset, or destructive rollback.
- Placeholder scan: every implementation and verification step contains concrete files, contracts, commands, and expected results.
- Type consistency: `CalendarMemoryType`, `MemoryFeedKind`, `CalendarEventInput`, unified mood content and 24-hour mutation contract are named once and reused consistently.
