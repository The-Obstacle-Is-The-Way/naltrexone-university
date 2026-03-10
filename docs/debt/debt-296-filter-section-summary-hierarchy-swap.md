# DEBT-296: Filter Section Summary Text Hierarchy Swap

**Priority:** P3
**Created:** 2026-03-09
**Status:** Resolved
**Resolved:** 2026-03-09

---

## Problem

The practice page filter sections (Topic, Substance, Treatment) currently surface the selection count in the collapsed summary and bury the default-state explanation below the chips. That hierarchy is backwards for the zero-selected state.

### Current layout

**Collapsed state:**
```text
Topic                              (0 selected) ▾
```

**Expanded state (below chips):**
```text
[chip] [chip] [chip] [chip]
Leave empty to include all topics.
```

**Live implementation reference:** `app/(app)/app/practice/components/practice-session-starter.tsx:216-242`

- The `<summary>` right-side cluster currently renders `({selectedCount} selected)` plus the chevron.
- The helper line below the chips currently renders `Leave empty to include all {tagKindPluralLabels[kind]}.`

### What's wrong

1. **"(0 selected)" implies obligation.** In the collapsed state, `0 selected` reads like an incomplete required field. The user has to expand the section to discover that doing nothing is valid.

2. **The hierarchy is inverted.** In the zero-selected state, the most important information is the default behavior, not the count. The user needs to know what happens if they leave the section alone.

3. **"Leave empty" is the wrong verb.** These are toggle chips, not a text field. "Empty" is mechanically inaccurate for this interaction.

4. **Outcome phrasing is clearer than instructional phrasing.** The user’s real question is not "what action should I take?" but "what happens if I do nothing?" The summary should answer that directly.

---

## Proposed Fix

### 1. Swap the hierarchy

Move the default-state explanation into the `<summary>` so it is visible when the section is collapsed. Move the selection count below the chips, where it functions as expanded-state metadata.

### 2. Update the zero-selected wording

Replace the current helper copy:

`Leave empty to include all {kind}`

with outcome wording:

`All {kind} included by default`

Examples:
- `All topics included by default`
- `All substances included by default`
- `All treatments included by default`

### 3. Keep the count dynamic

The selection count still updates dynamically. It simply moves below the chip group instead of owning the collapsed summary by default.

### Resulting layout

**Collapsed state (nothing selected):**
```text
Topic              All topics included by default ▾
```

**Expanded state (below chips):**
```text
[chip] [chip] [chip] [chip]
(0 selected)
```

**Expanded state (2 selected):**
```text
[chip] [CHIP] [chip] [CHIP]
(2 selected)
```

**Collapsed state (2 selected):**
```text
Topic                       2 selected ▾
```

### Resolved behavior

1. **Zero selected:** the summary shows the default-state outcome copy (`All topics included by default`), and the expanded footer shows `(0 selected)`.
2. **One or more selected:** the summary switches to count-only (`2 selected`), and the expanded footer also shows the current count.
3. **All selected:** still use count-only (`13 selected`), not `13 of 13 selected`. The denominator adds noise, has no internal precedent in this filter UI, and does not improve collapsed-state scanning.
4. **Summary helper styling:** keep the right-side helper/count text subordinate to the left-hand section label via the existing metadata treatment (`text-xs font-normal text-foreground/60`), not full-weight label styling.
5. **Accessibility:** no `aria-live` or extra SR-only compensation is needed. The stable control label (`Topic`, `Substance`, `Treatment`) remains in the summary, while the right-side helper/count text is supplementary state. The live available-question count already provides the primary filter feedback elsewhere in the form.

The brief duplicated count while a section is open and selections exist is acceptable. The lower count anchors status inside the expanded chip group; the summary count preserves the correct collapsed-state scan once the section closes again.

---

## Scope

### Production code

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-session-starter.tsx` | Replace the summary right-side count with conditional metadata: show `All {kind} included by default` when `selectedCount === 0`, show `{selectedCount} selected` when `selectedCount > 0`. Remove the helper line from below the chips and replace it with the count line. |

### Tests

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-session-starter.test.tsx` | Update the existing `renders tag filters as collapsible categories with selected counts` test (`:104-245` in the current file). The summary-text lookup for `1 selected`, the summary-count span query, and the exact helper-text assertion for `Leave empty to include all substances.` all need to change. |

No current browser-spec assertions touch this summary/helper wording.

### Docs

| File | Change |
|------|--------|
| `docs/frontend/pages/practice.md` | Update the Tag Filter Sections table to reflect the new summary metadata and the removal of the helper line below the chips |
| `docs/frontend/pattern-registry.md` | Update the S-2 practice variant rationale so it no longer describes selected-count metadata as the persistent summary payload |
| `docs/content/tag-taxonomy-golden-spec.md` | Update the active UI-behavior note from `Leave empty to include all` to the shipped default-state summary phrasing |
| `docs/debt/index.md` | Keep the active debt summary aligned with the final wording and behavior |

---

## Severity

**P3 — Polish.** Filters work correctly. This is an information hierarchy improvement that reduces cognitive load when scanning the collapsed filter sections.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-09 | Created DEBT-296 | User identified the hierarchy inversion during visual review: "(0 selected)" in the summary implies obligation; the optional-use helper is hidden inside the disclosure |
| 2026-03-09 | Outcome copy selected over instruction copy | `All topics included by default` answers the zero-state question directly and reads more naturally than `Leave unselected to include all topics` |

## Outcome

Implemented in `app/(app)/app/practice/components/practice-session-starter.tsx`.

- Zero-selected collapsed summaries now surface outcome copy (`All {kind} included by default`) instead of `(0 selected)`.
- Collapsed summaries switch to count-only (`{N} selected`) once selections exist.
- Expanded sections now show `({N} selected)` below the chips.
- The old `Leave empty to include all {kind}` helper copy was removed from the UI and synced in the related docs.
