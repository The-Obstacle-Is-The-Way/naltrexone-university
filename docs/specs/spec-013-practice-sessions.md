# SPEC-013: Practice Sessions

**Status:** Ready
**Slice:** SLICE-3 (Practice Sessions)
**Depends On:** SLICE-2 (Core Question Loop)
**Implements:** ADR-001, ADR-003, ADR-011

---

## Objective

Implement structured practice sessions:

- Start a session with filters (mode/count/tags/difficulties)
- Persist an immutable question order (`practice_sessions.params_json.questionIds`)
- Track progress and allow ending a session
- Enforce tutor vs exam explanation rules

This spec is intentionally **DRY**: the **exact** behavior and file list live in `docs/specs/master_spec.md` (SLICE-3 + Sections 4.5.5+).

---

## Source of Truth

- `docs/specs/master_spec.md`:
  - SLICE-3 (acceptance criteria + implementation checklist)
  - Section 4.5.5+ (session server actions + behavior)
- Domain rules:
  - `docs/specs/spec-003-domain-services.md` (session progress + explanation logic)

---

## Non-Negotiable Requirements

- **Session immutability:** once started, the question list/order is fixed.
- **Deterministic progress:** progress is computed from persisted session state + attempts.
- **Exam mode secrecy:** no explanations until `ended_at` is set.

---

## Definition of Done

- Behavior matches SLICE-3 in `docs/specs/master_spec.md`.
- Session question order is reproducible and stored server-side.
- Integration tests cover session lifecycle; E2E smoke covers one session run.
