"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Music2, Pause, Play, X } from "lucide-react";

const PLAYLIST_ID = "18189032813";
const EMBED_URL = `https://music.163.com/outchain/player?type=0&id=${PLAYLIST_ID}&auto=0&height=430`;
const PLAYLIST_URL = `https://music.163.com/#/playlist?id=${PLAYLIST_ID}`;

const STORAGE_KEY = "nkddiary-player-position";
const BOTTOM_NAV_HEIGHT = 80;
const EDGE_MARGIN = 16;
const PLAYER_WIDTH = 280;
const PLAYER_HEIGHT = 56;

function savePosition(position: { x: number; y: number }) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // ignore
  }
}

function getInitialPosition(): { x: number; y: number } {
  if (typeof window === "undefined") {
    return { x: EDGE_MARGIN, y: 200 };
  }
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  const defaultX = window.innerWidth - PLAYER_WIDTH - EDGE_MARGIN;
  const defaultY = window.innerHeight - BOTTOM_NAV_HEIGHT - PLAYER_HEIGHT - EDGE_MARGIN - 80;
  return { x: defaultX, y: defaultY };
}

export function GramophonePlayer() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setPosition(getInitialPosition());
    });

    const handleResize = () => {
      const maxX = window.innerWidth - PLAYER_WIDTH - EDGE_MARGIN;
      const maxY = window.innerHeight - BOTTOM_NAV_HEIGHT - PLAYER_HEIGHT - EDGE_MARGIN;
      setPosition((current) => {
        if (!current) return getInitialPosition();
        const newX = Math.max(EDGE_MARGIN, Math.min(current.x, maxX));
        const newY = Math.max(EDGE_MARGIN, Math.min(current.y, maxY));
        return newX === current.x && newY === current.y
          ? current
          : { x: newX, y: newY };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      active = false;
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!dragContainerRef.current || !position) return;
    dragContainerRef.current.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !position) return;
    const maxX = typeof window !== "undefined" ? window.innerWidth - PLAYER_WIDTH - EDGE_MARGIN : 0;
    const maxY = typeof window !== "undefined" ? window.innerHeight - BOTTOM_NAV_HEIGHT - PLAYER_HEIGHT - EDGE_MARGIN : 0;
    const newX = Math.max(EDGE_MARGIN, Math.min(e.clientX - dragOffset.x, maxX));
    const newY = Math.max(EDGE_MARGIN, Math.min(e.clientY - dragOffset.y, maxY));
    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = () => {
    if (!isDragging || !position) return;
    setIsDragging(false);
    const screenWidth = typeof window !== "undefined" ? window.innerWidth : 0;
    const playerCenterX = position.x + PLAYER_WIDTH / 2;
    const screenCenterX = screenWidth / 2;
    const maxX = screenWidth - PLAYER_WIDTH - EDGE_MARGIN;
    const newX = playerCenterX >= screenCenterX ? maxX : EDGE_MARGIN;
    const newPosition = { x: newX, y: position.y };
    setPosition(newPosition);
    savePosition(newPosition);
  };

  const stopPropagation = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="fixed bottom-6 right-5 z-40 rounded-full border border-[#c9a681] bg-[var(--paper)] p-3 shadow-lg"
        aria-label="重新打开回忆音乐"
        onPointerDown={stopPropagation}
      >
        <Music2 size={19} />
      </button>
    );
  }

  return (
    <>
      {open ? (
        <div className="fixed inset-x-0 bottom-0 z-50 md:relative md:right-4 md:w-[min(92vw,360px)]">
          <div className={`h-[60vh] w-full overflow-hidden rounded-t-[1.6rem] border-t border-x border-[#d9bea4] bg-[var(--paper)] shadow-2xl md:rounded-[1.6rem] md:h-auto`}>
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div>
                <p className="font-serif text-base font-semibold">回忆留声机</p>
                <p className="text-xs text-[var(--muted-ink)]">我们的网易云歌单</p>
              </div>
              <div className="flex items-center gap-1">
                <a
                  href={PLAYLIST_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full p-2 hover:bg-white"
                  aria-label="在网易云打开歌单"
                  onPointerDown={stopPropagation}
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-2 hover:bg-white"
                  aria-label="收起播放器"
                  onPointerDown={stopPropagation}
                >
                  <ChevronDown size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setHidden(true)}
                  className="rounded-full p-2 hover:bg-white"
                  aria-label="关闭播放器"
                  onPointerDown={stopPropagation}
                >
                  <X size={17} />
                </button>
              </div>
            </div>
            <iframe
              title="网易云音乐回忆歌单"
              src={EMBED_URL}
              width="100%"
              height="450"
              frameBorder="0"
              allow="autoplay; encrypted-media"
              loading="lazy"
            />
          </div>
        </div>
      ) : null}

      <aside
        className="fixed z-40"
        style={{
          left: position?.x,
          top: position?.y,
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
          transform: isDragging ? "scale(1.02)" : "scale(1)",
          transition: isDragging ? "none" : "left 0.3s ease, top 0.3s ease, transform 0.15s ease",
        }}
        aria-label="回忆音乐播放器"
      >
        <div
          ref={dragContainerRef}
          className={`flex h-full w-full items-center gap-3 rounded-[1rem] border border-[var(--line)] bg-[#fffdf7] px-3 py-2 shadow-md cursor-grab active:cursor-grabbing ${isDragging ? "shadow-lg" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f8f0e8]">
            <Music2 size={16} className="text-[#8b5d43]" />
          </div>

          <div className="flex flex-1 flex-col justify-center min-w-0">
            <span className="text-xs font-medium text-[var(--muted-ink)] truncate">回忆留声机</span>
            <span className="text-[10px] text-[var(--muted-ink)]/60 truncate">我们的网易云歌单</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(!isPlaying);
                setOpen(true);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f8f0e8] hover:bg-[#efe4d6] transition-colors"
              aria-label={isPlaying ? "暂停播放" : "开始播放"}
              onPointerDown={stopPropagation}
            >
              {isPlaying ? <Pause size={13} className="text-[#8b5d43]" /> : <Play size={13} className="text-[#8b5d43]" />}
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f8f0e8] hover:bg-[#efe4d6] transition-colors"
              aria-label="展开歌单"
              onPointerDown={stopPropagation}
            >
              <ExternalLink size={13} className="text-[#8b5d43]" />
            </button>
            <button
              type="button"
              onClick={() => setHidden(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[#f8f0e8] transition-colors"
              aria-label="关闭播放器"
              onPointerDown={stopPropagation}
            >
              <X size={13} className="text-[var(--muted-ink)]" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
