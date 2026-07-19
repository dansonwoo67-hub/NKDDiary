"use client";

import { useEffect, useState } from "react";

const MAX_TIMEOUT_MS = 2_147_483_647;

function isBeforeDeadline(deadline: string) {
  const timestamp = Date.parse(deadline);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function useDeadlineActive(deadline: string | undefined, enabled: boolean) {
  const [isActive, setIsActive] = useState(() => (deadline ? enabled && isBeforeDeadline(deadline) : false));

  useEffect(() => {
    if (!deadline || !enabled) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const updateDeadlineState = () => {
      const timestamp = Date.parse(deadline);
      const remaining = timestamp - Date.now();
      const active = Number.isFinite(timestamp) && remaining > 0;
      setIsActive(active);
      if (active) timeout = setTimeout(updateDeadlineState, Math.min(remaining, MAX_TIMEOUT_MS));
    };

    updateDeadlineState();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [deadline, enabled]);

  return enabled && isActive;
}
