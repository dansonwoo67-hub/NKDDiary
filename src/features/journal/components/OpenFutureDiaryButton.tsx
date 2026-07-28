"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openFutureDiaryAction } from "@/features/journal/actions";

export function OpenFutureDiaryButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    if (!window.confirm("确定现在开启这颗时间胶囊吗？开启后内容将对你可见。")) return;
    startTransition(async () => {
      try {
        const result = await openFutureDiaryAction(entryId);
        setMessage(result.message);
        setIsError(!result.ok);
        if (result.ok) router.refresh();
      } catch {
        setMessage("胶囊暂时无法开启，请稍后再试。");
        setIsError(true);
      }
    });
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleOpen}
        disabled={isPending}
        className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "正在开启…" : "开启胶囊"}
      </button>
      {message ? (
        <p className="mt-3 text-sm text-[var(--muted-ink)]" role={isError ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
