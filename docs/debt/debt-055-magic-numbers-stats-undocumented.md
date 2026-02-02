# DEBT-055: Magic Numbers in Stats Controller Lack Documentation

**Status:** Open
**Priority:** P3
**Date:** 2026-02-02

---

## Description

The stats controller defines three numeric constants without explaining why those specific values were chosen:

**Location:** `src/adapters/controllers/stats-controller.ts:23-25`

```typescript
const STATS_WINDOW_DAYS = 7;
const STREAK_WINDOW_DAYS = 60;
const RECENT_ACTIVITY_LIMIT = 20;
```

## Impact

- Future developers don't know why 7, 60, or 20
- Can't tell if values are arbitrary or have business meaning
- If values need to change, no context for decision
- CLAUDE.md warns against unexplained magic numbers

## Resolution

Add comments explaining the rationale:

```typescript
/**
 * Dashboard shows 7-day accuracy trend to match common weekly study cycles.
 * This aligns with spaced repetition research showing weekly review periods.
 */
const STATS_WINDOW_DAYS = 7;

/**
 * Streak calculation looks back 60 days to capture monthly study patterns
 * while not punishing long breaks (vacations, exam periods).
 */
const STREAK_WINDOW_DAYS = 60;

/**
 * Recent activity shows 20 items as a reasonable "at a glance" view.
 * Based on typical screen height showing ~15-20 rows without scrolling.
 */
const RECENT_ACTIVITY_LIMIT = 20;
```

If values are arbitrary, document that:
```typescript
// Arbitrary initial values - adjust based on user feedback
const STATS_WINDOW_DAYS = 7;
```

## Verification

- [ ] Each constant has a comment explaining "why this value"
- [ ] Comments reference user research, business logic, or acknowledge arbitrariness

## Related

- `src/adapters/controllers/stats-controller.ts:23-25`
- CLAUDE.md: "no magic numbers" guideline
