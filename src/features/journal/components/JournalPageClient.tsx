"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Mail, Star, Trash2, Edit3, Clock, Lock, Sparkles, Calendar } from "lucide-react";
import { RichLetterComposer } from "./RichLetterComposer";
import { EnvelopeLetterCard } from "./EnvelopeLetterCard";
import { deleteDraftAction } from "@/features/journal/draft-actions";
import type { LetterListItem } from "../letter-repository";
import type { LetterDraft } from "../draft-repository";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Category = "all" | "inbox" | "sent" | "starred";

type Boxes = {
  sent: LetterListItem[];
  inbox: LetterListItem[];
  starred: LetterListItem[];
};

type Props = {
  boxes: Boxes;
  partnerId: string;
  partnerName: string;
  userId: string;
  draft: LetterDraft | null;
  unreadLetterIds: string[];
  defaultBox?: string;
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

export function JournalPageClient({ boxes, partnerId, partnerName, userId, draft, unreadLetterIds, defaultBox }: Props) {
  const router = useRouter();
  const [showComposer, setShowComposer] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>((defaultBox as Category) || "all");
  const [unreadIds, setUnreadIds] = useState<Set<string>>(
    () => new Set(unreadLetterIds),
  );
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

  const allLetters = useMemo(() => {
    // Deduplicate by id: a letter should appear once even if it somehow
    // ends up in both inbox and sent arrays.
    const seen = new Set<string>();
    const all = [...boxes.inbox, ...boxes.sent].filter((x) => {
      if (seen.has(x.id)) return false;
      seen.add(x.id);
      return true;
    });
    return all.sort((a, b) =>
      new Date(b.publishedAt ?? b.createdAt).getTime() -
      new Date(a.publishedAt ?? a.createdAt).getTime()
    );
  }, [boxes.inbox, boxes.sent]);

  const filteredList = useMemo(() => {
    switch (activeCategory) {
      case "all":
        return allLetters;
      case "inbox":
        return boxes.inbox;
      case "sent":
        return boxes.sent;
      case "starred":
        return boxes.starred;
      default:
        return allLetters;
    }
  }, [activeCategory, allLetters, boxes]);

  const unreadLetters = useMemo(() => {
    return boxes.inbox.filter(x => unreadIds.has(x.id));
  }, [boxes.inbox, unreadIds]);

  function handleOpenLetter(letterId: string) {
    setUnreadIds(prev => {
      const next = new Set(prev);
      next.delete(letterId);
      return next;
    });
    router.push(`/journal/${letterId}`);
  }

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

  const categoryLabels: Record<Category, string> = {
    all: "全部",
    inbox: "收信箱",
    sent: "已寄出",
    starred: "收藏夹",
  };

  const categoryCounts: Record<Category, number> = {
    all: allLetters.length,
    inbox: boxes.inbox.length,
    sent: boxes.sent.length,
    starred: boxes.starred.length,
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-[.22em] text-[var(--rose)]">JOURNAL LETTERS</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">我们的日记</h1>
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

      {unreadLetters.length > 0 && (
        <section className="flex flex-wrap gap-3">
          {unreadLetters.map(letter => (
            <button
              key={letter.id}
              type="button"
              onClick={() => handleOpenLetter(letter.id)}
              className="unread-envelope group relative flex h-16 w-16 items-center justify-center rounded-xl border-2 border-[var(--rose)] bg-white/80 shadow-md transition hover:-translate-y-1 hover:shadow-lg"
            >
              <Mail size={24} className="text-[var(--rose)]" />
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--rose)] text-[10px] font-bold text-white">
                {unreadLetters.indexOf(letter) + 1}
              </span>
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </section>
      )}

      <nav className="flex flex-wrap items-center gap-2" aria-label="日记信箱">
        {(["all", "inbox", "sent", "starred"] as Category[]).map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`journal-box-tab flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
              activeCategory === cat
                ? "bg-[var(--ink)] text-white shadow-lg"
                : "bg-white/70 text-[var(--muted-ink)] hover:bg-white/90"
            }`}
          >
            {cat === "all" && <Star size={14} />}
            {cat === "inbox" && <Mail size={14} />}
            {cat === "sent" && <Send size={14} />}
            {cat === "starred" && <Star size={14} fill="currentColor" />}
            {categoryLabels[cat]}
            <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs">
              {categoryCounts[cat]}
            </span>
          </button>
        ))}
      </nav>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold">
            {activeCategory === "all" ? "所有信件" : activeCategory === "inbox" ? "收到的信" : activeCategory === "sent" ? "寄出的信" : "收藏夹"}
          </h2>
        </div>
        {filteredList.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredList.map(letter => {
              const isSentByUser = letter.authorId === userId;
              return (
                <EnvelopeLetterCard
                  key={letter.id}
                  letter={letter}
                  mode={activeCategory === "inbox" ? "inbox" : activeCategory === "sent" ? "sent" : (isSentByUser ? "sent" : "inbox")}
                  personName={partnerName}
                  userId={userId}
                  isUnread={unreadIds.has(letter.id)}
                  onOpen={() => handleOpenLetter(letter.id)}
                />
              );
            })}
          </div>
        ) : (
          <div className="cos-card py-16 text-center text-sm text-[var(--muted-ink)]">
            {activeCategory === "all" ? "还没有任何信件。" : activeCategory === "inbox" ? "信箱里还安安静静的。" : activeCategory === "sent" ? "还没有寄出的信。" : "还没有收藏任何信件。"}
          </div>
        )}
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
