export type ServerTimingEntry = { name: string; durationMs: number };

function timingName(name: string) {
  const normalized = name.trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
  return normalized || "operation";
}

export async function measureServerTiming<T>(
  name: string,
  operation: () => Promise<T>,
  now: () => number = () => performance.now(),
): Promise<{ value: T; timing: ServerTimingEntry }> {
  const startedAt = now();
  const value = await operation();
  return { value, timing: { name: timingName(name), durationMs: Math.max(0, now() - startedAt) } };
}

export function formatServerTiming(entries: ServerTimingEntry[]) {
  return entries.map((entry) => `${timingName(entry.name)};dur=${entry.durationMs.toFixed(1)}`).join(", ");
}
