# Bookmark Surface Policy

**Last Updated:** 2026-03-16
**Related:** [BS-053](../brainstorming/bs-053-bookmark-vs-mark-for-review-collision.md) (bookmark vs mark-for-review collision), [BS-052](../brainstorming/bs-052-bookmark-icon-toggle-replacement.md) (bookmark icon toggle), [Bookmarks Dossier](./pages/bookmarks.md) (complete vertical-slice documentation)

---

## Purpose

This document is the single source of truth for **where the bookmark action appears** across the application and **why**. It exists to prevent surface drift — bookmark showing up where it creates confusion or being absent where it's most needed.

## Guiding Principle

**Bookmark belongs where users are reflecting, not where they're performing.**

- **Reflecting** = reading explanations, reviewing past attempts, curating study material
- **Performing** = answering questions under time pressure, navigating an exam, submitting answers

## Surface Registry

### Current State (as-built)

| Surface | Route | Bookmark Present | Notes |
|---------|-------|-----------------|-------|
| Practice Session (Tutor) | `/app/practice/[sessionId]` | YES | Action bar pill |
| Practice Session (Exam) | `/app/practice/[sessionId]` | YES | Action bar pill — **collides with Mark for Review** |
| Quick Practice | `/app/practice/quick` | YES | Action bar pill |
| Exam Review (pre-submit) | `/app/practice/[sessionId]` (review state) | NO | List/navigator view only |
| Session Summary | `/app/practice/[sessionId]` (summary state) | NO | Summary stats + CTAs only |
| Question Review | `/app/questions/[slug]?mode=review` | **NO** | **Gap — ideal bookmarking surface** |
| History Questions tab | `/app/history?tab=questions` | NO | List view; click-through to review |
| Bookmarks Page | `/app/bookmarks` | Remove only | Toggle not needed (already bookmarked) |

### Proposed State (after BS-053 resolution)

Assuming Option A from BS-053 is adopted:

| Surface | Route | Bookmark Present | Rationale |
|---------|-------|-----------------|-----------|
| Practice Session (Tutor) | `/app/practice/[sessionId]` | **YES** | No collision (mark-for-review absent). User sees explanations inline — natural "reflect and bookmark" moment. |
| Practice Session (Exam) | `/app/practice/[sessionId]` | **NO** | Remove. Collides with Mark for Review. Assessment mindset — bookmark doesn't belong here. |
| Quick Practice | `/app/practice/quick` | **YES** | Same as tutor mode — no collision, explanations shown inline. |
| Exam Review (pre-submit) | `/app/practice/[sessionId]` (review state) | **NO** | Assessment mode. User is deciding whether to revisit questions, not curating study material. |
| Session Summary | `/app/practice/[sessionId]` (summary state) | **NO** | Summary view. User can reach review page via "Review your answers" CTA. |
| **Question Review** | **`/app/questions/[slug]?mode=review`** | **YES** | **Add.** This is the primary reflection surface — user is reading explanations, clinical pearls, references. Natural "I should save this" moment. |
| History Questions tab | `/app/history?tab=questions` | NO | List view. Bookmark is one click away via question review page. |
| Bookmarks Page | `/app/bookmarks` | Remove only | Already bookmarked; remove action is sufficient. |

## Decision Tree

When adding a new surface that displays questions, use this tree:

```
Is the user in an active assessment (exam mode, pre-submit review)?
  → NO bookmark. Use Mark for Review if flagging is needed.

Is the user answering questions with inline feedback (tutor mode, quick practice)?
  → YES bookmark. The "reflect and bookmark" moment happens mid-session.

Is the user reviewing past attempts with full explanations visible?
  → YES bookmark. This is the ideal curation moment.

Is the user viewing a list/summary without full question content?
  → NO bookmark in the list. Provide click-through to a review surface that has it.
```

## Mark for Review vs Bookmark

These are **intentionally separate concepts** and must never share the same visual treatment or appear side-by-side:

| Aspect | Bookmark | Mark for Review |
|--------|----------|-----------------|
| **Scope** | Global — persists permanently | Session-scoped — dies with the exam |
| **Storage** | `bookmarks` table | Session JSON `question_states` |
| **Purpose** | "Study this later" | "Revisit before I submit" |
| **Mental model** | Curation (learning) | Flagging (assessment) |
| **Available in** | Reflection surfaces | Exam mode only |

If a future surface needs both, they must be **visually distinct** (e.g., bookmark as icon toggle, mark-for-review as text pill) and **spatially separated** (e.g., bookmark in card header, mark-for-review in action bar).
