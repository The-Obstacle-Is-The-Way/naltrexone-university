# DEBT-299: Dashboard Recent Activity — Remove Redundant "Answered" Label from Date

**Priority:** P3
**Created:** 2026-03-10
**Status:** Open
**Related:** DEBT-297 (practice starter UI polish), DEBT-298 (UI structural consistency)

---

## Context

The Dashboard has two "recent" sections:

| Section | Shows | Date format |
|---------|-------|-------------|
| **Recent sessions** (left) | Tutor / Exam sessions | `Mar 7, 2026` |
| **Recent activity** (right) | Ad-hoc question attempts | `Answered Mar 8, 2026` |

In Recent activity, each chip displays the result status and date as:

```
Incorrect  •  Answered Mar 8, 2026
```

The word "Answered" is redundant — the item already appears in the "Recent activity" list, which by definition contains answered questions. The result label (`Correct` / `Incorrect`) already communicates that the question was answered.

---

## Proposed Change

Remove the "Answered" prefix so the date line reads:

```
Incorrect  •  Mar 8, 2026
```

This aligns with the Recent sessions panel, which uses bare dates (`Mar 7, 2026`), and reduces visual noise.

---

## Code Locations

Two render paths in `app/(app)/app/dashboard/page.tsx`:

1. **Unavailable question row** — line 217:
   ```tsx
   <span>Answered {formatDate(row.answeredAt)}</span>
   ```
   Change to:
   ```tsx
   <span>{formatDate(row.answeredAt)}</span>
   ```

2. **Available question row** — line 245:
   ```tsx
   <span>Answered {formatDate(row.answeredAt)}</span>
   ```
   Change to:
   ```tsx
   <span>{formatDate(row.answeredAt)}</span>
   ```

### Test updates

`app/(app)/app/dashboard/page.test.tsx` — assertions at lines 159-160:
```tsx
expect(html).toContain('Answered Feb 2, 2026');
expect(html).toContain('Answered Feb 3, 2026');
```
Update to:
```tsx
expect(html).toContain('Feb 2, 2026');
expect(html).toContain('Feb 3, 2026');
```

---

## Acceptance Criteria

- [ ] "Answered" prefix removed from both render paths (available + unavailable rows)
- [ ] Date displays as bare `{formatDate(row.answeredAt)}` — e.g., `Mar 8, 2026`
- [ ] Unit tests updated to match new format
- [ ] Visual verification: Recent activity chips show `Incorrect • Mar 8, 2026` / `Correct • Mar 8, 2026`
