import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202607130004_event_reminder_cron.sql"),
  "utf8",
);

describe("event reminder cron migration", () => {
  it("keeps reminder generation private, scheduled, and idempotent", () => {
    expect(migration).toContain("function private.enqueue_due_event_notifications");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("not exists");
    expect(migration).toContain("'enqueue-due-event-notifications'");
    expect(migration).toMatch(/revoke all on function private\.enqueue_due_event_notifications\(date\) from public, anon, authenticated/i);
  });

  it("reserves occurrence reminders for the private scheduler", () => {
    expect(migration).toMatch(/drop policy if exists "couple members can create notifications" on public\.notifications/i);
    expect(migration).toMatch(/type <> 'calendar_event'::public\.notification_type/i);
    expect(migration).toMatch(/occurrence_date is null/i);
    expect(migration).toMatch(/revoke insert on public\.notifications from authenticated/i);
    expect(migration).toMatch(
      /grant insert \(recipient_id, type, source_id, title, body\) on public\.notifications to authenticated/i,
    );
  });
});
