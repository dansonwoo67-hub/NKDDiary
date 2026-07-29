"use client";

import { useState } from "react";
import type { YearCalendarState, YearCalendarDay } from "@/features/calendar/types";
import { getTodayDateStr } from "@/lib/date/relationship-days";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

interface YearViewProps {
  state: YearCalendarState;
  onYearChange: (year: number) => void;
  onDayClick: (date: string) => void;
}

const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

export function YearView({ state, onYearChange, onDayClick }: YearViewProps) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  
  const today = getTodayDateStr();
  
  const getDaysByMonth = () => {
    const months: YearCalendarDay[][] = [];
    for (let m = 1; m <= 12; m++) {
      const monthDays = state.days.filter(d => {
        const [, month] = d.date.split("-").map(Number);
        return month === m;
      });
      months.push(monthDays);
    }
    return months;
  };
  
  const months = getDaysByMonth();
  
  const getLevelColor = (level: number) => {
    switch (level) {
      case 0: return "bg-[var(--muted-ink)]/5";
      case 1: return "bg-[var(--rose)]/20";
      case 2: return "bg-[var(--rose)]/40";
      case 3: return "bg-[var(--rose)]/60";
      case 4: return "bg-[var(--rose)]/80";
      default: return "bg-[var(--muted-ink)]/5";
    }
  };
  
  return (
    <section className="year-view bg-white/70 backdrop-blur-sm rounded-3xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm tracking-[0.2em] text-[var(--muted-ink)]">YEAR</p>
          <h2 className="mt-1 text-2xl font-semibold">我们的{state.year}年</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onYearChange(state.year - 1)}
            className="p-2 rounded-full hover:bg-[var(--muted-ink)]/5 transition"
            aria-label="上一年"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => onYearChange(new Date().getFullYear())}
            className="px-4 py-2 rounded-full bg-[var(--rose)]/10 text-[var(--rose)] text-sm font-medium hover:bg-[var(--rose)]/20 transition"
          >
            今年
          </button>
          <button
            onClick={() => onYearChange(state.year + 1)}
            className="p-2 rounded-full hover:bg-[var(--muted-ink)]/5 transition"
            aria-label="下一年"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <div className="inline-flex gap-2 min-w-full">
          {months.map((month, monthIndex) => (
            <div key={monthIndex} className="flex-shrink-0 w-20">
              <p className="text-center text-xs font-medium text-[var(--muted-ink)] mb-2">
                {MONTHS[monthIndex]}
              </p>
              <div className="grid grid-cols-7 gap-1">
                {month.map((day) => {
                  const isToday = day.date === today;
                  const isHovered = day.date === hoveredDay;
                  const dateParts = day.date.split("-");
                  const dayNum = parseInt(dateParts[2]);
                  const isFirstOfMonth = dayNum === 1;
                  
                  return (
                    <div
                      key={day.date}
                      className={`relative aspect-square rounded-md cursor-pointer transition-all duration-200 ${getLevelColor(day.level)} ${
                        isToday ? "ring-2 ring-[var(--rose)]" : ""
                      } ${isHovered ? "ring-2 ring-[var(--gold)]" : ""}`}
                      onClick={() => onDayClick(day.date)}
                      onMouseEnter={() => setHoveredDay(day.date)}
                      onMouseLeave={() => setHoveredDay(null)}
                      title={`${day.date}: ${day.count} 条记录`}
                    >
                      {isFirstOfMonth && (
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] text-[var(--muted-ink)]">
                          {dayNum}
                        </span>
                      )}
                      
                      {isHovered && (
                        <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-white rounded-xl shadow-xl p-2 text-left border border-[var(--muted-ink)]/10">
                          <p className="text-sm font-medium">{day.date}</p>
                          <p className="text-xs text-[var(--muted-ink)] mt-1">
                            {day.count > 0 
                              ? `${day.count} 条记录` 
                              : "这天还没有记录"}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="mt-6 flex items-center justify-end gap-2 text-xs text-[var(--muted-ink)]">
        <span>少</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map(level => (
            <div key={level} className={`w-3 h-3 rounded ${getLevelColor(level)}`} />
          ))}
        </div>
        <span>多</span>
      </div>
      
      {state.importantDates.length > 0 && (
        <div className="mt-8">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Star size={18} className="text-[var(--gold)]" fill="currentColor" />
            这一年的重要日子
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {state.importantDates.map((event, index) => {
              const [, month, day] = event.date.split("-").map(Number);
              return (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--rose)]/5 hover:bg-[var(--rose)]/10 transition cursor-pointer"
                  onClick={() => onDayClick(event.date)}
                >
                  <span className="text-2xl">{event.icon}</span>
                  <div>
                    <p className="font-medium">{event.name}</p>
                    <p className="text-xs text-[var(--muted-ink)]">{month}月{day}日</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
