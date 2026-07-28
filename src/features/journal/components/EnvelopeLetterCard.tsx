"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, MailOpen, Star, MessageCircle, Sparkles } from "lucide-react";
import type { LetterListItem } from "@/features/journal/letter-repository";
import { toggleStarAction } from "@/features/journal/letter-actions";

const dt = new Intl.DateTimeFormat("zh-CN", { timeZone:"Asia/Shanghai", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false });

export function EnvelopeLetterCard({ 
  letter, 
  mode, 
  personName, 
  userId,
  isUnread,
  onOpen 
}: { 
  letter:LetterListItem; 
  mode:"sent"|"inbox"; 
  personName:string;
  userId:string;
  isUnread:boolean;
  onOpen?:()=>void;
}) {
  const [now, setNow] = useState(0);
  const [isStarred, setIsStarred] = useState(!!letter.starAt);
  
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);
  
  const unread = mode === "inbox" && isUnread;
  const Icon = unread ? Mail : MailOpen;
  
  const isSentByUser = letter.authorId === userId;
  const label = isSentByUser ? `寄给 ${personName}` : `来自 ${personName} 的信`;

  // 胶囊信标识：entryType = 'future'
  const isCapsule = letter.entryType === "future";
  
  const excerpt = letter.excerpt.length > 40 ? letter.excerpt.substring(0, 40) + "..." : letter.excerpt;

  async function handleStar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const res = await toggleStarAction(letter.id);
    if (res.ok) {
      setIsStarred(!isStarred);
    }
  }

  const isWithdrawn = Boolean(letter.withdrawnAt);
  const canManage = !isWithdrawn && now > 0 && now <= Date.parse(letter.lockedAt);

  return (
    <Link 
      href={`/journal/${letter.id}`} 
      onClick={onOpen}
      className={`envelope-card stationery-${letter.stationeryTheme} group relative block rounded-[1.7rem] border p-5 transition hover:-translate-y-1 hover:shadow-xl ${
        isCapsule 
          ? "border-orange-200 ring-1 ring-orange-100" 
          : unread 
            ? "border-[var(--rose)] ring-1 ring-[var(--rose)]/20" 
            : "border-black/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-white/75 shadow-sm ${
            isCapsule 
              ? "text-orange-500" 
              : unread 
                ? "text-[var(--rose)]" 
                : "text-[var(--muted-ink)]"
          }`}>
            {isCapsule ? <Sparkles size={20} /> : <Icon size={20} />}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{label}</p>
              {isWithdrawn && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">已撤回</span>
              )}
              {/* 胶囊信标识标签 */}
              {isCapsule && (
                <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-orange-200 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700 shadow-sm">
                  <Sparkles size={10} />
                  胶囊信
                </span>
              )}
            </div>
            <time className="mt-1 block text-xs text-[var(--muted-ink)]">
              {isCapsule && letter.openAt 
                ? `开启时间 ${dt.format(new Date(letter.openAt))}` 
                : dt.format(new Date(letter.publishedAt))
              }
            </time>
            {letter.moodEmoji && !isCapsule && (
              <span className="mt-0.5 inline-block text-lg">{letter.moodEmoji}</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStar}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
              isStarred 
                ? "bg-yellow-100 text-yellow-600" 
                : "bg-white/50 text-[var(--muted-ink)] hover:text-yellow-600"
            }`}
            title={isStarred ? "取消星标" : "添加星标"}
          >
            <Star size={16} fill={isStarred ? "currentColor" : "none"} />
          </button>
          {unread && !isCapsule && (
            <span className="w-2 h-2 rounded-full bg-[var(--rose)]" />
          )}
        </div>
      </div>

      <p className="mt-4 line-clamp-2 min-h-[3rem] leading-6 text-[var(--ink)]">
        {excerpt}
      </p>

      <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted-ink)]">
        <div className="flex items-center gap-2">
          {isCapsule ? (
            <span className="flex items-center gap-1 text-orange-600 font-medium">
              <Sparkles size={12} />
              {letter.openedAt ? "已开启" : "等待开启"}
            </span>
          ) : (
            <span>信纸</span>
          )}
          {mode === "sent" && letter.openedAt && <span>对方已读</span>}
          {letter.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageCircle size={12} />
              {letter.commentCount}
            </span>
          )}
        </div>
        {canManage && !isCapsule && (
          <span className="text-[var(--rose)]/70">可管理至 {dt.format(new Date(letter.lockedAt))}</span>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-[1.7rem] overflow-hidden">
        <div className={`absolute inset-0 ${isCapsule ? "bg-gradient-to-br from-orange-50/40 via-transparent to-transparent" : "bg-gradient-to-br from-white/40 via-transparent to-transparent"}`} />
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white/60 to-transparent" />
      </div>
    </Link>
  );
}
