import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  deletePrivateLetterAction,
  getOwnLetterSnapshotAction,
  returnScheduledToDraftAction,
  scheduleLetterAction,
  withdrawPublishedLetterAction,
} from "@/features/letters/actions";
import { removeBookmarkAction } from "@/features/bookmarks/actions";
import { formatShanghaiDateTimeLocal, shanghaiInputToIso } from "@/features/personal-center/datetime";

function idFrom(formData: FormData) {
  return String(formData.get("id") ?? "");
}

function versionFrom(formData: FormData) {
  return Number(formData.get("version") ?? 0);
}

async function withdrawLetter(formData: FormData) {
  "use server";
  await withdrawPublishedLetterAction({ id: idFrom(formData), version: versionFrom(formData) });
  revalidatePath("/me");
  revalidatePath("/me/letters");
}

async function deletePrivateLetter(formData: FormData) {
  "use server";
  await deletePrivateLetterAction({ id: idFrom(formData), version: versionFrom(formData) });
  revalidatePath("/me");
  revalidatePath("/me/drafts");
  revalidatePath("/me/future");
}

async function returnFutureToDraft(formData: FormData) {
  "use server";
  await returnScheduledToDraftAction({ id: idFrom(formData), version: versionFrom(formData) });
  revalidatePath("/me");
  revalidatePath("/me/drafts");
  revalidatePath("/me/future");
}

async function rescheduleFutureLetter(formData: FormData) {
  "use server";
  const id = idFrom(formData);
  const snapshot = await getOwnLetterSnapshotAction(id);
  if (!snapshot.ok || snapshot.letter.kind !== "time_capsule") return;
  const letter = snapshot.letter;
  await scheduleLetterAction({
    id,
    version: letter.version,
    kind: "time_capsule",
    letterDate: letter.letterDate,
    salutation: letter.salutation ?? "",
    bodyJson: letter.bodyJson ?? { type: "doc", content: [] },
    bodyText: letter.bodyText ?? "",
    sevenCharLine: letter.sevenCharLine ?? "",
    sliders: letter.sliders,
    scheduledFor: shanghaiInputToIso(String(formData.get("scheduledFor") ?? "")),
  });
  revalidatePath("/me");
  revalidatePath("/me/future");
}

async function removeBookmark(formData: FormData) {
  "use server";
  await removeBookmarkAction({ bookmarkId: idFrom(formData) });
  revalidatePath("/me");
  revalidatePath("/me/bookmarks");
}

function HiddenLetterFields({ id, version }: { id: string; version: number }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
    </>
  );
}

const buttonClass = "rounded-full bg-white/70 px-3 py-2 text-sm text-[var(--ink)] transition hover:bg-white";

export function PublishedLetterActions({ id, version, href, canWithdraw }: { id: string; version: number; href: string; canWithdraw: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href={href} className={buttonClass}>查看原文</Link>
      {canWithdraw ? (
        <form action={withdrawLetter}>
          <HiddenLetterFields id={id} version={version} />
          <button type="submit" className="rounded-full bg-[var(--ink)] px-3 py-2 text-sm text-white">24小时内撤回</button>
        </form>
      ) : null}
    </div>
  );
}

export function DraftLetterActions({ id, version }: { id: string; version: number }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href={`/write/${id}`} className={buttonClass}>继续写</Link>
      <form action={deletePrivateLetter}>
        <HiddenLetterFields id={id} version={version} />
        <button type="submit" className={buttonClass}>删除草稿</button>
      </form>
    </div>
  );
}

export function FutureLetterActions({ id, version, scheduledFor }: { id: string; version: number; scheduledFor: string }) {
  const localValue = formatShanghaiDateTimeLocal(scheduledFor);
  return (
    <div className="mt-4 flex flex-col gap-3">
      <form action={rescheduleFutureLetter} className="flex flex-wrap items-center gap-2">
        <HiddenLetterFields id={id} version={version} />
        <input
          name="scheduledFor"
          type="datetime-local"
          defaultValue={localValue}
          className="min-h-10 rounded-full border border-[rgb(71_56_45_/_16%)] bg-white/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose)]"
        />
        <button type="submit" className={buttonClass}>改期</button>
      </form>
      <div className="flex flex-wrap gap-2">
        <form action={returnFutureToDraft}>
          <HiddenLetterFields id={id} version={version} />
          <button type="submit" className={buttonClass}>退回草稿箱</button>
        </form>
        <form action={deletePrivateLetter}>
          <HiddenLetterFields id={id} version={version} />
          <button type="submit" className={buttonClass}>删除</button>
        </form>
      </div>
    </div>
  );
}

export function BookmarkActions({ id, href }: { id: string; href: string | null }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {href ? <Link href={href} className={buttonClass}>查看原文</Link> : null}
      <form action={removeBookmark}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className={buttonClass}>取消收藏</button>
      </form>
    </div>
  );
}
