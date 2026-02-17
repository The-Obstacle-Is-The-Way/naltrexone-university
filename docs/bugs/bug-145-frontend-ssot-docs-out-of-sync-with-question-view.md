# BUG-145: Frontend SSOT Docs Are Out of Sync with Current Question View Implementation

**Status:** Open
**Priority:** P3
**Date:** 2026-02-17
**Component:** Documentation — Frontend / Practice Engine

---

## Description

Two canonical frontend SSOT docs currently describe **behavior and component structure that no longer exists**:

1. `docs/frontend/design-principles.md` claims `/app/questions/[slug]` still renders Previous/Next in Zone 1 via `SessionNavigationBar`, and that Tutor mode revisit loses correctness/explanation state.
2. `docs/practice-engine/question-rendering-architecture.md` references an inline `SessionNavigationBar` in `question-page-client.tsx` and includes stale line references for multiple behaviors.

The codebase has already evolved (notably in `question-page-client.tsx` and shared question-flow state), but the docs were not updated. These docs are explicitly positioned as canonical references, so drift here is high-risk for future refactors.

---

## Evidence

### 1) Design principles state an outdated implementation

`docs/frontend/design-principles.md:13`

> **Current compliance:** Partially violated — `SessionNavigationBar` in `/app/questions/[slug]` renders Previous/Next inline in Zone 1…

`docs/frontend/design-principles.md:98`

> **Bug:** Only `selectedChoiceId` + `isAnswered` restored; correctness/explanation lost…

### 2) Current question view has Previous/Next in the bottom action bar (Zone 2), and no SessionNavigationBar

`app/(app)/app/questions/[slug]/question-page-client.tsx:217-249`

```tsx
<div className="flex flex-col gap-3 sm:flex-row" data-testid="bottom-action-bar">
  {props.sessionNavigation && navPrev ? (
    <Button asChild variant="outline" className="rounded-full">
      <Link href={toQuestionRoute(navPrev.slug, { ... })}>← Previous</Link>
    </Button>
  ) : null}

  {props.sessionNavigation && navNext ? (
    <Button asChild variant="outline" className="rounded-full">
      <Link href={toQuestionRoute(navNext.slug, { ... })}>Next →</Link>
    </Button>
  ) : null}
```

### 3) Tutor-mode revisit state restoration exists in shared question flow state

`app/(app)/app/practice/shared/use-question-flow-core.ts:150-177`

```ts
const sessionSelectedChoiceId = nextQuestion.session?.latestSelectedChoiceId;
if (typeof sessionSelectedChoiceId === 'string') {
  setSelectedChoiceId(sessionSelectedChoiceId);
  setIsAnswered(true);

  const prev = nextQuestion.session?.previousSubmission;
  if (prev) {
    setSubmitResult({
      attemptId: RESTORED_ATTEMPT_ID,
      isCorrect,
      correctChoiceId: prev.correctChoiceId,
      explanationMd: prev.explanationMd,
      choiceExplanations: prev.choiceExplanations,
    });
  }
}
```

### 4) Practice engine architecture doc references a removed/changed component

`docs/practice-engine/question-rendering-architecture.md:73`

> `SessionNavigationBar` — `app/(app)/app/questions/[slug]/question-page-client.tsx:98-156`

No `SessionNavigationBar` exists in `question-page-client.tsx` today.

---

## Impact

- Future engineers will make incorrect changes based on outdated SSOT.
- Doc-driven refactors (Clean Architecture / “follow the spec”) lose safety guarantees when docs drift.
- Adds rework and increases chance of regressions during UI/UX unification work.

---

## Root Cause

Docs were not updated after implementing changes to question view navigation and persisted-state behavior.

---

## Proposed Fix

Update SSOT docs to match current behavior:

1. `docs/frontend/design-principles.md`
   - Remove/replace `SessionNavigationBar` references in “Current compliance” and the action bar section.
   - Update the Tutor-mode persistence row to reflect current restoration behavior.
2. `docs/practice-engine/question-rendering-architecture.md`
   - Remove/replace the `SessionNavigationBar` component references.
   - Update any file/line references that no longer match current code.

---

## Verification Plan

- Manually re-audit each referenced file/line after updates:
  - `app/(app)/app/questions/[slug]/question-page-client.tsx`
  - `app/(app)/app/practice/shared/use-question-flow-core.ts`
- Ensure docs describe the current Zone 1/Zone 2 behavior and persistence behavior accurately.
