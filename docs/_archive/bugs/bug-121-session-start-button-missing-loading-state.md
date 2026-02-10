# BUG-121: Session Start Button Never Shows Loading State

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-09
**Resolved:** 2026-02-10

---

## Description

On `/app/practice`, starting a session correctly kicked off the server action, but the "Start session" button never showed a pending/loading state. Users could double-click because there was no visual feedback that the request was in-flight.

## Root Cause

`PracticePageClient` always passed `isPending={false}` to `PracticeSessionStarter`, even when `sessionStartStatus === 'loading'`.

- `app/(app)/app/practice/practice-page-client.tsx`

## Resolution

Wire `PracticeSessionStarter.isPending` to the session start status:

- `isPending={sessionStartStatus === 'loading'}`

Added a regression test asserting the prop wiring:

- `app/(app)/app/practice/practice-page-client.test.tsx`

## Verification

- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build`

