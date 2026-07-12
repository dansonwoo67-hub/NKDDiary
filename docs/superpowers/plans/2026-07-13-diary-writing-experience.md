# Draft-First Rich-Text Writing Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved centered entry flow, one-question-at-a-time daily ritual, time-capsule scheduling, salutation step, minimizable/fullscreen rich-text paper, image upload, and reliable autosave.

**Architecture:** A client-side writing state machine owns the modal steps and persists only through typed server actions from Plan 1. TipTap stores structured JSON with stable block IDs and plain text. Draft autosave uses debouncing, optimistic version checks, and a local-storage recovery copy; image assets are compressed and uploaded separately to private Supabase Storage.

**Tech Stack:** React 19, Next.js App Router, TipTap, Supabase Storage, Zod, Vitest, Testing Library, Playwright

## Global Constraints

- User-visible copy is “总而言之，我想跟你说”; never show “今日七字信”.
- Salutation and final line are each limited to 7 characters.
- Daily letters use the three questions; time capsules skip them.
- Remove event creation from every writing component.

---

### Task 1: Add the writing state machine

**Files:**
- Create: `src/features/letters/editor/editor-machine.ts`
- Create: `src/features/letters/editor/editor-machine.test.ts`
- Create: `src/features/letters/editor/types.ts`

**Interfaces:**
- Produces: `EditorStep = entry | schedule | mood | meal | health | salutation | compose | finalLine | sent`, `EditorEvent`, and `reduceEditorState(state, event)`.

- [ ] **Step 1: Write failing transition tests**

```ts
it("routes daily letters through all three questions", () => {
  let state = initialEditorState("2026-07-13");
  state = reduceEditorState(state, { type: "CHOOSE_DAILY" });
  expect(state.step).toBe("mood");
  state = reduceEditorState(state, { type: "ANSWER", value: 4 });
  expect(state.step).toBe("meal");
});

it("routes future letters directly to salutation after scheduling", () => {
  let state = reduceEditorState(initialEditorState("2026-07-13"), { type: "CHOOSE_TIME_CAPSULE" });
  state = reduceEditorState(state, { type: "SET_SCHEDULE", value: "2026-08-01T08:30:00+08:00" });
  expect(state.step).toBe("salutation");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/letters/editor/editor-machine.test.ts`  
Expected: FAIL because the state machine is absent.

- [ ] **Step 3: Implement exhaustive transitions**

Use a discriminated union and an `assertNever` default. Reject past schedule values and reject `OPEN_COMPOSER` until salutation is 1–7 characters.

- [ ] **Step 4: Verify tests pass and commit**

Run: `npm test -- src/features/letters/editor/editor-machine.test.ts`  
Expected: PASS.

```powershell
git add src/features/letters/editor
git commit -m "feat: define guided writing flow"
```

### Task 2: Build the centered entry and one-question modal

**Files:**
- Create: `src/features/letters/editor/LetterEntryModal.tsx`
- Create: `src/features/letters/editor/QuestionStep.tsx`
- Create: `src/features/letters/editor/SalutationStep.tsx`
- Create: `src/features/letters/editor/ScheduleStep.tsx`
- Create: `src/features/letters/editor/LetterEntryModal.test.tsx`
- Modify: `src/app/(app)/page.tsx`
- Replace: `src/app/(app)/write/page.tsx`

**Interfaces:**
- Consumes: `reduceEditorState` and Plan 1 draft actions.
- Produces: `LetterEntryModal({ today, initialDraft })`.

- [ ] **Step 1: Write interaction tests**

```tsx
render(<LetterEntryModal today="2026-07-13" initialDraft={null} />);
await user.click(screen.getByRole("button", { name: "写今日日记" }));
expect(screen.getByText("今天的小狗心情？")).toBeVisible();

await user.click(screen.getByRole("button", { name: "写给未来" }));
expect(screen.getByLabelText("送达日期")).toHaveAttribute("min", "2026-07-14");
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/letters/editor/LetterEntryModal.test.tsx`  
Expected: FAIL because components are absent.

- [ ] **Step 3: Implement the approved A flow**

The overlay uses `role="dialog"`, traps focus, closes only through an explicit close control, and restores focus to the homepage write button. Question confirmation advances within the same dialog without navigation or full-page refresh.

- [ ] **Step 4: Remove the event entry point**

Delete `EventDialog` imports and rendering from the writing route and old `LetterEditor`.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/features/letters/editor/LetterEntryModal.test.tsx`  
Expected: PASS.

```powershell
git add src/features/letters/editor src/app/(app)/page.tsx src/app/(app)/write/page.tsx src/features/letters/components/LetterEditor.tsx
git commit -m "feat: add modal writing ritual"
```

### Task 3: Add TipTap paper editor and stable block IDs

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/letters/editor/RichLetterEditor.tsx`
- Create: `src/features/letters/editor/EditorToolbar.tsx`
- Create: `src/features/letters/editor/block-ids.ts`
- Create: `src/features/letters/editor/block-ids.test.ts`

**Interfaces:**
- Produces: `RichLetterDocument`, `ensureStableBlockIds(json)`, and `RichLetterEditor({ value, onChange, mode })`.

- [ ] **Step 1: Install only required editor packages**

Run:

```powershell
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-placeholder
```

- [ ] **Step 2: Write block-ID tests**

```ts
it("keeps existing block ids and fills missing ids", () => {
  const first = ensureStableBlockIds(docFixture);
  const second = ensureStableBlockIds(first);
  expect(second).toEqual(first);
  expect(first.content.every((node) => typeof node.attrs.blockId === "string")).toBe(true);
});
```

- [ ] **Step 3: Implement the editor extensions and toolbar**

Toolbar commands must be explicit:

```ts
editor.chain().focus().toggleBold().run();
editor.chain().focus().toggleItalic().run();
editor.chain().focus().toggleBulletList().run();
editor.chain().focus().toggleOrderedList().run();
```

Expose toolbar buttons with `aria-pressed` and Chinese labels. Store JSON plus `editor.getText({ blockSeparator: "\n" })`.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/letters/editor/block-ids.test.ts && npm run lint`  
Expected: PASS and exit 0.

```powershell
git add package.json package-lock.json src/features/letters/editor
git commit -m "feat: add rich letter paper editor"
```

### Task 4: Implement resilient autosave and window states

**Files:**
- Create: `src/features/letters/editor/useDraftAutosave.ts`
- Create: `src/features/letters/editor/useDraftAutosave.test.tsx`
- Create: `src/features/letters/editor/LetterPaperWindow.tsx`
- Modify: `src/features/letters/editor/RichLetterEditor.tsx`

**Interfaces:**
- Produces: `AutosaveState = idle | saving | saved | offline | conflict`, `flush()`, and `LetterPaperWindow` with normal/minimized/fullscreen modes.

- [ ] **Step 1: Write fake-timer autosave tests**

```ts
vi.useFakeTimers();
const save = vi.fn().mockResolvedValue({ ok: true, version: 2 });
const { result } = renderHook(() => useDraftAutosave({ draft, save, delayMs: 1000 }));
act(() => result.current.update({ ...draft, bodyText: "new" }));
await vi.advanceTimersByTimeAsync(999);
expect(save).not.toHaveBeenCalled();
await vi.advanceTimersByTimeAsync(1);
expect(save).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Implement debounce, local recovery, and version conflicts**

Store recovery data under `nkd-diary:draft:<letterId-or-new>`. Clear it only after a confirmed server save. On `VERSION_CONFLICT`, stop automatic retries and show a refresh/recover decision.

- [ ] **Step 3: Implement minimize and fullscreen**

Minimize keeps the component mounted and renders a fixed “继续写信” bar. Fullscreen uses a portal-level fixed container and restores the preceding mode on exit. Call `flush()` before close, publish, schedule, or tab unload.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/letters/editor/useDraftAutosave.test.tsx`  
Expected: PASS.

```powershell
git add src/features/letters/editor
git commit -m "feat: add resilient letter autosave"
```

### Task 5: Add compressed private image upload

**Files:**
- Create: `src/features/letters/editor/image-compression.ts`
- Create: `src/features/letters/editor/image-compression.test.ts`
- Create: `src/features/letters/editor/image-actions.ts`
- Create: `src/features/letters/editor/ImageUploadButton.tsx`
- Modify: `src/features/letters/editor/RichLetterEditor.tsx`

**Interfaces:**
- Produces: `compressLetterImage(file, maxEdge = 2000, quality = 0.82)`, `createLetterImageUploadAction`, and `completeLetterImageUploadAction`.

- [ ] **Step 1: Test validation before browser compression**

```ts
expect(validateLetterImage(new File(["x"], "x.gif", { type: "image/gif" })).ok).toBe(false);
expect(validateLetterImage(new File([new Uint8Array(6_000_000)], "x.jpg", { type: "image/jpeg" })).ok).toBe(false);
```

- [ ] **Step 2: Implement compression and private upload path**

Use path `${userId}/${letterId}/${crypto.randomUUID()}.webp`. Server actions verify the letter is the caller's `draft` or `scheduled` letter before returning a signed upload URL or marking an asset ready.

- [ ] **Step 3: Insert image nodes only after upload success**

```ts
editor.chain().focus().setImage({ src: signedReadUrl, alt: "信中图片" }).run();
```

Render failed uploads as retryable local placeholders; do not discard text changes.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/letters/editor/image-compression.test.ts && npm run build`  
Expected: PASS and build exit 0.

```powershell
git add src/features/letters/editor
git commit -m "feat: support private letter images"
```

### Task 6: Wire final line, publish/schedule confirmation, and E2E coverage

**Files:**
- Create: `src/features/letters/editor/FinalLineStep.tsx`
- Create: `src/features/letters/editor/PublishConfirmation.tsx`
- Modify: `tests/e2e/couple-diary.spec.ts`
- Modify: `scripts/run-playwright-e2e.ts`

**Interfaces:**
- Consumes: Plan 1 publish/schedule actions and all editor components.

- [ ] **Step 1: Add E2E cases**

```ts
await page.getByRole("button", { name: "写今日日记" }).click();
// complete three questions and salutation
await page.getByLabel("总而言之，我想跟你说").fill("平安到家");
await page.getByRole("button", { name: "寄出" }).click();
await expect(page.getByText("已经寄出，不能再修改")).toBeVisible();
```

Add a second case that schedules a future letter and verifies it appears only in the author's “给未来” list.

- [ ] **Step 2: Implement publish confirmations**

Daily copy: “寄出后不能修改，24小时内可以撤回。”  
Scheduled copy: “将在 {Asia/Shanghai date time} 自动送达，送达前可以撤回或退回草稿箱。”

- [ ] **Step 3: Run the writing suite**

Run: `npm test && npm run lint && npm run build && npm run test:e2e`  
Expected: all configured tests pass; credential-dependent E2E scenarios may skip only when test account variables are absent.

- [ ] **Step 4: Commit**

```powershell
git add src/features/letters/editor tests/e2e/couple-diary.spec.ts scripts/run-playwright-e2e.ts
git commit -m "feat: complete draft-first writing experience"
```

