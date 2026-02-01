# SPEC-012: Core Question Loop

**Status:** Ready
**Slice:** SLICE-2 (Core Question Loop)
**Depends On:** SLICE-1 (Paywall)
**Implements:** ADR-001, ADR-003, ADR-011

---

## Objective

Deliver the core learning loop for subscribed users:

- Fetch next question (ad-hoc or session-backed)
- Render stem + choices (safe markdown)
- Submit answer → record attempt → return grading + explanation (when allowed)

This spec is intentionally **DRY**: the **exact** behavior and file list live in `docs/specs/master_spec.md` (SLICE-2 + Sections 4.5.3–4.5.4).

---

## Source of Truth

- `docs/specs/master_spec.md`:
  - Sections 4.5.3–4.5.4 (exact server action behavior)
  - SLICE-2 (acceptance criteria + implementation checklist)
- Contracts and boundaries:
  - `docs/specs/spec-003-domain-services.md` (`gradeAnswer`, session explanation rules)
  - `docs/specs/spec-005-core-use-cases.md` (use-case responsibilities)
  - `docs/specs/spec-010-server-actions.md` (`ActionResult<T>`)

---

## Non-Negotiable Requirements

- **Every submit creates an attempt:** submitting an answer MUST insert an `attempts` row.
- **No correctness leakage:** never send `Choice.isCorrect` to the client before answering.
- **Markdown is sanitized:** render markdown with a locked-down sanitize schema (no raw HTML injection).
- **Explanation visibility:** in exam sessions, return `explanationMd = null` until the session ends.

---

## Definition of Done

- Behavior matches SLICE-2 in `docs/specs/master_spec.md`.
- Seeded content can be inserted idempotently (`scripts/seed.ts`) and drives the UI.
- Integration tests prove attempts insert correctly; E2E smoke covers the happy path.
