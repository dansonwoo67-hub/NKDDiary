"use client";

import { useState, useEffect } from "react";
import { getDateInfo } from "@/lib/date/chinese-calendar";
import { EarthDecoration } from "./EarthDecoration";

export function TodayInfo() {
  const [time, setTime] = useState<Date | null>(null);
  
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setTime(new Date());
    });
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  
  const dateInfo = getDateInfo();
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };
  
  const holidayText = dateInfo.holiday 
    ? (dateInfo.holiday.type === "holiday" 
        ? `${dateInfo.holiday.name} · 休` 
        : `${dateInfo.holiday.name} · 班`)
    : dateInfo.solarTerm
      ? dateInfo.solarTerm
      : null;
  
  return (
    <section className="today-info bg-gradient-to-br from-[var(--rose)]/10 to-[var(--gold)]/10 rounded-3xl p-6 sm:p-8">
      <div className="grid gap-6 sm:grid-cols-[1fr_38%]">
        <div>
          <p className="text-sm font-semibold tracking-[0.2em] text-[var(--rose)]">TODAY</p>
          <h2 className="mt-2 text-3xl font-serif font-semibold sm:text-4xl">
            {dateInfo.year}年{dateInfo.month}月{dateInfo.day}日
          </h2>
          <p className="mt-1 text-lg text-[var(--muted-ink)]">
            {dateInfo.weekday}
            {holidayText && (
              <span className="ml-3 px-2 py-0.5 rounded-full bg-[var(--rose)]/10 text-[var(--rose)] text-sm">
                {holidayText}
              </span>
            )}
          </p>
          <div className="mt-6 text-4xl font-mono font-light text-[var(--ink)]">
            {time ? formatTime(time) : null}
          </div>
          <p className="mt-2 text-sm text-[var(--muted-ink)]">
            农历 {dateInfo.lunar.yearName}年 · {dateInfo.lunar.monthName}月{dateInfo.lunar.dayName}
          </p>
        </div>
        
        <div className="sm:flex items-center sm:justify-end">
          <EarthDecoration />
        </div>
      </div>
    </section>
  );
}
