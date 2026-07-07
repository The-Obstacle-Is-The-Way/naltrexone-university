# BS-064: Radio Choice Modality Split

**Status:** Decision recorded; implemented by BUG-274 fix arc
**Created:** 2026-07-07
**Owner:** Product / Engineering
**Related:** [BUG-274](../bugs/bug-274-radio-choice-arrow-key-auto-commits-answer.md), [Interaction Contracts](../practice-engine/interaction-contracts.md), [Practice Modes](../practice-engine/practice-modes.md)

---

## Decision

Quick Practice and Tutor mode keep the 2026-05-04 one-click answer commit behavior for pointer users. The permanent interaction contract is a modality split:

- **Pointer activation:** selecting a choice by pointer commits immediately and reveals feedback.
- **Keyboard/AT radio selection:** arrow keys, Space, and synthesized activations without `pointerdown` select the radio but do not commit; the user commits with the visible `Submit` affordance or by pressing `Enter`.
- **Exam mode:** selection remains a visible, mutable draft and never immediately grades; final grading remains behind Review & Submit / exam finalization.

This is not a temporary compatibility patch. It is the settled interaction contract for native radio answer choices.

## Background

Two May 4, 2026 commits deliberately changed Quick Practice and Tutor sessions from a submit-gated question flow into a faster click-to-feedback flow:

- `931c7845` — `Commit clicked choices in ad-hoc practice flow`
- `53d59ba9` — `Commit clicked tutor choices in session flow`

BUG-274 later exposed the missing modality distinction: native sibling radios fire selection changes during standard arrow-key navigation. Because the application treated selection as commit in Tutor and Quick Practice, keyboard-only and assistive-tech users could unintentionally submit and lock the first browsed-to choice.

## Measured Event Model

The BUG-274 branch measured this in this repo's own Vitest Chromium harness, once through React handlers and once with raw native DOM listeners:

- Arrowing between sibling radios fires `click`, `input`, and `change` on the newly checked radio.
- Arrowing does **not** fire `pointerdown`.
- A pointer click fires `pointerdown`, then `click`, `input`, and `change`.

Therefore `click` and `change` cannot distinguish deliberate pointer activation from keyboard browsing. `pointerdown` can.

## Rejected Alternative

**Submit button for all Tutor/Quick users** was rejected. It would fix the keyboard defect by removing the May 2026 click-to-feedback feature for everyone, adding friction to the dominant pointer path and undoing an intentional product decision.

The chosen design preserves instant pointer feedback while giving keyboard/AT users a visible, recoverable two-step commit path. If an environment synthesizes an activation without Pointer Events, it falls into the safer selected-uncommitted state instead of silently grading.

## Implementation Contract

- `ChoiceButton` arms a transient pointer flag on wrapper `pointerdown` and consumes it on the next radio `change`.
- Held pointer activations stay armed until `change` consumes them; pointer cancel/leave and click-capture cleanup clear arms that do not produce a radio change.
- Arrow/Space keydown clears any stale pointer arm before native radio selection can occur.
- Quick Practice and Tutor hooks always update the selected choice, but commit only when the origin is pointer or an explicit submit action.
- `QuestionCard` handles `Enter` in the answer fieldset as explicit submit for the selected-uncommitted state.
- `PracticeView` renders `Submit` in the existing action-bar primary group only while a non-exam selected-uncommitted choice exists.
- Exam mode keeps its existing draft-only selection guard before any commit path.

Regression coverage lives in `app/(app)/app/practice/components/practice-view-radio-modality.browser.spec.tsx`.
