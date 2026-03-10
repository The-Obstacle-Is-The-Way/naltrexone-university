# DEBT-296: Filter Section Summary Text Hierarchy Swap

**Priority:** P3
**Created:** 2026-03-09
**Status:** Open

---

## Problem

The practice page filter sections (Topic, Substance, Treatment) have their summary and helper text in the wrong positions, creating a confusing hierarchy when the disclosure is collapsed.

### Current layout

**Collapsed state:**
```
Topic                              (0 selected) ▾
```

**Expanded state (below chips):**
```
Leave empty to include all topics.
```

### What's wrong

1. **"0 selected" implies obligation.** When a user sees a collapsed filter section showing "(0 selected)", it reads as "you haven't done something you need to do" — like an empty required field. The helper text that clarifies this is optional ("Leave empty to include all topics") is hidden inside the disclosure, so the user has to open the section just to learn they don't need to.

2. **Wrong information hierarchy.** The most important thing to communicate in the collapsed summary is the *default behavior* — that leaving filters unselected includes everything. The count is secondary information that matters only after the user has already engaged with the filter. Currently, these are reversed.

3. **"Leave empty" is inaccurate for chip toggles.** The helper text says "Leave empty" which implies a text input or container. These are toggle chips — the correct verb is "Leave unselected."

---

## Proposed Fix

### 1. Swap positions

Move the helper/default-behavior text into the `<summary>` (visible when collapsed). Move the selection count to where the helper text was (visible only when expanded, below the chips).

### 2. Update wording

Change "Leave empty to include all {kind}" → "Leave unselected to include all {kind}"

### 3. Dynamic count stays functional

The "(N selected)" text continues to update dynamically — it just moves below the chips where it serves as a status indicator for the expanded section.

### Resulting layout

**Collapsed state (nothing selected):**
```
Topic              Leave unselected to include all topics ▾
```

**Expanded state (below chips):**
```
[chip] [chip] [chip] [chip]
(0 selected)
```

**Expanded state (2 selected):**
```
[chip] [CHIP] [chip] [CHIP]
(2 selected)
```

**Collapsed state (2 selected):**
```
Topic                       2 selected ▾
```

> **Open question:** When chips *are* selected, should the summary show "2 selected" (replacing the helper text), or should it keep showing "Leave unselected to include all topics" alongside the count? The count-only approach is cleaner — the helper text is only relevant when nothing is selected.

---

## Scope

### Production code

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-session-starter.tsx` | Swap summary right-side text: show helper when 0 selected, show count when >0 selected. Move count below chips. Update "Leave empty" → "Leave unselected". |

### Tests

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-session-starter.test.tsx` | Update assertions for new text positions and wording |

### Docs

| File | Change |
|------|--------|
| `docs/frontend/pages/practice.md` | Update filter section layout description |

---

## Severity

**P3 — Polish.** Filters work correctly. This is an information hierarchy improvement that reduces cognitive load when scanning the collapsed filter sections.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-09 | Created DEBT-296 | User identified the hierarchy inversion during visual review: "0 selected" in the summary implies obligation; the optional-use helper is hidden inside the disclosure |
