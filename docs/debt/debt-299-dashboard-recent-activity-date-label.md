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
| **Recent activity** (right) | Individual question attempts (ad-hoc + session-backed) | `Answered Mar 8, 2026` |

In Recent activity, each chip displays the result status and date as:

```
Incorrect  •  Answered Mar 8, 2026
```

The word "Answered" is redundant. The item already appears in the "Recent activity" list, and the result label (`Correct` / `Incorrect`) already implies the question was answered.

This copy appears in both Recent activity render branches:

- available question rows (clickable links)
- unavailable question rows (`[Question no longer available]`)

---

## Proposed Change

Remove the "Answered" prefix so the date line reads:

```
Incorrect  •  Mar 8, 2026
```

This aligns with the Recent sessions panel, which already uses bare dates (`Mar 7, 2026`), and with the History questions tab, which already renders a bare date in its metadata row. The change reduces visual noise without changing information density.

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

`app/(app)/app/dashboard/page.test.tsx`

1. **Available recent activity rows** — current assertions at lines 159-160:
```tsx
expect(html).toContain('Answered Feb 2, 2026');
expect(html).toContain('Answered Feb 3, 2026');
```
Update to explicit positive + negative assertions:
```tsx
expect(html).toContain('Feb 2, 2026');
expect(html).toContain('Feb 3, 2026');
expect(html).not.toContain('Answered Feb 2, 2026');
expect(html).not.toContain('Answered Feb 3, 2026');
```

`toContain('Feb 2, 2026')` alone is not sufficient, because the old string still contains that substring.

2. **Unavailable recent activity rows** — extend the existing `renders placeholder text for unavailable recent activity rows` test (currently around lines 320-358) to assert the same copy contract for the unavailable branch:
```tsx
expect(html).toContain('Feb 1, 2026');
expect(html).toContain('Feb 2, 2026');
expect(html).not.toContain('Answered Feb 1, 2026');
expect(html).not.toContain('Answered Feb 2, 2026');
```

### Documentation sync

If docs are being updated in the same change, also update the dashboard-flavored example in `docs/frontend/typography-policy.md` so it no longer uses `Answered Mar 7, 2026` as a sample secondary label.

### No additional app-surface changes required

- No known Playwright/E2E assertions depend on the `Answered` prefix today
- No route, query-param, or review-mode behavior changes are required
- Do not broaden this debt to Bookmarks; `Bookmarked {date}` is a different event label and remains correct

---

## Acceptance Criteria

- [ ] "Answered" prefix removed from both render paths (available + unavailable rows)
- [ ] Date displays as bare `{formatDate(row.answeredAt)}` — e.g., `Mar 8, 2026`
- [ ] Dashboard render-output tests assert both presence of bare dates and absence of `Answered {date}` for available rows
- [ ] Dashboard render-output tests assert both presence of bare dates and absence of `Answered {date}` for unavailable rows
- [ ] Typography policy example updated if docs are touched in the same change
- [ ] Visual verification: Recent activity chips show `Incorrect • Mar 8, 2026` / `Correct • Mar 8, 2026`
