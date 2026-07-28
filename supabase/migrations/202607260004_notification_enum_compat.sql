-- Run this migration by itself and wait for success before rerunning
-- 202607260001_home_activity_and_location_history.sql and
-- 202607260002_home_v7_rules.sql.
-- PostgreSQL enum values must be committed before later statements use them.
alter type public.notification_type add value if not exists 'memory_created';
alter type public.notification_type add value if not exists 'mood_created';
alter type public.notification_type add value if not exists 'profile_updated';
alter type public.notification_type add value if not exists 'journal_created';
