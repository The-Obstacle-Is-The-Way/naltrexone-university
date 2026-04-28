# DEBT-370: Oversized Test Files Hide Multiple Concerns; No Enforced Size Guardrail

**Priority:** P3
**Created:** 2026-04-25
**Source:** Test suite quality audit, 2026-04-25
**Related:** [DEBT-234 (archived) — Add max-lines lint rule](../_archive/debt/debt-234-add-max-lines-lint-rule.md), [DEBT-139 (archived) — Production files exceed size guardrail](../_archive/debt/debt-139-production-files-exceed-size-guardrail.md), [DEBT-354 (archived) — God-file and clean-code audit](../_archive/debt/debt-354-god-file-and-clean-code-audit.md), [DEBT-369 (archived)](../_archive/debt/debt-369-feedback-test-brittle-presentational-token-assertions.md)

**Audit verified:** 2026-04-27 against `87284372`.

---

## Context

After the DEBT-354 god-file audit (2026-04-09) split the worst production-side offenders, the size hot spots are now overwhelmingly **test** files. As of 2026-04-27:

| LOC | File |
|----:|------|
| 2,086 | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` |
| 1,210 | `components/question/Feedback.test.tsx` |
| 1,842 | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx` |
| 1,837 | `app/(app)/app/questions/[slug]/use-question-page-controller.browser.spec.tsx` |
| 1,784 | `tests/integration/bug-regression.integration.test.ts` (pre-Phase 1 baseline; split in PR #295) |
| 1,756 | `app/(app)/app/practice/practice-page-logic.test.ts` |
| 1,730 | `src/adapters/controllers/practice-controller.test.ts` |
| 1,625 | `src/application/use-cases/submit-answer.test.ts` |
| 1,473 | `app/(app)/app/practice/components/practice-view.test.tsx` |
| 1,468 | `src/application/use-cases/get-next-question.test.ts` |
| 1,401 | `src/adapters/repositories/drizzle-practice-session-repository.test.ts` |

The `Feedback.test.tsx` row reflects the post-DEBT-369 cleanup in PR #294; it remains in this context table to preserve the before/after trail for the multi-PR DEBT-370 campaign. The `bug-regression.integration.test.ts` row is the pre-Phase 1 baseline for PR #295, which replaces that monolith with focused siblings for active-exam projections, active-exam latest-attempt fallback, exam-draft bounds, and historical CAS coverage. The largest app/src/components production file remains 572 LOC (`history-questions-tab.tsx`) — about a quarter of the largest test file. `db/schema.ts` is larger at 639 LOC, but it is infrastructure schema rather than feature logic. `biome.json` does not enforce a `max-lines` style rule today. DEBT-234 was archived as resolved but no enforcement landed.

## Why This Is Debt

Test files at 1,500+ LOC compound the same problems Sandi Metz / Kent Beck flag in production:

- **Multiple concerns bundled.** A 2,086-line browser spec for one component covers init, answer flow, review flow, mark-for-review, submit confirmation, exam-end transition, etc. Each is a separate testing concern. Failure isolation is poor — a failed test takes longer to diagnose because the relevant setup is buried hundreds of lines away.
- **Setup duplication.** Long files invariably accumulate `beforeEach` boilerplate that drifts from sibling files. Tests stop being readable as documentation; they become "find the right helper or copy the right block."
- **Slow / brittle iteration.** Adding one new test forces a 2 KLOC file recompile; refactoring the helpers risks unrelated breakage in tests the author never opened.
- **Signal of underlying SRP smell.** Most of these tests cover entry points (use cases, controllers, view components, page-level logic) that themselves do many things. The test file is mirroring the production surface; splitting tests *forces* the conversation about whether the production module should also split. (See: DEBT-371 — `practice-controller` itself has cross-cutting boilerplate that suggests a smaller surface is possible.)

## Remediation

Two-track approach:

### Track A — Targeted splits

For each file >1,500 LOC, identify the natural concern boundaries (skim the `describe` blocks) and split into peer files that share a colocated `*-test-helpers.ts`. Examples:

- `practice-session-page-view.browser.spec.tsx` (2086) → split by phase: init/load, answer/feedback, review-stage, mark-for-review, submit/finalize.
- `Feedback.test.tsx` (1210 after DEBT-369) → split by feedback variant: correct-card, incorrect-card, fallback rendering, accessibility. **Pairing with [DEBT-369](../_archive/debt/debt-369-feedback-test-brittle-presentational-token-assertions.md) is complete** — the brittle token assertions were cleaned up before any future split so the split files don't ship the old pattern repo-wide.
- `bug-regression.integration.test.ts` (1784) → split by regression family: active-exam visibility, exam draft cumulative bounds, security/auth regressions, and older historical bug groups.
- `practice-controller.test.ts` (1730) → split by action group: session lifecycle (start/end/finalize), answer reads, mark/bookmark.
- `submit-answer.test.ts` (1625) → split by mode-shape: tutor / exam / standalone / retry.
- `get-next-question.test.ts` (1468) → split by call shape: explicit-questionId path, navigation path, fallback path.

Each split should keep cohesive setup helpers in a `*-test-helpers.ts` peer file rather than copy-pasting boilerplate across the new siblings.

### Track B — Soft guardrail

Add a Biome size warning (or equivalent) for `**/*.test.{ts,tsx}` and `**/*.browser.spec.tsx`. Production code already has an implicit 300/350 guideline — see the `WHY:` comment block at `src/adapters/repositories/drizzle-attempt-repository.ts:45-49` referencing DEBT-224. Make the convention explicit for tests too.

Recommended thresholds: warn at 800 LOC for test files. **Warn-only, not error** — splits should be deliberate, not ratchet-driven.

## Constraints

- Do NOT split for split's sake. A 1,200-line test file covering one cohesive use case may be acceptable; the smell is multi-concern bundling, not raw line count.
- Do NOT promote private helper functions to shared modules during the split unless they are used in ≥3 sibling test files. Premature shared-test-helper extraction is its own debt class.
- Do NOT change test behavior during the split. Each split file's `pnpm test --run` output must match the pre-split behavior exactly.

## Why P3

The suite passes. The cost is friction on every test-touching change and the slow drift toward unreadable assertion blocks. Pick this up alongside DEBT-369 (the worst single file is in both tickets) so the largest file gets attention from both angles.

## Verification

- After Track A: each file in the table above is below 1,200 LOC, and no new file replaces it in the >1,500 bucket.
- After Track B: `pnpm lint` warns (does not error) on test files exceeding the configured threshold; no existing test file in the suite warns after Track A is complete.
- All split tests cover the same behavior — `pnpm test --run` and `pnpm test:browser` line/branch coverage on touched modules does not regress.
