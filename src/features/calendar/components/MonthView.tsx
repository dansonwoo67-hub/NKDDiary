"use client";

import { useState } from "react";
import type { MonthCalendarState, MonthCalendarDay } from "@/features/calendar/types";
import { getDateInfo } from "@/lib/date/chinese-calendar";
import { getTodayDateStr } from "@/lib/date/relationship-days";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthViewProps {
  state: MonthCalendarState;
  onMonthChange: (year: number, month: number) => void;
  onDayClick: (date: string, day: MonthCalendarDay) => void;
  selectedDate: string | null;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const EVENT_TYPE_ICONS: Record<string, string> = {
  anniversary: "💍",
  birthday: "🎂",
  travel: "✈️",
  date: "🍽️",
  todo: "✅",
  other: "📌",
};

export function MonthView({ state, onMonthChange, onDayClick, selectedDate }: MonthViewProps) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  
  const today = getTodayDateStr();
  
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };
  
  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month - 1, 1).getDay();
  };
  
  const daysInMonth = getDaysInMonth(state.year, state.month);
  const firstDay = getFirstDayOfMonth(state.year, state.month);
  
  const prevMonthDays = firstDay;
  const nextMonthDays = 42 - (prevMonthDays + daysInMonth);
  
  const prevMonth = state.month === 1 ? { year: state.year - 1, month: 12 } : { year: state.year, month: state.month - 1 };
  const nextMonth = state.month === 12 ? { year: state.year + 1, month: 1 } : { year: state.year, month: state.month + 1 };
  
  const prevMonthDayCount = getDaysInMonth(prevMonth.year, prevMonth.month);
  
  const renderDay = (day: MonthCalendarDay, isCurrentMonth: boolean) => {
    const dateInfo = getDateInfo(day.date);
    const isToday = day.date === today;
    const isSelected = day.date === selectedDate;
    const isHovered = day.date === hoveredDay;
    
    const letters = day.letters ?? [];
    const content = day.content ?? [];
    const events = day.events ?? [];
    
    const unreadLetter = letters.find(l => l.status === "unread");
    const importantEvent = events.find(e => e.isImportant || ["anniversary", "birthday"].includes(e.eventType));
    const sealedLetter = letters.find(l => l.status === "sealed");
    
    let mainIcon = "";
    if (importantEvent) {
      mainIcon = importantEvent.icon || EVENT_TYPE_ICONS[importantEvent.eventType] || "📌";
    } else if (unreadLetter) {
      mainIcon = "💌";
    } else if (sealedLetter) {
      mainIcon = "🔒";
    } else if (events.length > 0) {
      mainIcon = events[0].icon || EVENT_TYPE_ICONS[events[0].eventType] || "📌";
    } else if (content.length > 0) {
      mainIcon = content[0].icon;
    }
    
    const totalItems = letters.length + content.length + events.length;
    const hasExtra = totalItems > 2;
    const extraCount = totalItems > 2 ? totalItems - 2 : 0;
    
    let subtitle = "";
    if (dateInfo.holiday) {
      subtitle = dateInfo.holiday.type === "holiday" ? "休" : dateInfo.holiday.name === "班" ? "班" : dateInfo.holiday.name;
    } else if (dateInfo.solarTerm) {
      subtitle = dateInfo.solarTerm;
    } else {
      subtitle = dateInfo.lunar.dayName;
    }
    
    return (
      <div
        key={day.date}
        className={`relative cursor-pointer rounded-xl p-2 transition-all duration-200 ${
          isCurrentMonth 
            ? "bg-white/80 hover:bg-white" 
            : "bg-white/20 text-[var(--muted-ink)]/50"
        } ${isToday ? "ring-2 ring-[var(--rose)]/50" : ""} ${isSelected ? "ring-2 ring-[var(--gold)]" : ""}`}
        onClick={() => isCurrentMonth && onDayClick(day.date, day)}
        onMouseEnter={() => setHoveredDay(day.date)}
        onMouseLeave={() => setHoveredDay(null)}
      >
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${isToday ? "text-[var(--rose)]" : ""}`}>
            {day.dayOfMonth}
          </span>
          {isToday && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--rose)]/10 text-[var(--rose)]">今天</span>}
        </div>
        
        <p className="mt-1 text-[10px] text-[var(--muted-ink)] truncate">
          {subtitle}
        </p>
        
        <div className="mt-2 flex flex-wrap gap-1 justify-center">
          {mainIcon && (
            <span className="text-sm">{mainIcon}</span>
          )}
          {hasExtra && (
            <span className="text-[10px] px-1 rounded bg-[var(--muted-ink)]/10 text-[var(--muted-ink)]">
              +{extraCount}
            </span>
          )}
        </div>
        
        {isHovered && isCurrentMonth && (
          <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white rounded-xl shadow-xl p-3 text-left border border-[var(--muted-ink)]/10">
            <p className="text-sm font-medium">{day.date} · {getDateInfo(day.date).weekday}</p>
            <p className="text-xs text-[var(--muted-ink)]">{getDateInfo(day.date).lunar.monthName}月{getDateInfo(day.date).lunar.dayName}</p>
            {importantEvent && (
              <p className="mt-2 text-xs"><span>{importantEvent.icon}</span> <strong>{importantEvent.name}</strong></p>
            )}
            {unreadLetter && (
              <p className="mt-1 text-xs"><span>💌</span> 对方寄来一封信</p>
            )}
            {events.filter(e => !e.isImportant).slice(0, 3).map(e => (
              <p key={e.id} className="mt-1 text-xs"><span>{e.icon}</span> {e.name}</p>
            ))}
            {content.slice(0, 3).map(c => (
              <p key={c.id} className="mt-1 text-xs"><span>{c.icon}</span> {c.label}</p>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  const days: MonthCalendarDay[] = [];
  
  for (let i = prevMonthDays - 1; i >= 0; i--) {
    const dayNum = prevMonthDayCount - i;
    const date = `${prevMonth.year}-${String(prevMonth.month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    days.push({ date, dayOfMonth: dayNum, events: [] });
  }
  
  for (let i = 1; i <= daysInMonth; i++) {
    const date = `${state.year}-${String(state.month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const dayData = state.days.find(d => d.date === date);
    days.push(dayData ?? { date, dayOfMonth: i, events: [] });
  }
  
  for (let i = 1; i <= nextMonthDays; i++) {
    const date = `${nextMonth.year}-${String(nextMonth.month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    days.push({ date, dayOfMonth: i, events: [] });
  }
  
  return (
    <section className="month-view bg-white/70 backdrop-blur-sm rounded-3xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm tracking-[0.2em] text-[var(--muted-ink)]">MONTH</p>
          <h2 className="mt-1 text-2xl font-semibold">{state.year}年{state.month}月</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMonthChange(prevMonth.year, prevMonth.month)}
            className="p-2 rounded-full hover:bg-[var(--muted-ink)]/5 transition"
            aria-label="上个月"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => {
              const now = new Date();
              onMonthChange(now.getFullYear(), now.getMonth() + 1);
            }}
            className="px-4 py-2 rounded-full bg-[var(--rose)]/10 text-[var(--rose)] text-sm font-medium hover:bg-[var(--rose)]/20 transition"
          >
            今天
          </button>
          <button
            onClick={() => onMonthChange(nextMonth.year, nextMonth.month)}
            className="p-2 rounded-full hover:bg-[var(--muted-ink)]/5 transition"
            aria-label="下个月"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center text-xs font-medium text-[var(--muted-ink)] py-2">
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, index) => {
          const isPrevMonth = index < prevMonthDays;
          const isNextMonth = index >= prevMonthDays + daysInMonth;
          const isCurrentMonth = !isPrevMonth && !isNextMonth;
          return renderDay(day, isCurrentMonth);
        })}
      </div>
    </section>
  );
}
