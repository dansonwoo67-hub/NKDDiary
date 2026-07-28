import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/202607190004_product_integration.sql"), "utf8");

describe("product integration migration", () => {
  it("space-scopes moods and calendar events with RLS and immutable identity", () => {
    expect(sql).toMatch(/create table public\.mood_entries[\s\S]*space_id uuid not null/i);
    expect(sql).toMatch(/alter table public\.calendar_events\s+add column space_id uuid/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/mood entry identity is immutable/i);
    expect(sql).toMatch(/calendar event identity is immutable/i);
  });

  it("exposes only narrow authenticated mutation functions", () => {
    expect(sql).toMatch(/create or replace function public\.create_mood_entry/i);
    expect(sql).toMatch(/create or replace function public\.create_space_calendar_event/i);
    expect(sql).toMatch(/create or replace function public\.update_couple_preferences/i);
    expect(sql).toMatch(/revoke all privileges on table public\.mood_entries from anon, authenticated/i);
    expect(sql).toMatch(/revoke insert, update, delete on public\.calendar_events from authenticated/i);
  });

  it("replaces the legacy profile policy with active-space-only visibility", () => {
    expect(sql).toMatch(/drop policy if exists "couple members can read profiles"/i);
    expect(sql).toMatch(/create or replace function public\.shares_active_space[\s\S]*security definer[\s\S]*set search_path = ''/i);
    expect(sql).toMatch(/create policy "users can read self and active space profiles"[\s\S]*shares_active_space\(id\)/i);
    expect(sql).toMatch(/revoke execute on function public\.shares_active_space\(uuid, uuid\) from public, anon, authenticated/i);
  });

  it("authoritatively rejects cross-space and non-due calendar reminders", () => {
    expect(sql).toMatch(/create or replace function public\.calendar_event_occurs_on/i);
    expect(sql).toMatch(/event\.space_id = v_space_id/i);
    expect(sql).toMatch(/is_active_space_member\(event\.space_id, event\.creator_id\)/i);
    expect(sql).toMatch(/not public\.calendar_event_occurs_on\(v_event\.event_date, v_event\.recurrence, v_today\)/i);
    expect(sql).toMatch(/create_legacy_notification_task7/i);
  });

  it("serializes one event occurrence after due validation and before duplicate checks", () => {
    const dueCheck = sql.indexOf("if not public.calendar_event_occurs_on(v_event.event_date, v_event.recurrence, v_today)");
    const lock = sql.indexOf("pg_catalog.pg_advisory_xact_lock");
    const duplicateCheck = sql.indexOf("if not exists (", lock);
    expect(dueCheck).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(dueCheck);
    expect(duplicateCheck).toBeGreaterThan(lock);
    expect(sql.slice(lock, duplicateCheck)).toMatch(/v_event\.id::text \|\| ':' \|\| v_today::text/i);
    expect(sql).toMatch(/notification\.created_at at time zone 'Asia\/Shanghai'\)::date = v_today/i);
  });
});
