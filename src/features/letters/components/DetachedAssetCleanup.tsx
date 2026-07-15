"use client";

import { useEffect } from "react";

import { cleanupDetachedLetterAssetsAction } from "../detached-asset-cleanup-action";

const SESSION_KEY_PREFIX = "nkd:detached-letter-assets-cleaned:v1";
const inFlight = new Set<string>();

export function DetachedAssetCleanup({
  userId,
  runCleanup = cleanupDetachedLetterAssetsAction,
}: {
  userId: string;
  runCleanup?: () => Promise<{ ok: boolean }>;
}) {
  useEffect(() => {
    const sessionKey = `${SESSION_KEY_PREFIX}:${userId}`;
    try {
      if (window.sessionStorage.getItem(sessionKey)) return;
    } catch {
      // Cleanup remains opportunistic when browser storage is unavailable.
    }
    if (inFlight.has(sessionKey)) return;
    inFlight.add(sessionKey);
    void runCleanup()
      .then((result) => {
        if (!result.ok) return;
        try {
          window.sessionStorage.setItem(sessionKey, "1");
        } catch {
          // A later mount may repeat this harmless cleanup.
        }
      })
      .catch(() => undefined)
      .finally(() => inFlight.delete(sessionKey));
  }, [runCleanup, userId]);

  return null;
}
