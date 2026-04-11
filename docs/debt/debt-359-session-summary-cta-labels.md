# DEBT-359: Session Summary CTA Label Clarity

**Priority:** P2
**Created:** 2026-04-11
**Status:** Open
**Affected surface:** Session Summary (`app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`)
**Related:** [BS-063](../brainstorming/bs-063-exam-review-reentry-state-confusion.md)

---

## Problem

The terminal Session Summary screen uses labels that are accurate from a routing perspective but weaker from a product-intent perspective:

### 1. `Back to Practice` is directionally correct but post-completion ambiguous

The button routes to `/app/practice`, which is the setup page for starting another session. On a completed summary surface, `Back to Practice` emphasizes direction (`back`) instead of the likely user goal (`start another session`).

**Current label:** `Back to Practice`
**Recommended label:** `New Session`

Alternatives considered:

- `Practice Again`: friendly, but it implies an immediate restart rather than a return to setup
- `Start New Session`: accurate, but longer
- `Exit`: too generic

### 2. `Review your answers` is longer than it needs to be

`your` does not carry useful information here.

**Current label:** `Review your answers`
**Recommended label:** `Review Answers`

---

## Verified Current Implementation

The current strings live only in [session-summary-view.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:128):

- `Review your answers`: lines 136 and 147
- `Back to Practice`: line 156
- `View in History`: line 159

The surrounding orchestrator components do not own those strings:

- [practice-session-exam-results-renderer.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.tsx:50) only decides whether `SessionSummaryView` is rendered and whether re-entry uses a callback.
- [practice-session-page-view.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:93) only threads those props through.

---

## Scope

This debt item is scoped to the completed Session Summary surface only.

### Source file requiring the label change

| File | Change |
|------|--------|
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | Rename the two summary CTAs |

### Tests that currently assert these labels

| File | Why it needs updates |
|------|----------------------|
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx` | Static markup assertions for both labels |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.browser.spec.tsx` | Browser assertions for link/button names and CTA variants |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` | Orchestrator-level assertions for the callback-driven `Review your answers` button |
| `app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.test.tsx` | Summary-branch assertion for `Review your answers` |
| `app/(app)/app/practice/[sessionId]/page.test.tsx` | End-to-end page rendering assertions for both summary labels |

### Documentation that would need copy updates if this ships

| File | Why |
|------|-----|
| `docs/practice-engine/interaction-contracts.md` | Describes the current summary CTA copy |
| `docs/practice-engine/question-rendering-architecture.md` | Still lists the current summary CTA copy in the architecture reference |
| `docs/brainstorming/bs-063-exam-review-reentry-state-confusion.md` | Discusses the Summary <-> Review loop in the current labels |

---

## Out of Scope

This debt item does **not** imply a repo-wide rename of every `Back to Practice` string.

Other surfaces still use that label in a different context:

- Quick Practice back links
- Session-level error states
- Standalone question review origins without `sessionId`

Those are navigational return links, not terminal session-summary CTAs. They should be evaluated separately.

---

## Feasibility Notes

- The implementation change is trivial: it is a string-only edit in one component.
- The real work is the test sweep and doc-copy sweep listed above.
- No routing logic changes are required; the destination remains `/app/practice`.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Keep the debt scoped to Session Summary only | Other `Back to Practice` labels live in materially different contexts. |
| 2026-04-11 | Recommend `New Session` over `Start New Session` | Shorter and still accurate for a CTA that routes to session setup. |
| 2026-04-11 | Recommend `Review Answers` over `Review your answers` | Tighter copy with no loss of meaning. |
| 2026-04-11 | Corrected the downstream file list | The earlier draft incorrectly swept in unrelated quick-practice and standalone-review surfaces. |
