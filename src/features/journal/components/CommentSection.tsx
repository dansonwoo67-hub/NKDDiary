"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Edit3, Trash2, EyeOff, Send } from "lucide-react";
import { 
  createCommentAction, 
  updateCommentAction, 
  withdrawCommentAction, 
  deleteCommentAction 
} from "@/features/journal/comment-actions";

type CommentProfile = {
  display_name: string | null;
  avatar_url: string | null;
};

type CommentItem = {
  id: string;
  entry_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  editable_until: string | null;
  withdrawn_at: string | null;
  profiles: CommentProfile | CommentProfile[] | null;
};

type Props = {
  entryId: string;
  initialComments: CommentItem[];
  userId: string;
};

function getProfileName(profile: CommentProfile | CommentProfile[] | null): string {
  if (!profile) return "匿名";
  if (Array.isArray(profile)) return profile[0]?.display_name || "匿名";
  return profile.display_name || "匿名";
}

function isEditable(comment: CommentItem): boolean {
  if (!comment.editable_until) return false;
  if (comment.withdrawn_at) return false;
  return new Date(comment.editable_until) > new Date();
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function CommentSection({ entryId, initialComments, userId }: Props) {
  const [comments, setComments] = useState<CommentItem[]>(initialComments || []);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Browser-only deep-linking starts after hydration so SSR stays deterministic.
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/^#comment-([^/]+)$/);
    if (match) {
      const targetId = match[1];
      const highlightTimer = setTimeout(() => {
        setHighlightedId(targetId);
      }, 0);

      // Scroll to the comment
      const scrollTimer = setTimeout(() => {
        const element = document.getElementById(`comment-${targetId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);

      // Remove highlight after 2 seconds
      const timer = setTimeout(() => {
        setHighlightedId(null);
      }, 2000);

      return () => {
        clearTimeout(highlightTimer);
        clearTimeout(scrollTimer);
        clearTimeout(timer);
      };
    }
  }, []);

  const topLevelComments = comments.filter(c => !c.parent_id);
  const repliesByParent = comments.reduce<Record<string, CommentItem[]>>((acc, c) => {
    if (c.parent_id) {
      if (!acc[c.parent_id]) acc[c.parent_id] = [];
      acc[c.parent_id].push(c);
    }
    return acc;
  }, {});

  const totalCount = comments.length;

  const handleSubmit = async () => {
    const body = replyTo ? newComment.trim() : newComment.trim();
    if (!body || body.length > 200 || submitting) return;

    setSubmitting(true);
    try {
      const res = await createCommentAction(
        entryId, 
        body, 
        replyTo?.id || null
      );
      
      if (res.ok) {
        setNewComment("");
        setReplyTo(null);
        if (res.data && typeof res.data === "object") {
          const newC = res.data as CommentItem;
          setComments(prev => [...prev, {
            ...newC,
            profiles: { display_name: "我", avatar_url: null }
          }]);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    const body = editText.trim();
    if (!body || body.length > 200) return;

    try {
      const res = await updateCommentAction(id, body);
      if (res.ok) {
        setComments(prev => prev.map(c => 
          c.id === id ? { ...c, body, updated_at: new Date().toISOString() } : c
        ));
        setEditingId(null);
        setEditText("");
      }
    } catch {
      // error
    }
  };

  const handleWithdraw = async (id: string) => {
    try {
      const res = await withdrawCommentAction(id);
      if (res.ok) {
        setComments(prev => prev.map(c => 
          c.id === id ? { ...c, withdrawn_at: new Date().toISOString() } : c
        ));
      }
    } catch {
      // error
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteCommentAction(id);
      if (res.ok) {
        setComments(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
      }
    } catch {
      // error
    }
  };

  const startEdit = (comment: CommentItem) => {
    setEditingId(comment.id);
    setEditText(comment.body);
  };

  const startReply = (comment: CommentItem) => {
    setReplyTo({ 
      id: comment.id, 
      name: getProfileName(comment.profiles) 
    });
    setNewComment("");
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="cos-card rounded-[2rem] p-6 sm:p-8">
      <header className="flex items-center justify-between border-b border-black/5 pb-3">
        <h3 className="flex items-center gap-2 font-serif text-xl font-semibold">
          <MessageCircle size={18} />
          评论 <span className="text-base font-normal text-[var(--muted-ink)]">({totalCount})</span>
        </h3>
      </header>

      <div className="space-y-4 py-4 max-h-96 overflow-y-auto" ref={scrollRef}>
        {topLevelComments.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-ink)]">
            还没有评论，来说点什么吧～
          </p>
        ) : (
          topLevelComments.map(comment => (
            <div key={comment.id} className="space-y-3">
              <CommentItemView
                comment={comment}
                userId={userId}
                editable={isEditable(comment) && comment.author_id === userId}
                editing={editingId === comment.id}
                editText={editText}
                onEditTextChange={setEditText}
                onEdit={() => startEdit(comment)}
                onSave={() => handleUpdate(comment.id)}
                onCancelEdit={() => { setEditingId(null); setEditText(""); }}
                onWithdraw={() => handleWithdraw(comment.id)}
                onDelete={() => handleDelete(comment.id)}
                onReply={() => startReply(comment)}
                highlighted={highlightedId === comment.id}
              />
              
              {repliesByParent[comment.id]?.map(reply => (
                <div key={reply.id} className="ml-8 border-l-2 border-rose-100 pl-4">
                  <CommentItemView
                    comment={reply}
                    userId={userId}
                    editable={isEditable(reply) && reply.author_id === userId}
                    editing={editingId === reply.id}
                    editText={editText}
                    onEditTextChange={setEditText}
                    onEdit={() => startEdit(reply)}
                    onSave={() => handleUpdate(reply.id)}
                    onCancelEdit={() => { setEditingId(null); setEditText(""); }}
                    onWithdraw={() => handleWithdraw(reply.id)}
                    onDelete={() => handleDelete(reply.id)}
                    isReply
                    replyToName={getProfileName(comment.profiles)}
                    highlighted={highlightedId === reply.id}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-black/5 pt-4">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-[var(--muted-ink)]">
              回复 <span className="text-[var(--rose)]">{replyTo.name}</span>
            </span>
            <button
              type="button"
              onClick={() => { setReplyTo(null); setNewComment(""); }}
              className="text-xs text-[var(--muted-ink)] hover:text-[var(--ink)]"
            >
              取消回复
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value.slice(0, 200))}
            placeholder={replyTo ? "写下你的回复..." : "说点什么..."}
            className="flex-1 resize-none rounded-xl bg-white/60 px-3 py-2 text-sm outline-none focus:bg-white transition min-h-[60px]"
            rows={2}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!newComment.trim() || submitting || newComment.length > 200}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ink)] text-white transition hover:opacity-90 disabled:opacity-30"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-1 text-right text-xs text-[var(--muted-ink)]">
          {newComment.length} / 200
        </div>
      </div>
    </section>
  );
}

function CommentItemView({
  comment,
  userId,
  editable,
  editing,
  editText,
  onEditTextChange,
  onEdit,
  onSave,
  onCancelEdit,
  onWithdraw,
  onDelete,
  onReply,
  isReply,
  replyToName,
  highlighted,
}: {
  comment: CommentItem;
  userId: string;
  editable: boolean;
  editing: boolean;
  editText: string;
  onEditTextChange: (v: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onWithdraw: () => void;
  onDelete: () => void;
  onReply?: () => void;
  isReply?: boolean;
  replyToName?: string;
  highlighted?: boolean;
}) {
  const isAuthor = comment.author_id === userId;
  const isWithdrawn = !!comment.withdrawn_at;

  return (
    <div 
      className={`group transition-all duration-300 ${highlighted ? "bg-rose-50/50 rounded-xl p-2 -mx-2" : ""}`}
      id={`comment-${comment.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-[var(--rose)]">
          {getProfileName(comment.profiles).charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink)]">
              {getProfileName(comment.profiles)}
            </span>
            {isReply && replyToName && (
              <span className="text-xs text-[var(--muted-ink)]">
                回复 <span className="text-[var(--rose)]">{replyToName}</span>
              </span>
            )}
            <span className="text-xs text-[var(--muted-ink)]">
              {formatTime(comment.created_at)}
            </span>
          </div>

          {isWithdrawn ? (
            <p className="mt-1 text-sm italic text-[var(--muted-ink)]">
              {isReply ? "这条回复已撤回" : "这条评论已撤回"}
            </p>
          ) : editing ? (
            <div className="mt-1 space-y-2">
              <textarea
                value={editText}
                onChange={e => onEditTextChange(e.target.value.slice(0, 200))}
                className="w-full resize-none rounded-xl bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rose)]/30"
                rows={2}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!editText.trim() || editText.length > 200}
                  className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs text-white disabled:opacity-30"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="rounded-full bg-white px-3 py-1 text-xs text-[var(--muted-ink)]"
                >
                  取消
                </button>
                <span className="ml-auto text-xs text-[var(--muted-ink)]">
                  {editText.length} / 200
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-1 break-words text-sm text-[var(--ink)]">
              {comment.body}
            </p>
          )}

          {!isWithdrawn && !editing && (
            <div className="mt-1 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition">
              {!isReply && onReply && (
                <button
                  type="button"
                  onClick={onReply}
                  className="text-xs text-[var(--muted-ink)] hover:text-[var(--rose)]"
                >
                  回复
                </button>
              )}
              {editable && isAuthor && (
                <>
                  <button
                    type="button"
                    onClick={onEdit}
                    className="text-xs text-[var(--muted-ink)] hover:text-[var(--ink)] flex items-center gap-0.5"
                  >
                    <Edit3 size={12} /> 编辑
                  </button>
                  <button
                    type="button"
                    onClick={onWithdraw}
                    className="text-xs text-[var(--muted-ink)] hover:text-amber-600 flex items-center gap-0.5"
                  >
                    <EyeOff size={12} /> 撤回
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="text-xs text-[var(--muted-ink)] hover:text-red-600 flex items-center gap-0.5"
                  >
                    <Trash2 size={12} /> 删除
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
