"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, Edit3, Clock, Lock, Sparkles, Calendar } from "lucide-react";
import { RichLetterComposer } from "./RichLetterComposer";
import { LetterThreadList } from "./LetterThreadList";
import { deleteDraftAction } from "@/features/journal/draft-actions";
import type { LetterThreadSummary } from "../thread-repository";
import type { LetterDraft } from "../draft-repository";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Props = {
  threads: LetterThreadSummary[];
  partnerId: string;
  partnerName: string;
  userId: string;
  draft: LetterDraft | null;
};

interface LetterLimitStatus {
  used_today: number;
  limit: number;
  remaining: number;
  is_limit_reached: boolean;
  reset_at: string;
}

const LOCAL_STORAGE_KEY_PREFIX = "nkddiary_letter_draft";
const CAPSULE_STORAGE_KEY_PREFIX = "nkddiary_capsule_draft";

interface LocalDraft {
  authorId?: string;
  recipientId?: string;
  html: string;
  text: string;
  plainText: string;
  stationeryTheme: string;
  moodEmoji: string;
  draftId?: string | null;
  updatedAt: string;
}

interface CapsuleLocalDraft {
  authorId?: string;
  recipientId?: string;
  html: string;
  text: string;
  stationeryTheme: string;
  moodEmoji: string;
  openAt: string;
  updatedAt: string;
}

function loadLocalDraftFromStorage(userId: string): LocalDraft | null {
  try {
    // Include userId in key to prevent cross-account draft leakage
    const key = `${LOCAL_STORAGE_KEY_PREFIX}_${userId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as LocalDraft;
      // Only return draft if it belongs to the current user
      if (parsed.text && parsed.text.trim().length > 0 && parsed.authorId === userId) {
        return parsed;
      }
      // Clear stale draft from a different user
      if (parsed.authorId && parsed.authorId !== userId) {
        localStorage.removeItem(key);
      }
    }
    // Also check and clean up the old keyless format
    const oldStored = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX);
    if (oldStored) {
      const oldParsed = JSON.parse(oldStored) as LocalDraft;
      if (oldParsed.authorId && oldParsed.authorId !== userId) {
        localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX);
      } else if (oldParsed.text && oldParsed.text.trim().length > 0 && oldParsed.authorId === userId) {
        // Migrate to new keyed format
        localStorage.setItem(key, oldStored);
        localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX);
        return oldParsed;
      }
    }
  } catch (error) {
    console.error("Failed to load draft from localStorage:", error);
  }
  return null;
}

function loadCapsuleDraftFromStorage(userId: string): CapsuleLocalDraft | null {
  try {
    const key = `${CAPSULE_STORAGE_KEY_PREFIX}_${userId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as CapsuleLocalDraft;
      if (parsed.text && parsed.text.trim().length > 0 && parsed.authorId === userId) {
        return parsed;
      }
      if (parsed.authorId && parsed.authorId !== userId) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error("Failed to load capsule draft from localStorage:", error);
  }
  return null;
}

function formatTime(dateString: string) {
  try {
    if (!dateString) return "未知时间";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString || "";
  }
}

function formatCountdown(resetAt: string): string {
  try {
    const target = new Date(resetAt);
    const now = new Date();
    const diff = target.getTime() - now.getTime();
    
    if (diff <= 0) return "已恢复";
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `还有 ${hours}小时${minutes}分钟恢复`;
    }
    return `还有 ${minutes}分钟恢复`;
  } catch {
    return "稍后恢复";
  }
}

export function JournalPageClient({ threads, partnerId, partnerName, userId, draft }: Props) {
  const router = useRouter();
  const [showComposer, setShowComposer] = useState(false);
  const [localDraft, setLocalDraft] = useState<LocalDraft | null>(null);
  const [capsuleDraft, setCapsuleDraft] = useState<CapsuleLocalDraft | null>(null);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [capsuleLimit, setCapsuleLimit] = useState<LetterLimitStatus | null>(null);
  const [countdown, setCountdown] = useState(() => {
    if (capsuleLimit?.is_limit_reached && capsuleLimit.reset_at) {
      return formatCountdown(capsuleLimit.reset_at);
    }
    return "";
  });
  const [limitsLoaded, setLimitsLoaded] = useState(false);

  // localStorage is browser-only. Restore account-scoped drafts after hydration
  // so the server and the client's first render always produce the same markup.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLocalDraft(loadLocalDraftFromStorage(userId));
      setCapsuleDraft(loadCapsuleDraftFromStorage(userId));
    });
    return () => {
      active = false;
    };
  }, [userId]);

  // 加载胶囊信额度状态（普通信无额度限制）
  useEffect(() => {
    async function loadLimits() {
      try {
        const capsuleRes = await createBrowserSupabaseClient().rpc("get_capsule_letter_limit_status");
        setCapsuleLimit(capsuleRes.data as LetterLimitStatus);
      } catch (error) {
        console.error("Failed to load letter limits:", error);
      } finally {
        setLimitsLoaded(true);
      }
    }
    loadLimits();
  }, []);

  // 倒计时更新（使用 functional update 避免 setState in effect）
  useEffect(() => {
    if (!capsuleLimit?.is_limit_reached) return;
    
    // 使用 ref 保存最新的 reset_at 以供 interval 回调使用
    const resetAtRef = { current: capsuleLimit.reset_at };
    
    const timer = setInterval(() => {
      if (resetAtRef.current) {
        setCountdown(formatCountdown(resetAtRef.current));
      }
    }, 60000);
    
    return () => clearInterval(timer);
  }, [capsuleLimit]);

  const handleOpenComposer = () => {
    setShowComposer(true);
  };

  const handleOpenCapsule = () => {
    router.push("/journal/future/new");
  };

  // 草稿保存后立即更新本地状态
  const handleDraftSaved = () => {
    const updatedDraft = loadLocalDraftFromStorage(userId);
    setLocalDraft(updatedDraft);
    // 刷新服务器数据以确保一致性
    router.refresh();
  };

  // 正式寄出成功后：立即清除草稿状态，无需刷新页面
  const handleSent = () => {
    setLocalDraft(null);
    localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_${userId}`);
    localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX);
    router.refresh();
  };

  const handleDeleteDraft = async () => {
    setDeletingDraft(true);
    try {
      await deleteDraftAction();
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_${userId}`);
      localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX);
      window.location.reload();
    } catch (error) {
      console.error("Failed to delete draft:", error);
    } finally {
      setDeletingDraft(false);
    }
  };

  const getDisplayDraft = useMemo(() => {
    // If we have a fresh local draft (just saved), prefer it over stale server data
    if (localDraft && localDraft.authorId === userId) {
      if (!draft) return localDraft;
      // Both exist - prefer the one with newer updatedAt
      const serverTime = new Date(draft.updatedAt).getTime();
      const localTime = new Date(localDraft.updatedAt).getTime();
      if (localTime > serverTime) return localDraft;
    }
    // Server draft is either newer or local draft doesn't exist
    if (draft) return draft;
    return null;
  }, [draft, localDraft, userId]);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-[.22em] text-[var(--rose)]">LETTERS</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">我们的信件</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenComposer}
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg transition bg-[var(--ink)] text-white hover:-translate-y-0.5"
          >
            <Send size={16} />
            {getDisplayDraft ? "继续写信" : "写一封信"}
          </button>
          <button
            type="button"
            onClick={handleOpenCapsule}
            disabled={limitsLoaded && capsuleLimit?.is_limit_reached}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg transition ${
              limitsLoaded && capsuleLimit?.is_limit_reached
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:-translate-y-0.5"
            }`}
          >
            <Sparkles size={16} />
            写胶囊信
          </button>
        </div>
      </header>

      {/* 胶囊信额度提示 */}
      {limitsLoaded && capsuleLimit?.is_limit_reached && (
        <section className="cos-card bg-gradient-to-r from-amber-50 to-orange-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-amber-600" />
              <span className="text-sm font-medium text-amber-800">今天的胶囊已经封存好啦，明天 00:00 后可以再写一封。</span>
            </div>
            {countdown && (
              <span className="text-xs text-amber-600">{countdown}</span>
            )}
          </div>
        </section>
      )}

      {getDisplayDraft && (
        <section className="cos-card bg-gradient-to-r from-rose-50 to-white p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--rose)]">未完成的信</span>
                {getDisplayDraft.moodEmoji && (
                  <span className="text-lg">{getDisplayDraft.moodEmoji}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--muted-ink)]">写给 {partnerName}</p>
              <p className="mt-1 line-clamp-1 text-sm text-[var(--ink)]">
                {getDisplayDraft.plainText?.slice(0, 20) || "..."}...
              </p>
              <div className="mt-2 flex items-center gap-1 text-xs text-[var(--muted-ink)]">
                <Clock size={12} />
                最后保存：{formatTime(getDisplayDraft.updatedAt || "")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenComposer}
                className="flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white transition hover:opacity-90"
              >
                <Edit3 size={14} />
                继续写
              </button>
              <button
                type="button"
                onClick={handleDeleteDraft}
                disabled={deletingDraft}
                className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm text-[var(--muted-ink)] hover:text-red-600 transition"
              >
                <Trash2 size={14} />
                {deletingDraft ? "删除中..." : "放弃草稿"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 胶囊信草稿 */}
      {capsuleDraft && (
        <section className="cos-card bg-gradient-to-r from-amber-50 to-orange-50 p-4 border border-orange-100">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-semibold text-orange-600">
                  <Sparkles size={12} />
                  未完成的胶囊信
                </span>
                {capsuleDraft.moodEmoji && (
                  <span className="text-lg">{capsuleDraft.moodEmoji}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--muted-ink)]">写给未来的 {partnerName}</p>
              <p className="mt-1 line-clamp-1 text-sm text-[var(--ink)]">
                {capsuleDraft.text?.slice(0, 20) || "..."}...
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs text-[var(--muted-ink)]">
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  计划开启：{formatTime(capsuleDraft.openAt || "")}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  最后保存：{formatTime(capsuleDraft.updatedAt || "")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenCapsule}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm text-white transition hover:opacity-90"
              >
                <Edit3 size={14} />
                继续写
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(`${CAPSULE_STORAGE_KEY_PREFIX}_${userId}`);
                  window.location.reload();
                }}
                className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm text-[var(--muted-ink)] hover:text-red-600 transition"
              >
                <Trash2 size={14} />
                放弃草稿
              </button>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold">往来信件</h2>
        </div>
        <LetterThreadList key={userId} accountId={userId} counterpartName={partnerName} threads={threads} />
      </section>

      {showComposer && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
          <div className="relative w-full sm:w-[min(1120px,calc(100vw-64px))] h-[calc(100vh-32px)] overflow-hidden sm:rounded-[32px] bg-white shadow-2xl flex flex-col">
            <button
              type="button"
              onClick={() => setShowComposer(false)}
              className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-lg text-[var(--muted-ink)] transition hover:text-[var(--ink)]"
            >
              ×
            </button>
            <RichLetterComposer
              recipientId={partnerId}
              recipientName={partnerName}
              initialHtml={draft?.richTextJson?.html || localDraft?.html || ""}
              initialText={draft?.plainText || localDraft?.text || ""}
              initialTheme={draft?.stationeryTheme || localDraft?.stationeryTheme || "cream"}
              initialMood={draft?.moodEmoji || localDraft?.moodEmoji || ""}
              initialDraftId={draft?.id || localDraft?.draftId || null}
              onClose={() => setShowComposer(false)}
              authorId={userId}
              onDraftSaved={handleDraftSaved}
              onSent={handleSent}
            />
          </div>
        </div>
      )}
    </div>
  );
}
