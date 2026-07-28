"use client";

import { useEffect } from "react";

export function CursorSparkles() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || Date.now() - last < 90) return;
      last = Date.now();
      const node = document.createElement("span");
      node.textContent = Math.random() > 0.65 ? "♡" : "✦";
      node.className = "memory-cursor-sparkle";
      node.style.left = `${event.clientX}px`;
      node.style.top = `${event.clientY}px`;
      document.body.appendChild(node);
      window.setTimeout(() => node.remove(), 850);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return null;
}
