# BS-040: Incorrect Answer Feedback Flow Redesign

**Date:** 2026-03-04
**Triggered by:** Manual review of correct vs incorrect answer display flow in Quick Practice
**Scope:** The Feedback component renders identical section ordering for correct and incorrect answers — the incorrect flow is cognitively jarring because it doesn't prioritize explaining the user's mistake
**Related:** [BS-033](./bs-033-question-display-formatting-and-feedback-ux.md) (22 formatting issues, component fixes done), `components/question/feedback.tsx`

---

## The Problem

### Current rendering (both correct AND incorrect — identical layout)

```
1. Badge: "Correct" or "Incorrect"
2. "Correct answer" label + letter + choice text
3. explanationMd (explanation of correct answer + clinical pearl)
4. "Why other answers are wrong:" (all incorrect choices, each with explanationMd)
5. Reference
```

### Why this works for CORRECT answers

Natural cognitive flow: "You got it right → here's why it's right → here's why the others are wrong → reference." The user's mental model is confirmed, then deepened.

### Why this FAILS for INCORRECT answers

When the user picks wrong, they see:

```
❌ Incorrect
"Correct answer: D) Zolpidem is contraindicated in patients who have experienced complex sleep behaviors"
[Full explanation of why D is correct...]
[Clinical pearl about D...]
"Why other answers are wrong:"
  A) Increase dose... [explanation]
  B) Normal variant... [explanation] ← "Your answer" badge buried here
  C) Sleep study... [explanation]
```

**The cognitive mismatch:** After seeing "Incorrect," the learner's first instinct is "why was MY answer wrong?" But the component immediately jumps to explaining the correct answer. The user's chosen answer is buried 3-4 scroll-lengths down inside the "Why other answers are wrong" section, tagged with a small "Your answer" badge.

This forces the learner to:
1. Read through the correct answer explanation (which they didn't pick)
2. Scroll past other wrong choices
3. Eventually find their own choice with a small badge
4. Then mentally re-sequence everything

---

## Concrete Trace: What's Programmatic vs What's Raw MDX

Using **stahls-zolpidem-004** (user chose B "Normal variant", correct answer is D "Contraindicated").

### What the MDX file contains (raw content)

```
frontmatter.choices[]:
  A) "Patients should have a sleep study before continuing zolpidem"  (correct: false)
  B) "Zolpidem dose should be increased..."                          (correct: false)
  C) "This is a normal variant that does not require intervention"    (correct: false)
  D) "Zolpidem is contraindicated in patients who have..."           (correct: true)

## Explanation
Sleep driving and other complex behaviors... [paragraph]
**Clinical pearl:** Complex sleep behaviors are dose-dependent... [paragraph]

**Why other answers are wrong:**
- A) Sleep study before continuing: A sleep study would not address...
- B) Increase dose for deeper sleep: Increasing the dose would likely INCREASE...
- C) Normal variant: Complex sleep behaviors are NOT normal...

### Reference
Stahl SM. Stahl's Essential Psychopharmacology...
```

### What the component receives as props (after pipeline processing)

```
isCorrect: false
selectedChoiceId: "uuid-of-B"
explanationMd: "Sleep driving and other complex behaviors... **Clinical pearl:** ..."
referenceMd: "Stahl SM. Stahl's Essential Psychopharmacology..."
choiceExplanations: [
  { displayLabel: "A", textMd: "Zolpidem dose should be increased...",
    isCorrect: false, explanationMd: "Increase dose for deeper sleep: ..." },
  { displayLabel: "B", textMd: "This is a normal variant...",
    isCorrect: false, explanationMd: "Normal variant: Complex sleep behaviors...",
    choiceId: "uuid-of-B" },  ← user's pick
  { displayLabel: "C", textMd: "Patients should have a sleep study...",
    isCorrect: false, explanationMd: "Sleep study before continuing: ..." },
  { displayLabel: "D", textMd: "Zolpidem is contraindicated...",
    isCorrect: true, explanationMd: null },  ← correct answer
]
```

Note: Labels are shuffled per-user (A/B/C/D may differ from MDX ordering).

### What the component INSERTS programmatically (line-by-line trace)

| Line | What renders | Source | Programmatic? |
|------|-------------|--------|---------------|
| L49-57 | `Incorrect` (red badge) | Hardcoded string, styled by `isCorrect` | **YES** — component inserts "Incorrect" or "Correct" |
| L62-63 | `Correct answer` (label) | Hardcoded string | **YES** — component always inserts this label |
| L65-70 | `D) Zolpidem is contraindicated...` | `correctChoice.displayLabel` + `correctChoice.textMd` from `choiceExplanations` | **YES** — component finds `isCorrect: true` choice and renders its label + text |
| L75-76 | Full explanation paragraph + clinical pearl | `explanationMd` prop (from `question.explanationMd` in DB, from `## Explanation` in MDX) | **RAW MDX** — rendered as-is via `<Markdown>` |
| L86-87 | `Why other answers are wrong:` (heading) | Hardcoded string | **YES** — component inserts this heading |
| L90-108 | Each wrong choice card: `A) choice text` + explanation | `choice.displayLabel` + `choice.textMd` + `choice.explanationMd` from `choiceExplanations` | **MIXED** — label/text are programmatic lookup; explanationMd is raw from MDX parsed into per-choice fields |
| L98-101 | `Your answer` badge on selected wrong choice | Hardcoded string, shown when `choice.choiceId === selectedChoiceId` | **YES** — component inserts this badge |
| L116 | `Reference` (heading) | Hardcoded string | **YES** — component inserts this heading |
| L119 | Reference citation text | `referenceMd` prop (from `### Reference` in MDX) | **RAW MDX** — rendered as-is |

### Summary: What the component inserts that ISN'T in the MDX

1. **"Incorrect" / "Correct" badge** — verdict from `isCorrect` boolean
2. **"Correct answer" label** — hardcoded, always shown
3. **Correct choice letter + text** — looked up from `choiceExplanations.find(c => c.isCorrect)`
4. **"Why other answers are wrong:" heading** — hardcoded
5. **Per-choice cards with letter + text** — looked up from `choiceExplanations` array
6. **"Your answer" badge** — shown on the choice matching `selectedChoiceId`
7. **"Reference" heading** — hardcoded

Everything else (`explanationMd`, each `choice.explanationMd`, `referenceMd`) is raw MDX content rendered through `<Markdown>`.

---

## Root Cause

**`feedback.tsx` has no conditional rendering based on `isCorrect`.** Lines 59-81 always render the correct answer first, then explanation, regardless of whether the user got it right or wrong. The `isCorrect` prop only changes the badge color — it never changes section ordering or emphasis.

The component has all the data it needs to branch:
- `isCorrect` — knows verdict
- `selectedChoiceId` — knows which choice the user picked
- `choiceExplanations[]` — has per-choice text AND explanation for every choice
- `explanationMd` — has the full correct-answer explanation + clinical pearl

**No MDX changes needed. No pipeline changes needed. No domain/use-case/controller changes needed.**

The fix is **purely in the Feedback component** — rearranging what's already available based on `isCorrect`.

---

## Proposed Fix: Conditional Section Ordering

### Correct answer flow (keep as-is, minor polish)

```
1. ✅ "Correct" badge
2. "Correct answer" label + D) choice text     ← confirms what they picked
3. Explanation of correct answer + clinical pearl
4. "Why other answers are wrong:" section
5. Reference
```

**Minor polish items:**
- Remove redundant choice-text echo inside wrong-answer explanations (e.g., "Stimulant intoxication: While polysubstance..." → just "While polysubstance...")
- This is a content-layer MDX fix, not component

### Incorrect answer flow (REDESIGN)

Using stahls-zolpidem-004, user chose B "Normal variant":

```
1. ❌ "Incorrect" badge

2. YOUR ANSWER
   B)  This is a normal variant that does not require intervention
   Normal variant: Complex sleep behaviors are NOT normal and can result
   in serious injury or death. They require medication discontinuation.
   └─ Source: choiceExplanations.find(c => c.choiceId === selectedChoiceId)
   └─ Letter + text from choice, explanation from choice.explanationMd

3. CORRECT ANSWER
   D)  Zolpidem is contraindicated in patients who have experienced
       complex sleep behaviors
   Sleep driving and other complex behaviors (eating and preparing food,
   making phone calls) have been reported...
   **Clinical pearl:** Complex sleep behaviors are dose-dependent...
   └─ Source: choiceExplanations.find(c => c.isCorrect) for letter + text
   └─ Source: explanationMd prop for the full explanation + clinical pearl

4. WHY OTHER ANSWERS ARE WRONG
   A)  Zolpidem dose should be increased...
   Increase dose for deeper sleep: Increasing the dose would likely INCREASE...

   C)  Patients should have a sleep study before continuing zolpidem
   Sleep study before continuing: A sleep study would not address...
   └─ Source: choiceExplanations.filter(c => !c.isCorrect && c.choiceId !== selectedChoiceId)
   └─ User's choice (B) is NOT repeated here — already shown in section 2

5. REFERENCE
   Stahl SM. Stahl's Essential Psychopharmacology...
```

**Key changes from current layout:**
- User's wrong answer is **PROMOTED to the top** (immediately after badge) with its explanation
- Correct answer comes **second** (not first)
- "Your answer" badge is **no longer needed** in the "Why other answers are wrong" section — the user's choice is already its own section
- User's choice is **excluded from** the "Why other answers are wrong" section (no duplication)

### Why this ordering works

| Position | What | Cognitive purpose |
|----------|------|-------------------|
| 1 | Badge | Verdict — you got it wrong |
| 2 | Your answer + why wrong | Addresses first instinct: "why was I wrong?" |
| 3 | Correct answer + explanation + pearl | Teaches the concept: "here's what was right and why" |
| 4 | Other wrong choices (excl. yours) | Supplemental: "here's why the other options fail too" |
| 5 | Reference | Source for further reading |

---

## Implementation Sketch

### Component changes (`feedback.tsx`)

**New derived values (add to existing logic at top of component):**

```tsx
// Already exists (line 30-31):
const correctChoice = choiceExplanations.find((choice) => choice.isCorrect) ?? null;

// NEW: find the user's selected choice (for incorrect flow)
const userChoice = !isCorrect && selectedChoiceId
  ? choiceExplanations.find((c) => c.choiceId === selectedChoiceId) ?? null
  : null;

// NEW: other wrong choices excluding user's pick (for incorrect flow)
const otherWrongChoices = !isCorrect
  ? visibleChoiceExplanations.filter((c) => c.choiceId !== selectedChoiceId)
  : visibleChoiceExplanations;  // correct flow uses all wrong choices as before
```

**Rendering branch:**

```tsx
// CORRECT FLOW — keep current layout (lines 59-112 unchanged)
if (isCorrect) {
  // 1. "Correct" badge (already done)
  // 2. "Correct answer" + letter + text
  // 3. explanationMd (explanation + clinical pearl)
  // 4. "Why other answers are wrong:" with all wrong choices
  // 5. Reference
}

// INCORRECT FLOW — new layout
if (!isCorrect) {
  // 1. "Incorrect" badge (already done)

  // 2. YOUR ANSWER section (NEW)
  //    - Label: "Your answer"
  //    - userChoice.displayLabel + userChoice.textMd
  //    - userChoice.explanationMd (why this specific choice is wrong)

  // 3. CORRECT ANSWER section (moved from position 2 to position 3)
  //    - Label: "Correct answer"
  //    - correctChoice.displayLabel + correctChoice.textMd
  //    - explanationMd prop (full explanation + clinical pearl)

  // 4. OTHER ANSWERS section (filtered: excludes user's choice)
  //    - Label: "Why other answers are wrong:" (or renamed)
  //    - otherWrongChoices.map(...) — same card rendering as current

  // 5. Reference (same as current)
}
```

### Affected files

| File | Change |
|------|--------|
| `components/question/feedback.tsx` | Conditional section ordering based on `isCorrect` |
| `components/question/Feedback.test.tsx` | Update/add tests for incorrect flow ordering |

### NOT affected

- MDX content files — no changes needed
- Domain entities — no changes
- Use cases — no changes
- Controllers — no changes
- Database — no changes

---

## Secondary Polish (can be done separately)

### P1. Redundant choice-text echo in wrong-answer explanations

**Current MDX:**
```markdown
- A) These symptoms are unrelated to zaleplon and suggest stimulant intoxication

Stimulant intoxication: While polysubstance history warrants considering...
```

The component renders the choice text ("These symptoms are unrelated...") as a heading, then the explanation repeats a summary ("Stimulant intoxication:") before the actual explanation.

**Options:**
- (A) Fix at MDX content level — remove the lead-in summary from explanations
- (B) Fix at component level — strip text before first colon if it matches choice text
- (C) Leave as-is — it's slightly redundant but not confusing

**Root layer:** Content (MDX). The component already renders `choice.textMd` as a heading and `choice.explanationMd` as the body. The redundancy comes from the MDX explanation starting with a summary of the choice text.

### P2. "Correct answer" label for correct answers

When the user gets it right, "Correct answer" + the choice text is slightly redundant with the "Correct" badge. Could simplify to just showing the choice text without the "Correct answer" label, since the badge already says "Correct."

### P3. Section header naming for incorrect flow

The "Why other answers are wrong" heading doesn't make sense when the user's answer is already separated out. Rename to "Other answers:" or "Other incorrect answers:" for the remaining choices.

---

## Open Questions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| 1 | Should the user's wrong answer have a distinct visual treatment (red border/tint)? | (A) Red-tinted card, (B) Red left border, (C) Neutral card with "Your answer" badge only | — |
| 2 | Should the correct answer section have a green accent when shown in incorrect flow? | (A) Green left border, (B) Green "Correct answer" badge, (C) Neutral | — |
| 3 | Should the "Other answers" section be collapsible by default in incorrect flow? | (A) Always expanded, (B) Collapsed with "Show other answers" toggle | — |
| 4 | Handle the edge case where user's selected choice has NULL explanationMd? | (A) Fall back to current layout, (B) Show "No explanation available" in user's answer section | — |
| 5 | Address P1 (redundant echo) now or defer to a separate content cleanup pass? | (A) Now, (B) Defer | — |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-04 | Created BS-040 | Correct answer flow is fine; incorrect answer flow needs section reordering — pure component change, no MDX changes needed |
