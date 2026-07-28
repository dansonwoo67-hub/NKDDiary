"use client";

import { useState, useEffect } from "react";
import { getDailyTip } from "@/lib/daily-tips";
import { Heart } from "lucide-react";

export function DailyTip() {
  const [tip] = useState(() => getDailyTip());
  const [showHeart, setShowHeart] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHeart(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <section className="daily-tip bg-white/70 backdrop-blur-sm rounded-2xl p-5 border border-[var(--rose)]/10">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--rose)]/10 flex items-center justify-center text-2xl">
          {tip.emoji}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--rose)] mb-1">今日宜</p>
          <p className="text-base leading-relaxed text-[var(--ink)]">
            {tip.text}
          </p>
          <div className={`mt-3 flex items-center gap-2 text-xs text-[var(--muted-ink)] transition-opacity duration-500 ${showHeart ? "opacity-100" : "opacity-0"}`}>
            <Heart size={14} className="text-[var(--rose)]" fill="currentColor" />
            <span>今天就这样做</span>
          </div>
        </div>
      </div>
    </section>
  );
}
