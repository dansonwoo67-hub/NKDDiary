"use client";

import type { MonthCalendarDay } from "@/features/calendar/types";
import { getDateInfo } from "@/lib/date/chinese-calendar";
import { X, Mail, Star, Heart, Calendar, Gift, Plane, Utensils, CheckSquare, Lock } from "lucide-react";
import Link from "next/link";

interface DayDetailDrawerProps {
  date: string;
  day: MonthCalendarDay;
  onClose: () => void;
  highlightedEventId?: string | null;
}

const EVENT_ICONS: Record<string, React.ElementType> = {
  anniversary: Gift,
  birthday: Gift,
  travel: Plane,
  date: Utensils,
  todo: CheckSquare,
  other: Calendar,
};

export function DayDetailDrawer({ date, day, onClose, highlightedEventId }: DayDetailDrawerProps) {
  const dateInfo = getDateInfo(date);
  
  const letters = day.letters ?? [];
  const content = day.content ?? [];
  const events = day.events ?? [];
  
  const importantEvent = events.find(e => e.isImportant || ["anniversary", "birthday"].includes(e.eventType));
  
  const holidayText = dateInfo.holiday 
    ? (dateInfo.holiday.type === "holiday" 
        ? `${dateInfo.holiday.name} · 休` 
        : `${dateInfo.holiday.name} · 班`)
    : dateInfo.solarTerm
      ? dateInfo.solarTerm
      : null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-[var(--muted-ink)]/10">
          <div>
            <h2 className="text-xl font-semibold">{dateInfo.month}月{dateInfo.day}日</h2>
            <p className="text-sm text-[var(--muted-ink)]">
              {dateInfo.weekday} · {dateInfo.lunar.monthName}月{dateInfo.lunar.dayName}
              {holidayText && <span className="ml-2 text-[var(--rose)]">{holidayText}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--muted-ink)]/5 transition"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {importantEvent && (
            <div className={`p-4 rounded-2xl bg-[var(--rose)]/10 border transition-all duration-300 ${
              highlightedEventId === importantEvent.id 
                ? "border-[var(--rose)]/50 ring-2 ring-[var(--rose)]/30" 
                : "border-[var(--rose)]/20"
            }`}>
              <p className="text-xs text-[var(--rose)] font-medium mb-2">重要日子</p>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{importantEvent.icon}</span>
                <div>
                  <p className="font-semibold">{importantEvent.name}</p>
                  {importantEvent.description && (
                    <p className="text-sm text-[var(--muted-ink)] mt-1">{importantEvent.description}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {letters.length > 0 && (
            <div>
              <p className="text-xs text-[var(--muted-ink)] font-medium mb-3">来信</p>
              <div className="space-y-2">
                {letters.map(letter => (
                  <Link 
                    key={letter.id} 
                    href={letter.href}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[var(--muted-ink)]/10 hover:border-[var(--rose)]/30 transition"
                  >
                    {letter.status === "sealed" ? (
                      <Lock size={20} className="text-[var(--muted-ink)]" />
                    ) : letter.status === "unread" ? (
                      <Mail size={20} className="text-[var(--rose)]" />
                    ) : (
                      <Mail size={20} className="text-[var(--muted-ink)]" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{letter.label}</p>
                      <p className="text-xs text-[var(--muted-ink)]">
                        {letter.status === "sealed" ? "时间胶囊尚未开启" : letter.status === "unread" ? "未读" : "已读"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          
          {events.filter(e => !e.isImportant).length > 0 && (
            <div>
              <p className="text-xs text-[var(--muted-ink)] font-medium mb-3">事件</p>
              <div className="space-y-2">
                {events.filter(e => !e.isImportant).map(event => {
                  const Icon = EVENT_ICONS[event.eventType] || Calendar;
                  return (
                    <div 
                      key={event.id}
                      className={`flex items-center gap-3 p-3 rounded-xl bg-white border transition-all duration-300 ${
                        highlightedEventId === event.id 
                          ? "border-[var(--rose)]/50 ring-2 ring-[var(--rose)]/30" 
                          : "border-[var(--muted-ink)]/10"
                      }`}
                    >
                      <Icon size={20} className="text-[var(--gold)]" />
                      <div className="flex-1">
                        <p className="font-medium">{event.name}</p>
                        {event.description && (
                          <p className="text-sm text-[var(--muted-ink)]">{event.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {content.length > 0 && (
            <div>
              <p className="text-xs text-[var(--muted-ink)] font-medium mb-3">对方的心情与回忆</p>
              <div className="space-y-2">
                {content.map(item => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[var(--muted-ink)]/10 hover:border-[var(--rose)]/30 transition"
                  >
                    {item.kind === "mood" ? (
                      <Heart size={20} className="text-[var(--rose)]" />
                    ) : (
                      <Star size={20} className="text-[var(--gold)]" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium truncate">{item.label}</p>
                      <p className="text-xs text-[var(--muted-ink)]">
                        {item.kind === "mood" ? "心情" : "回忆"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          
          {letters.length === 0 && events.length === 0 && content.length === 0 && (
            <div className="text-center py-12 text-[var(--muted-ink)]">
              <p className="text-4xl mb-3">📝</p>
              <p>这一天还没有记录</p>
              <p className="text-sm mt-1">一起创造美好的回忆吧</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
