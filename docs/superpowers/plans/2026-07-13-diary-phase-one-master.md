# NKD Diary Phase One Optimization Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved first-phase diary optimization as three independently testable increments, then deploy one verified production release.

**Architecture:** First migrate the letter lifecycle and remove query bottlenecks. Next build the draft-first rich-text writing experience on the new contracts. Finally add inline interaction, personal-center navigation, and continuous heart calendar views before full regression and deployment.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/Auth/Storage/Cron, TipTap, Vitest, Playwright, Vercel

## Global Constraints

- Drafts are private, editable indefinitely, and hard-deletable.
- Published letters are immutable and withdrawable only during the first 24 hours.
- Daily letters require the three questions; time capsules skip them.
- Both letter kinds require the user-facing field “总而言之，我想跟你说” with a maximum of 7 characters.
- Both letter kinds require a response of at most 3 characters before the recipient opens them.
- Scheduled delivery is minute-granularity and may arrive at most about one minute late.
- Letter creation never contains a calendar-event entry point.
- Do not commit `.env.local`, credentials, user passwords, or Supabase secret keys.
- Preserve the unrelated untracked `desktop.ini` and `docs/audits/` files.

## Execution Order

1. [Core lifecycle and performance](./2026-07-13-diary-core-lifecycle-performance.md)
2. [Draft-first rich-text writing](./2026-07-13-diary-writing-experience.md)
3. [Inline interaction, personal center, and continuous calendar](./2026-07-13-diary-interaction-center-calendar.md)

Each plan ends with a green unit-test/build checkpoint and a focused commit. Do not deploy between plans. After all three pass, run the final end-to-end and production checklist in Plan 3.

