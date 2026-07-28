"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getMonthCalendarState, getYearCalendarState } from "@/features/calendar/actions";
import type { MonthCalendarState, MonthCalendarDay, YearCalendarState } from "@/features/calendar/types";
import { TodayInfo } from "./TodayInfo";
import { DailyTip } from "./DailyTip";
import { MonthView } from "./MonthView";
import { YearView } from "./YearView";
import { DayDetailDrawer } from "./DayDetailDrawer";
import { EventCreatePanel } from "./EventCreatePanel";
import { Plus, CalendarDays, Calendar, Sparkles } from "lucide-react";

export type ViewType = "month" | "year";

function getInitialView(searchParams: URLSearchParams): ViewType {
  const viewParam = searchParams.get("view");
  return viewParam === "year" || viewParam === "month" ? viewParam : "month";
}

function getInitialYear(searchParams: URLSearchParams): number {
  const dateParam = searchParams.get("date");
  if (dateParam) {
    const [y] = dateParam.split("-").map(Number);
    if (!isNaN(y)) return y;
  }
  return new Date().getFullYear();
}

function getInitialMonth(searchParams: URLSearchParams): number {
  const dateParam = searchParams.get("date");
  if (dateParam) {
    const [, m] = dateParam.split("-").map(Number);
    if (!isNaN(m)) return m;
  }
  return new Date().getMonth() + 1;
}

function getInitialSelectedDate(searchParams: URLSearchParams): string | null {
  return searchParams.get("date");
}

function getInitialHighlightedEventId(searchParams: URLSearchParams): string | null {
  return searchParams.get("event");
}

export function CalendarPageClient() {
  const searchParams = useSearchParams();
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(() => getInitialHighlightedEventId(searchParams));
  const [view, setView] = useState<ViewType>(() => getInitialView(searchParams));
  const [year, setYear] = useState(() => getInitialYear(searchParams));
  const [month, setMonth] = useState(() => getInitialMonth(searchParams));
  const [monthState, setMonthState] = useState<MonthCalendarState | null>(null);
  const [yearState, setYearState] = useState<YearCalendarState | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => getInitialSelectedDate(searchParams));
  const [selectedDay, setSelectedDay] = useState<MonthCalendarDay | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [createPanelDate, setCreatePanelDate] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Handle URL parameters for deep linking - use setTimeout to avoid synchronous setState in effect
  useEffect(() => {
    const viewParam = searchParams.get("view");
    const dateParam = searchParams.get("date");
    const eventParam = searchParams.get("event");
    
    if (viewParam === "year" || viewParam === "month") {
      setTimeout(() => setView(viewParam), 0);
    }
    
    if (dateParam) {
      const [y, m] = dateParam.split("-").map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setTimeout(() => {
          setYear(y);
          setMonth(m);
          setSelectedDate(dateParam);
        }, 0);
      }
    }
    
    if (eventParam) {
      setTimeout(() => setHighlightedEventId(eventParam), 0);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (view === "month") {
          const state = await getMonthCalendarState(year, month);
          setMonthState(state);
          
          // If we have an event to highlight, find and select the corresponding day
          if (highlightedEventId) {
            for (const day of state.days) {
              const event = day.events.find(e => e.id === highlightedEventId);
              if (event) {
                setSelectedDate(day.date);
                setSelectedDay(day);
                
                // Highlight for 2 seconds
                setTimeout(() => {
                  setHighlightedEventId(null);
                }, 2000);
                break;
              }
            }
          }
        } else {
          const state = await getYearCalendarState(year);
          setYearState(state);
        }
      } catch (error) {
        console.error("Calendar data fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [view, year, month, highlightedEventId]);
  
  const handleMonthChange = (newYear: number, newMonth: number) => {
    setYear(newYear);
    setMonth(newMonth);
  };
  
  const handleYearChange = (newYear: number) => {
    setYear(newYear);
  };
  
  const handleDayClick = (date: string, day?: MonthCalendarDay) => {
    if (day) {
      setSelectedDate(date);
      setSelectedDay(day);
    }
  };
  
  const handleYearDayClick = (date: string) => {
    const [newYear, newMonth] = date.split("-").map(Number);
    setYear(newYear);
    setMonth(newMonth);
    setView("month");
    
    setTimeout(() => {
      const day = monthState?.days.find(d => d.date === date);
      if (day) {
        setSelectedDate(date);
        setSelectedDay(day);
      }
    }, 300);
  };
  
  const handleCreateEvent = (date?: string) => {
    setCreatePanelDate(date);
    setShowCreatePanel(true);
  };
  
  const handleCloseDrawer = () => {
    setSelectedDate(null);
    setSelectedDay(null);
  };
  
  const handleCloseCreatePanel = () => {
    setShowCreatePanel(false);
    setCreatePanelDate(undefined);
  };
  
  const handleEventCreated = () => {
    setLoading(true);
    if (view === "month") {
      getMonthCalendarState(year, month).then(state => {
        setMonthState(state);
        setLoading(false);
      });
    } else {
      getYearCalendarState(year).then(state => {
        setYearState(state);
        setLoading(false);
      });
    }
  };
  
  const upcomingEvents = monthState?.days
    .flatMap(d => d.events.map(e => ({ ...e, date: d.date })))
    .filter(e => e.date >= new Date().toISOString().split("T")[0])
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2) ?? [];
  
  const today = new Date().toISOString().split("T")[0];
  const daysWithContent = monthState?.days.filter(d => {
    const letters = d.letters ?? [];
    const content = d.content ?? [];
    return letters.length > 0 || content.length > 0 || d.events.length > 0;
  }).length ?? 0;
  
  const upcomingCount = monthState?.days
    .reduce((count, day) => count + day.events.length, 0) ?? 0;
  
  const importantCount = monthState?.days
    .flatMap(d => d.events)
    .filter(e => e.isImportant || ["anniversary", "birthday"].includes(e.eventType))
    .length ?? 0;
  
  return (
    <div className="relative">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div ref={scrollRef}>
          <header className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm font-semibold tracking-[0.22em] text-[var(--rose)]">CALENDAR</p>
              <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">我们的日历</h1>
              <p className="mt-2 text-sm text-[var(--muted-ink)]">约会、纪念日、旅行和小计划，一起慢慢安排。</p>
            </div>
            
            <div className="hidden lg:flex flex-col items-end gap-2">
              <div className="flex bg-white/70 rounded-xl p-1">
                <button
                  onClick={() => { setView("month"); setLoading(true); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    view === "month" ? "bg-[var(--rose)]/10 text-[var(--rose)]" : "text-[var(--muted-ink)] hover:text-[var(--ink)]"
                  }`}
                >
                  <CalendarDays size={16} />
                  月视图
                </button>
                <button
                  onClick={() => { setView("year"); setLoading(true); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    view === "year" ? "bg-[var(--rose)]/10 text-[var(--rose)]" : "text-[var(--muted-ink)] hover:text-[var(--ink)]"
                  }`}
                >
                  <Calendar size={16} />
                  年视图
                </button>
              </div>
            </div>
          </header>
          
          <TodayInfo />
          
          <DailyTip />
          
          <section className="recent-events bg-white/70 backdrop-blur-sm rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[var(--gold)]" />
                <span className="text-sm font-medium">最近安排</span>
              </div>
              <div className="text-xs text-[var(--muted-ink)]">
                本月 {daysWithContent} 个有故事的日子 · 待发生 {upcomingCount} · 重要 {importantCount}
              </div>
            </div>
            
            {upcomingEvents.length > 0 ? (
              <div className="mt-4 space-y-2">
                {upcomingEvents.map((event, index) => {
                  const [, m, d] = event.date.split("-").map(Number);
                  const todayDate = new Date(today);
                  const eventDate = new Date(event.date);
                  const diffDays = Math.ceil((eventDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
                  
                  return (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/50 hover:bg-white transition cursor-pointer"
                      onClick={() => handleDayClick(event.date, monthState?.days.find(d => d.date === event.date))}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{event.icon}</span>
                        <div>
                          <p className="font-medium">{event.name}</p>
                          <p className="text-xs text-[var(--muted-ink)]">
                            {m}月{d}日 · {diffDays === 0 ? "今天" : diffDays === 1 ? "明天" : `还有${diffDays}天`}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        event.isImportant ? "bg-[var(--rose)]/10 text-[var(--rose)]" : "bg-[var(--muted-ink)]/10 text-[var(--muted-ink)]"
                      }`}>
                        {event.isImportant ? "重要" : "普通"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--muted-ink)]">暂时没有即将发生的事件</p>
            )}
          </section>
          
          {loading ? (
            <div className="mt-6 flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--rose)]" />
            </div>
          ) : view === "month" && monthState ? (
            <MonthView
              state={monthState}
              onMonthChange={handleMonthChange}
              onDayClick={handleDayClick}
              selectedDate={selectedDate}
            />
          ) : view === "year" && yearState ? (
            <YearView
              state={yearState}
              onYearChange={handleYearChange}
              onDayClick={handleYearDayClick}
            />
          ) : (
            <div className="mt-6 text-center py-12 text-[var(--muted-ink)]">
              <p>日历数据暂时加载不了</p>
              <button 
                onClick={() => { setLoading(true); }}
                className="mt-4 px-4 py-2 rounded-lg bg-[var(--rose)]/10 text-[var(--rose)] text-sm"
              >
                再试一次
              </button>
            </div>
          )}
          
          <div className="lg:hidden mt-4 flex justify-center bg-white/70 rounded-xl p-1 w-fit mx-auto">
            <button
              onClick={() => { setView("month"); setLoading(true); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                view === "month" ? "bg-[var(--rose)]/10 text-[var(--rose)]" : "text-[var(--muted-ink)]"
              }`}
            >
              <CalendarDays size={16} />
              月视图
            </button>
            <button
              onClick={() => { setView("year"); setLoading(true); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                view === "year" ? "bg-[var(--rose)]/10 text-[var(--rose)]" : "text-[var(--muted-ink)]"
              }`}
            >
              <Calendar size={16} />
              年视图
            </button>
          </div>
        </div>
        
        <div className="hidden lg:block sticky top-6 h-fit">
          <button
            onClick={() => handleCreateEvent()}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-[var(--rose)] text-white font-medium hover:bg-[var(--rose)]/90 transition shadow-lg"
          >
            <Plus size={20} />
            创建事件
          </button>
          
          <div className="mt-4 p-4 rounded-xl bg-white/50 border border-[var(--muted-ink)]/10">
            <p className="text-xs text-[var(--muted-ink)]">快捷创建</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { icon: "💍", label: "纪念日", type: "anniversary" },
                { icon: "🎂", label: "生日", type: "birthday" },
                { icon: "🍽️", label: "约会", type: "date" },
                { icon: "✈️", label: "旅行", type: "travel" },
                { icon: "✅", label: "待办", type: "todo" },
                { icon: "📌", label: "其他", type: "other" },
              ].map(item => (
                <button
                  key={item.type}
                  onClick={() => handleCreateEvent()}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl border border-[var(--muted-ink)]/10 hover:border-[var(--rose)]/30 hover:bg-[var(--rose)]/5 transition"
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-xs">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {selectedDate && selectedDay && (
        <DayDetailDrawer
          date={selectedDate}
          day={selectedDay}
          onClose={handleCloseDrawer}
          highlightedEventId={highlightedEventId}
        />
      )}
      
      {showCreatePanel && (
        <EventCreatePanel
          defaultDate={createPanelDate}
          onClose={handleCloseCreatePanel}
          onSuccess={handleEventCreated}
        />
      )}
    </div>
  );
}
