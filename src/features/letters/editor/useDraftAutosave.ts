"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { countCharacters } from "@/lib/validation/text-limits";

export type AutosaveState = "idle" | "saving" | "saved" | "offline" | "conflict";
export type AutosaveFailureKind =
  | "network"
  | "validation"
  | "locked"
  | "database"
  | "unknown";
export type AutosaveFailure = { kind: AutosaveFailureKind; message: string };
export type AutosaveFlushOutcome = {
  state: AutosaveState;
  recoverySafe: boolean;
  failure: AutosaveFailure | null;
  draft?: AutosaveDraft;
};

export type AutosaveDraft = {
  id?: string;
  version: number;
  kind: "daily" | "time_capsule";
  letterDate: string;
  salutation: string;
  bodyJson: Record<string, unknown>;
  bodyText: string;
  finalLine: string;
  sliders: {
    selfMoodValue: number;
    mealValue: number;
    healthValue: number;
  } | null;
  scheduledFor?: string;
};

export type AutosaveSaveResult =
  | {
      ok: true;
      id?: string;
      version?: number;
      letter?: { id: string; version: number };
    }
  | { ok: false; code?: string; message: string };

export type ConflictResolution =
  | { strategy: "use-server"; draft: AutosaveDraft }
  | { strategy: "keep-local"; serverVersion: number; serverId?: string };

type RecoveryEnvelope = {
  schema: 1;
  identity: string;
  revision: number;
  draft: AutosaveDraft;
};

const RECOVERY_PREFIX = "nkd-diary:draft:";
const MAX_RECOVERY_BYTES = 750_000;
// Matches draftSchema's browser/server validation: JavaScript UTF-16 string units.
export const RECOVERY_BODY_MAX_LENGTH = 50_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function draftRecoveryKey(identity: string, id?: string) {
  return `${RECOVERY_PREFIX}${id ?? `new:${encodeURIComponent(identity)}`}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeJson(value: unknown, depth = 0, budget = { nodes: 0 }): unknown {
  budget.nodes += 1;
  if (depth > 30 || budget.nodes > 12_000) return null;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (/^(data|blob):/i.test(value)) return "";
    return value.slice(0, 100_000);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 5_000).map((item) => sanitizeJson(item, depth + 1, budget));
  }
  if (!isPlainRecord(value)) return null;

  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (item === undefined) continue;
    result[key] = sanitizeJson(item, depth + 1, budget);
  }
  return result;
}

function isAutosaveDraft(value: unknown): value is AutosaveDraft {
  if (!isPlainRecord(value)) return false;
  if (value.id !== undefined && typeof value.id !== "string") return false;
  if (!Number.isInteger(value.version) || Number(value.version) < 0) return false;
  if (value.kind !== "daily" && value.kind !== "time_capsule") return false;
  if (typeof value.letterDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.letterDate)) return false;
  if (typeof value.salutation !== "string" || countCharacters(value.salutation) > 7) return false;
  if (
    typeof value.bodyText !== "string" ||
    value.bodyText.length > RECOVERY_BODY_MAX_LENGTH
  ) return false;
  if (typeof value.finalLine !== "string" || countCharacters(value.finalLine) > 7) return false;
  if (!isPlainRecord(value.bodyJson)) return false;
  if (value.scheduledFor !== undefined && typeof value.scheduledFor !== "string") return false;
  if (value.sliders !== null) {
    if (!isPlainRecord(value.sliders)) return false;
    for (const key of ["selfMoodValue", "mealValue", "healthValue"]) {
      const slider = value.sliders[key];
      if (!Number.isInteger(slider) || Number(slider) < 1 || Number(slider) > 5) return false;
    }
  }
  return true;
}

function recoveryStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readDraftRecovery(identity: string, id?: string): AutosaveDraft | null {
  const storage = recoveryStorage();
  if (!storage) return null;
  const raw = storage.getItem(draftRecoveryKey(identity, id));
  if (!raw || raw.length > MAX_RECOVERY_BYTES) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainRecord(parsed)) return null;
    if (parsed.schema !== 1 || parsed.identity !== identity) return null;
    if (!Number.isInteger(parsed.revision) || Number(parsed.revision) < 0) return null;
    if (!isAutosaveDraft(parsed.draft)) return null;
    if (id && parsed.draft.id !== id) return null;
    const sanitized = sanitizeJson(parsed.draft);
    return isAutosaveDraft(sanitized) ? sanitized : null;
  } catch {
    return null;
  }
}

function writeRecovery(identity: string, revision: number, draft: AutosaveDraft): boolean {
  const storage = recoveryStorage();
  if (!storage) return false;
  try {
    if (JSON.stringify(draft).length > MAX_RECOVERY_BYTES) return false;
  } catch {
    return false;
  }
  const sanitized = sanitizeJson(draft);
  if (!isAutosaveDraft(sanitized)) return false;
  const envelope: RecoveryEnvelope = { schema: 1, identity, revision, draft: sanitized };
  const serialized = JSON.stringify(envelope);
  if (serialized.length > MAX_RECOVERY_BYTES) return false;
  try {
    storage.setItem(draftRecoveryKey(identity, draft.id), serialized);
    return storage.getItem(draftRecoveryKey(identity, draft.id)) === serialized;
  } catch {
    return false;
  }
}

function classifyFailure(result: Extract<AutosaveSaveResult, { ok: false }>): AutosaveFailure {
  switch (result.code) {
    case "VALIDATION_ERROR":
      return { kind: "validation", message: result.message };
    case "LETTER_LOCKED":
    case "NOT_FOUND":
      return { kind: "locked", message: result.message };
    case "DATABASE_ERROR":
      return { kind: "database", message: result.message };
    case "NETWORK_ERROR":
      return { kind: "network", message: result.message };
    default:
      return { kind: "unknown", message: result.message };
  }
}

function removeRecovery(identity: string, id?: string) {
  try {
    recoveryStorage()?.removeItem(draftRecoveryKey(identity, id));
  } catch {
    // Best effort only.
  }
}

export function useDraftAutosave({
  initialDraft,
  recoveryIdentity,
  save,
  delayMs = 1_000,
  saveInitial = false,
}: {
  initialDraft: AutosaveDraft;
  recoveryIdentity: string;
  save: (draft: AutosaveDraft) => Promise<AutosaveSaveResult>;
  delayMs?: number;
  saveInitial?: boolean;
}) {
  const [starting] = useState(() => {
    const recovered =
      readDraftRecovery(recoveryIdentity, initialDraft.id) ??
      (!initialDraft.id ? readDraftRecovery(recoveryIdentity) : null);
    return { draft: recovered ?? initialDraft, recovered: Boolean(recovered) };
  });
  const startingDraft = starting.draft;
  const [draft, setDraft] = useState(startingDraft);
  const [state, setState] = useState<AutosaveState>(starting.recovered ? "offline" : "idle");
  const [conflict, setConflict] = useState<{ message: string } | null>(null);
  const [recoverySafe, setRecoverySafe] = useState(starting.recovered);
  const [failure, setFailure] = useState<AutosaveFailure | null>(null);
  const draftRef = useRef(startingDraft);
  const stateRef = useRef<AutosaveState>(starting.recovered ? "offline" : "idle");
  const revisionRef = useRef(starting.recovered || saveInitial ? 1 : 0);
  const savedRevisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<AutosaveState> | null>(null);
  const saveRef = useRef(save);
  const mountedRef = useRef(true);
  const conflictRef = useRef(false);
  const recoverySafeRef = useRef(starting.recovered);
  const failureRef = useRef<AutosaveFailure | null>(null);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const commitState = useCallback((next: AutosaveState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const commitRecoverySafety = useCallback((safe: boolean) => {
    recoverySafeRef.current = safe;
    if (mountedRef.current) setRecoverySafe(safe);
  }, []);

  const commitFailure = useCallback((next: AutosaveFailure | null) => {
    failureRef.current = next;
    if (mountedRef.current) setFailure(next);
  }, []);

  const persistLatest = useCallback(() => {
    const safe = writeRecovery(recoveryIdentity, revisionRef.current, draftRef.current);
    commitRecoverySafety(safe);
    return safe;
  }, [commitRecoverySafety, recoveryIdentity]);

  const drain = useCallback((): Promise<AutosaveState> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (conflictRef.current) return Promise.resolve("conflict");
    if (revisionRef.current <= savedRevisionRef.current) {
      return Promise.resolve(stateRef.current === "saving" ? "saved" : stateRef.current);
    }
    if (inFlightRef.current) return inFlightRef.current;

    const operation = (async () => {
      while (
        !conflictRef.current &&
        revisionRef.current > savedRevisionRef.current
      ) {
        const savingRevision = revisionRef.current;
        const savingDraft = draftRef.current;
        const oldId = savingDraft.id;
        commitState("saving");

        let result: AutosaveSaveResult;
        try {
          result = await saveRef.current(savingDraft);
        } catch (error) {
          result = {
            ok: false,
            code: "NETWORK_ERROR",
            message: error instanceof Error ? error.message : "network error",
          };
        }

        if (!result.ok) {
          persistLatest();
          if (result.code === "VERSION_CONFLICT") {
            conflictRef.current = true;
            if (mountedRef.current) setConflict({ message: result.message });
            commitState("conflict");
            return "conflict";
          }
          commitFailure(classifyFailure(result));
          commitState("offline");
          return "offline";
        }

        commitFailure(null);

        const serverId = result.letter?.id ?? result.id ?? oldId;
        const serverVersion = result.letter?.version ?? result.version;
        const latest = draftRef.current;
        const nextDraft: AutosaveDraft = {
          ...latest,
          ...(serverId ? { id: serverId } : {}),
          version:
            typeof serverVersion === "number"
              ? serverVersion
              : Math.max(latest.version, savingDraft.version + 1),
        };
        draftRef.current = nextDraft;
        if (mountedRef.current) setDraft(nextDraft);
        savedRevisionRef.current = savingRevision;

        if (oldId !== serverId) removeRecovery(recoveryIdentity, oldId);
        if (revisionRef.current === savingRevision) {
          removeRecovery(recoveryIdentity, serverId);
          commitRecoverySafety(false);
        } else {
          commitRecoverySafety(
            writeRecovery(recoveryIdentity, revisionRef.current, nextDraft),
          );
        }
      }

      commitState("saved");
      return "saved";
    })();

    inFlightRef.current = operation;
    void operation.finally(() => {
      if (inFlightRef.current === operation) inFlightRef.current = null;
    });
    return operation;
  }, [commitFailure, commitRecoverySafety, commitState, persistLatest, recoveryIdentity]);

  const update = useCallback(
    (next: AutosaveDraft) => {
      if (conflictRef.current) {
        const current = draftRef.current;
        draftRef.current = {
          ...next,
          id: current.id ?? next.id,
          version: current.version,
        };
        revisionRef.current += 1;
        if (mountedRef.current) setDraft(draftRef.current);
        persistLatest();
        return;
      }

      const current = draftRef.current;
      draftRef.current = {
        ...next,
        id: current.id ?? next.id,
        version: current.version,
      };
      revisionRef.current += 1;
      if (mountedRef.current) setDraft(draftRef.current);
      persistLatest();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void drain();
      }, delayMs);
    },
    [delayMs, drain, persistLatest],
  );

  const flush = useCallback(async () => {
    if (revisionRef.current > savedRevisionRef.current) persistLatest();
    const nextState = await drain();
    return {
      state: nextState,
      recoverySafe: recoverySafeRef.current,
      failure: failureRef.current,
      draft: draftRef.current,
    } satisfies AutosaveFlushOutcome;
  }, [drain, persistLatest]);

  const resolveConflict = useCallback(
    (resolution: ConflictResolution) => {
      conflictRef.current = false;
      if (mountedRef.current) setConflict(null);
      commitFailure(null);
      if (resolution.strategy === "use-server") {
        removeRecovery(recoveryIdentity, draftRef.current.id);
        draftRef.current = resolution.draft;
        revisionRef.current = 0;
        savedRevisionRef.current = 0;
        if (mountedRef.current) setDraft(resolution.draft);
        commitState("idle");
        return;
      }

      draftRef.current = {
        ...draftRef.current,
        id: resolution.serverId ?? draftRef.current.id,
        version: resolution.serverVersion,
      };
      if (mountedRef.current) setDraft(draftRef.current);
      persistLatest();
      commitState("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void drain();
      }, delayMs);
    },
    [commitFailure, commitState, delayMs, drain, persistLatest, recoveryIdentity],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (saveInitial && !starting.recovered) persistLatest();
    if ((starting.recovered || saveInitial) && revisionRef.current > savedRevisionRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void drain();
      }, delayMs);
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasUnsavedRevision = revisionRef.current > savedRevisionRef.current;
      if (hasUnsavedRevision && !persistLatest()) {
        event.preventDefault();
        event.returnValue = "";
      }
      // Browsers do not wait for promises during unload. This is intentionally
      // best effort; the synchronous local recovery copy is the reliable path.
      void drain();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [delayMs, drain, persistLatest, saveInitial, starting.recovered]);

  return {
    draft,
    state,
    conflict,
    recoverySafe,
    failure,
    update,
    flush,
    resolveConflict,
  };
}
