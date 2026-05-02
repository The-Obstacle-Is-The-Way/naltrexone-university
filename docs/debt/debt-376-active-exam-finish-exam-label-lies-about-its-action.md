# DEBT-376: Active Exam Empty-State Button Labeled "Finish Exam" Does Not Finish The Exam

**Priority:** P3
**Created:** 2026-05-02
**Status:** Active
**Source:** Adversarial second-opinion review during DEBT-375 cleanup, 2026-05-02. Earlier in the same conversation I dismissed `practice-session-page-view.tsx:267` twice — first as "out-of-scope cosmetic cruft" inside the DEBT-375 doc, then as "verifiable dead code" during a follow-up cleanup discussion. A second-opinion agent pushed back, and a deeper excavation found that the line is not dead and the label is semantically incorrect: the button promises a final action (`Finish exam`) but the click handler actually navigates to a different stage (`loadReview()`).
**Related:**

- [DEBT-322 Exam action bar UX polish](./debt-322-exam-action-bar-ux-polish.md) — D-2 introduced `'Finish exam'` as the rename target for the active-exam header button on 2026-03-18. Historical origin of the current label.
- [DEBT-363 Exam shell scroll model and dual-CTA disambiguation](./debt-363-exam-shell-scroll-model-and-dual-cta.md) — Concern 2 (PR #281) dropped the active-exam header button by gating with `!isExamMode`. The header was the primary consumer of `endSessionLabel`, but the label conditional in the page-view was not updated. This is the moment the current bug was created.
- [DEBT-361 Exam last question Next label](./debt-361-exam-last-question-next-label.md) — established `Review & Submit` as the canonical label for the action that loads the review/submit stage in active exam mode. DEBT-376 brings the empty-state edge-case label into alignment with this vocabulary.
- [DEBT-365 Exam flow affordance and label consistency](./debt-365-exam-flow-affordance-and-label-consistency.md) — earlier exam-flow vocabulary unification pass; explicitly kept tutor mode out of scope. DEBT-376 closes the trailing edge-case vocabulary divergence inside exam mode that DEBT-365 did not catch.
- [DEBT-375 Tutor session action bar terminal CTA](./debt-375-tutor-session-action-bar-no-terminal-cta-on-last-question.md) — flagged this label conditional as out-of-scope cosmetic cruft. This doc retracts that characterization after deeper investigation; the line is not cosmetic, it is wrong.

**Audit verified:** _pending_ — to be filled after second-opinion audit pass.

---

## Context: what the line actually does

`app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:267`:

```tsx
endSessionLabel={mode === 'exam' ? 'Finish exam' : 'End session'}
```

This passes a string label as a prop to `PracticeView`. The label is used by exactly two button candidates in `practice-view.tsx`:

### Consumer 1: Header right-side button (lines 424–434)

```tsx
{props.onEndSession && !isExamMode ? (
  <Button onClick={props.onEndSession}>{endSessionLabel}</Button>
) : ...}
```

The `!isExamMode` gate means exam mode renders `null` here. So `'Finish exam'` is **never displayed in this consumer.** That is settled by DEBT-363 Concern 2 (PR #281).

### Consumer 2: Empty-state fallback card (lines 499–510)

```tsx
{props.loadState.status === 'ready' && props.question === null ? (
  <Card>
    <div>No more questions found.</div>
    {props.onEndSession ? (
      <Button onClick={props.onEndSession}>{endSessionLabel}</Button>
    ) : null}
  </Card>
) : null}
```

This card fires when `loadState === 'ready'` AND `question === null`. **In exam mode, if this branch fires, the displayed label is `'Finish exam'`.**

### Whether the empty state can fire for exam mode in production

The page-view's render flow gates ahead of `PracticeView`:

1. `examResults` substage returns first
2. Non-exam summary returns `SessionSummaryView`
3. `reviewLoadState === 'loading' && !review` returns the loading card
4. `reviewLoadState === 'error' && !review` returns the error UI
5. `review` truthy returns `ExamReviewView`
6. Otherwise renders `PracticeView`

For the empty state to fire in exam mode the controller must produce `loadState === 'ready' && question === null` while also `!review`, `reviewLoadState === 'idle'` (not loading or error), and no exam-results substage in flight. In normal active-exam flow this combination is unlikely because the controller transitions to review state when all questions are submitted, and any question fetch failure produces `loadState === 'error'` rather than `'ready' + null`.

**Verifiable claim:** the edge case is rare in normal flow but not formally proven impossible. Plausible triggers include a server-side session whose question pool is exhausted but whose review state has not been initialized client-side, a recovery path after a navigation/reload at an unusual moment in the flow, or a future controller refactor that creates a new path through this state. Without server logs or analytics we cannot rule it out — but **whether or not the edge case fires today, the label is the wrong vocabulary for the action either way.**

## The bug: the label lies about the action

`onEndSession` for the active session page is defined at `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts:154-164`:

```tsx
const onEndSession = useCallback(() => {
  if (
    input.sessionMode === 'exam' ||
    isInReviewStage ||
    input.sessionMode === null
  ) {
    void loadReview();
    return;
  }
  finalizeSessionSafely();
}, [input.sessionMode, isInReviewStage, loadReview, finalizeSessionSafely]);
```

In **exam mode**, clicking `onEndSession` calls `loadReview()` — it loads the Review & Submit stage. **It does NOT finalize the exam.** Final submission happens later in `ExamReviewView` via the `Submit exam` button → confirmation dialog → `onFinalizeReview` (`use-practice-session-review-stage.ts:147-152`).

The button labeled `'Finish exam'` therefore lies. Clicking it does not finish the exam — it loads a different stage where the user must take additional action to actually finalize. The label promises a terminal action and delivers a navigation action.

A user who clicks `'Finish exam'` expecting their exam submitted, then closes the tab, has an unsubmitted exam they thought they finished. That is a real semantic bug, not cosmetic cruft, regardless of how rare the empty-state edge case is.

## Historical origin (the lie was not always a lie)

git log shows the label has changed three times:

```
2026-02-06 SPEC-020 (Practice Engine Completion):
  endSessionLabel={props.sessionInfo?.mode === 'exam' ? 'Review answers' : 'End session'}

2026-02-09 (Resolve Practice UX Problem 8):
  endSessionLabel={mode === 'exam' ? 'Review answers' : 'End session'}   // variable rename only

2026-03-18 (DEBT-322 D-2):
  endSessionLabel={mode === 'exam' ? 'Finish exam' : 'End session'}       // current line
```

At each historical moment the label reflected the action of the button it labeled — initially the active-exam header button. DEBT-322 D-2 deliberately renamed `'Review answers'` → `'Finish exam'` while the active-exam header button still rendered. The rename was sound at the time because the button was prominent and a renaming pass was harmonizing exam-mode terminology.

DEBT-363 Concern 2 (PR #281, 2026-04-20) then dropped the active-exam header button via the `!isExamMode` gate as part of the dual-CTA disambiguation. The primary consumer of the label was removed, but the label conditional in the page-view was not updated. The label is now stranded: its prominent display surface has been deleted, its remaining display surface (the empty-state fallback) is mis-labeled, and the rename rationale from DEBT-322 D-2 no longer applies.

This is the moment DEBT-376 was created. It was invisible because the empty-state edge case is rare and the regression guards in the active-exam-header browser spec only verify the header *does not* show `'Finish exam'`, not whether the label is semantically correct anywhere it might surface. DEBT-375's investigation surfaced the issue when an adversarial second-opinion review pushed back on my characterization of the line as cruft.

## Why this is debt

- **Semantic correctness.** Code that does not say what it means is a maintenance hazard. A future reader reasoning about `onEndSession` will read `'Finish exam'` and assume the click finalizes; that assumption is wrong, and any refactor relying on it (e.g. wiring a confirmation dialog "are you sure you want to finalize the exam?") would corrupt the flow.
- **User-facing harm potential.** Even if rare, the empty-state edge case can surface this label to a real user. A user clicking `'Finish exam'` expecting their exam submitted is a real harm — not a hypothetical one. The fact that the harm is rare lowers the priority but does not change the correctness call.
- **Stale vocabulary trail.** This is the trailing edge of DEBT-363's cleanup. Closing it brings the active-exam vocabulary fully in line with DEBT-361's `Review & Submit` canonical label and the post-DEBT-363 flow.
- **Verifiable, not speculative.** Per the lessons from DEBT-375, this debt is grounded in concrete evidence: the label string and the click handler's branch resolution are both readable, and they conflict. This is not "could theoretically be better" — it is "the label says X, the handler does Y, X ≠ Y."

## Options

### Option α (recommended): Rename to `'Review & Submit'` to match the actual action

Production change at `practice-session-page-view.tsx:267`:

```tsx
// before
endSessionLabel={mode === 'exam' ? 'Finish exam' : 'End session'}
// after
endSessionLabel={mode === 'exam' ? 'Review & Submit' : 'End session'}
```

Rationale: matches DEBT-361's canonical vocabulary for the action that loads the review/submit stage. The button now tells the truth about what clicking it does. The tutor-mode `'End session'` branch is unchanged because tutor `onEndSession` actually does finalize the session (`finalizeSessionSafely` at `use-practice-session-review-stage-state.ts:163`).

Test impact (4 references, 3 files — all need attention):

- `app/(app)/app/practice/components/practice-view-layout.test.tsx:198, 219` — fixture passes `endSessionLabel="Finish exam"` and asserts on it. Update both the fixture string and the assertion to `'Review & Submit'` for vocabulary consistency. The test's purpose (verifying the empty-state branch displays the passed label) is unchanged.
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-active-question.browser.spec.tsx:90, 130` — header-regression guard from DEBT-363 ("does not render Finish exam in the active exam-question header"). Update the asserted name from `'Finish exam'` to `'Review & Submit'` so the regression guard remains meaningful (still asserting the header has no end-session button after the rename). **Caveat:** the bottom-bar `Review & Submit` last-question CTA also exists; verify the test fixture is mid-exam (not last-question) so the bottom-bar CTA does not collide with the assertion. Scope the query to the header region with a stable selector if needed.
- `tests/e2e/practice.spec.ts:251` — E2E asserts `Finish exam` has count 0 paired with `Review & Submit` visibility. After the rename `'Finish exam'` no longer exists anywhere in the codebase, so the count-0 assertion becomes either trivially true (string never appears) or redundant with the codebase-level grep verification. Either delete the count-0 assertion or rename it to a more durable regression: assert there is exactly one `Review & Submit` button (the bottom-bar CTA) and zero in the header.

Acceptance: `rg "Finish exam" app/ src/ tests/` returns zero hits. `rg "Review & Submit"` continues to return the existing exam-flow hits plus the new page-view label.

### Option β (rejected): Hardcode `'End session'` for both modes

This was my initial speculative recommendation. It would replace `'Finish exam'` with `'End session'` in the empty-state edge case, which is technically more honest than `'Finish exam'` (since the action is at least *some kind of* exit) but loses the semantic specificity that the actual call is `loadReview()` → Review & Submit stage. Option α is strictly better because it is more accurate about the destination.

### Option γ (rejected): Delete the conditional entirely; remove the `endSessionLabel` prop

Tempting from a YAGNI perspective. The header consumer is gated off, so the label only matters in the empty-state edge case. But:

- We have not formally proven the empty-state edge case is unreachable in exam mode.
- Removing the prop creates a refactor risk (PracticeView's empty-state still needs *some* button label; the default at `practice-view.tsx:312` would become `'End session'`).
- The doc-quality cost of "this prop appears unused but isn't" exceeds the benefit of removing it.

Option γ would require an upstream proof that exam mode can never reach `loadState === 'ready' && question === null`, which is a research project (read the question-flow hook, the controller, the use-cases, the server-side session creation paths). Option α delivers the correctness fix without that prerequisite.

## Recommendation

**Option α.** One-line rename in `practice-session-page-view.tsx:267`. Test fixture/assertion updates in three test files. Total production diff: one line. Total test diff: ~5–8 lines across three files. Zero behavior change beyond the label string. Brings the active-exam vocabulary in line with DEBT-361 and the post-DEBT-363 flow, and closes the trailing-edge debt that DEBT-365 did not catch.

## Production Diff Spec

Single production file:

1. **`app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:267`** — rename `'Finish exam'` to `'Review & Submit'`.

Test files:

2. **`app/(app)/app/practice/components/practice-view-layout.test.tsx:198, 219`** — update fixture and assertion from `'Finish exam'` to `'Review & Submit'`.
3. **`app/(app)/app/practice/[sessionId]/components/practice-session-page-view-active-question.browser.spec.tsx:90, 130`** — update test name and asserted button name from `'Finish exam'` to `'Review & Submit'`. Verify fixture is mid-exam (not last question) so the bottom-bar `Review & Submit` CTA does not collide with the header-region assertion. If collision risk exists, scope the query to the header region with a stable selector.
4. **`tests/e2e/practice.spec.ts:251`** — either delete the `'Finish exam'` count-0 assertion (string no longer exists in the codebase, so the assertion is trivial) or rename it to a durable check on `Review & Submit` button count.

Header (`practice-view.tsx:391-413` / `424-434`), `ExamActionBar` (192–269), `TutorActionBar` (111–174), `ActionBarSpacer` (88–90), the empty-state branch JSX (497–510), and the `endSessionLabel` plumbing logic in `practice-view.tsx:312` are unchanged.

## Test Impact

| File | Impact | Action |
|------|--------|--------|
| `app/(app)/app/practice/components/practice-view-layout.test.tsx` | **HIGH** | Update fixture (`endSessionLabel="Finish exam"` → `"Review & Submit"`) and assertion (`button.textContent?.includes('Finish exam')` → `'Review & Submit'`) at lines 198 and 219. Test purpose unchanged. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-active-question.browser.spec.tsx` | **HIGH** | Update test name (line 90) and asserted button name (line 130) from `'Finish exam'` to `'Review & Submit'`. Verify fixture is mid-exam, not last-question, so the bottom-bar `Review & Submit` does not collide with the header-region assertion. Scope the query to the header region if needed. |
| `tests/e2e/practice.spec.ts` | **MEDIUM** | At line 251, either delete the `'Finish exam'` count-0 assertion (trivially true after rename) or replace with a durable `Review & Submit` button-count assertion scoped to the header region. |
| All other test files | **NONE** | No other test passes the literal `'Finish exam'` or asserts on it. |

Test discipline reminders:

- **Fakes over mocks.** Use existing fakes from `src/application/test-helpers/fakes/`. No internal `vi.mock()`.
- **`renderToStaticMarkup` + `// @vitest-environment jsdom`** for `*.test.tsx`.
- **`vitest-browser-react`** for `*.browser.spec.tsx`.
- **Region-scoped queries.** If the renamed `Review & Submit` collides with the bottom-bar CTA in the header browser-spec test, scope the query to the header region with a stable selector rather than relying on global text presence.
- No snapshot rewrites, no `.first()` / `.nth()` shortcuts, no class-token assertions.

## Verification

Local pre-push gate (mandatory):

```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

E2E if available:

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null
pnpm test:e2e
```

Grep verification after implementation:

```bash
# Should return zero hits in production AND tests:
rg "Finish exam" app/ src/ tests/

# Should continue to return the existing exam-flow hits plus the new page-view label:
rg "Review & Submit" app/ src/ tests/
```

## Constraints

- **Doc-first cadence.** This doc lands on `dev` first and gets audit-cleaned via the standard god-prompt audit pass. Implementation branches off `dev` only after the audit returns clean and the user grades the doc.
- **Stop before merge.** The implementing agent must STOP after the implementation PR is CR-clean and await explicit user grade before merging. No autonomous merge.
- **Out of scope (deliberately):**
  - **Empty-state reachability proof.** We do not need to prove the edge case fires in exam mode for this fix to be correct. The fix corrects the label vocabulary regardless of frequency.
  - **`endSessionLabel` prop removal.** See Option γ rejection.
  - **Tutor-mode `'End session'` label.** Tutor `onEndSession` calls `finalizeSessionSafely`, which actually ends the session — `'End session'` is semantically correct for tutor mode. Whether to migrate tutor terminology to `View Summary` (matching DEBT-372) is a distinct concern not bundled here.
  - **Header layout refactor.** The header right-side button gating (`!isExamMode` for exam, button kept for tutor) was settled by DEBT-363 and DEBT-375. Unchanged.

## Acceptance

- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:267` reads `endSessionLabel={mode === 'exam' ? 'Review & Submit' : 'End session'}`.
- The three affected test files updated to use `'Review & Submit'` (or removed where the assertion becomes trivial).
- `rg "Finish exam" app/ src/ tests/` returns zero hits.
- `rg "Review & Submit" app/ src/ tests/` returns the existing exam-flow hits plus the new page-view label.
- The header-region browser-spec regression guard remains meaningful (asserting absence of an end-session button in the active-exam header, not just absence of an obsolete string).
- All affected tests use stable, semantic assertions; no snapshot rewrites; no class-token assertions; no `.first()` / `.nth()` shortcuts.
- CodeRabbit latest-head review on the implementation PR returns explicit `APPROVED`.
- Full local gate green (typecheck + lint + unit + browser + integration + build, plus E2E if local environment supports it).
