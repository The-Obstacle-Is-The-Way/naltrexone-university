# DEBT-496: Content-Change Notices Have No Route-Level Proof

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the spec is written and passes (2026-10-05); the record closes once it is in production ([Progress](#progress))
**Priority:** P2
**Date:** 2026-10-04
**Resolved:** —
**Verification receipts:** —

---

## Summary

[DEBT-493](../_archive/debt/debt-493-learner-scores-and-labels-when-content-changes.md) shipped learner-facing notices for content that changed after a learner saw it. Two of them carry clinical weight: a key-corrected answer is flagged as a caution, and a withdrawn or held question warns that its content may be wrong. Each layer of every notice is proven:
- the domain rule and use-case outputs, by mutation-proven unit tests;
- the queries, on real Postgres;
- the rendered component, in real Chromium in the browser lane.

No test drives a real page from database state to the rendered notice. The UI PRs, #1349, #1351 and #1354, also shipped without the screenshots that `.claude/rules/git-workflow.md` asks of UI changes.

## Evidence

Investigated on 2026-10-04 against `dev` at `79ada5db`.
- **No end-to-end case arranges a content change.** `tests/e2e/` has 28 specs, and none withdraws, holds, retires or revises a question; `grep -rln "withdraw\|question_withdrawals\|question_holds" tests/e2e` finds nothing.
- **What a regression there would escape.** Each layer's tests pass their own inputs. A route that loads the wrong output, a server action that drops a field in serialization, or a page that renders a different branch than its component test would each pass every lane.
- **The data can be arranged safely.** The E2E lane runs against the per-clone test database. Its helpers already write to it directly (`tests/e2e/helpers/seed-test-user.ts` uses `postgres` with the injected `DATABASE_URL`), and the shared E2E user is signed in by Clerk testing tokens, with no human sign-in. The SQL that withdraws, holds or revises a question exists for the integration lane in `tests/integration/question-state-test-helpers.ts`.
- **A manual screenshot pass is not the answer.** The dev server's `.env.local` points at the shared remote Neon development database, and staging withdrawn or key-corrected questions there would affect every clone. A manual pass is also not repeatable.

## Impact

A learner could see a corrected key presented as correct, or unsafe content with no caution, after a wiring change that every current lane passes. The likelihood is low, since every layer is tested, but the cost is clinical.

## Resolution (decided)

One Playwright spec, `tests/e2e/content-change-notices.spec.ts`, proves the path end to end and produces the visual evidence on every run.
1. **Arrange on dedicated questions only.** A helper in `tests/e2e/helpers/` creates questions with unique slugs, never touching the shared seeded bank, and removes them afterwards. The question-state SQL moves from `tests/integration/` to `tests/shared/`, so both lanes use one implementation.
2. **Cases:**
   - the E2E user answered a question whose key was then moved: the review page shows the caution and the link "Practice the corrected question";
   - the E2E user bookmarked a question that was then withdrawn: Bookmarks names it withdrawn and shows no content;
   - a question held for review shows its label in History.
3. **Assert by role and text** (`.claude/rules/testing.md`: no snapshots). Each case attaches a full-page screenshot to the Playwright report (`testInfo.attach`): the visual evidence, produced by every run rather than by hand.
4. **Out of scope:** visual-regression baselines. They would be a new ADR-level decision (ADR-019 Compliance), not this record.

## Progress

**The spec, 2026-10-05.** `tests/e2e/content-change-notices.spec.ts` runs three cases as the E2E user, on dedicated questions:
- an answer whose key then moved: the review page shows the caution, "This attempt isn't scored." and the link to the corrected question;
- an answered question then placed under review: its review names the state;
- a bookmarked question then withdrawn: Bookmarks names it, with no stem and no link.

`tests/e2e/helpers/content-changes.ts` arranges each state with the question fixtures, which moved to `tests/shared/question-fixtures.ts`; the integration lane re-exports them unchanged. Each case attaches a full-page screenshot. All three were viewed: each notice renders in its documented card, the caution in F-11's warning card.

## Verification

- [x] The spec passes in the local E2E lane (3 of 3) and in the full gate.
- [x] Targeted mutations fail it, each failing exactly one case: the review page not passing `keyCorrected`, and the bookmarks page ignoring `availability`.
- [x] The screenshots appear in the Playwright report.
- [x] After a run, no question with an `e2e-content-change-` slug remains. The shared bank is untouched, since only those questions are written.

## Related

- [DEBT-493](../_archive/debt/debt-493-learner-scores-and-labels-when-content-changes.md): the notices.
- [DEBT-465](./debt-465-test-quality-practices-adoption.md) Part 4: the UI QA procedures. This record moves one of their gaps into the automated lane.
- `.claude/rules/git-workflow.md`: screenshots for UI changes.
