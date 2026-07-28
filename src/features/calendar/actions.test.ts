import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, revalidatePath } = vi.hoisted(() => ({ rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn().mockResolvedValue({ spaceId: "space-1" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({ rpc }),
}));

import {
  createCalendarEventAction,
} from "./actions";
import { deriveCalendarLetterStatus } from "./letter-status";

describe("calendar actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ error: null });
  });

  it("forwards event classification and memory importance to the protected RPC", async () => {
    await expect(createCalendarEventAction({
      name: "一起旅行",
      eventDate: "2026-08-01",
      endDate: "2026-08-03",
      eventType: "travel",
      recurrence: "none",
      isImportant: false,
      description: "去海边",
      icon: "✈️",
      color: "blue",
    })).resolves.toEqual({ ok: true, message: "事件已记到日历。" });
    expect(rpc).toHaveBeenCalledWith("create_space_calendar_event_v2", {
      p_space_id: "space-1",
      p_name: "一起旅行",
      p_event_date: "2026-08-01",
      p_end_date: "2026-08-03",
      p_event_type: "travel",
      p_recurrence: "none",
      p_is_important: false,
      p_description: "去海边",
      p_icon: "✈️",
      p_color: "blue",
    });
  });

  it("rejects unknown types and backwards date ranges", async () => {
    await expect(createCalendarEventAction({
      name: "错误",
      eventDate: "2026-08-03",
      endDate: "2026-08-01",
      eventType: "other",
      recurrence: "none",
      isImportant: false,
      description: "",
      icon: "⭐",
      color: "rose",
    })).resolves.toEqual({ ok: false, message: "结束日期不能早于开始日期。" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("derives calendar unread status only from active unread notifications", () => {
    expect(deriveCalendarLetterStatus({
      sealed: false,
      hasUnreadNotification: true,
    })).toBe("unread");
    expect(deriveCalendarLetterStatus({
      sealed: false,
      hasUnreadNotification: false,
    })).toBe("read");
    expect(deriveCalendarLetterStatus({
      sealed: true,
      hasUnreadNotification: true,
    })).toBe("sealed");
  });
});

it("does not filter notification enums with values that may not exist yet", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const source = await readFile(
    resolve(process.cwd(), "src/features/calendar/actions.ts"),
    "utf8",
  );
  expect(source).not.toContain('.in("type",["journal_created","future_diary_ready"])');
  expect(source).toContain('select("source_id,type")');
  expect(source).toContain('.eq("is_read",false).eq("is_active",true)');
  expect(source).not.toContain('.limit(200)');
});
