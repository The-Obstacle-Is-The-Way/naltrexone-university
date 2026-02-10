# BUG-124: Exam Review Data Stale After Changing Answer from Review

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-09
**Resolved:** 2026-02-10

---

## Description

In the exam review stage, opening a question from review, submitting an answer, and returning to review could show stale counts (answered/marked) and stale per-row answered state.

## Root Cause

The risk was that the review stage would not re-fetch the latest review summary after a review-opened question was answered, leaving the UI to display previously fetched data.

## Resolution

Verified that the review stage reload path correctly re-fetches review data, and added a browser regression test that simulates updated server review output after answering a review-opened question.

Key files:

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

## Verification

- `pnpm test:browser`

