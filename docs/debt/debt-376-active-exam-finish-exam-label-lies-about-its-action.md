# DEBT-376: Active Exam Empty-State Button Labeled "Finish Exam" Does Not Finish The Exam

**Priority:** P3
**Created:** 2026-05-02
**Status:** Active
**Source:** Adversarial second-opinion review during DEBT-375 cleanup, 2026-05-02. Earlier in the same conversation I dismissed `practice-session-page-view.tsx:267` twice — first as "out-of-scope cosmetic cruft" inside the DEBT-375 doc, then as "verifiable dead code" during a follow-up cleanup discussion. A second-opinion agent pushed back, and a deeper excavation found that the line is not dead and the label is semantically incorrect: the button promises a final action (`Finish exam`) but the click handler actually navigates to a different stage (`loadReview()`).
**Related:**

- [DEBT-322 Exam action bar UX polish](../_archive/debt/debt-322-exam-action-bar-ux-polish.md) — D-2 introduced `'Finish exam'` as the rename target for the active-exam header button on 2026-03-18. Historical origin of the current label.
- [DEBT-363 Exam shell scroll model and dual-CTA disambiguation](../_archive/debt/debt-363-exam-shell-scroll-model-and-dual-cta.md) — Concern 2 (PR #281) dropped the active-exam header button by gating with `!isExamMode`. The header was the primary consumer of `endSessionLabel`, but the label conditional in the page-view was not updated. This is the moment the current bug was created.
- [DEBT-361 Exam last question Next label](../_archive/debt/debt-361-exam-last-question-next-label.md) — established `Review & Submit` as the canonical label for the action that loads the review/submit stage in active exam mode. DEBT-376 brings the empty-state edge-case label into alignment with this vocabulary.
- [DEBT-365 Exam flow affordance and label consistency](../_archive/debt/debt-365-exam-flow-affordance-and-label-consistency.md) — earlier exam-flow vocabulary unification pass; explicitly kept tutor mode out of scope. DEBT-376 closes the trailing edge-case vocabulary divergence inside exam mode that DEBT-365 did not catch.
- [DEBT-375 Tutor session action bar terminal CTA](../_archive/debt/debt-375-tutor-session-action-bar-no-terminal-cta-on-last-question.md) — flagged this label conditional as out-of-scope cosmetic cruft. This doc retracts that characterization after deeper investigation; the line is not cosmetic, it is wrong.

**Audit verified:** 2026-05-02 against `origin/dev` head `22f55e7c`. The handler chain was confirmed from source: active-exam `onEndSession` saves any current exam draft, calls the inner review-stage `onEndSession`, and loads the Review & Submit stage via `loadReview()`; it does not finalize the exam. This document was corrected after audit for archived-doc links, finalization citations, historical framing, and exact test-impact counts.

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

For the empty state to fire in exam mode the controller must produce `loadState === 'ready' && question === null` while also `!review`, `reviewLoadState === 'idle'` (not loading or error), and no exam-results substage in flight. In normal active-exam flow this combination is unlikely because the last-question footer routes through `onEndSession` to load review, and any question fetch failure produces `loadState === 'error'` rather than `'ready' + null`.

**Verifiable claim:** the edge case is rare in normal flow but not formally proven impossible. A static reachability pass found a real state shape: `GetNextQuestionUseCase.executeForSession()` can return `null` when no target question exists, `runLoadQuestionFlow()` commits that `null` result and sets `loadState` to `'ready'`, and the session-page loader only updates `sessionInfo` when a returned question has session data (`practice-session-page-logic.ts:82-84`). That means an existing exam `sessionInfo` can plausibly survive into a ready/null-question state. Whether or not this edge case is common today, **the label is the wrong vocabulary for the action if it ever surfaces.**

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

In **exam mode**, clicking `onEndSession` calls `loadReview()` — it loads the Review & Submit stage. **It does NOT finalize the exam.** The wrapper hook first saves the current exam draft (`use-practice-session-review-stage.ts:196-216`), then calls the inner review-stage state hook. Final submission happens later in `ExamReviewView` via the `Submit exam` button → confirmation dialog (`exam-review-view.tsx:235-280`) → `onFinalizeReview`. The inner state hook's generic finalizer clears review state and calls `input.finalizeSession()` at `use-practice-session-review-stage-state.ts:147-152`; the wrapper's exam-specific finalizer calls `finalizeExamSessionForPostReview()` and enters post-exam results at `use-practice-session-review-stage.ts:224-239`.

The button labeled `'Finish exam'` therefore lies. Clicking it does not finish the exam — it loads a different stage where the user must take additional action to actually finalize. The label promises a terminal action and delivers a navigation action.

A user who clicks `'Finish exam'` expecting their exam submitted, then closes the tab, has an unsubmitted exam they thought they finished. That is a real semantic bug, not cosmetic cruft, regardless of how rare the empty-state edge case is.

## Historical origin (intentional copy that became stranded)

git log shows the label has changed three times:

```
2026-02-06 SPEC-020 (Practice Engine Completion):
  endSessionLabel={props.sessionInfo?.mode === 'exam' ? 'Review answers' : 'End session'}

2026-02-09 (Resolve Practice UX Problem 8):
  endSessionLabel={mode === 'exam' ? 'Review answers' : 'End session'}   // variable rename only

2026-03-18 (DEBT-322 D-2):
  endSessionLabel={mode === 'exam' ? 'Finish exam' : 'End session'}       // current line
```

DEBT-322 D-2 deliberately renamed `'Review answers'` → `'Finish exam'` while the active-exam header button still rendered. That was an intentional local copy decision, not evidence that the label precisely described finalization. DEBT-363 later verified that the header `Finish exam` button and the footer path both resolved to the same `onEndSession` handler and the same intermediate `ExamReviewView` destination; actual submission still happened later via `Submit exam` → confirmation → `onFinalizeReview`.

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

Rationale: matches DEBT-361's canonical vocabulary for the action that loads the review/submit stage. The button now tells the truth about what clicking it does. The tutor-mode `'End session'` branch is unchanged because tutor `onEndSession` falls through to `finalizeSessionSafely()`, which calls `input.finalizeSession()` (`use-practice-session-review-stage-state.ts:57-69`, `154-164`).

Current grep impact: `rg -n "Finish exam" app/ src/ tests/` returns **6 lines**: one production line plus five test lines across three test files. Implementation touches the three test files below.

- `app/(app)/app/practice/components/practice-view-layout.test.tsx:198, 219, 221` — fixture passes `endSessionLabel="Finish exam"`, filters buttons by that text, and asserts `toHaveLength(2)`. Update the fixture string and filter to `'Review & Submit'`. Keep the length assertion at `2`: this direct `PracticeView` render has no exam `sessionInfo`, so the passed label appears in both the header consumer and the empty-state consumer. The test's purpose (verifying the empty-state branch displays the passed label) is unchanged.
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-active-question.browser.spec.tsx:90, 130` — header-regression guard from DEBT-363 ("does not render Finish exam in the active exam-question header"). Update the test name and asserted name from `'Finish exam'` to `'Review & Submit'`. The fixture is mid-exam (`sessionInfo.index = 0`, `sessionInfo.total = 2`), so the bottom-bar `Review & Submit` last-question CTA does not exist and cannot collide with the global absence assertion. `PracticeView` does not currently expose a stable header test id or landmark; do not add one for this copy-only fix unless the fixture changes to a last-question case.
- `tests/e2e/practice.spec.ts:251` — E2E asserts `Finish exam` has count 0 paired with existing `Review & Submit` visibility and a scoped bottom-action-bar `Review & Submit` count. Delete the obsolete `Finish exam` count-0 assertion. The existing scoped bottom-bar assertion is the durable regression guard; adding another global `Review & Submit` count would be redundant and more brittle.

Acceptance: `rg "Finish exam" app/ src/ tests/` returns zero hits. `rg "Review & Submit"` continues to return the existing exam-flow hits plus the new page-view label.

### Option β (rejected): Hardcode `'End session'` for both modes

This was my initial speculative recommendation. It would replace `'Finish exam'` with `'End session'` in the empty-state edge case, which is technically more honest than `'Finish exam'` (since the action is at least *some kind of* exit) but loses the semantic specificity that the actual call is `loadReview()` → Review & Submit stage. Option α is strictly better because it is more accurate about the destination.

### Option γ (rejected): Delete the conditional entirely; remove the `endSessionLabel` prop

Tempting from a YAGNI perspective. The header consumer is gated off, so the label only matters in the empty-state edge case. But:

- We have not formally proven the empty-state edge case is unreachable in exam mode.
- A static audit found a plausible ready/null-question path: `GetNextQuestionUseCase.executeForSession()` can return `null`, and `runLoadQuestionFlow()` can commit that result as `question=null` with `loadState='ready'`.
- Removing the prop creates a refactor risk (PracticeView's empty-state still needs *some* button label; the default at `practice-view.tsx:312` would become `'End session'`).
- The doc-quality cost of "this prop appears unused but isn't" exceeds the benefit of removing it.

Option γ would require an upstream proof that exam mode can never reach `loadState === 'ready' && question === null`. The current source does not support that proof. Option α delivers the correctness fix without deleting a defensive label path.

## Recommendation

**Option α.** One-line rename in `practice-session-page-view.tsx:267`. Test fixture/assertion updates in three test files. Total production diff: one line. Total test diff: small and mechanical across three files. Zero behavior change beyond the label string. Brings the active-exam vocabulary in line with DEBT-361 and the post-DEBT-363 flow, and closes the trailing-edge debt that DEBT-365 did not catch.

## Production Diff Spec

Single production file:

1. **`app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:267`** — rename `'Finish exam'` to `'Review & Submit'`.

Test files:

2. **`app/(app)/app/practice/components/practice-view-layout.test.tsx:198, 219, 221`** — update fixture and filter from `'Finish exam'` to `'Review & Submit'`; keep `expect(endButtons).toHaveLength(2)`.
3. **`app/(app)/app/practice/[sessionId]/components/practice-session-page-view-active-question.browser.spec.tsx:90, 130`** — update test name and asserted button name from `'Finish exam'` to `'Review & Submit'`. The fixture is mid-exam (`index: 0`, `total: 2`), so the bottom-bar `Review & Submit` CTA does not collide with the global absence assertion.
4. **`tests/e2e/practice.spec.ts:251`** — delete the `'Finish exam'` count-0 assertion. Keep the existing `Review & Submit` visibility assertion and the existing scoped bottom-action-bar count assertion.

Header (`practice-view.tsx:423-444`), `ExamActionBar` (`practice-view.tsx:223-299`; current `Review & Submit` label at lines 271-273), `TutorActionBar` (`practice-view.tsx:112-205`), `ActionBarSpacer` (`practice-view.tsx:88-90`), the empty-state branch JSX (`practice-view.tsx:499-510`), and the `endSessionLabel` default in `practice-view.tsx:312` are unchanged.

## Test Impact

| File | Impact | Action |
|------|--------|--------|
| `app/(app)/app/practice/components/practice-view-layout.test.tsx` | **HIGH** | Update fixture (`endSessionLabel="Finish exam"` → `"Review & Submit"`) and filter (`button.textContent?.includes('Finish exam')` → `'Review & Submit'`) at lines 198 and 219. Keep `expect(endButtons).toHaveLength(2)` at line 221; both header and empty-state consumers render in this direct component fixture. |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view-active-question.browser.spec.tsx` | **HIGH** | Update test name (line 90) and asserted button name (line 130) from `'Finish exam'` to `'Review & Submit'`. Fixture is mid-exam (`index: 0`, `total: 2`), so the bottom-bar `Review & Submit` CTA does not collide. |
| `tests/e2e/practice.spec.ts` | **MEDIUM** | Delete the `'Finish exam'` count-0 assertion at line 251. Keep the existing `Review & Submit` visibility assertion and scoped bottom-action-bar count assertion at lines 249 and 255-258. |
| All other test files | **NONE** | No other test passes the literal `'Finish exam'` or asserts on it. |

Test discipline reminders:

- **Fakes over mocks.** Use existing fakes from `src/application/test-helpers/fakes/`. No internal `vi.mock()`.
- **`renderToStaticMarkup` + `// @vitest-environment jsdom`** for `*.test.tsx`.
- **`vitest-browser-react`** for `*.browser.spec.tsx`.
- **Region-scoped queries.** The current header browser-spec fixture is mid-exam and has no bottom-bar `Review & Submit` collision. If an implementation changes that fixture to a last-question case, do not rely on a global absence assertion; add or use a stable header selector and scope the query.
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
