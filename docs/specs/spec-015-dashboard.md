# SPEC-015: Dashboard

**Status:** Ready
**Slice:** SLICE-5 (Dashboard)
**Depends On:** SLICE-4 (Review + Bookmarks)
**Implements:** ADR-001, ADR-003, ADR-010

---

## Objective

Provide a fast, motivating dashboard for subscribed users:

- Total answered
- Overall accuracy
- Last 7 days accuracy
- Current streak (UTC days with ≥1 attempt)
- Recent activity list

This spec is intentionally **DRY**: the **exact** behavior and file list live in `docs/specs/master_spec.md` (SLICE-5).

---

## Source of Truth

- `docs/specs/master_spec.md`:
  - SLICE-5 (acceptance criteria + implementation checklist)
- Domain computations:
  - `docs/specs/spec-003-domain-services.md` (`computeAccuracy`, `computeStreak`, windowing helpers)

---

## Non-Negotiable Requirements

- **No stored stats:** compute from persisted attempts (no denormalized counters for MVP).
- **UTC correctness:** streak and window calculations use UTC day boundaries.
- **No stale entitlement:** dashboard is behind the subscription gate (server-side).

---

## Definition of Done

- Behavior matches SLICE-5 in `docs/specs/master_spec.md`.
- Dashboard renders server-side and loads fast for MVP data volumes.
- Integration tests validate stats correctness; E2E smoke covers dashboard load.
