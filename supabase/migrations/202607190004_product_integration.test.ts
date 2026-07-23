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
});
