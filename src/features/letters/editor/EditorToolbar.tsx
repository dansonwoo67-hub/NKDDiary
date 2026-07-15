"use client";

import type { Editor } from "@tiptap/react";
import { Bold, ImagePlus, Italic, List, ListOrdered } from "lucide-react";
import type { ReactNode } from "react";

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={typeof active === "boolean" ? active : undefined}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-[rgb(71_56_45_/_12%)] bg-white/65 px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-[rgb(152_74_79_/_55%)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#984a4f] disabled:cursor-not-allowed disabled:opacity-45 data-[active=true]:border-[rgb(152_74_79_/_65%)] data-[active=true]:bg-[rgb(229_139_143_/_18%)] motion-reduce:transition-none"
      data-active={active === true}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export function EditorToolbar({
  editor,
  readOnly,
  onRequestImage,
  imageUploadControl,
}: {
  editor: Editor | null;
  readOnly: boolean;
  onRequestImage?: () => void;
  imageUploadControl?: ReactNode;
}) {
  const disabled = readOnly || !editor;

  return (
    <div
      role="toolbar"
      aria-label="信纸格式工具"
      className="flex max-w-full gap-2 overflow-x-auto border-b border-[rgb(71_56_45_/_10%)] px-3 py-3 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible sm:px-5"
    >
      <ToolbarButton
        label="加粗"
        active={editor?.isActive("bold") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="斜体"
        active={editor?.isActive("italic") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="无序列表"
        active={editor?.isActive("bulletList") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="有序列表"
        active={editor?.isActive("orderedList") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered aria-hidden="true" className="h-4 w-4" />
      </ToolbarButton>
      {imageUploadControl ? imageUploadControl : onRequestImage ? (
        <ToolbarButton
          label="插入图片"
          active={undefined}
          disabled={disabled}
          onClick={onRequestImage}
        >
          <ImagePlus aria-hidden="true" className="h-4 w-4" />
        </ToolbarButton>
      ) : null}
    </div>
  );
}
