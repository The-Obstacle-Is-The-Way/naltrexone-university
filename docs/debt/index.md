# Technical Debt Register

**Project:** Naltrexone University
**Last Updated:** 2026-05-03 (DEBT-377 redirected to V1: borderless + rounded-md + dimmed text)

---

## What is Technical Debt?

Technical debt documents known shortcuts, deferred work, and architectural compromises. They serve as:

1. **Visibility** — Make implicit debt explicit
2. **Prioritization** — Help decide what to tackle and when
3. **Tracking** — Ensure debt is paid down over time

## Debt Index (Active)

| ID | Title | Priority | GitHub Issue |
|----|-------|----------|--------------|
| [DEBT-377](./debt-377-practice-starter-chip-emphasis-and-hierarchy.md) | Practice starter chip chrome dominance + shape mismatch — `FilterChip` carries a per-chip `border` + `rounded-full` pill while every other interactive control on the card is borderless inside a frame and uses `rounded-md`. Diagnosis evolved through font-weight → font-size → chrome-density iterations and landed on V1 (Claude Design): drop the per-chip border (chip joins the I-1 borderless tonal-fill family; identification via fill + cursor + hover + focus + `aria-pressed`), square corners to `rounded-md` for system-wide shape coherence, and dim unselected text to `text-foreground/80` with `hover:text-foreground` restoring full strength. Selected chips lose redundant `border-primary` and gain `rounded-md`; selected/unselected delta *widens*. Reclassifies DEBT-291 boundary + DEBT-309 hover; preserves DEBT-294 fill and DEBT-295 contrast intent in modulated form. Stat prominence, disclosure label asymmetry, heading bump, chip-row reflow, and grayscale palette explicitly out of scope | P3 | — |
| [DEBT-332](./debt-332-security-posture-audit.md) | Security posture audit — Clerk strict CSP report-only is deployed and verified in production/dev, no RLS (accepted architecture decision); remaining work is billing-flow `form-action` verification plus enforcing mode or explicitly accepting the residual report-only posture | P2 | — |
| [DEBT-337](./debt-337-future-feedback-enhancements.md) | Future feedback & practice enhancements (F2/F3/F5/F6/F7) — clinical pearl field, reference styling, running score, card collapse, difficulty tags; parked | P4 | — |
| [DEBT-349](./debt-349-cross-request-published-content-caching.md) | Optional Tier 2 cross-request caching for immutable published questions and tag lists after DEBT-344 shipped request-scoped dedup | P3 | — |

**Next Debt ID:** DEBT-378

---

## Debt Index (Resolved)

| ID | Title | Priority | Resolved | GitHub Issue |
|----|-------|----------|----------|--------------|
| [DEBT-376](../_archive/debt/debt-376-active-exam-finish-exam-label-lies-about-its-action.md) | Active-exam empty-state button label corrected from `'Finish exam'` to `'Review & Submit'` (PR #304, one-line production diff at `practice-session-page-view.tsx:267`). Resolves a label/behavior mismatch where the button promised exam finalization but the underlying `onEndSession` chain calls `loadReview()` (navigation to Review & Submit stage). Stranded leftover from DEBT-322 D-2's deliberate rename, never updated when DEBT-363 Concern 2 (PR #281) dropped the active-exam header button. Test updates: 4 renames across `practice-view-layout.test.tsx` and `practice-session-page-view-active-question.browser.spec.tsx`; 1 obsolete count-0 assertion deleted in `tests/e2e/practice.spec.ts`; layout test `toHaveLength(2)` invariant preserved. CodeRabbit explicit APPROVED, zero defended nits | P3 | 2026-05-03 | [PR #304](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/304) |
| [DEBT-375](../_archive/debt/debt-375-tutor-session-action-bar-no-terminal-cta-on-last-question.md) | Tutor session footer no longer dead-ends on the last question. PR #303 replaced the invisible `ActionBarSpacer` with a primary `View Summary` terminal CTA (variant `outline` pre-submit, `default` post-submit, calling `onEndSession`), restructured `TutorActionBar` into exam-parallel `tutor-action-primary-group` / `tutor-action-secondary-group` (`sm:ml-auto`) layout with `Bookmark` right-aligned in the secondary slot, and preserved the persistent header `End session` button bit-for-bit on first-principles grounds (tutor's self-paced bail-cheap value vs. exam's commitment model). Tests added scoped queries via the new `data-testid`s plus behavioral routing assertions (`onEndSession` called, `onNextQuestion` NOT called) and `data-variant` pre/post-submit hierarchy coverage. CodeRabbit latest-head approved with zero actionable comments | P2 | 2026-05-02 | [PR #303](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/303) |
| [DEBT-374](../_archive/debt/debt-374-session-summary-view-in-history-button-is-redundant-cruft.md) | Session Summary action bar no longer exposes the redundant ghost-variant `View in History` button. PR #302 deleted the single Button block, preserved `Review Answers` / `New Session`, left the persistent top-nav `History` link unchanged, removed stale assertions from four tests, and verified zero `View in History` hits across production/test scope. CodeRabbit latest-head approved; optional negative-assertion nit rejected because it would violate the zero-hit SSOT | P3 | 2026-05-01 | [PR #302](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/302) |
| [DEBT-373](../_archive/debt/debt-373-post-exam-review-score-banner-uses-app-h1-pattern-instead-of-stat-number-pattern.md) | Post-exam review score banner now uses the canonical stat-number pattern: semantic `Exam complete` `<h1>` preserved, standalone `text-3xl font-bold font-display` percentage stat, and `"X of Y correct"` metadata moved into the description line. Direct component, renderer, browser, and E2E assertions updated with scoped score-banner queries; CodeRabbit latest-head approved. PR #301 also filed DEBT-374 as documentation only, with implementation left active | P3 | 2026-05-01 | [PR #301](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/301) |
| [DEBT-372](../_archive/debt/debt-372-post-exam-review-summary-button-label-divergence.md) | Post-exam review summary button label unified on `View Summary` (PR #300, one-line production diff at `post-exam-review-view.tsx:184`). Final review question now intentionally renders two same-label `View Summary` buttons (persistent top + bottom terminal), both calling `onViewSummary`. Test selectors region-scoped via `[data-testid="bottom-action-bar"]` and `[data-slot="card"]` filters; one assertion strengthened from substring check to `toHaveLength(2)` contract. CodeRabbit explicit APPROVED | P3 | 2026-05-01 | [PR #300](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/300) |
| [DEBT-370](../_archive/debt/debt-370-oversized-test-files-without-enforced-size-rule.md) | Oversized test files campaign closed across 4 sequenced PRs — 10 originals split into 43 cohesive siblings + 9 helpers, 360 `it()` cases preserved (-1 SPEC-020 self-referential source-size guard, documented). All 43 post-split files <800 LOC (largest 706). Track B shipped warn-only Biome `nursery/noExcessiveLinesPerFile` rule scoped to `**/*.test.{ts,tsx}` + `**/*.browser.spec.tsx` at 800 LOC; 19 legacy warnings on pre-existing oversized files outside audit scope, 0 warnings on Phase 1-4 post-split files. CR clean across all phases; explicit APPROVED on Phase 4 latest head | P3 | 2026-05-01 | [PR #295](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/295), [PR #297](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/297), [PR #298](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/298), [PR #299](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/299) |
| [DEBT-368](../_archive/debt/debt-368-browser-spec-vi-mock-missing-spy-true.md) | Internal `vi.mock` without `{ spy: true }` in browser specs swept to zero across 13 specs (26→0 doc grep, 27→0 broader grep covering relative imports). Production-fidelity `shouldReportClientError` predicate forwarded via `vi.importActual` instead of narrow filter; shared `installReportClientErrorMocks` helper extracted to `tests/test-helpers/report-client-error-mocks.ts`. CodeRabbit latest-head: "No actionable comments." | P3 | 2026-04-29 | [PR #296](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/296) |
| [DEBT-369](../_archive/debt/debt-369-feedback-test-brittle-presentational-token-assertions.md) | `Feedback.test.tsx` brittle presentational-token assertions cleaned up: Tailwind token grep `70 -> 0`, file size `1,874 -> 1,210` LOC, 36 test cases preserved, no helper promotion or file split | P3 | 2026-04-28 | [PR #294](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/294) |
| [DEBT-371](../_archive/debt/debt-371-idempotency-wrapper-boilerplate-across-controllers.md) | `withIdempotency()` boilerplate at 8 call sites across 4 controllers consolidated into `executeIdempotent()` at `src/adapters/controllers/shared/execute-idempotent.ts` — structural deps subset, Zod-typed output schema, deep module per Ousterhout. Pure refactor, net -185 LOC, zero test files modified, zero CR inline comments | P3 | 2026-04-28 | [PR #293](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/293) |
| [DEBT-367](../_archive/debt/debt-367-fake-attempt-repository-missing-active-exam-visibility.md) | `FakeAttemptRepository` now mirrors the shared active-exam visibility predicate in all 10 sister read methods via a private `isHiddenByActiveExam` helper; unit tests against the fake match real Postgres behavior, closing the silent-regression vector for the BUG-235/236/237/239 visibility sweep | P2 | 2026-04-27 | [PR #292](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/292) |
| [DEBT-366](../_archive/debt/debt-366-active-exam-visibility-predicate-duplication.md) | Active-exam visibility predicate consolidated into shared `getActiveExamVisibilityCondition()` at `src/adapters/repositories/shared/active-exam-visibility.ts`; both `DrizzleAttemptRepository` and `DrizzleQuestionRepository` now import the shared helper. Pure deduplication, zero behavior change, zero test files modified | P3 | 2026-04-26 | [PR #289](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/289) |
| [DEBT-365](../_archive/debt/debt-365-exam-flow-affordance-and-label-consistency.md) | Exam flow affordance and label consistency pass — Concern 3A footer grouping and Concern 5A `View Summary` outline shipped in [PR #283](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/283); Concerns 1, 4, 6, 7 resolved earlier; Concern 2 (`Mark for review` vs `Bookmark`) closed 2026-04-23 as intentional-by-design because the two controls never share a surface in the shipped flow | P3 | 2026-04-23 | [PR #283](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/283) |
| [DEBT-364](../_archive/debt/debt-364-post-exam-review-reentry-cursor-persistence.md) | Post-exam review re-entry cursor persistence — untargeted `Review Answers` from Session Summary now resets to the first available row so `Next` is visible; targeted breakdown-row re-entry is unchanged | P2 | 2026-04-21 | [PR #282](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/282) |
| [DEBT-363](../_archive/debt/debt-363-exam-shell-scroll-model-and-dual-cta.md) | Exam shell scroll model + dual-CTA disambiguation — Concern 1 reverted the DEBT-360 bounded-scroll shell to document-flow action bars (PR #280); Concern 2 dropped the `Finish exam` header button in exam mode so the footer `Review & Submit` is the single primary CTA (PR #281) | P2 | 2026-04-20 | [PR #280](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/280), [PR #281](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/281) |
| [DEBT-362](../_archive/debt/debt-362-review-submit-screen-affordances.md) | Review & Submit return affordance — explicit instructional sentence above the row list plus a decorative trailing chevron on available rows | P3 | 2026-04-13 | [PR #279](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/279) |
| [DEBT-360](../_archive/debt/debt-360-action-bar-below-fold.md) | Sticky action bar primitive shared by `PracticeView` and `PostExamReviewView`, using a viewport-bounded shell, scrollable content region, and safe-area footer treatment so primary controls stay visible on long questions/feedback | P2 | 2026-04-13 | [PR #278](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/278) |
| [DEBT-361](../_archive/debt/debt-361-exam-last-question-next-label.md) | Exam last question label — renamed the `ExamActionBar` middle button from `Next` to `Review & Submit` on the last exam question, preserving the existing `onEndSession` routing and `aria-describedby` hint | P3 | 2026-04-12 | [PR #277](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/277) |
| [DEBT-359](../_archive/debt/debt-359-session-summary-cta-labels.md) | Session Summary CTA label clarity — renamed "Back to Practice" → "New Session" and "Review your answers" → "Review Answers" on the completed Session Summary surface | P2 | 2026-04-11 | [PR #276](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/276) |
| [DEBT-356](../_archive/debt/debt-356-duplicate-question-surface-renderers.md) | Duplicate question-surface renderers — extracted shared `QuestionSurfaceBody` so `QuestionView` and `PracticeView` now share one question-card/feedback composition path while keeping surface-specific wrappers thin | P3 | 2026-04-10 | [PR #275](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/275) |
| [DEBT-352](../_archive/debt/debt-352-post-exam-review-focus-ring-flash.md) | Post-exam review focus-ring flash — removed forced `focusVisible: true` from programmatic focus while preserving panel focus transfer and keyboard/screen-reader affordance | P3 | 2026-04-10 | [PR #274](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/274) |
| [DEBT-357](../_archive/debt/debt-357-test-double-discipline-drift.md) | Test double discipline drift — consolidated drifted inline doubles onto repo-standard fakes (`FakeUserRepository`, `FakeAuthGateway`, `FakeCheckEntitlementUseCase`) in three test files | P3 | 2026-04-10 | [PR #273](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/273) |
| [DEBT-355](../_archive/debt/debt-355-cross-feature-question-flow-coupling.md) | Cross-feature question-flow coupling — extracted shared error-message and async-action helpers from `practice/` to neutral `shared/` boundary | P2 | 2026-04-10 | [PR #272](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/272) |
| [DEBT-354](../_archive/debt/debt-354-god-file-and-clean-code-audit.md) | God-file and clean-code audit — audit complete; child tickets DEBT-355/356/357 opened for coupling, duplication, and test-discipline drift | P2 | 2026-04-09 | [PR #271](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/271) |
| [DEBT-358](../_archive/debt/debt-358-exam-review-question-navigation-stranded.md) | Exam review question navigation stranded — clicking a question from Review & Submit disables the navigator because `isInReviewStage` stays `true`, stranding the student on one question | P2 | 2026-04-09 | [PR #270](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/270) |
| [DEBT-353](../_archive/debt/debt-353-practice-session-results-orchestrator-decomposition.md) | Practice session results orchestrator decomposition — split DEBT-350 continuity logic out of the 500+ line review-stage hook and large page-view branch tree without changing shipped behavior | P3 | 2026-04-09 | [PR #270](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/270) |
| [DEBT-350](../_archive/debt/debt-350-exam-results-session-continuity.md) | Exam results continuity — keep Session Summary review re-entry inside `/app/practice/[sessionId]` with an explicit results substage, preserved review payload, callback-driven CTA, and summary breakdown callback mode | P2 | 2026-04-08 | [PR #269](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/269) |
| [DEBT-351](../_archive/debt/debt-351-exam-review-submit-affordance-cleanup.md) | Review & Submit affordance cleanup — make available rows whole-card semantic buttons, remove nested `Open question`, and drop default `Not marked` noise | P3 | 2026-04-07 | [PR #268](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/268) |
| [DEBT-348](../_archive/debt/debt-348-cache-components-public-marketing-shell.md) | Cache Components for public marketing shell — enabled `cacheComponents`, split static marketing shell from dynamic auth/entitlement islands behind Suspense with neutral skeleton fallbacks | P3 | 2026-04-04 | [PR #264](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/264) |
| [DEBT-345](../_archive/debt/debt-345-circuit-breaker-external-services.md) | Circuit breaker for Stripe API — in-memory `CircuitBreaker` class wrapping `callStripeWithRetry`, with full state-machine coverage; auxiliary paths routed through same breaker | P3 | 2026-04-03 | [PR #263](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/263) |
| [DEBT-344](../_archive/debt/debt-344-request-scoped-caching.md) | Request-scoped auth/question/tag read dedup — shipped framework-layer `React.cache` for auth state, published question reads, and tag lists; optional Tier 2 split to [DEBT-349](./debt-349-cross-request-published-content-caching.md) | P2 | 2026-04-03 | — |
| [DEBT-343](../_archive/debt/debt-343-scripts-cleanup.md) | Scripts directory cleanup — removed stale one-offs (`migrate-tag-taxonomy.*`, `tag-census.ts`, `ralph-loop.sh`, `docs/_ralphwiggum/`), added `seed-all-environments.sh` with dedup, production safety guard, and `--plan` mode | P3 | 2026-04-02 | — |
| [DEBT-347](../_archive/debt/debt-347-parallel-fetch-opportunities.md) | Parallel fetch opportunities — resolved the remaining page-level await waterfalls in layout, pricing, billing, plus the trivial practice/question/bookmarks follow-ons, with targeted regression tests | P4 | 2026-04-02 | — |
| [DEBT-346](../_archive/debt/debt-346-lazy-stripe-sdk-initialization.md) | Lazy Stripe SDK initialization — replaced the eager module-level Stripe client with a lazy singleton accessor in the container and preserved container-level Stripe injection seams | P3 | 2026-04-02 | — |
| [DEBT-336](../_archive/debt/debt-336-content-markdown-quality-pass.md) | Content markdown quality pass (C1–C4) — C1/C2/C4 resolved by Phase 2 YAML migration (DEBT-338); C3 (122 cosmetic restatements) investigated and tabled as acceptable | P3 | 2026-03-29 | — |
| [DEBT-342](../_archive/debt/debt-342-idempotency-backward-compat-guard.md) | Idempotency backward-compat guard cleanup — removed the `completedAt \|\| resultJson` replay fallback, made `completedAt` the sole completion marker, and updated the targeted unit contract | P4 | 2026-03-28 | — |
| [DEBT-275](../_archive/debt/debt-275-bs033-residual-open-items.md) | BS-033 Residual Open Items — decomposed into DEBT-335/336/337; all children tracked | P3 | 2026-03-24 | — |
| [DEBT-338](../_archive/debt/debt-338-seed-parser-silent-wrong-answer-section-corruption.md) | Seed parser silent corruption — Phase 1 hardening + 24-file repair + Phase 2 YAML migration all complete (PR #254). Legacy path cleanup in [DEBT-341](../_archive/debt/debt-341-post-migration-legacy-path-removal.md). | P1 | 2026-03-28 | [PR #254](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/254) |
| [DEBT-340](../_archive/debt/debt-340-clerk-v7-nextjs-upgrade.md) | Clerk v7 (Core 3) + Next.js 16.2.1 upgrade — `@clerk/themes` → `@clerk/ui`, dead `getAuth` removed, vendor docs corrected; enables Client Trust credential-stuffing protection | P2 | 2026-03-28 | [PR #255](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/255) |
| [DEBT-341](../_archive/debt/debt-341-post-migration-legacy-path-removal.md) | Post-migration legacy path removal — deleted the legacy draft `answer` / `## Choices` importer path, removed `parseChoiceExplanations()` and its regex state machine, collapsed seed parsing to a single YAML path, and pruned the legacy-only tests | P2 | 2026-03-28 | [PR #256](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/256) |
| [DEBT-335](../_archive/debt/debt-335-remove-all-or-nothing-wrong-answer-guard.md) | Remove all-or-nothing wrong-answer display guard — `Feedback` now shows available wrong-answer explanations even when sibling choices are null/blank, with targeted regression coverage and synced authoring docs | P2 | 2026-03-24 | — |
| [DEBT-339](../_archive/debt/debt-339-consolidate-question-instruction-files.md) | Consolidate 8 question instruction files → 5 — `SCHEMA.md` absorbed QUESTION-FORMAT-SPEC/TAG-TAXONOMY, `META.MD` was redistributed into `SCHEMA.md`/`PLAN.md`/`NOTES.md`, and the consolidated survivor files were synced to external `addiction-final-2026` | P2 | 2026-03-27 | — |
| [DEBT-329](../_archive/debt/debt-329-navigator-colorblind-accessibility.md) | Colorblind-accessible review navigator badges — shared `ReviewCorrectnessBadge` (✓/✗ shape cues), DRY `getReviewVariant`/`getReviewStatusLabel` utilities, `ring-1 ring-border` light-mode fix, stable `data-testid` selectors | P3 | 2026-03-23 | [PR #249](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/249) |
| [DEBT-318](../_archive/debt/debt-318-tutor-bookmark-before-answer.md) | Bookmark visible before feedback in tutor mode and quick practice — tutor/quick bookmark now renders only when inline feedback is actually visible, including the `isCorrect === null` edge case | P3 | 2026-03-23 | [PR #248](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/248) |
| [DEBT-334](../_archive/debt/debt-334-practice-session-bootstrap-timeout-guard.md) | Practice-session summary bootstrap timeout guard — wrapped bootstrap `getPracticeSessionSummary` in `withTimeout(...)` so hung requests no longer pin the page in `loading` forever | P3 | 2026-03-22 | [PR #247](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/247) |
| [DEBT-333](../_archive/debt/debt-333-browser-test-flakiness-audit.md) | Browser test flakiness — fixed the one confirmed unawaited deferred browser-spec bug, added same-file cleanup hardening plus browser config/setup hardening, and verified stability with repeated full-suite runs | P2 | 2026-03-21 | [PR #244](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/244) |
| [DEBT-331](../_archive/debt/debt-331-session-started-toast-overlap.md) | Remove redundant "Session started" toast and reposition shared toast region from `top-4` to `bottom-4` — eliminates nav bar overlap, keeps shortfall warning and bookmark toasts, CodeRabbit config hardened against docstring nags | P3 | 2026-03-21 | [PR #240](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/240) |
| [DEBT-330](../_archive/debt/debt-330-review-action-bar-bookmark-placement.md) | Post-exam review action bar now groups Previous and Next/Finish review ahead of Bookmark, with desktop trailing separation, mobile-safe stacking, regression coverage, and updated design-principles documentation | P3 | 2026-03-21 | [PR #241](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/241) |
| [DEBT-326](../_archive/debt/debt-326-post-exam-review-focus-management.md) | Post-exam review focus management — `useEffect` + `useRef` focuses the review panel on mount and navigation, `aria-label` for screen reader announcement, `<section>` landmark, repo-standard focus-visible ring, shared test fixtures, `FocusOptions` type augmentation | P3 | 2026-03-20 | [PR #239](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/239) |
| [DEBT-325](../_archive/debt/debt-325-post-exam-review-unanswered-display.md) | Post-exam review unanswered display — added `isUnanswered` prop to shared `Feedback` component, yellow warning banner in post-exam review, verdict pill suppression for unanswered on both review surfaces | P2 | 2026-03-20 | [PR #238](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/238) |
| [DEBT-324](../_archive/debt/debt-324-session-scoped-practice-missed-questions.md) | Removed misleading `Practice missed questions` CTA from exam Summary — DEBT-324 confirmed the link opened the user's global latest-incorrect Quick Practice pool, so the terminal summary now stays focused on review re-entry and exit paths. | P3 | 2026-03-19 | — |
| [DEBT-323](../_archive/debt/debt-323-agent-browser-react-click-failures.md) | Agent-browser React click failures — upstream limitation documented in `docs/tooling/agent-browser.md`. Not a code bug. Eval workarounds and toggle-button limitation permanently documented. | P3 | 2026-03-18 | — |
| [DEBT-328](../_archive/debt/debt-328-bookmark-surface-policy-stale-origin.md) | Bookmark Surface Policy — stale summary-review origin wording fixed; summary-launched review now documented as `from=summary` in the active frontend docs. | P4 | 2026-03-19 | — |
| [DEBT-327](../_archive/debt/debt-327-interaction-contracts-status-cleanup.md) | Interaction Contracts doc status cleanup — header/current-state framing reconciled so the document now reads as current implementation instead of mixed proposed/shipped state. | P4 | 2026-03-19 | — |
| [DEBT-322](../_archive/debt/debt-322-exam-action-bar-ux-polish.md) | Exam action bar UX polish — D-1 spacer removal, D-2 "Finish exam"/"Review & Submit" rename, D-3 fixed "Next" label, D-4b Previous visibility stabilization. All frontend-only. | P2 | 2026-03-19 | [PR #235](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/235) |
| [DEBT-321](../_archive/debt/debt-321-bs055-exam-interaction-model-overhaul.md) | BS-055 Exam Interaction Model Overhaul — all 8 stages complete. Draft fields, save-draft, finalize, draft-aware readers, action bar split, navigation save, review wiring, summary back-target. | P1 | 2026-03-18 | — |
| [DEBT-320](../_archive/debt/debt-320-useeffect-audit.md) | useEffect audit — resolved the two `use-question-page-controller` anti-patterns and decomposed the question-page flow into focused bookmark, session-navigation, and previous-attempt hooks; broader fetch-abstraction discussion remains informational only | P2 | 2026-03-17 | — |
| [DEBT-319](../_archive/debt/debt-319-icon-size-shorthand-drift.md) | Lucide icon size shorthand drift in disclosure chevrons — replaced `h-4 w-4` with canonical `size-4` shorthand in both production chevrons and updated the corresponding test assertion | P3 | 2026-03-17 | — |
| [DEBT-317](../_archive/debt/debt-317-practice-questions-centering-on-narrow-screens.md) | Practice "Questions" block centering on narrow screens — changed the Questions wrapper from `items-center` to `items-start`, kept the existing sibling row structure, and updated the static markup test | P3 | 2026-03-16 | — |
| [DEBT-316](../_archive/debt/debt-316-exam-post-submit-review-flow.md) | Exam Post-Submit Review Flow — add "Review your answers" CTA to Session Summary, retarget breakdown links to `from=history`, add bottom-bar "Review answers" after last exam question | P2 | 2026-03-16 | — |
| [DEBT-315](../_archive/debt/debt-315-feedback-chip-semantic-color-and-casing.md) | Feedback Chip Semantic Color & Casing Polish — converted the incorrect-flow transition label to a semantic green `"Correct"` chip, dropped uppercase/tracking from section chips, and strengthened the neutral chip background in dark mode | P3 | 2026-03-15 | — |
| [DEBT-314](../_archive/debt/debt-314-feedback-section-label-chip-consistency.md) | Feedback Section Label Chip Consistency — converted the feedback section's plain-text labels into neutral muted chips, removed the trailing colon from `"Why other answers are wrong"`, and preserved the existing `showLabel` behavior | P3 | 2026-03-15 | — |
| [DEBT-313](../_archive/debt/debt-313-choice-button-dark-surface-and-badge-visibility.md) | Choice Button Dark Surface & Badge Visibility — replaced the DEBT-312 gray rest fill with the recessed `bg-background/50` dark-surface model, calibrated hover/selected ramps, and fixed neutral badge visibility across ChoiceButton and Feedback | P1 | 2026-03-15 | — |
| [DEBT-312](../_archive/debt/debt-312-choice-button-neutral-state-surface-alignment.md) | Choice Button Neutral-State Surface Alignment — landed the cross-theme required-boundary branch discipline and light-mode neutral-state alignment later refined by DEBT-313 | P2 | 2026-03-15 | — |
| [DEBT-286](../_archive/debt/debt-286-client-side-error-reporting.md) | Client-Side Caught Error Reporting — complete SPEC-016 rollout; wired all caught client-side operational errors to Sentry via `reportClientError()` | P2 | 2026-03-15 | [PR #218](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/218) |
| [DEBT-311](../_archive/debt/debt-311-practice-mode-questions-alignment.md) | Practice Page — bottom-align the mixed-height Mode/Questions controls at `sm`, and replace duplicate Practice starter SegmentedControl legends with visible-label `aria-labelledby` wiring | P3 | 2026-03-13 | — |
| [DEBT-310](../_archive/debt/debt-310-stripe-stale-price-id-in-production-db.md) | Production Neon `main` contained non-production Stripe subscription rows (one manual old-price seed, one E2E test subscription); deleting the polluted subscription rows resolved the `/app/dashboard` crash | P1 | 2026-03-13 | — |
| [DEBT-309](../_archive/debt/debt-309-filter-chip-hover-border-affordance.md) | FilterChip Hover Affordance — add `hover:border-foreground/60` (light) and `dark:hover:border-foreground/70` (dark), bump fill hover from `[0.10]` to `[0.12]` (+5pp delta); current hover is only a 3pp fill bump with no border change, barely perceptible | P3 | 2026-03-13 | — |
| [DEBT-308](../_archive/debt/debt-308-e2e-review-mode-selector-regression.md) | E2E Bookmark Review Selector Drift After DEBT-307 — updated the bookmark review audit to target the current title-link route contract instead of the removed `Review question:` action-link selector | P1 | 2026-03-12 | — |
| [DEBT-307](../_archive/debt/debt-307-bookmarks-row-visual-unification.md) | Bookmarks Row Visual Unification and Affordance Cleanup — replace bordered per-item cards with page-background tonal rows, remove redundant `Review`, adopt delegated container activation, and keep bookmark metadata scope intentionally narrow | P3 | 2026-03-12 | — |
| [DEBT-298](../_archive/debt/debt-298-ui-structural-consistency.md) | UI Structural Consistency Audit — standardized label/control spacing, card heading semantics, and mixed-height flex alignment across the verified practice/dashboard/session-summary views; touch target policy accepted at current sizes | P3 | 2026-03-12 | — |
| [DEBT-249](../_archive/debt/debt-249-checkout-success-auth-boundary-hardening.md) | Checkout Success Auth Boundary Hardening (Stripe Return + Clerk Redirect) | P1 | 2026-03-12 | — |
| [DEBT-304](../_archive/debt/debt-304-clerk-user-deleted-cancel-idempotency.md) | Clerk `user.deleted` Stripe cancel loop — handle already-canceled subscriptions idempotently instead of failing webhook processing | P2 | 2026-03-11 | [#204](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/204) |
| [DEBT-306](../_archive/debt/debt-306-stripe-customer-search-create-race.md) | Stripe customer search/create race — concurrent or late-visible customers can violate the intended 1:1 mapping | P2 | 2026-03-11 | — |
| [DEBT-305](../_archive/debt/debt-305-checkout-session-reuse-expire-race.md) | Checkout session reuse/expire flow — treat already-terminal sessions idempotently and revalidate reused sessions before returning stale URLs | P2 | 2026-03-11 | [#202](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/202) |
| [DEBT-303](../_archive/debt/debt-303-reconciliation-cancel-idempotency.md) | Reconciliation cancel loop — handle already-canceled Stripe subscriptions idempotently instead of failing the row | P3 | 2026-03-11 | [#201](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/201) |
| [DEBT-300](../_archive/debt/debt-300-history-questions-all-sources.md) | History Questions Tab — show all question sources (ad-hoc + tutor + exam) instead of ad-hoc only; add Source filter dropdown; fix Dashboard → History "View all" IA inconsistency | P2 | 2026-03-11 | [#200](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/200) |
| [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md) | History Row Fill Depth and Affordance Cleanup — raise all History rows from `bg-foreground/5` to `bg-foreground/[0.08]` for page-background perceptual parity with Dashboard/Practice; remove Sessions hover + underlines; remove Questions "Review" pill; adjust Questions hover to `/[0.12]` | P3 | 2026-03-10 | — |
| [DEBT-301](../_archive/debt/debt-301-history-page-visual-unification.md) | History Page Visual Unification — convert Sessions and Questions tabs from bordered/shadowed legacy rows to tonal-fill surfaces, replace the Sessions breakdown button with chevron disclosure, and soften internal breakdown separators/dividers | P2 | 2026-03-10 | — |
| [DEBT-299](../_archive/debt/debt-299-dashboard-recent-activity-date-label.md) | Dashboard Recent Activity — remove redundant "Answered" prefix from date labels to match Recent sessions bare-date style | P3 | 2026-03-10 | [#196](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/196) |
| [DEBT-295](../_archive/debt/debt-295-filter-chip-unselected-text-weight.md) | Filter Chip Unselected Text Weight — promoted unselected chip labels from `text-foreground/60` to full `text-foreground` and removed hover-only text brightening so chip labels read as primary interactive content at rest | P3 | 2026-03-09 | — |
| [DEBT-294](../_archive/debt/debt-294-filter-chip-fill-depth-and-cursor.md) | Filter Chip Fill Depth, Cursor, and Summary Hover Removal — promoted unselected chips from transparent labels to tonal toggle surfaces (`bg-foreground/[0.07]` + `hover:bg-foreground/[0.10]`), added `cursor-pointer`, and removed the imperceptible filter-summary hover fill | P3 | 2026-03-09 | — |
| [DEBT-297](../_archive/debt/debt-297-practice-starter-ui-polish.md) | Practice Session Starter UI Polish — shortened collapsed zero-state summary copy, aligned the Questions input to the card surface, enabled clear-and-retype number entry with clamp-on-blur, promoted the title to `<h2>`, and hid native number spinners | P3 | 2026-03-10 | — |
| [DEBT-296](../_archive/debt/debt-296-filter-section-summary-hierarchy-swap.md) | Filter Section Summary Text Hierarchy Swap — collapsed zero-state summaries now surface outcome copy (`All topics included by default`), while expanded sections show the current `({N} selected)` footer below the chips | P3 | 2026-03-09 | — |
| [DEBT-293](../_archive/debt/debt-293-e2e-shared-state-structural-flakiness.md) | E2E Shared-State Structural Flakiness — full per-test user-state reset now isolates mutating specs; `startSession()` verifies requested count; review navigator assertions now derive count from the page contract | P1 | 2026-03-09 | — |
| [DEBT-291](../_archive/debt/debt-291-filter-chip-light-mode-border-contrast.md) | FilterChip Light Mode Border Contrast — replaced the unselected light-mode chip border with `border-foreground/45` while preserving `dark:border-foreground/40` so the required chip boundary clears SC 1.4.11 in both themes | P3 | 2026-03-09 | — |
| [DEBT-292](../_archive/debt/debt-292-filter-section-disclosure-indicator.md) | Filter Section Disclosure Indicator — added a `ChevronDown` disclosure icon, `group-open:rotate-180`, and summary-only hover treatment to Topic/Substance/Treatment filter sections without reintroducing container borders | P3 | 2026-03-09 | — |
| [DEBT-290](../_archive/debt/debt-290-practice-filter-tonal-fill-elevation.md) | Practice Filter Container Tonal Fill Elevation — removed filter-container borders, applied `bg-foreground/5` tonal fill, promoted chip/count/helper secondary text to `text-foreground/60`, and switched FilterChip rest/hover to transparent + foreground-scale tokens | P3 | 2026-03-09 | — |
| [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md) | Dashboard Nested Card Surface Strategy — removed inner row borders, applied tonal fill elevation (`bg-foreground/5` + `hover:bg-foreground/[0.08]`) per Material Design 3; includes badge pill companion change (`bg-foreground/[0.06] border-0 text-foreground/60`); dashboard-local | P3 | 2026-03-08 | — |
| [DEBT-288](../_archive/debt/debt-288-feedback-redundant-section-labels.md) | Feedback Redundant Section Labels — removed the redundant first-card labels in feedback, kept the second-card `"Correct answer"` transition label in incorrect flow, and updated outcome-aware selector coverage | P3 | 2026-03-08 | — |
| [DEBT-287](../_archive/debt/debt-287-clinical-pearl-label-dark-mode-prominence.md) | Clinical Pearl Label Dark Mode Prominence — promoted the shared clinical pearl label token from `text-muted-foreground` to `text-foreground/60` and synced Pattern Registry F-7 | P3 | 2026-03-07 | — |
| [DEBT-285](../_archive/debt/debt-285-feedback-explanation-dark-mode-readability.md) | Feedback Explanation Dark Mode Readability — promoted feedback explanations to `text-base text-foreground`, bumped the feedback reference from `text-xs` to `text-sm`, and documented the feedback-context override | P2 | 2026-03-07 | [#182](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/182) |
| [DEBT-284](../_archive/debt/debt-284-feedback-visual-polish-phase-2.md) | Feedback Visual Polish Phase 2 — verdict-colored feedback badges (success/destructive), unified explanation muting across all card types | P2 | 2026-03-07 | [#180](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/180) |
| [DEBT-283](../_archive/debt/debt-283-hardcoded-ui-typography-explicit-sizing-alignment.md) | Hardcoded UI Typography Explicit Sizing Alignment — normalized the audited 13-file / 19-occurrence supporting-copy drift to explicit `text-base text-muted-foreground` and added regression coverage | P3 | 2026-03-07 | — |
| [DEBT-282](../_archive/debt/debt-282-feedback-visual-unification.md) | Feedback Visual Unification — circular badges, `text-base` typography, `gap-3`/`p-4` layout alignment with choice buttons, hierarchy inversion fix | P2 | 2026-03-07 | — |
| [DEBT-278](../_archive/debt/debt-278-verdict-badge-solid-pill-styling.md) | Verdict Badge Solid Pill Styling — solid background + white text + `self-start` compact pill for Correct/Incorrect badge, WCAG AA compliant across all theme combinations | P2 | 2026-03-07 | [#177](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/177) |
| [DEBT-281](../_archive/debt/debt-281-e2e-bookmark-test-flakiness.md) | E2E Bookmark Test Flakiness — scoped per-test bookmark reset eliminated cross-spec state leakage; helper hardening retained as defense in depth | P2 | 2026-03-07 | [#176](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/176) |
| [DEBT-280](../_archive/debt/debt-280-choice-button-dark-mode-surface-refinement.md) | Choice Button and Segmented Control Dark Mode Surface Refinement — remove gray rest fill, widen hover/selected state steps, soften segmented control border | P2 | 2026-03-06 | [#175](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/175) |
| [DEBT-279](../_archive/debt/debt-279-wcag-aa-contrast-remediation-plan.md) | WCAG AA Contrast Remediation Plan (BS-042) — token + pattern + component-level compliance rollout | P1 | 2026-03-06 | [#174](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/174) |
| [DEBT-277](../_archive/debt/debt-277-clinical-pearl-styled-callout.md) | Clinical Pearl Styled Callout — detect `**Clinical pearl:**` in `<Markdown>` and render as visually distinct callout with label separated from content | P3 | 2026-03-04 | [#173](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/173) |
| [DEBT-276](../_archive/debt/debt-276-feedback-section-card-containment.md) | Feedback Section Card Containment — semantic section wrappers for correct/incorrect feedback hierarchy (Part B of BS-041) | P3 | 2026-03-04 | [#172](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/172) |
| [DEBT-274](../_archive/debt/debt-274-incorrect-answer-feedback-flow-reorder.md) | Incorrect Answer Feedback Flow Reorder — promote user's wrong answer to top of feedback, correct answer second | P2 | 2026-03-04 | [#171](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/171) |
| [DEBT-273](../_archive/debt/debt-273-choice-button-surface-hierarchy-fix.md) | Choice Button Surface Hierarchy Fix — elevate `bg-background` → `bg-muted/20` + smooth hover in dark mode | P2 | 2026-03-04 | [#170](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/170) |
| [DEBT-270](../_archive/debt/debt-270-integration-test-god-file-split.md) | Integration Test God File Split — split `repositories.integration.test.ts` (3,004 lines) into 9 domain-scoped files + shared helpers | P3 | 2026-03-03 | [#169](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/169) |
| [DEBT-271](../_archive/debt/debt-271-structural-ast-test-brittleness.md) | Structural/AST-Coupled Test Brittleness — removed remaining AST-coupled helper assertion from practice-session repository tests | P2 | 2026-03-03 | [#168](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/168) |
| [DEBT-272](../_archive/debt/debt-272-fakes-test-god-file-split.md) | Fakes Test God File Split — extracted 12 per-fake test files and removed `fakes.test.ts` | P3 | 2026-03-03 | [#168](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/168) |
| [DEBT-268](../_archive/debt/debt-268-quick-practice-ordering-policy-alignment.md) | Quick Practice Ordering Policy Alignment — daily-seeded shuffle in `executeForFilters` (BS-038) | P2 | 2026-03-02 | — |
| [DEBT-267](../_archive/debt/debt-267-get-previous-attempt-identifier-contract-hardening.md) | GetPreviousAttempt Identifier Contract Hardening | P3 | 2026-03-01 | — |
| [DEBT-266](../_archive/debt/debt-266-retry-observability-and-session-review-marker-persistence.md) | Retry Observability and Session-Review Marker Persistence | P3 | 2026-03-01 | — |
| [DEBT-269](../_archive/debt/debt-269-history-breakdown-ux-redesign.md) | History Breakdown UX Redesign — flat surface, list structure, disclosure a11y, interaction semantics (BS-036) | P2 | 2026-03-01 | — |
| [DEBT-265](../_archive/debt/debt-265-retry-lineage-and-review-practice-unification.md) | Retry Lineage and Review/Practice Unification | P2 | 2026-03-01 | — |
| [DEBT-264](../_archive/debt/debt-264-documentation-sync.md) | Documentation Sync (Finalize frontend docs after DEBT-251–263) | P2 | 2026-03-01 | — |
| [DEBT-250](../_archive/debt/debt-250-frontend-visual-divergence-compliance-plan.md) | Frontend Visual Divergence Compliance Plan (BS-035 + all 31 items + 13 decisions) | P2 | 2026-03-01 | — |
| [DEBT-263](../_archive/debt/debt-263-text-contrast.md) | Text Contrast (LIGHT-2) | P2 | 2026-03-01 | — |
| [DEBT-262](../_archive/debt/debt-262-light-mode-opacity.md) | Light-Mode Opacity Scale (LIGHT-1) | P2 | 2026-03-01 | — |
| [DEBT-261](../_archive/debt/debt-261-touch-targets.md) | Touch Targets (TOUCH-1, TOUCH-2) | P2 | 2026-03-01 | [#152](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/152) |
| [DEBT-260](../_archive/debt/debt-260-ux-seams.md) | UX Seams (UX-1 through UX-4) | P2 | 2026-03-01 | [#152](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/152) |
| [DEBT-259](../_archive/debt/debt-259-shared-constants-extraction.md) | Shared Constants Extraction (D-13, D-11) | P2 | 2026-03-01 | [#152](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/152) |
| [DEBT-258](../_archive/debt/debt-258-marketing-alignment.md) | Marketing Alignment (D-8, D-9, D-10, D-14, D-15) | P2 | 2026-02-28 | — |
| [DEBT-257](../_archive/debt/debt-257-choice-selected-state.md) | Choice Button Selected State (AFFORD-1) | P2 | 2026-02-28 | — |
| [DEBT-256](../_archive/debt/debt-256-expanded-breakdown-hierarchy.md) | Expanded Breakdown Visual Hierarchy (STRUCT-1) | P2 | 2026-02-28 | — |
| [DEBT-255](../_archive/debt/debt-255-mobile-nav-hover.md) | Mobile Nav Hover (D-16) | P2 | 2026-02-28 | — |
| [DEBT-254](../_archive/debt/debt-254-headings-errorcard-compliance.md) | Headings + ErrorCard Compliance (D-17, COMP-1) | P2 | 2026-02-28 | — |
| [DEBT-253](../_archive/debt/debt-253-scattered-phase1-fixes.md) | Scattered Phase 1 Fixes (D-2, D-4, D-7, D-12) | P2 | 2026-02-28 | [#150](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/150) |
| [DEBT-252](../_archive/debt/debt-252-history-sessions-compliance.md) | History Sessions Compliance (D-1, D-5, A11Y-1) | P2 | 2026-02-28 | [#150](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/150) |
| [DEBT-251](../_archive/debt/debt-251-choice-button-compliance.md) | Choice Button Compliance (D-3, D-6, A11Y-2, LIGHT-3) | P2 | 2026-02-28 | [#150](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/150) |
| [DEBT-246](../_archive/debt/debt-246-e2e-coverage-gaps-visual-testing-strategy.md) | Targeted E2E Coverage Gaps and Visual/CSS Testing Layer Policy | P3 | 2026-02-24 | — |
| [DEBT-248](../_archive/debt/debt-248-e2e-helper-robustness.md) | Post-PR-134 CodeRabbit Follow-Ups (E2E Helpers) | P4 | 2026-02-24 | — |
| [DEBT-247](../_archive/debt/debt-247-test-helper-structure-cleanup.md) | Test Helper Structure Cleanup (Orphans, Boundary Violations, Duplication) | P4 | 2026-02-24 | — |
| [DEBT-245](../_archive/debt/debt-245-e2e-pyramid-drift-and-skip-governance.md) | E2E Pyramid Drift and Data-Dependent Skip Governance | P1 | 2026-02-23 | [#133](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/133) |
| [DEBT-244](../_archive/debt/debt-244-test-reliability-schema-and-state-drift.md) | Test Reliability Drift (Schema + Stateful E2E Data + Spec Drift) | P1 | 2026-02-23 | — |
| [DEBT-243](../_archive/debt/debt-243-e2e-credential-drift-silent-failure.md) | E2E Credential Drift and Silent Failure | P2 | 2026-02-23 | — |
| [DEBT-242](../_archive/debt/debt-242-cron-secret-missing-from-vercel-development.md) | CRON_SECRET Missing From Vercel Development Environment | P3 | 2026-02-22 | — |
| [DEBT-241](../_archive/debt/debt-241-sentry-dsn-missing-from-vercel-environments.md) | Sentry DSN Missing From All Vercel Environments | P2 | 2026-02-22 | — |
| [DEBT-240](../_archive/debt/debt-240-local-dev-database-url-points-to-production.md) | Local Dev DATABASE_URL Points to Production Neon Branch | P1 | 2026-02-22 | — |
| [DEBT-239](../_archive/debt/debt-239-env-local-stripe-account-mismatch.md) | .env.local Stripe Account Mismatch, E2E Credential Gaps, and Audit Test Infrastructure | P1 | 2026-02-22 | — |
| [DEBT-235](../_archive/debt/debt-235-split-migrate-tag-taxonomy-script.md) | Split migrate-tag-taxonomy.ts Into Focused Modules | P3 | 2026-02-19 | — |
| [DEBT-224](../_archive/debt/debt-224-file-size-audit-production-and-test.md) | File Size Audit - Production and Test Files Exceeding Guidelines | P3 | 2026-02-19 | — |
| [DEBT-237](../_archive/debt/debt-237-extract-reconciliation-test-factory.md) | Extract Reconciliation Test Factory to Reduce Boilerplate | P4 | 2026-02-19 | — |
| [DEBT-236](../_archive/debt/debt-236-extract-reconciliation-concurrency-utility.md) | Extract Concurrency Utility and Document Reconciliation Algorithm | P4 | 2026-02-19 | — |
| [DEBT-238](../_archive/debt/debt-238-orphaned-from-review-test-artifact.md) | Orphaned `from=review` Test Artifact From DEBT-215 Cleanup | P4 | 2026-02-19 | #89 |
| [DEBT-234](../_archive/debt/debt-234-add-max-lines-lint-rule.md) | Add max-lines Check to Prevent File Size Regression | P4 | 2026-02-18 | — |
| [DEBT-233](../_archive/debt/debt-233-add-why-comments-to-justified-large-files.md) | Add WHY Comments to Justified Large Files | P4 | 2026-02-18 | — |
| [DEBT-232](../_archive/debt/debt-232-reduce-get-next-question-test-inflation.md) | Reduce get-next-question.test.ts Test Inflation | P3 | 2026-02-18 | — |
| [DEBT-229](../_archive/debt/debt-229-extract-bookmarks-server-action-and-errors.md) | Extract Server Action and Error Handling From bookmarks/page.tsx | P3 | 2026-02-19 | — |
| [DEBT-231](../_archive/debt/debt-231-reduce-browser-spec-probe-duplication.md) | Reduce Browser Spec Probe Component Duplication | P3 | 2026-02-19 | — |
| [DEBT-230](../_archive/debt/debt-230-decompose-seed-script-into-modules.md) | Decompose seed.ts Into Focused Modules | P4 | 2026-02-19 | — |
| [DEBT-228](../_archive/debt/debt-228-dry-fake-use-cases-with-generic-base.md) | DRY fake-use-cases.ts With Generic Base Class | P4 | 2026-02-18 | — |
| [DEBT-227](../_archive/debt/debt-227-split-fake-repositories-into-individual-files.md) | Split fake-repositories.ts Into Individual Files | P3 | 2026-02-19 | — |
| [DEBT-226](../_archive/debt/debt-226-playwright-e2e-timeout-and-import-convention.md) | Playwright E2E Timeout Policy and Import Convention Are Undocumented | P3 | 2026-02-18 | — |
| [DEBT-225](../_archive/debt/debt-225-vitest-cold-import-timeout-flakes.md) | Vitest Cold-Import Timeout Flakes — 3 Tests Hit Default 5s Wall | P2 | 2026-02-18 | — |
| [DEBT-223](../_archive/debt/debt-223-verbose-set-array-dedup-pattern.md) | Verbose Set+Array Dedup Pattern in get-user-stats.ts | P4 | 2026-02-16 | — |
| [DEBT-222](../_archive/debt/debt-222-bookmark-retry-state-should-be-refs.md) | Bookmark Idempotency Key Should Use `useRef` (retryCount must stay as state) | P4 | 2026-02-16 | — |
| [DEBT-221](../_archive/debt/debt-221-compute-accuracy-conflates-zero-with-no-attempts.md) | `computeAccuracy()` Conflates "No Attempts" With "0% Accuracy" | P4 | 2026-02-16 | — |
| [DEBT-220](../_archive/debt/debt-220-duplicated-enrich-with-question-boilerplate.md) | Duplicated enrichWithQuestion Boilerplate Across 4 Use Cases | P3 | 2026-02-16 | — |
| [DEBT-219](../_archive/debt/debt-219-sequential-stripe-api-reconciliation.md) | Sequential Stripe API Calls in Reconciliation Cron Job | P3 | 2026-02-16 | — |
| [DEBT-218](../_archive/debt/debt-218-server-component-pages-missing-maxduration.md) | Server Component Pages Missing maxDuration + Dead Code in practice-logic.ts | P2 | 2026-02-15 | — |
| [DEBT-217](../_archive/debt/debt-217-history-back-link-loses-tab-and-filter-state.md) | History Back Link Loses Tab and Filter State | P2 | 2026-02-15 | — |
| [DEBT-213](../_archive/debt/debt-213-useeffect-derived-state-sync-antipatterns.md) | useEffect Derived-State Sync Anti-Patterns in Practice Hooks (5 instances) | P4 | 2026-02-14 | — |
| [DEBT-212](../_archive/debt/debt-212-duplicate-sleep-utility-adapter-shared.md) | Duplicate `sleep()` Utility in Adapter Shared Modules | P4 | 2026-02-14 | #91 |
| [DEBT-208](../_archive/debt/debt-208-e2e-cross-page-navigation-tests.md) | Missing E2E Tests for Cross-Page Navigation Flows | P3 | 2026-02-14 | #81 |
| [DEBT-215](../_archive/debt/debt-215-backwards-compatibility-shims-cleanup.md) | Backwards Compatibility Shims in a Greenfield Codebase | P3 | 2026-02-14 | — |
| [DEBT-216](../_archive/debt/debt-216-remaining-drizzle-dry-violations.md) | Remaining Drizzle Repository Violations (God Method, Race Condition, DRY) | P3 | 2026-02-14 | — |
| [DEBT-214](../_archive/debt/debt-214-drizzle-query-duplication-attempt-repository.md) | Drizzle Query Duplication in Attempt Repository (Conditional JOINs via Copy-Paste) | P3 | 2026-02-14 | — |
| [DEBT-210](../_archive/debt/debt-210-dead-routes-app-review-constant.md) | Dead `ROUTES.APP_REVIEW` Constant in Route Definitions | P4 | 2026-02-14 (Subsumed by DEBT-215) | #90 |
| [DEBT-207](../_archive/debt/debt-207-missing-session-question-count-warning.md) | No Warning When Practice Session Has Fewer Questions Than Requested | P3 | 2026-02-14 | #82 |
| [DEBT-209](../_archive/brainstorming/bs-015-practice-starter-available-count-display.md) | Practice Starter Shows Available Question Count Before Session Start | P3 | 2026-02-14 | #53 |
| [DEBT-206](../_archive/debt/debt-206-client-side-difficulty-tag-filters-history.md) | Client-Side Difficulty/Tag Filters Cause Inaccurate Pagination on History Questions Tab | P2 | 2026-02-14 | #87 |

---

## Frontend Debt (Active)

All frontend-specific UI/UX debt. Items use `FE-XXX` IDs and are cross-referenced in `docs/frontend/standards.md` Section 17 (Known Violations).

### P2 — Fix during UI/UX refactor

*No active P2 items.*

### P3 — Fix as encountered

*No active P3 items.*

**Next Frontend ID:** FE-056

### Frontend Debt — Resolved

| ID | Summary | Resolution |
|----|---------|------------|
| FE-001 | God hook: `usePracticeSessionPageController` (was 306 lines, 14 state vars) | Refactored to 102 lines; logic extracted to sub-hooks |
| FE-003 | God hook: `usePracticeSessionControls` (was 288 lines, 26 return props) | Refactored to 79 lines; 4 sub-hooks extracted. Still 23 return props (composition hub). |
| FE-004 | God hook: `usePracticeQuestionFlow` (was 246 lines) | Refactored to 55 lines; 2 sub-hooks extracted |
| FE-005 | Duplicated logic: 3 copies of loadNextQuestion, submitAnswer | Core logic extracted to shared `question-flow-actions.ts` |
| FE-006 | Two competing `LoadState` type definitions | Unified via shared `load-state.ts` |
| FE-014 | Heading hierarchy skip (h1 to h3) in pricing | Fixed — now h1 > h2 > h3 |
| FE-027 | Feedback component missing `role="alert"` | Added `role="alert"` to feedback banner and regression test coverage |
| FE-038 | Card sub-components: 0 imports outside tests | Sub-components removed — zero production usage across 16 Card consumers confirmed. Project uses Card + direct children pattern per frontend standards. |
| FE-039 / DEBT-179 | `global-error.tsx` missing `<head>` and `suppressHydrationWarning` | Fixed with full HTML shell metadata + hydration parity tests |
| FE-040 / DEBT-180 | Duplicated manage-billing files across pricing and billing routes | Shared core/types extracted to `lib/manage-billing/*`; route wrappers preserved |
| FE-041 / DEBT-181 | Hardcoded pricing data duplicated in marketing and pricing views | Shared constants extracted to `lib/pricing-data.ts` with regression guards |
| FE-042 / DEBT-182 | Missing `font-heading` on error/not-found/pricing headings | `font-heading` applied consistently across targeted headings + style regression tests |
| FE-043 / DEBT-183 | Bare `console.error` in client hooks (not observable) | Removed redundant client hook console logs; bookmark failures now surface as error notifications |
| FE-044 / DEBT-184 | Loading message says "Loading question..." during answer submission | Submit flows now use transition pending state; loading card is fetch-only and submit button announces `Submitting…` |
| FE-046 | Toggle buttons lack `aria-pressed` attribute | Added `aria-pressed` to bookmark + mark-for-review toggles |
| FE-047 | Filter chip groups missing semantic grouping | Wrapped difficulty/tag chips in `<fieldset aria-label=...>` and added regression test |
| FE-048 | Session progress counter not announced to screen readers | Added `aria-live="polite"` to session progress label and test coverage |
| FE-050 | Exam review submit button missing pending label | Exam review submit button now shows `Submitting…` when pending, with test coverage |
| FE-051 | No warning when submitting exam with unanswered questions | Added unanswered warning copy in exam review confirmation dialog, with regression coverage |
| FE-052 | Loading state `<output>` missing `aria-live` in `practice-view.tsx` | Added `aria-live="polite"` to practice loading output and updated tests |
| FE-053 | Bookmark error card never auto-dismisses and has no retry button | Added `Retry bookmarks` action wired to reload bookmarks, with test coverage |
| [FE-054](../_archive/debt/fe-054-hardcoded-emerald-color-bypasses-design-tokens.md) | Hardcoded `text-emerald-500` bypasses design system tokens (3 files) | Replaced `text-emerald-500` with `text-success` and updated regression test |
| [FE-055](../_archive/debt/fe-055-aria-controls-wiring.md) ([phase 1](../_archive/debt/fe-055-exam-navigator-missing-nav-landmark.md)) | Practice session question navigator accessibility wiring (`<nav>` landmark, `aria-current`, `aria-controls`) | Completed in two stages: phase 1 added landmark + `aria-current="step"`; follow-up added end-to-end `aria-controls` → panel `id` wiring (`useId`) across `exam-review-view.tsx`, `practice-view.tsx`, and `practice-session-page-view.tsx` with regression coverage. |
| FE-002 | `usePracticeSessionReviewStage` exceeds 150-line guideline | Refactored to 212 lines; summary + navigator extracted to sub-hooks |
| FE-007 | Raw `<button>` in pricing client | Replaced with `Button` component and preserved pending state |
| FE-008 | Raw styled links used as buttons | Adopted `Button asChild` and standardized focus rings |
| FE-009 | Card-like divs in marketing | Adopted `Card` component across all marketing sections |
| FE-010 | PascalCase filenames + card-like divs in question components | Renamed to kebab-case and adopted `Card` component |
| FE-011 | Two competing focus ring patterns | Unified to `ring-[3px] ring-ring/50` standard |
| FE-012 | Missing focus-visible rings on text links | Added focus-visible rings where missing |
| FE-013 | Disabled opacity uses 60 instead of 50 | Standardized disabled opacity to 50 |
| FE-015 | Copy-pasted error boundaries | Extracted shared `ErrorBoundaryPage` component |
| FE-016 | Card defaults unused | Updated Card defaults to match consumer expectations |
| FE-017 | Loading skeleton radius mismatch | Standardized skeleton radius to match cards |
| FE-018 | Missing `cn()` usage | Converted manual class concat to `cn()` |
| FE-019 | External CTA link missing `target="_blank"` | Added `target="_blank"` + `rel="noreferrer noopener"` |
| FE-020 | Missing practice session `error.tsx` | Added route error boundary |
| FE-021 | Missing per-page metadata | Added `metadata` to pages for distinct titles |
| FE-022 | Inconsistent stat card hover | Unified hover/transition treatment |
| FE-023 | Hover color changes missing transitions | Added `transition-colors` where needed |
| FE-024 | Missing font styling on pricing numbers | Standardized pricing typography |
| FE-025 | Icon sizing uses `h-X w-X` instead of `size-X` | Standardized icons to `size-X` |
| FE-026 | Buttons missing accessible context labels | Added contextual `aria-label`s where needed |
| FE-028 | No confirmation dialogs for destructive actions | Added AlertDialog confirmations for abandon/remove/submit |
| FE-029 | Toast system underused | Added success toasts for key flows |
| FE-030 | Bookmark removal lacks success feedback | Added removal toast and URL param clearing |
| FE-031 | Inline hook logic in QuestionPageClient | Extracted controller hook for page client |
| FE-032 | Clerk theme hardcoded | Made Clerk appearance follow app theme |
| FE-033 | No shared marketing layout | Introduced shared `MarketingLayout` for `/` and `/pricing` |
| FE-034 | Empty states lack helpful CTAs | Added CTAs across empty states |
| FE-035 | Checkout success sync file too large | Decomposed into focused modules under cap |
| FE-036 | Unused shadcn/ui components | Removed `avatar`, `label`, and `radio-group` primitives + tests |
| FE-045 | Duplicate question flow hooks | Extracted shared core hook for both flows |
| FE-049 | Missing `createBookmark()` factory | Added factory + barrel export + unit test |

## Archived Debt

### Resolved in Codebase Health Audit (2026-02-11)

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-211](../_archive/debt/debt-211-spec-index-status-drift.md) | Spec Index Status Drift — SPEC-021 and SPEC-022 Had Incorrect Status | P3 | 2026-02-11 |

### Resolved in Stripe Gateway Test Refactor

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-204](../_archive/debt/debt-204-stripe-payment-gateway-test-god-file.md) | Stripe Payment Gateway Test God File (Was 2,468 Lines) | P2 | 2026-02-09 |

### Resolved in Debt Register Cleanup

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-193](../_archive/debt/debt-193-backend-production-files-over-300-lines.md) | Backend Production Files Exceed 300-Line Guideline (5 files) | P3 | 2026-02-09 |
| [DEBT-194](../_archive/debt/debt-194-console-error-default-in-utility-functions.md) | Default `console.error` in Utility Function Parameters (3 files) | P4 | 2026-02-09 |
| [DEBT-202](../_archive/debt/debt-202-missing-migration-0008-snapshot.md) | Missing Drizzle Migration 0008 Snapshot File | P3 | 2026-02-09 |
| [DEBT-203](../_archive/debt/debt-203-fragile-date-display-string-slicing.md) | Fragile Date Display Using `.slice(0, 10)` in Bookmarks and Review Pages (4 locations) | P4 | 2026-02-09 |

### Resolved in Practice Submit Loading Cleanup

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-184](../_archive/debt/debt-184-loading-message-misleading-during-submit.md) | Loading Message Misleading During Answer Submission | P2 | 2026-02-08 |

### Resolved in Practice Engine DRY Cleanup

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-185](../_archive/debt/debt-185-duplicated-session-stats-calculation.md) | Duplicated Session Stats Calculation Across 4 Use Cases | P2 | 2026-02-08 |
| [DEBT-186](../_archive/debt/debt-186-duplicated-session-duration-calculation.md) | Duplicated Session Duration Calculation | P2 | 2026-02-08 |
| [DEBT-187](../_archive/debt/debt-187-duplicated-default-question-state.md) | Duplicated Default PracticeSessionQuestionState Creation | P2 | 2026-02-08 |

### Resolved in Regression Test Cleanup

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-192](../_archive/debt/debt-192-source-reading-regression-tests-fragile.md) | Source-Reading Regression Tests Are Fragile (3 of 5 should be behavioral) | P3 | 2026-02-09 |

### Resolved in Cron Endpoint Hardening

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-196](../_archive/debt/debt-196-cron-endpoint-lacks-rate-limiting.md) | Cron Endpoint Lacks Rate Limiting | P2 | 2026-02-09 |

### Resolved in Middleware Hardening

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-197](../_archive/debt/debt-197-skip-clerk-node-env-inconsistency.md) | SKIP_CLERK Middleware Check Uses `NODE_ENV` Inconsistently with `VERCEL_ENV` | P2 | 2026-02-09 |

### Resolved in Domain Defensive Cleanup

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-195](../_archive/debt/debt-195-domain-service-defensive-gaps.md) | Domain Service Defensive Programming Gaps (`computeAccuracy` unclamped, `isEntitled` impure default) | P3 | 2026-02-09 |

### Resolved in Design System Button Hardening

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-199](../_archive/debt/debt-199-button-missing-default-type.md) | Button Component Missing Default `type="button"` | P3 | 2026-02-09 |

### Resolved in Subscription Repository Error Context

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-200](../_archive/debt/debt-200-subscription-upsert-discards-error-details.md) | Subscription Repository Upsert Discards Original Error Details | P3 | 2026-02-09 |

### Resolved in Practice Session End Fresh Return

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-201](../_archive/debt/debt-201-practice-session-end-returns-stale-data.md) | Practice Session `end()` Returns Pre-Read Stale Data | P4 | 2026-02-09 |
| [DEBT-188](../_archive/debt/debt-188-duplicated-count-query-attempt-repository.md) | Duplicated Count Query Pattern in Attempt Repository | P3 | 2026-02-08 |
| [DEBT-189](../_archive/debt/debt-189-day-ms-constant-triplicated.md) | DAY_MS Constant Defined in Three Separate Files | P3 | 2026-02-08 |
| [DEBT-190](../_archive/debt/debt-190-submit-answer-rollback-lacks-logger.md) | SubmitAnswerUseCase Rollback Error Handling Lacks Logger | P2 | 2026-02-08 |
| [DEBT-191](../_archive/debt/debt-191-get-next-question-missing-runtime-validation.md) | Missing Runtime Validation in GetNextQuestion Discriminated Union | P2 | 2026-02-08 |

### Resolved in Frontend Baseline Hardening

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-179](../_archive/debt/debt-179-global-error-missing-head-and-hydration-warning.md) | `global-error.tsx` Missing `<head>` and `suppressHydrationWarning` | P2 | 2026-02-08 |
| [DEBT-180](../_archive/debt/debt-180-duplicated-manage-billing-files.md) | Duplicated Manage-Billing Files Across Pricing and Billing Routes | P2 | 2026-02-08 |
| [DEBT-181](../_archive/debt/debt-181-hardcoded-pricing-data-duplicated.md) | Hardcoded Pricing Data Duplicated in Marketing and Pricing Views | P2 | 2026-02-08 |
| [DEBT-182](../_archive/debt/debt-182-missing-font-heading-on-headings.md) | Missing `font-heading` on Error Boundary, Not-Found, and Pricing Headings | P3 | 2026-02-08 |
| [DEBT-183](../_archive/debt/debt-183-bare-console-error-in-client-hooks.md) | Bare `console.error` in Client Hooks (Not Observable) | P3 | 2026-02-08 |

### Resolved in UI Foundation Hardening

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-173](../_archive/debt/debt-173-practice-hooks-multi-concern-state-machines.md) | Practice Hooks Are Multi-Concern State Machines | P1 | 2026-02-08 |
| [DEBT-177](../_archive/debt/debt-177-duplicated-question-flow-logic-practice-modules.md) | Duplicated Question Flow Logic Across Practice Modules | P2 | 2026-02-08 |
| [DEBT-174](../_archive/debt/debt-174-checkout-success-page-mixes-orchestration-and-entrypoint.md) | Checkout Success Page Mixes Orchestration and Route Entrypoint | P2 | 2026-02-08 |
| [DEBT-178](../_archive/debt/debt-178-duplicated-loadstate-types-across-page-logic.md) | Duplicated LoadState Types Across Page Logic Modules | P3 | 2026-02-08 |
| [DEBT-175](../_archive/debt/debt-175-pricing-view-design-system-and-heading-hierarchy-drift.md) | Pricing View Bypasses Button Primitive and Skips Heading Hierarchy | P3 | 2026-02-08 |
| [DEBT-176](../_archive/debt/debt-176-theme-and-nav-modules-missing-direct-unit-tests.md) | Theme and Nav Modules Missing Direct Unit Tests | P3 | 2026-02-08 |

### Resolved in Follow-Up Remediation

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-172](../_archive/debt/debt-172-duplicate-zod-schemas-across-controllers.md) | Duplicate Zod Schema Definitions Across Controllers | P3 | 2026-02-08 |
| [DEBT-171](../_archive/debt/debt-171-subscription-repo-and-postgres-errors-missing-tests.md) | Drizzle Subscription Repository and Postgres Error Helpers Missing Tests | P2 | 2026-02-08 |
| [DEBT-170](../_archive/debt/debt-170-fake-rate-limiter-always-success-default.md) | FakeRateLimiter Always-Success Default Masks Rejection Paths | P2 | 2026-02-08 |
| [DEBT-169](../_archive/debt/debt-169-shared-utilities-missing-unit-tests.md) | Shared Application Utilities Missing Unit Tests | P2 | 2026-02-08 |

### Resolved in Foundation Audit #2 Remediation

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-167](../_archive/debt/debt-167-idempotency-key-prune-select-delete-race.md) | Idempotency Key Prune Uses Non-Atomic SELECT→DELETE | P3 | 2026-02-08 |
| [DEBT-165](../_archive/debt/debt-165-stripe-gateway-barrel-file-inconsistency.md) | Stripe Gateway Modules Bypass Barrel File Pattern | P2 | 2026-02-08 |
| [DEBT-166](../_archive/debt/debt-166-practice-view-missing-focus-management-after-error.md) | Practice View Missing Focus Management After Error Recovery | P3 | 2026-02-08 |
| [DEBT-163](../_archive/debt/debt-163-fakes-file-approaching-split-threshold.md) | Test Fakes File Approaching Split Threshold (1472 Lines) | P2 | 2026-02-08 |
| [DEBT-162](../_archive/debt/debt-162-stripe-portal-missing-retry-consistency.md) | Stripe Portal Session Creation Has Inconsistent Retry Behavior | P2 | 2026-02-08 |
| [DEBT-160](../_archive/debt/debt-160-cron-secret-not-required-in-production.md) | CRON_SECRET Not Enforced as Required in Production | P2 | 2026-02-08 |
| [DEBT-159](../_archive/debt/debt-159-practice-session-review-missing-state-corruption-warning.md) | Practice Session Review Silently Backfills Missing Question States | P2 | 2026-02-08 |
| [DEBT-158](../_archive/debt/debt-158-missing-idempotency-key-repository-tests.md) | Missing Tests for Idempotency Key Repository | P1 | 2026-02-08 |

### Resolved in Stripe Reconciliation

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-155](../_archive/debt/debt-155-stripe-legacy-duplicate-subscriptions-reconciliation.md) | Stripe Legacy Duplicate Subscription Reconciliation | P1 | 2026-02-07 |

### Resolved in Stripe Hardening Follow-Up

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-156](../_archive/debt/debt-156-stripe-payment-critical-adapter-test-gaps.md) | Stripe Payment-Critical Adapter Test Gaps | P2 | 2026-02-07 |
| [DEBT-157](../_archive/debt/debt-157-hot-path-prune-failures-are-not-observable.md) | Hot-Path Prune Failures Are Not Observable | P2 | 2026-02-07 |

### Resolved in Debt Cleanup (Billing, Observability, Notifications)

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-136](../_archive/debt/debt-136-dunning-grace-period-for-past-due-subscribers.md) | Dunning Grace Period for Past-Due Subscribers | P2 | 2026-02-07 |
| [DEBT-140](../_archive/debt/debt-140-request-correlation-not-wired-into-runtime-logs.md) | Request Correlation Wired Into Runtime Logs | P3 | 2026-02-07 |
| [DEBT-154](../_archive/debt/debt-154-custom-notification-provider-vs-shadcn-sonner.md) | Custom NotificationProvider vs shadcn/sonner (Accepted) | P4 | 2026-02-07 |

### Resolved in Debt Cleanup (Testing + Accessibility)

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-153](../_archive/debt/debt-153-brittle-css-class-string-assertions.md) | Brittle CSS Class String Assertions in renderToStaticMarkup Tests | P3 | 2026-02-07 |
| [DEBT-148](../_archive/debt/debt-148-minimal-aria-accessibility-app-pages.md) | Minimal ARIA Accessibility in App Pages | P3 | 2026-02-07 |

### Resolved in PR #64 (SPEC-020)

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-123](../_archive/debt/debt-123-session-summary-missing-question-breakdown.md) | Session Summary Per-Question Breakdown (SPEC-020) | P2 | 2026-02-06 |
| [DEBT-122](../_archive/debt/debt-122-in-run-question-navigation-gap.md) | In-Run Question Navigation Gap (SPEC-020) | P2 | 2026-02-06 |
| [DEBT-116](../_archive/debt/debt-116-session-page-god-component.md) | Session Page God Component 670 → 21 Lines (SPEC-020) | P1 | 2026-02-06 |
| [DEBT-115](../_archive/debt/debt-115-practice-page-god-component.md) | Practice Page God Component 823 → 114 Lines (SPEC-020) | P1 | 2026-02-06 |
| [DEBT-114](../_archive/debt/debt-114-no-session-history-page.md) | Session History Page (SPEC-020) | P2 | 2026-02-06 |
| [DEBT-113](../_archive/debt/debt-113-dashboard-review-lack-session-context.md) | Dashboard + Review Session Context (SPEC-020) | P1 | 2026-02-06 |

### Moved to Brainstorming (Needs Design)

| ID | Title | Now | Reason |
|----|-------|-----|--------|
| DEBT-209 | Practice Session Starter Missing Question Counts Per Tag | [BS-015](../_archive/brainstorming/bs-015-practice-starter-available-count-display.md) | Problem is real but solution scope unclear — display only vs input constraint; needs design pass |
| DEBT-207 | No Warning When Practice Session Has Fewer Questions Than Requested | [BS-014](../_archive/brainstorming/bs-014-practice-starter-question-count-ux.md) | Problem is real but proposed fix (post-creation toast) needs UX design work; related to DEBT-209 |

### Invalidated (False Positives)

| ID | Title | Priority | Invalidated |
|----|-------|----------|-------------|
| [DEBT-168](../_archive/debt/debt-168-stripe-event-table-missing-check-constraint.md) | Stripe Events Table Missing CHECK Constraint (false positive; `markFailed()` intentionally writes `processedAt=NULL, error=NOT NULL` for retry) | P3 | 2026-02-08 |
| [DEBT-164](../_archive/debt/debt-164-missing-suspense-boundary-practice-session-history.md) | Missing Suspense Boundary for Practice Session History Panel (client-rendered page already non-blocking) | P2 | 2026-02-08 |
| [DEBT-161](../_archive/debt/debt-161-incomplete-csp-headers.md) | Incomplete CSP Headers (false positive; CSP baseline is owned by Clerk middleware) | P2 | 2026-02-08 |
| [DEBT-198](../_archive/debt/debt-198-missing-baseline-csp-header.md) | Missing Baseline Content-Security-Policy Header (invalidated; static CSP is owned by Clerk middleware and previously caused Preview outage in BUG-071) | P3 | 2026-02-09 |
| [DEBT-137](../_archive/debt/debt-137-container-type-cycles.md) | Container Type Cycles (madge false positive — type-only imports, not runtime cycles) | P2 | 2026-02-07 |
| [DEBT-139](../_archive/debt/debt-139-production-files-exceed-size-guardrail.md) | Global 300-Line Guardrail (invalid as universal standard; SPEC-scoped case now tracked in DEBT-142) | P2 | 2026-02-07 |

### Previously Archived

| ID | Title | Priority | Resolved |
|----|-------|----------|----------|
| [DEBT-205](../_archive/debt/debt-205-e2e-selector-drift-from-ui-refactors.md) | E2E Test Selectors Drifted from UI Refactors (7/16 tests failing) | P1 | 2026-02-10 |
| [DEBT-152](../_archive/debt/debt-152-home-route-literals-remain-outside-routes-constants.md) | Home Route Literals Remain Outside `ROUTES` Constants | P4 | 2026-02-07 |
| [DEBT-151](../_archive/debt/debt-151-no-toast-notification-system.md) | No Toast/Notification System | P3 | 2026-02-07 |
| [DEBT-150](../_archive/debt/debt-150-navigation-links-missing-transitions-hover.md) | Navigation Links Missing Transitions and Hover States | P3 | 2026-02-07 |
| [DEBT-149](../_archive/debt/debt-149-heading-typography-system-inconsistent.md) | Heading Typography System Inconsistent | P2 | 2026-02-07 |
| [DEBT-147](../_archive/debt/debt-147-error-state-ui-duplicated-across-pages.md) | Error State UI Duplicated Across 9+ Pages | P2 | 2026-02-07 |
| [DEBT-146](../_archive/debt/debt-146-missing-semantic-success-warning-tokens.md) | Missing Semantic Success/Warning Color Tokens | P2 | 2026-02-07 |
| [DEBT-145](../_archive/debt/debt-145-shadcn-card-input-components-never-used.md) | Shadcn Card Adoption Is Incomplete Across App Pages | P2 | 2026-02-07 |
| [DEBT-144](../_archive/debt/debt-144-hardcoded-colors-bypass-design-system.md) | Hardcoded Colors Bypass Design System Tokens | P2 | 2026-02-07 |
| [DEBT-138](../_archive/debt/debt-138-dead-modules-and-unused-dependencies.md) | Dead Modules and Unused Dependencies After Refactors | P3 | 2026-02-07 |
| [DEBT-141](../_archive/debt/debt-141-practice-hook-tests-emit-react-act-warnings.md) | Migrate Practice Hook Tests from renderLiveHook to Browser Mode | P2 | 2026-02-07 |
| [DEBT-142](../_archive/debt/debt-142-spec-020-practice-file-line-cap-regression.md) | SPEC-020 Line-Cap Regression in Practice Page Logic | P2 | 2026-02-07 |
| [DEBT-143](../_archive/debt/debt-143-practice-ui-components-missing-browser-specs.md) | Practice UI Components Missing Browser Specs | P2 | 2026-02-07 |
| [DEBT-135](../_archive/debt/debt-135-rate-limit-client-ip-trust-boundary-hardening.md) | Rate-Limit Client IP Trust Boundary Is Not Explicitly Hardened | P2 | 2026-02-07 |
| [DEBT-134](../_archive/debt/debt-134-practice-hook-tests-are-contract-only.md) | Practice Hook Tests Are Contract-Only (Behavior Gaps) | P1 | 2026-02-07 |
| [DEBT-132](../_archive/debt/debt-132-missing-practice-hook-tests.md) | Missing Tests for 6 Extracted Practice Hooks (SPEC-020) | P1 | 2026-02-07 |
| [DEBT-131](../_archive/debt/debt-131-missing-use-case-error-path-tests.md) | Missing Error Path Tests for 6 Use Cases | P2 | 2026-02-07 |
| [DEBT-130](../_archive/debt/debt-130-missing-suspense-boundary-app-layout.md) | Missing Suspense Boundary in App Layout | P3 | 2026-02-07 |
| [DEBT-127](../_archive/debt/debt-127-missing-practice-sessions-ended-at-index.md) | Missing Index on practice_sessions (userId, endedAt) | P2 | 2026-02-07 |
| [DEBT-133](../_archive/debt/debt-133-idempotency-polling-timeout-message-misleading.md) | Idempotency Polling Timeout Message Is Misleading | P3 | 2026-02-07 |
| [DEBT-129](../_archive/debt/debt-129-skip-clerk-production-safety.md) | NEXT_PUBLIC_SKIP_CLERK Has No Production Safety Guard | P1 | 2026-02-07 |
| [DEBT-128](../_archive/debt/debt-128-bookmark-load-failure-not-shown-to-user.md) | Bookmark Load Failure Not Visible to User | P2 | 2026-02-07 |
| [DEBT-126](../_archive/debt/debt-126-console-warn-in-repository.md) | console.warn in Repository Bypasses Structured Logger | P3 | 2026-02-07 |
| [DEBT-125](../_archive/debt/debt-125-billing-system-audit-2026-02-06.md) | Billing System Audit — Webhook Ordering, Race Conditions, Edge Cases | P2 | 2026-02-06 |
| [DEBT-124](../_archive/debt/debt-124-e2e-question-helper-false-negative.md) | E2E Question Existence Helper Can Produce False Negatives | P2 | 2026-02-06 |
| [DEBT-121](../_archive/debt/debt-121-use-case-fakes-lack-interfaces.md) | Use Case Fakes Don't Implement Interfaces (No Compile-Time Safety) | P2 | 2026-02-06 |
| [DEBT-120](../_archive/debt/debt-120-composition-root-growing.md) | Composition Root Growing Toward God File (407 Lines) | P3 | 2026-02-06 |
| [DEBT-119](../_archive/debt/debt-119-ports-file-god-module.md) | Ports File Is a God Module (353 Lines, 10+ Interfaces) | P3 | 2026-02-06 |
| [DEBT-118](../_archive/debt/debt-118-graceful-degradation-dry-violation.md) | Graceful Degradation Pattern Duplicated in 3 Use Cases | P3 | 2026-02-06 |
| [DEBT-117](../_archive/debt/debt-117-choice-shuffling-dry-violation.md) | Choice Shuffling Logic Duplicated Across Use Cases | P2 | 2026-02-06 |
| [DEBT-112](../_archive/debt/debt-112-raw-slugs-exposed-in-ui.md) | Raw Content-Pipeline Slugs Exposed to Users in Dashboard, Review, and Bookmarks | P1 | 2026-02-06 |
| [DEBT-106](../_archive/debt/debt-106-exam-mode-mark-for-review.md) | Exam Mode Missing "Mark for Review" Feature | P2 | 2026-02-06 |
| [DEBT-111](../_archive/debt/debt-111-explanation-choice-label-mismatch.md) | Explanation Text References Original Choice Labels After Shuffle | P0 | 2026-02-06 |
| [DEBT-110](../_archive/debt/debt-110-e2e-helper-anti-patterns.md) | E2E Test Helper Anti-Patterns (isVisible Timeout + Stripe Duplication) | P3 | 2026-02-05 |
| [DEBT-107](../_archive/debt/debt-107-question-engine-e2e-completeness.md) | Question Engine E2E Completeness and State Management (Accepted) | P1 | 2026-02-06 |
| [DEBT-105](../_archive/debt/debt-105-missing-session-resume-functionality.md) | Missing Session Resume Functionality | P2 | 2026-02-06 |
| [DEBT-104](../_archive/debt/debt-104-missing-e2e-test-credentials.md) | Missing E2E Test Credentials for Authenticated Flows (Accepted) | P1 | 2026-02-06 |
| [DEBT-109](../_archive/debt/debt-109-inline-vi-fn-logger-mocks.md) | Inline vi.fn() Logger Mocks Violate Fakes-Over-Mocks Rule | P2 | 2026-02-05 |
| [DEBT-108](../_archive/debt/debt-108-hardcoded-zinc-colors-break-light-dark-toggle.md) | Hardcoded Zinc Colors Break Light/Dark Mode Toggle | P2 | 2026-02-05 |
| [DEBT-103](../_archive/debt/debt-103-nextjs-scroll-behavior-warning.md) | Next.js Scroll Behavior Warning | P4 | 2026-02-05 |
| [DEBT-100](../_archive/debt/debt-100-adversarial-audit-2026-02-04.md) | Adversarial Codebase Audit Backlog (2026-02-04) | P0 | 2026-02-05 |
| [DEBT-101](../_archive/debt/debt-101-add-sentry-error-tracking.md) | Add Sentry Error Tracking (Next.js, Free Tier) | P1 | 2026-02-05 |
| [DEBT-102](../_archive/debt/debt-102-question-content-pipeline-hardening.md) | Question Content Pipeline Hardening (Tags, Publishing, and Prod Seeding) | P2 | 2026-02-05 |
| [DEBT-084](../_archive/debt/debt-084-user-email-race-condition.md) | User Email Race Condition in Concurrent Webhook Handling | P3 | 2026-02-04 |
| [DEBT-090](../_archive/debt/debt-090-missing-use-cases-business-logic-in-controllers.md) | Missing Application Use Cases (Business Logic Lives in Controllers) | P1 | 2026-02-04 |
| [DEBT-096](../_archive/debt/debt-096-repository-mapper-duplication.md) | Repository Row→Domain Mapping Duplicated (DRY Violation) | P3 | 2026-02-04 |
| [DEBT-099](../_archive/debt/debt-099-interactive-ui-tests-missing.md) | Interactive UI Tests Missing — Client Components Had Zero Interaction Coverage | P1 | 2026-02-04 |
| [DEBT-092](../_archive/debt/debt-092-stripe-payment-gateway-god-class.md) | StripePaymentGateway is a God Class (SRP + Separation Pressure) | P2 | 2026-02-04 |
| [DEBT-091](../_archive/debt/debt-091-attempt-repository-isp-violation.md) | AttemptRepository is “Fat” (Interface Segregation Pressure) | P3 | 2026-02-04 |
| [DEBT-098](../_archive/debt/debt-098-clerk-ui-theming-incomplete.md) | Clerk UI Components Not Fully Themed for Achromatic Dark Mode | P2 | 2026-02-04 |
| [DEBT-097](../_archive/debt/debt-097-v0-premium-ui-components-not-integrated.md) | V0 Premium Landing Page Components Deleted Instead of Integrated | P2 | 2026-02-04 |
| [DEBT-093](../_archive/debt/debt-093-clerk-webhook-route-business-logic.md) | Clerk Webhook Route Contains Business Logic (Framework Layer Leakage) | P2 | 2026-02-04 |
| [DEBT-094](../_archive/debt/debt-094-inline-server-action-billing-page.md) | Inline Server Action Inside Billing Page (Inconsistent Pattern) | P3 | 2026-02-04 |
| [DEBT-095](../_archive/debt/debt-095-console-error-in-production.md) | console.error Usage in Production Code (Bypasses Structured Logger) | P3 | 2026-02-04 |
| [DEBT-089](../_archive/debt/debt-089-logger-port-wrong-layer.md) | Logger Port Defined in Wrong Layer (Dependency Arrow Outward) | P2 | 2026-02-04 |
| [DEBT-088](../_archive/debt/debt-088-optional-logger-hides-errors.md) | Optional Logger Pattern Hides Errors | P2 | 2026-02-03 |
| [DEBT-087](../_archive/debt/debt-087-graceful-degradation-hides-data-loss.md) | Graceful Degradation Hides Data Loss from Users | P2 | 2026-02-03 |
| [DEBT-086](../_archive/debt/debt-086-dry-violation-controller-boilerplate.md) | DRY Violation — Repeated Controller Boilerplate Pattern | P3 | 2026-02-03 |
| [DEBT-085](../_archive/debt/debt-085-union-return-type-code-smell.md) | Union Return Type Pattern in requireEntitledUserId() | P3 | 2026-02-03 |
| [DEBT-083](../_archive/debt/debt-083-unused-attempt-repository-find-by-user-id.md) | AttemptRepository.findByUserId() Needs Pagination | P2 | 2026-02-03 |
| [DEBT-082](../_archive/debt/debt-082-test-logs-too-noisy.md) | Unit Tests Emit Noisy Error Logs | P3 | 2026-02-03 |
| [DEBT-081](../_archive/debt/debt-081-nextjs-alloweddevorigins-warning.md) | Next.js allowedDevOrigins Warning in E2E Runs | P3 | 2026-02-03 |
| [DEBT-080](../_archive/debt/debt-080-missing-e2e-coverage-core-pages.md) | Missing E2E Coverage for Core App Pages | P1 | 2026-02-03 |
| [DEBT-074](../_archive/debt/debt-074-missing-boundary-integration-tests.md) | Missing Boundary Integration Tests (Uncle Bob's "Humble Object" Gap) | P1 | 2026-02-02 |
| [DEBT-079](../_archive/debt/debt-079-no-retry-backoff-external-calls.md) | No Retry/Backoff Logic for External API Calls | P2 | 2026-02-02 |
| [DEBT-078](../_archive/debt/debt-078-no-idempotency-keys.md) | No Idempotency Keys on State-Changing Actions | P1 | 2026-02-02 |
| [DEBT-077](../_archive/debt/debt-077-no-rate-limiting.md) | No Rate Limiting on Webhooks or Actions | P1 | 2026-02-02 |
| [DEBT-076](../_archive/debt/debt-076-no-webhook-input-validation.md) | No Schema Validation on Webhook Payloads | P1 | 2026-02-02 |
| [DEBT-075](../_archive/debt/debt-075-no-vcr-cassettes-external-apis.md) | No VCR/Cassette Pattern for External API Testing | P1 | 2026-02-02 |
| [DEBT-073](../_archive/debt/debt-073-pricing-page-shows-subscribe-to-subscribers.md) | Pricing Page Shows Subscribe Buttons to Already-Subscribed Users | P2 | 2026-02-02 |
| [DEBT-072](../_archive/debt/debt-072-drizzle-subquery-join-pattern.md) | Drizzle Subquery Join Pattern Causes Ambiguous Columns | P2 | 2026-02-02 |
| [DEBT-071](../_archive/debt/debt-071-missing-why-comments.md) | Missing WHY Comments on Non-Obvious Business Logic | P3 | 2026-02-02 |
| [DEBT-060](../_archive/debt/debt-060-no-rollback-migrations.md) | No Rollback Migrations | P2 | 2026-02-02 |
| [DEBT-061](../_archive/debt/debt-061-timezone-not-explicitly-enforced.md) | Timezone Not Explicitly Enforced at Application Level | P3 | 2026-02-02 |
| [DEBT-001](../_archive/debt/debt-001-foundation-drift-vs-spec.md) | Foundation Drift vs SSOT | P2 | 2026-02-01 |
| [DEBT-002](../_archive/debt/debt-002-missing-integration-tests.md) | Missing Integration Tests | P2 | 2026-01-31 |
| [DEBT-003](../_archive/debt/debt-003-missing-subscription-update-method.md) | SubscriptionRepository Missing update() | P1 | 2026-01-31 |
| [DEBT-004](../_archive/debt/debt-004-magic-numbers-practice-session-validation.md) | Magic Numbers in Validation | P3 | 2026-01-31 |
| [DEBT-005](../_archive/debt/debt-005-gateway-adapters-missing.md) | Gateway Adapters Missing | P1 | 2026-01-31 |
| [DEBT-006](../_archive/debt/debt-006-grading-service-spec-drift.md) | Grading Service Spec Drift | P1 | 2026-01-31 |
| [DEBT-007](../_archive/debt/debt-007-fake-repos-no-validation.md) | Fake Repos No Validation | P3 | 2026-01-31 |
| [DEBT-008](../_archive/debt/debt-008-duplicated-validation-logic.md) | Duplicated Validation Logic | P2 | 2026-01-31 |
| [DEBT-009](../_archive/debt/debt-009-duplicated-choice-mapping.md) | Duplicated Choice Mapping | P2 | 2026-01-31 |
| [DEBT-010](../_archive/debt/debt-010-trivial-entity-tests.md) | Trivial Entity Tests | P1 | 2026-01-31 |
| [DEBT-011](../_archive/debt/debt-011-get-next-question-srp-violation.md) | GetNextQuestion SRP Violation | P2 | 2026-01-31 |
| [DEBT-012](../_archive/debt/debt-012-validation-in-wrong-layer.md) | Validation in Wrong Layer | P2 | 2026-01-31 |
| [DEBT-013](../_archive/debt/debt-013-time-spent-tracking-post-mvp.md) | Time Spent Tracking Deferred | P3 | 2026-02-01 |
| [DEBT-014](../_archive/debt/debt-014-lib-throws-plain-error.md) | lib/ Throws Plain Error | P2 | 2026-02-01 |
| [DEBT-015](../_archive/debt/debt-015-stripe-customer-race-condition.md) | Stripe Customer Fallback Logic | P3 | 2026-02-01 |
| [DEBT-016](../_archive/debt/debt-016-duplicated-upsert-pattern.md) | Duplicated Upsert Pattern | P2 | 2026-02-01 |
| [DEBT-017](../_archive/debt/debt-017-undocumented-stripe-customer-constraint.md) | Undocumented Stripe Constraint | P3 | 2026-02-01 |
| [DEBT-018](../_archive/debt/debt-018-missing-error-boundaries.md) | Missing Error Boundaries | P2 | 2026-02-01 |
| [DEBT-019](../_archive/debt/debt-019-stripe-events-idempotency-port-mismatch.md) | Stripe Events Idempotency Port | P1 | 2026-02-01 |
| [DEBT-020](../_archive/debt/debt-020-duplicate-postgres-unique-violation-helper.md) | Duplicate Unique-Violation Helper | P4 | 2026-02-01 |
| [DEBT-021](../_archive/debt/debt-021-duplicate-choice-ordering.md) | Duplicate Choice Ordering | P4 | 2026-02-01 |
| [DEBT-022](../_archive/debt/debt-022-attempt-selected-choice-nullability.md) | Attempt Nullability Mismatch | P2 | 2026-02-01 |
| [DEBT-023](../_archive/debt/debt-023-unused-lib-subscription.md) | Unused lib/subscription.ts | P3 | 2026-02-01 |
| [DEBT-024](../_archive/debt/debt-024-shuffle-seed-spec-drift.md) | Shuffle Seed Spec Drift | P2 | 2026-02-01 |
| [DEBT-025](../_archive/debt/debt-025-untested-stripe-event-repository.md) | Untested Stripe Event Repository | P1 | 2026-02-01 |
| [DEBT-026](../_archive/debt/debt-026-duplicated-db-type-definition.md) | Duplicated Db Type Definition | P2 | 2026-02-01 |
| [DEBT-027](../_archive/debt/debt-027-repositories-hardcode-new-date.md) | Repositories Hardcode new Date() | P2 | 2026-02-01 |
| [DEBT-028](../_archive/debt/debt-028-clerk-auth-gateway-srp-violation.md) | ClerkAuthGateway SRP Violation | P2 | 2026-02-01 |
| [DEBT-029](../_archive/debt/debt-029-untested-stripe-prices-config.md) | Untested Stripe Prices Config | P2 | 2026-02-01 |
| [DEBT-030](../_archive/debt/debt-030-untested-tag-repository.md) | Untested Tag Repository | P2 | 2026-02-01 |
| [DEBT-031](../_archive/debt/debt-031-stripe-payment-gateway-unknown-args.md) | StripePaymentGateway unknown[] Args | P2 | 2026-02-01 |
| [DEBT-032](../_archive/debt/debt-032-incomplete-composition-root.md) | Incomplete Composition Root | P3 | 2026-02-01 |
| [DEBT-033](../_archive/debt/debt-033-flat-repository-structure.md) | Flat Repository Structure | P3 | 2026-02-01 |
| [DEBT-034](../_archive/debt/debt-034-test-coverage-gap-critical.md) | Test Coverage Gap — Must Stabilize Before New Features | P1 | 2026-02-01 |
| [DEBT-035](../_archive/debt/debt-035-inconsistent-repo-test-mocking.md) | Inconsistent Repo Test Mocking (False Positive) | P2 | 2026-02-01 |
| [DEBT-036](../_archive/debt/debt-036-specs-register-and-ports-doc-drift.md) | Specs Register and Ports Docs Drift | P2 | 2026-02-01 |
| [DEBT-037](../_archive/debt/debt-037-attempt-repo-unnecessary-null-checks.md) | Unnecessary Null Checks in Attempt Repository | P3 | 2026-02-02 |
| [DEBT-038](../_archive/debt/debt-038-question-repo-type-assertion.md) | Misleading Type Assertion in Question Repository | P3 | 2026-02-02 |
| [DEBT-039](../_archive/debt/debt-039-webhook-error-context-loss.md) | Error Context Loss in Stripe Webhook Failures | P2 | 2026-02-02 |
| [DEBT-040](../_archive/debt/debt-040-missing-session-id-index.md) | Missing Standalone Index on Attempts by Session | P2 | 2026-02-02 |
| [DEBT-041](../_archive/debt/debt-041-skip-clerk-production-safety.md) | SKIP_CLERK Production Safety Gap | P2 | 2026-02-02 |
| [DEBT-042](../_archive/debt/debt-042-stripe-customer-concurrent-upsert.md) | Race Condition in Stripe Customer Concurrent Upsert | P3 | 2026-02-02 |
| [DEBT-043](../_archive/debt/debt-043-unused-schema-wildcard-import.md) | Unused Schema Wildcard Import | P4 | 2026-02-02 |
| [DEBT-044](../_archive/debt/debt-044-spec-005-status-drift.md) | SPEC-005 Status Incorrectly Marked as Implemented | P2 | 2026-02-02 |
| [DEBT-045](../_archive/debt/debt-045-claude-md-documentation-drift.md) | CLAUDE.md Documentation Drift | P2 | 2026-02-02 |
| [DEBT-046](../_archive/debt/debt-046-question-selection-in-wrong-layer.md) | Question Selection Algorithm in Wrong Layer | P2 | 2026-02-02 |
| [DEBT-047](../_archive/debt/debt-047-spec-010-missing-webhook-controller.md) | SPEC-010 Missing Webhook Controller Documentation | P3 | 2026-02-02 |
| [DEBT-048](../_archive/debt/debt-048-hardcoded-url-paths-billing.md) | Hard-Coded URL Paths in Billing Controller | P2 | 2026-02-02 |
| [DEBT-049](../_archive/debt/debt-049-hardcoded-limits-not-centralized.md) | Hard-Coded Limits Not Centralized Across Controllers | P2 | 2026-02-02 |
| [DEBT-050](../_archive/debt/debt-050-missing-fake-implementations.md) | Missing Fake Implementations for 5 Repositories | P2 | 2026-02-02 |
| [DEBT-051](../_archive/debt/debt-051-controller-tests-use-mocks-not-fakes.md) | Controller Tests Use vi.fn() Instead of Fakes | P2 | 2026-02-02 |
| [DEBT-052](../_archive/debt/debt-052-unused-domain-service-compute-session-progress.md) | Unused Domain Service — computeSessionProgress | P2 | 2026-02-02 |
| [DEBT-053](../_archive/debt/debt-053-unused-tag-repository.md) | Unused TagRepository — Wired But Never Called | P2 | 2026-02-02 |
| [DEBT-054](../_archive/debt/debt-054-unused-domain-error-codes.md) | Unused Domain Error Codes — Defined But Never Thrown | P3 | 2026-02-02 |
| [DEBT-055](../_archive/debt/debt-055-magic-numbers-stats-undocumented.md) | Magic Numbers in Stats Controller Lack Documentation | P3 | 2026-02-02 |
| [DEBT-056](../_archive/debt/debt-056-repeated-getdeps-pattern.md) | Repeated getDeps Pattern Across 6 Controllers | P3 | 2026-02-02 |
| [DEBT-057](../_archive/debt/debt-057-webhook-error-stack-trace-lost.md) | Webhook Error Stack Trace Lost in Database | P3 | 2026-02-02 |
| [DEBT-058](../_archive/debt/debt-058-cancel-at-period-end-not-displayed.md) | cancelAtPeriodEnd Stored But Never Displayed in UI | P2 | 2026-02-02 |
| [DEBT-059](../_archive/debt/debt-059-stripe-api-version-undocumented.md) | Stripe API Version Hardcoded Without Documentation | P3 | 2026-02-02 |
| [DEBT-062](../_archive/debt/debt-062-confusing-redirect-control-flow.md) | Confusing Redirect Control Flow Relied on `redirect()` Throwing | P3 | 2026-02-02 |
| [DEBT-063](../_archive/debt/debt-063-missing-aria-labels-choice-buttons.md) | Missing ARIA Labels on Choice Buttons | P2 | 2026-02-02 |
| [DEBT-064](../_archive/debt/debt-064-missing-focus-indicators-error-buttons.md) | Missing Focus Indicators on Error Page Buttons | P3 | 2026-02-02 |
| [DEBT-065](../_archive/debt/debt-065-touch-targets-too-small.md) | Touch Targets Too Small (Dropdown Menu, Pricing Buttons) | P2 | 2026-02-02 |
| [DEBT-066](../_archive/debt/debt-066-no-success-toast-bookmark.md) | No Success Toast for Bookmark Action | P3 | 2026-02-02 |
| [DEBT-067](../_archive/debt/debt-067-generic-error-page-no-details.md) | Generic Error Page Lacks Error Details | P3 | 2026-02-02 |
| [DEBT-068](../_archive/debt/debt-068-missing-error-tsx-nested-routes.md) | Missing error.tsx in Nested Routes | P3 | 2026-02-02 |
| [DEBT-069](../_archive/debt/debt-069-document-stripe-eager-sync-pattern.md) | Document Stripe Eager Sync Pattern | P3 | 2026-02-02 |
| [DEBT-070](../_archive/debt/debt-070-checkout-failure-lacks-actionable-feedback.md) | Checkout Failure Lacks Actionable Feedback | P2 | 2026-02-02 |

## Debt Statuses

- **Open** — Debt acknowledged, not yet addressed
- **In Progress** — Actively being paid down
- **Resolved** — Debt paid, verified
- **Accepted** — Intentionally kept (with justification)

## Priority Levels

- **P0** — Critical: Blocks development or production
- **P1** — High: Significant impact on velocity or quality
- **P2** — Medium: Noticeable friction, should address soon
- **P3** — Low: Minor inconvenience
- **P4** — Trivial: Nice to clean up

---

## How to Document New Debt

1. Create `debt-NNN-short-description.md` using the template below
2. Set status to "Open"
3. Assign priority based on impact
4. Submit PR for review

## Debt Template

```markdown
# DEBT-NNN: Short Title

**Status:** Open | In Progress | Resolved | Accepted
**Priority:** P0 | P1 | P2 | P3 | P4
**Date:** YYYY-MM-DD

---

## Description

What is the debt? Why does it exist?

## Impact

How does this affect development, quality, or users?

## Resolution

What needs to be done to pay down this debt?

## Verification

How will we verify the debt is resolved?

## Related

- Links to code, specs, ADRs
```

---

## Archive

Resolved debt is archived to `docs/_archive/debt/` after verification.
