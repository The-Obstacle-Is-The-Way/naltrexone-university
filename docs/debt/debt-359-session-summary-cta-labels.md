# DEBT-359: Session Summary CTA Label Clarity

**Priority:** P2
**Created:** 2026-04-11
**Status:** Open
**Affected surface:** Session Summary (`app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`)
**Related:** [BS-063](../brainstorming/bs-063-exam-review-reentry-state-confusion.md) — ship together with cursor reset and re-entry label fixes for a coherent Summary ↔ Review round-trip

---

## Problem

The Session Summary CTA labels are ambiguous or unnecessarily verbose:

### 1. "Back to Practice" is directionally confusing

The user just *finished* a practice session. "Back to" implies returning to an interrupted activity, but nothing was interrupted — the session completed. The destination is `/app/practice` (the session setup page), which means the user's *actual* intent when clicking this button is to start a new session.

"Back to Practice" raises a natural question: *back to what?* Back to the session I just finished? Back to a list? Back to the setup page? The label communicates navigation direction ("back") instead of user intent ("do another one").

**Current label:** `Back to Practice`
**Recommended label:** `New Session`

Alternatives considered:
- "Practice Again" — warm but slightly misleading; the button goes to the config page, not directly into a new session
- "Start New Session" — accurate but 3 words where 2 suffice
- "Exit" — too generic, doesn't hint at what comes next

"New Session" wins because:
- 2 words, action-oriented
- Communicates intent, not direction
- Accurate — clicking takes you to the page where you configure and start a new session

### 2. "Review your answers" is unnecessarily wordy

"Your" adds no information. The user knows whose answers they are.

**Current label:** `Review your answers`
**Recommended label:** `Review Answers`

---

## Scope

### Files requiring label changes

| File | Change |
|------|--------|
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:136,147,156` | Update button labels |

### Files requiring test updates

| File | Reason |
|------|--------|
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx` | Label assertions |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.browser.spec.tsx` | Label assertions |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` | `Review your answers` button/link assertions |
| `app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.test.tsx` | `Review your answers` label assertion |
| `app/(app)/app/practice/[sessionId]/page.test.tsx` | Both label assertions |
| `app/(app)/app/practice/quick/quick-practice-client.test.tsx` | `Back to Practice` assertion |
| `app/(app)/app/practice/quick/error.test.tsx` | `Back to Practice` assertion |
| `app/(app)/app/practice/quick/error.tsx` | `Back to Practice` label in error links |
| `app/(app)/app/practice/quick/quick-practice-client.tsx:76` | `Back to Practice` label in backLink prop |
| `app/(app)/app/practice/quick/page.test.tsx` | `Back to Practice` assertion |
| `app/(app)/app/practice/[sessionId]/error.tsx` | `Back to Practice` label in error links |
| `app/(app)/app/practice/[sessionId]/error.test.tsx` | `Back to Practice` assertion |
| `app/(app)/app/questions/[slug]/question-page-client.tsx:117,135` | `Back to Practice` in backLabel |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx:277` | `Back to Practice` assertion |
| `tests/e2e/practice.spec.ts` | E2E assertion on `View in History` (unchanged, but verify no `Back to Practice` assertions) |

### Documentation updates

Interaction contracts and architecture docs reference the old labels:
- `docs/practice-engine/interaction-contracts.md`
- `docs/practice-engine/question-rendering-architecture.md`

---

## Additional note: "Back to Practice" in other surfaces

The `Back to Practice` label also appears in the Quick Practice flow and question review pages (not just Session Summary). Renaming it to `New Session` on the Session Summary makes sense, but the other surfaces use "Back to Practice" in a different context — navigating away from an in-progress view back to the practice setup page. In those contexts, "Back to Practice" may still be appropriate since you *are* going back. This debt ticket scopes to the **Session Summary** surface only, where the session is already complete.

If the broader rename is desired, it should be a separate sweep after evaluating each surface's context.

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Rename "Back to Practice" → "New Session" on Session Summary | "Back to" is directionally confusing post-completion; "New Session" communicates intent |
| 2026-04-11 | Rename "Review your answers" → "Review Answers" | Remove unnecessary possessive; tighter label |
| 2026-04-11 | Scope to Session Summary only | Other surfaces use "Back to Practice" in a navigational context where "back" is semantically correct |
