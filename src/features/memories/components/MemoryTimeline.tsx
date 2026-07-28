"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Camera, Download, Heart, ImageIcon, Leaf, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { deleteMemoryFromForm, updateMemoryFromForm } from "@/features/memories/actions";
import { MemoryComposer } from "@/features/memories/components/MemoryComposer";
import type { MemoryItem, MemoryFeedKind } from "@/features/memories/repository";
import { canAuthorMutate } from "@/features/mood/rules";

type Filter = "all" | MemoryFeedKind | "photos";
const filters: Array<{ value: Filter; label: string; Icon: typeof Heart }> = [
  { value: "all", label: "全部", Icon: Leaf },
  { value: "memory", label: "回忆", Icon: Camera },
  { value: "mood", label: "心情", Icon: Sparkles },
  { value: "calendar", label: "纪念日", Icon: CalendarDays },
  { value: "photos", label: "照片", Icon: ImageIcon },
];
const kindMeta = {
  mood: { label: "心情", Icon: Sparkles, fruit: "花苞" },
  memory: { label: "回忆", Icon: Camera, fruit: "果实" },
  calendar: { label: "纪念日", Icon: CalendarDays, fruit: "花冠" },
} as const;

function dateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function displayDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}年${get("month")}月${get("day")}日`;
}
function displayWeekday(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "long" }).format(new Date(value));
}
function displayTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}

export function MemoryTimeline({ items, viewerId, now = new Date() }: { items: MemoryItem[]; viewerId: string; now?: Date }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemoryItem | null>(null);
  const [lightbox, setLightbox] = useState<MemoryItem | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showFloatingFilter, setShowFloatingFilter] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterBarRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => ({
    all: items.length,
    memory: items.filter((x) => x.kind === "memory").length,
    mood: items.filter((x) => x.kind === "mood").length,
    calendar: items.filter((x) => x.kind === "calendar").length,
    photos: items.filter((x) => x.kind === "memory" && x.imageUrl).length,
  }), [items]);
  const visibleItems = items.filter((item) => filter === "all" ? true : filter === "photos" ? item.kind === "memory" && Boolean(item.imageUrl) : item.kind === filter);
  const groups = useMemo(() => {
    const map = new Map<string, MemoryItem[]>();
    for (const item of visibleItems) {
      const key = dateKey(item.occurredAt);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [visibleItems]);
  const monthGroups = useMemo(() => {
    const seen = new Set<string>();
    return groups.flatMap(([key]) => {
      const monthKey = key.slice(0, 7);
      if (seen.has(monthKey)) return [];
      seen.add(monthKey);
      return [{ key: monthKey, year: monthKey.slice(0, 4), month: monthKey.slice(5, 7) }];
    });
  }, [groups]);
  const [activeMonth, setActiveMonth] = useState(monthGroups[0]?.key ?? "");
  const displayedActiveMonth = monthGroups.some(({ key }) => key === activeMonth)
    ? activeMonth
    : monthGroups[0]?.key ?? "";

  useEffect(() => {
    if (!monthGroups.length) return;
    if (typeof window.IntersectionObserver !== "function") return;
    const nodes = monthGroups.map(({ key }) => document.getElementById(`memory-month-${key}`)).filter(Boolean) as HTMLElement[];
    const observer = new window.IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible?.target.id) setActiveMonth(visible.target.id.replace("memory-month-", ""));
    }, { rootMargin: "-20% 0px -68% 0px", threshold: 0 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [monthGroups]);

  useEffect(() => {
    const handleScroll = () => {
      if (!filterBarRef.current) return;
      const rect = filterBarRef.current.getBoundingClientRect();
      setShowFloatingFilter(rect.bottom < 0);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".floating-filter-menu")) {
        setShowFilterMenu(false);
      }
    };

    if (showFilterMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showFilterMenu]);

  function jumpToMonth(key: string) {
    document.getElementById(`memory-month-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section aria-label="回忆树" className="relative min-w-0">
      <div ref={filterBarRef} className="mx-auto mb-8 min-w-0 max-w-5xl px-1">
        <div className="flex items-center justify-between gap-4 overflow-hidden">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {filters.map(({ value, label, Icon }) => (
              <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
                className="flex shrink-0 items-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm font-medium text-[var(--muted-ink)] transition hover:bg-white aria-pressed:border-[var(--rose)]/25 aria-pressed:bg-[var(--rose)] aria-pressed:text-white">
                <Icon size={15} /> {label} <span className="text-xs opacity-75">{counts[value]}</span>
              </button>
            ))}
          </div>
          <div className="flex shrink-0">
            <button type="button" onClick={() => setShowComposer(true)} className="hidden items-center gap-2 rounded-full border-2 border-[var(--rose)]/30 bg-gradient-to-r from-[var(--rose)]/10 to-[var(--orange)]/10 px-4 py-1.5 text-sm font-medium text-[var(--rose)] transition hover:from-[var(--rose)]/20 hover:to-[var(--orange)]/20 sm:flex">
              <Plus size={15} /> 添加回忆
            </button>
            <button type="button" onClick={() => setShowComposer(true)} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--rose)]/30 bg-gradient-to-r from-[var(--rose)]/10 to-[var(--orange)]/10 text-[var(--rose)] transition hover:from-[var(--rose)]/20 hover:to-[var(--orange)]/20 sm:hidden" aria-label="添加回忆">
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[9rem_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="回忆年月导航">
          <div className="sticky top-40 max-h-[calc(100vh-12rem)] overflow-y-auto rounded-[1.4rem] border border-[var(--line)] bg-[var(--paper)]/92 p-3 shadow-sm backdrop-blur">
            <p className="mb-3 px-2 text-xs font-semibold tracking-[0.18em] text-[var(--rose)]">时间年轮</p>
            <div className="relative border-l-2 border-[#d7b696] pl-3">
              {monthGroups.map(({ key, year, month }, index) => {
                const showYear = index === 0 || monthGroups[index - 1].year !== year;
                return <div key={key} className="mb-2">
                  {showYear ? <button type="button" onClick={() => jumpToMonth(key)} className="mb-1 block font-serif text-base font-semibold">{year}</button> : null}
                  <button type="button" onClick={() => jumpToMonth(key)} aria-current={displayedActiveMonth === key ? "location" : undefined} className="relative block w-full rounded-xl px-2 py-1.5 text-left text-sm text-[var(--muted-ink)] transition hover:bg-white aria-[current=location]:bg-[var(--rose)] aria-[current=location]:font-semibold aria-[current=location]:text-white">
                    <span className="absolute -left-[1.18rem] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#c69a76]" />{Number(month)}月
                  </button>
                </div>;
              })}
            </div>
          </div>
        </nav>

        <div className="relative min-w-0 pb-10">
        <div className="absolute bottom-0 left-1/2 top-0 hidden w-1 -translate-x-1/2 rounded-full bg-[linear-gradient(var(--rose),#d69b70,#87a86f)] opacity-45 md:block" aria-hidden="true" />
        {groups.map(([key, dayItems], groupIndex) => {
          const anchor = dayItems[0];
          const year = key.slice(0, 4);
          const month = key.slice(5, 7);
          const showYear = groupIndex === 0 || groups[groupIndex - 1][0].slice(0, 4) !== year;
          const showMonth = groupIndex === 0 || groups[groupIndex - 1][0].slice(0, 7) !== key.slice(0, 7);
          return (
            <div key={key} id={showMonth ? `memory-month-${key.slice(0, 7)}` : undefined} className="relative mb-12 scroll-mt-40">
              {showYear ? <div className="mb-5 text-center"><span className="inline-flex rounded-full border border-[#c9a681] bg-[var(--paper)] px-5 py-2 font-serif text-xl font-semibold shadow-sm">{year} · 年轮</span></div> : null}
              {showMonth ? <div className="mb-4 text-center text-sm font-semibold tracking-[0.2em] text-[var(--rose)]">{month}月 · 新枝</div> : null}
              <div className="relative mb-6 text-center">
                <span className="inline-flex min-w-44 flex-col rounded-[1.4rem] border border-[var(--line)] bg-white px-5 py-3 shadow-sm">
                  <strong className="font-serif text-lg">{displayDate(anchor.occurredAt)}</strong>
                  <span className="mt-1 text-xs text-[var(--muted-ink)]">{displayWeekday(anchor.occurredAt)}</span>
                </span>
              </div>
              <div className="grid gap-5">
                {dayItems.map((item, index) => {
                  const { Icon, label, fruit } = kindMeta[item.kind];
                  const editable = item.kind === "memory" && item.authorId === viewerId && Boolean(item.createdAt) && canAuthorMutate(item.createdAt!, now);
                  const side = index % 2 === 0 ? "md:mr-[52%]" : "md:ml-[52%]";
                  return (
                    <article id={`${item.kind}-${item.id}`} key={`${item.kind}-${item.id}`} className={`group relative ${side}`}>
                      <span className={`absolute top-8 hidden h-px w-[10%] bg-[#c99b79] md:block ${index % 2 === 0 ? "-right-[10%]" : "-left-[10%]"}`} />
                      <div className="rounded-[1.6rem] border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[0_12px_30px_rgba(108,77,55,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(108,77,55,0.13)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--rose)]"><Icon size={15} /> {label} · {fruit}</div>
                          <time className="text-xs text-[var(--muted-ink)]">{displayTime(item.createdAt ?? item.occurredAt)}</time>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--line)] bg-white text-xs font-semibold">
                            {item.authorAvatarUrl ? <img src={item.authorAvatarUrl} alt="" className="h-full w-full object-cover" /> : (item.authorName ?? "我").slice(0, 1)}
                          </span>
                          <span className="text-xs text-[var(--muted-ink)]">{item.authorName ?? "我们"}</span>
                        </div>
                        <h2 className="mt-2 text-base font-semibold">{item.title}</h2>
                        {item.description ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted-ink)]">{item.description}</p> : null}
                        {item.imageUrl ? (
                          <button type="button" onClick={() => setLightbox(item)} aria-label={`查看${item.title}大图`} className="mt-3 block w-full overflow-hidden rounded-2xl">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.imageUrl} alt={item.title} className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                          </button>
                        ) : null}
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <button type="button" onClick={() => setDetail(item)} aria-label={`查看${item.title}详情`} className="text-sm font-medium text-[var(--rose)]">查看更多 →</button>
                          {editable ? <div className="flex gap-2">
                            <button type="button" className="cos-button-secondary gap-1 px-3 text-xs" onClick={() => setEditingId(editingId === item.id ? null : item.id)}><Pencil size={13} />编辑</button>
                            <form action={deleteMemoryFromForm}><input type="hidden" name="id" value={item.id} /><button type="submit" className="cos-button-secondary gap-1 px-3 text-xs text-[var(--rose)]"><Trash2 size={13} />删除</button></form>
                          </div> : null}
                        </div>
                        {editingId === item.id ? (
                          <form action={updateMemoryFromForm} className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4">
                            <input type="hidden" name="id" value={item.id} />
                            <input name="title" maxLength={30} defaultValue={item.title === "一段回忆" ? "" : item.title} className="cos-input px-3" aria-label="修改回忆标题" />
                            <textarea name="body" maxLength={150} required defaultValue={item.description} className="cos-input px-3 py-2" aria-label="修改回忆描述" />
                            <input name="occurredOn" type="date" defaultValue={item.occurredAt.slice(0, 10)} className="cos-input px-3" />
                            <button type="submit" className="cos-button-primary px-4">保存修改</button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
        {visibleItems.length === 0 ? <div className="rounded-[2rem] border border-dashed border-[var(--line)] py-20 text-center text-sm text-[var(--muted-ink)]">这根枝桠还在等待新的故事。</div> : null}
        </div>
      </div>

      {detail ? <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" role="dialog" aria-label={detail.title}>
        <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-[var(--paper)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-[var(--rose)]">{kindMeta[detail.kind].label} · {displayDate(detail.occurredAt)}</p><h2 className="mt-2 font-serif text-2xl font-semibold">{detail.title}</h2></div><button type="button" onClick={() => setDetail(null)} aria-label="关闭详情"><X /></button></div>
          {detail.imageUrl ? <button type="button" onClick={() => setLightbox(detail)} aria-label={`查看${detail.title}大图`} className="mt-5 overflow-hidden rounded-2xl"><img src={detail.imageUrl} alt={detail.title} className="max-h-[55vh] w-full object-contain" /></button> : null}
          {detail.description ? <p className="mt-5 whitespace-pre-wrap text-base leading-8">{detail.description}</p> : null}
          <p className="mt-5 text-sm text-[var(--muted-ink)]">由 {detail.authorName ?? "我们"} 留下 · {displayTime(detail.createdAt ?? detail.occurredAt)}</p>
        </div>
      </div> : null}

      {lightbox?.imageUrl ? <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4" role="dialog" aria-label={`${lightbox.title}大图`}>
        <button type="button" onClick={() => setLightbox(null)} className="absolute right-5 top-5 rounded-full bg-white/15 p-3 text-white" aria-label="关闭大图"><X /></button>
        <img src={lightbox.imageUrl} alt={lightbox.title} className="max-h-[82vh] max-w-[92vw] object-contain" />
        <a href={lightbox.imageUrl} download className="absolute bottom-6 flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"><Download size={16} />下载原图</a>
      </div> : null}

      {showFloatingFilter ? (
        <div className="fixed right-5 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-3">
          <div className="floating-filter-menu relative">
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowFilterMenu(!showFilterMenu); }} className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 shadow-lg">
              <span className="text-sm font-medium text-[var(--muted-ink)]">
                {filters.find((f) => f.value === filter)?.label} {counts[filter]}
              </span>
            </button>
            {showFilterMenu ? (
              <div className="absolute right-0 top-full mt-2 w-36 overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-lg">
                {filters.map(({ value, label, Icon }) => (
                  <button key={value} type="button" onClick={() => { setFilter(value); setShowFilterMenu(false); }} aria-pressed={filter === value}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--muted-ink)] transition hover:bg-[var(--rose)]/5 aria-pressed:bg-[var(--rose)] aria-pressed:text-white">
                    <Icon size={14} /> {label} <span className="text-xs opacity-75">{counts[value]}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={() => setShowComposer(true)} className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--rose)]/25 bg-[var(--rose)] text-white shadow-lg transition hover:-translate-y-1">
            <Plus size={20} />
          </button>
        </div>
      ) : null}

      {showComposer ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4" role="dialog" aria-label="添加回忆">
          <div className="cos-modal w-full max-w-md p-5 sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl font-semibold">添加一段回忆</h2>
                <p className="mt-1 text-sm text-[var(--muted-ink)]">一段短短的文字、一张照片，长成树上的一颗果实。</p>
              </div>
              <button type="button" onClick={() => setShowComposer(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)]" aria-label="关闭添加回忆窗口">
                <X size={18} />
              </button>
            </div>
            <MemoryComposer today={new Date().toISOString().slice(0, 10)} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
