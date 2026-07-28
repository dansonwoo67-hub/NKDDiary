"use client";

import { useState, useTransition } from "react";
import { ImagePicker } from "@/features/media/ImagePicker";
import { createMemoryAction } from "@/features/memories/actions";

const BODY_LIMIT = 150;

export function MemoryComposer({ today }: { today: string }) {
  const [image, setImage] = useState<Blob | null>(null);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (image) formData.set("image", image, "memory.webp");

    startTransition(async () => {
      const result = await createMemoryAction(formData);
      setIsError(!result.ok);
      setMessage(result.message);
      if (result.ok) {
        form.reset();
        setBody("");
        setImage(null);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <label className="text-sm font-medium">
        回忆标题 <span className="font-normal text-[var(--muted-ink)]">（可选）</span>
        <input name="title" maxLength={30} className="cos-input mt-2 px-4" aria-label="回忆标题" placeholder="给这段记忆起个名字" />
      </label>
      <label className="text-sm font-medium">
        日期
        <input name="occurredOn" type="date" required defaultValue={today} className="cos-input mt-2 px-4" />
      </label>
      <label className="text-sm font-medium">
        回忆正文
        <textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={BODY_LIMIT}
          rows={5}
          required
          className="cos-input mt-2 px-4 py-3"
          aria-label="回忆描述"
          placeholder="把这一小段故事留在树上…"
        />
        <span className="mt-1 flex justify-between gap-3 text-xs text-[var(--muted-ink)]">
          <span>短短写下，刚好够以后想起。</span>
          <span>{body.length} / {BODY_LIMIT}</span>
        </span>
      </label>
      <ImagePicker value={image} onChange={setImage} disabled={isPending} />
      {message ? (
        <p role={isError ? "alert" : "status"} className="rounded-xl bg-white/70 px-4 py-3 text-sm text-[var(--muted-ink)]">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={isPending || body.trim().length === 0} className="cos-button-primary px-5">
        {isPending ? "正在收藏…" : "保存回忆"}
      </button>
    </form>
  );
}
