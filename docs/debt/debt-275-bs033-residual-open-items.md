# DEBT-275: BS-033 Residual Open Items

**Priority:** P3
**Created:** 2026-03-04
**Status:** Decomposed (2026-03-24)
**Source:** [BS-033](../_archive/brainstorming/bs-033-question-display-formatting-and-feedback-ux.md)
**Scope:** Content-layer fixes, one unresolved design decision, and future enhancement ideas extracted from BS-033 after all 22 component-layer fixes shipped (BUG-152–159, PRs #141–#143). F1 resolved by DEBT-277, F4 is now shipped in `practice-session-page-view.tsx`, and F8 resolved by DEBT-276 (PR #172).

> **Decomposed:** This omnibus doc has been split into focused debt items. See:
> - [DEBT-335](./debt-335-remove-all-or-nothing-wrong-answer-guard.md) — Remove all-or-nothing wrong-answer display guard (code fix)
> - [DEBT-336](./debt-336-content-markdown-quality-pass.md) — Content markdown quality pass C1–C4 (external repo)
> - [DEBT-337](./debt-337-future-feedback-enhancements.md) — Future enhancements F2/F3/F5/F6/F7 (parked)

---

## Context

BS-033 identified 22 problems across question display and feedback UX. All component-layer fixes are complete. This debt doc captures everything that remains genuinely open so BS-033 can be archived.

**Four design questions from BS-033 are now settled by shipped code:**

| Question | Answer (settled in code) |
|----------|------------------------|
| Prose styling scope — global or contextual? | Global: `[&_p+p]:mt-3` on the shared `<Markdown>` wrapper (`components/markdown/Markdown.tsx`) |
| Correct answer display — show label + full text? | Yes: `correctChoice.displayLabel` + `textMd` shown in feedback (`components/question/feedback.tsx`) |
| Text size — uniform or tiered? | Tiered: `text-base` for stem and choices, `text-sm` for feedback body/labels |
| Feedback card color — badge-only or accent? | Badge-only pill for verdict. Inner sections now have semantic containment cards: `border-success/20 bg-success/5` (correct answer) and `border-destructive/20 bg-destructive/5` (your answer). Outer `<Card>` remains neutral. Settled by DEBT-276 (PR #172). |

---

## Open Design Decision

### All-or-Nothing Wrong-Answer Display Rule

**Current behavior** (`components/question/feedback.tsx`): If ANY incorrect choice has `null` or blank `explanationMd`, the entire "Why other answers are wrong" section is hidden. This means many questions show no wrong-answer feedback at all because their content is incomplete.

```tsx
const hasMissingIncorrectExplanation = choiceExplanations.some(
  (choice) =>
    !choice.isCorrect &&
    (choice.explanationMd === null ||
      choice.explanationMd.trim().length === 0),
);
const shouldRenderChoiceExplanations =
  !hasMissingIncorrectExplanation && visibleChoiceExplanations.length > 0;
```

**Options:**
- **Keep all-or-nothing** — Motivates complete content authoring; prevents partial/misleading display
- **Show whatever exists** — Shows available explanations even when some choices lack them; better than nothing for the learner

**Decision needed:** Pick one. No code change needed if keeping current behavior.

---

## Content-Layer Work (Deferred)

These require editing the private question MDX corpus and authoring guidance, not app code. This checkout commits only placeholder questions plus authoring docs; real question content lives in gitignored/private `content/questions/**` directories per `content/questions/README.md`.

### C1: MDX Blank Lines in Stems (BS-033 P1, partial)

Some question stems lack a blank line before "Which of the following...", causing the scenario and question to render as one paragraph. The component prose fix (`[&_p+p]:mt-3`) handles visual spacing, but adding blank lines is semantically correct markdown.

**Scope:** Audit private question `.mdx` files for missing blank lines before terminal question sentences.

### C2: MDX Blank Lines Before Clinical Pearls (BS-033 P4, partial)

Some explanations lack a blank line before `**Clinical pearl:**`, causing it to merge with the preceding paragraph. Same visual fix covers it, but content should be semantically correct.

**Scope:** Audit explanation content for missing blank lines before clinical pearl markers.

### C3: Wrong-Answer Explanation Format Convention (BS-033 P5)

Some wrong-answer explanations use a confusing "short-label: explanation" format:
```
- A) CYP interaction increasing methadone: While drug interactions should always be checked...
```

This restates the answer before explaining why it's wrong. Should directly explain:
```
- A) While drug interactions should always be checked, the primary concern here is...
```

**Action:** Update authoring guide (`docs/content/question-format-spec.md`) with explicit rules, then fix existing content.

### C4: Wrong-Answer Explanation Completeness (BS-033 P6)

Many questions are missing per-choice wrong-answer explanations entirely. Related to the all-or-nothing display decision above — incomplete content triggers the hide-all guard.

**Scope:** Bulk audit of content completeness. Scale depends on authoring pipeline.

---

## Future Enhancement Ideas

These were identified during BS-033 analysis but never implemented. None are bugs — all are polish or new features.

| ID | Enhancement | Notes |
|----|-------------|-------|
| ~~F1~~ | ~~Clinical pearl styled callout box~~ | ~~Detect `**Clinical pearl:**` pattern in `<Markdown>` and render as a visually distinct callout~~ → **Resolved by DEBT-277.** `<Markdown>` now renders detected clinical-pearl paragraphs as styled callouts with separated label/content. |
| F2 | Clinical pearl as separate seed field | Parse clinical pearl at seed level (like `reference_md`), store as its own column/field |
| F3 | Reference section styling improvements | Improve label/content hierarchy and reference readability in feedback |
| ~~F4~~ | ~~Question counter / progress indicator~~ | ~~"Question 1 of 48" during practice sessions~~ → **Resolved.** `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` now displays `"Question X of Y"` in the session description. |
| F5 | Running score tracker | "3/5 correct so far" during practice sessions |
| F6 | Post-submit question card collapse | Collapse question card after submission to reduce scroll to feedback |
| F7 | Difficulty / topic tag display | Show difficulty level or topic tags on the question card |
| ~~F8~~ | ~~"Why C is correct" summary card~~ | ~~Structural symmetry — correct answer gets same card treatment as wrong-answer cards~~ → **Resolved by DEBT-276 (PR #172).** Correct-answer section now wrapped in `border-success/20 bg-success/5` containment card in both flows. |

---

## Minor Edge Case

### Direct URL Context Mismatch (BS-033 P-note)

Hitting `/app/questions/<slug>` directly (no query params) shows dashboard review copy ("Review a question from your recent activity." / "Back to Dashboard") but renders submit-mode controls. Internally inconsistent, but requires manual URL entry — not reachable through normal app navigation.

**Severity:** Cosmetic. No user impact in practice.

---

## Summary

| Category | Count | Action Required |
|----------|-------|----------------|
| Settled design questions | 4 | None — already shipped |
| Open design decision | 1 | Decide on all-or-nothing rule |
| Content-layer fixes | 4 | Content authoring pass |
| Future enhancements | 5 open (F2/F3/F5/F6/F7; F1/F4/F8 already resolved) | Build when prioritized |
| Minor edge case | 1 | Fix if convenient |
