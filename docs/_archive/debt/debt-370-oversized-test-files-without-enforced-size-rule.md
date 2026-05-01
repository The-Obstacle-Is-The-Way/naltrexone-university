# DEBT-370: Oversized Test Files Hide Multiple Concerns; No Enforced Size Guardrail

**Priority:** P3
**Created:** 2026-04-25
**Source:** Test suite quality audit, 2026-04-25
**Related:** [DEBT-234 (archived) — Add max-lines lint rule](../_archive/debt/debt-234-add-max-lines-lint-rule.md), [DEBT-139 (archived) — Production files exceed size guardrail](../_archive/debt/debt-139-production-files-exceed-size-guardrail.md), [DEBT-354 (archived) — God-file and clean-code audit](../_archive/debt/debt-354-god-file-and-clean-code-audit.md), [DEBT-369 (archived)](../_archive/debt/debt-369-feedback-test-brittle-presentational-token-assertions.md)

**Status:** Resolved 2026-05-01 ([PR #295](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/295), [PR #297](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/297), [PR #298](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/298), [PR #299](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/299)).

**Audit verified:** 2026-04-27 against `87284372`.

---

## Resolution

DEBT-370 closed across 4 sequenced PRs (2026-04-28 to 2026-05-01). Track A split 10 originals into 43 cohesive siblings + 9 colocated helpers; Track B shipped a warn-only Biome `nursery/noExcessiveLinesPerFile` rule scoped to test/spec files at 800 LOC.

**Aggregate metrics:**

| Phase | PR | Originals | Siblings | Helpers | Cases preserved |
|------:|----|----------:|---------:|--------:|----------------:|
| 1 | #295 | 1 integration test | 4 | 1 | 24 |
| 2 | #297 | 3 browser specs | 14 | 3 | 77 |
| 3 | #298 | 3 unit tests | 11 | 3 | 135 |
| 4 | #299 | 3 unit/component/repo tests | 14 | 2 | 123 (-1 SPEC-020 guard) |
| **Total** | | **10** | **43** | **9** | **359** |

- Behavioral preservation across all 4 phases: **360 `it()` cases preserved exactly** (124 jsdom unit/component, 24 integration, 77 browser hooks/views, 135 use-case/controller). The single deletion was the self-referential `it('keeps practice-page-logic.ts within the SPEC-020 line cap', ...)` source-size guard that only enforced one production file at ≤300 LOC; documented in PR #299. Production file is currently 152 LOC, well under the deleted cap. Production-file size enforcement remains a separate ad-hoc concern (DEBT-139 / DEBT-234 lineage).
- All 43 post-split sibling files are below 800 LOC (largest: 706 in Phase 2's `practice-session-page-view-question-navigation.browser.spec.tsx`).
- Zero new `vi.mock()` calls on internal modules across all 4 phases — Fakes-over-mocks discipline preserved repo-wide.
- Helper hygiene: every helper meets the ≥3-sibling extraction bar (range: 3-6 callers per helper). No cross-family helper promotion. `practice-page-logic` correctly skipped its helper because shared pieces already came from existing repo-wide test-helpers (`createNextQuestion`, `createDeferred`).

**Track B implementation (PR #299, commit `c6d94e80`):**

- Native Biome rule: `lint/nursery/noExcessiveLinesPerFile` (available from Biome 2.3.12).
- Configured in `biome.json` `overrides` as **warn-only** (`level: "warn"`), `maxLines: 800`.
- Scope: `**/*.test.ts`, `**/*.test.tsx`, `**/*.browser.spec.tsx`. Production files NOT included.
- Independent verification: `pnpm lint` produces exactly 19 warnings on legacy oversized test/spec files outside DEBT-370's audited table (e.g., `clerk-webhook-controller.test.ts`, `Feedback.test.tsx` at 1,210 — deferred bonus). **Zero warnings on any of the 43 Phase 1-4 post-split sibling files.** The `nursery` group means the rule may shift in future Biome releases; biome.json may need a one-line update if the rule graduates out of nursery.

**CR responsiveness across all 4 phases:**

- Phase 1: clean.
- Phase 2: 2 substantive findings addressed in `8897ce93` (results harness callback stability) and `7ddc4613` (bookmark controller readiness race).
- Phase 3: 1 substantive finding addressed in `f17abf59` — removed unnecessary `// @vitest-environment jsdom` directive from 4 practice-controller siblings (copy-paste artifact incorrect for pure-Vitest adapter unit tests).
- Phase 4: explicit `APPROVED` review event on latest head `c6d94e80` — cleanest CR state of any phase.

**Per-phase breakdown:**

- **Phase 1 (PR #295, 2026-04-28):** `tests/integration/bug-regression.integration.test.ts` (1,784 LOC) split into 4 cohesive siblings — `bug-regression-active-exam-projections.integration.test.ts` (524), `bug-regression-active-exam-latest-attempt-fallback.integration.test.ts` (845), `bug-regression-exam-draft-bounds.integration.test.ts` (284), `bug-regression-historical.integration.test.ts` (149) — sharing a co-located `bug-regression-test-helpers.ts` (22). Zero behavior change; 24 `it()` cases preserved; full gate green.
- **Phase 2 (PR #297, 2026-04-30):** Top 3 browser specs split into 14 cohesive siblings + 3 colocated helpers, sharing the same cohort-by-domain pattern as Phase 1. Zero behavior change; 77 `test()` cases preserved exactly (31+24+22 → 77 across 14 files). All post-split files <800 LOC (largest 706); average ~5.5 tests per file. CR latest-head APPROVED on `7ddc4613`.
  - `practice-session-page-view.browser.spec.tsx` (2,086) → 5 siblings: `-results` (301), `-review-stage` (423), `-active-question` (309), `-focus-restoration` (380), `-question-navigation` (706); helper `practice-session-page-view-test-helpers.ts` (1 LOC, 5 callers — `noop`).
  - `use-practice-session-page-controller.browser.spec.tsx` (1,842) → 4 siblings: `-init-load` (388), `-answer-flow` (596), `-review-stage` (409), `-bookmark-mark` (297); helper `use-practice-session-page-controller-test-helpers.ts` (251 LOC, 4 callers).
  - `use-question-page-controller.browser.spec.tsx` (1,817) → 5 siblings: `-bookmarks` (326), `-retry-reveal` (241), `-review-hydration` (292), `-session-navigation` (506), `-stale-responses` (376); helper `use-question-page-controller-test-helpers.tsx` (172 LOC, 5 callers).
- **Phase 3 (PR #298, 2026-04-30):** Use-case + controller test layer split into 11 cohesive siblings + 3 colocated helpers. Zero behavior change; 135 source `it()` cases preserved exactly (64+37+34 → 135 across 11 files; Vitest executes 137 due to one `it.each` expansion). All post-split files <800 LOC (largest 693). Zero new `vi.mock()` calls — Fakes-only discipline preserved. CR latest-head clean on `f17abf59` ("No actionable comments").
  - `practice-controller.test.ts` (1,730) → 4 siblings: `-session-lifecycle` (514), `-exam-draft` (202), `-session-reads` (533), `-mark-and-count` (249); helper `practice-controller-test-helpers.ts` (250 LOC, 4 callers).
  - `submit-answer.test.ts` (1,625) → 4 siblings: `-retry` (641), `-standalone` (460), `-tutor` (357), `-exam` (185); helper `submit-answer-test-helpers.ts` (61 LOC, 4 callers).
  - `get-next-question.test.ts` (1,468) → 3 siblings: `-fallback` (693), `-explicit-question` (324), `-navigation` (320); helper `get-next-question-test-helpers.ts` (208 LOC, 3 callers).
- **Phase 4 (PR #299, 2026-05-01):** Final Track A splits + Track B Biome guardrail in a single closing PR. 3 originals split into 14 cohesive siblings + 2 colocated helpers; 124 → 123 `it()` cases preserved (one approved deletion of the self-referential SPEC-020 source-size guard). All post-split files <800 LOC. Zero new internal `vi.mock()` calls. CR explicit `APPROVED` on `c6d94e80`. `Feedback.test.tsx` (1,210) deferred — under audit threshold, future opportunistic cleanup.
  - `practice-page-logic.test.ts` (1,756) → 5 siblings: `-loading` (273), `-answer-flow` (330), `-bookmarks` (592), `-session-start` (290), `-session-handlers` (285); no helper (existing repo-wide test-helpers covered shared pieces).
  - `practice-view.test.tsx` (1,473) → 6 siblings: `-layout` (253), `-answer-feedback` (276), `-bookmarks` (223), `-navigation` (317), `-exam-actions` (393), `-bookmark-notification-transition` (66 — pure utility test extracted from inside the component test); helper `practice-view-test-helpers.tsx` (15 LOC, 6 callers — hosts the allowed `vi.mock('next/link')` external-SDK mock and a shared `createQuestionProps` builder).
  - `drizzle-practice-session-repository.test.ts` (1,401) → 3 siblings: `-reads` (490), `-session-writes` (350), `-question-state` (573); helper `drizzle-practice-session-repository-test-helpers.ts` (6 LOC, 3 callers — minimal shared teardown).

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
- `bug-regression.integration.test.ts` (1784) → **Phase 1 shipped in PR #295** — split by regression family into `bug-regression-active-exam-projections.integration.test.ts`, `bug-regression-active-exam-latest-attempt-fallback.integration.test.ts`, `bug-regression-exam-draft-bounds.integration.test.ts`, `bug-regression-historical.integration.test.ts`, sharing `bug-regression-test-helpers.ts`.
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
