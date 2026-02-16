# Frontend Design Principles

**Last Updated:** 2026-02-16

Canonical reference for layout composition patterns and UX design rules. While [standards.md](./standards.md) covers atoms (tokens, components, accessibility), this document covers how those atoms compose into consistent page layouts.

---

## 1. Navigation Zone Model

**Defined by:** SPEC-030 (Question View UX Unification)
**Applies to:** All question-viewing contexts (practice sessions, review pages, quick practice)
**Current compliance:** Partially violated — `SessionNavigationBar` in `/app/questions/[slug]` renders Previous/Next inline in Zone 1. SPEC-030 will relocate these to Zone 2.

Question-related pages use two non-overlapping navigation zones:

```
┌─────────────────────────────────────────┐
│  Zone 1 — TOP: Random-Access Navigation │
│  • Question Navigator grid              │
│  • "Question X of Y" status label       │
│  • Never put clickable Previous/Next    │
│    links here                           │
├─────────────────────────────────────────┤
│                                         │
│  Content Area                           │
│  • Question stem                        │
│  • Choice buttons                       │
│  • Feedback / explanation               │
│                                         │
├─────────────────────────────────────────┤
│  Zone 2 — BOTTOM: Sequential Nav +      │
│           Actions                        │
│  • ← Previous / Next →                  │
│  • Submit / Try Again                   │
│  • Bookmark / Mark for review           │
│  • Back link                            │
│  • Never put a navigator grid here      │
└─────────────────────────────────────────┘
```

**Why:** Users read content top-to-bottom. After reading a question and explanation, their eyes are at the bottom. Placing sequential navigation at the bottom means they can advance without scrolling back up.

**Rules:**
- Zone 1 is for **random-access** (jump to any question by number)
- Zone 2 is for **sequential** (previous/next) and **actions** (submit, bookmark, back)
- The two zones must not overlap in function
- "Question X of Y" is a **status label** (non-interactive), not a navigation control

---

## 2. Action Bar Composition

Action bars are rendered inline per context (not via a shared component). The button sets differ enough that abstraction would add complexity without benefit. However, they follow consistent ordering:

```
[← Previous] [Submit / Next →] [Bookmark / Mark for review] [Back link]
 sequential    primary action    secondary actions              navigation
```

### By Context (Current State)

| Context | Bottom Action Bar (current) |
|---------|-------------------|
| Practice — before submit | [Submit] [Next Question] [Bookmark] |
| Practice — after submit (Tutor) | [Next Question] [Bookmark] |
| Practice — after submit (Exam) | [Next Question] [Bookmark] [Mark for review] |
| Quick Practice | [Submit] [Next Question] [Bookmark] |
| History Session Review (answered) | [Try Again] [Back to History] |
| History Session Review (unanswered) | [Submit] |
| History Individual Review | [Try Again] [Back to History] |
| Exam Review Stage | [Submit Exam] |

> **Note:** Previous/Next for session review currently live in `SessionNavigationBar` (Zone 1 inline), not in the bottom action bar. SPEC-030 will move them to Zone 2 and add a Previous button to active practice. The target state after SPEC-030:

| Context | Bottom Action Bar (after SPEC-030) |
|---------|-------------------|
| Practice — before submit | [← Previous] [Submit] [Next Question] [Bookmark] |
| Practice — after submit (Tutor) | [← Previous] [Next Question] [Bookmark] |
| Practice — after submit (Exam) | [← Previous] [Next Question] [Bookmark] [Mark for review] |
| Quick Practice | [Submit] [Next Question] [Bookmark] |
| History Session Review (answered) | [← Previous] [Next →] [Try Again] [Back to History] |
| History Session Review (unanswered) | [← Previous] [Next →] [Submit] |
| History Individual Review | [Try Again] [Back to History] |
| Exam Review Stage | [Submit Exam] |

**Rules:**
- Previous only appears when there's a session-ordered question list
- Quick Practice has no Previous (no session context, no ordering)
- Individual review has no Previous/Next (no session context)

---

## 3. State Persistence Expectations

| Mode | On revisit, user expects to see... | Current Status |
|------|------------------------------------|----------------|
| Tutor (active session) | Full post-submission state: selected answer, correct/incorrect highlighting, explanation | **Bug:** Only `selectedChoiceId` + `isAnswered` restored; correctness/explanation lost (BS-018, SPEC-030 Problem A) |
| Exam (active session) | Selected answer only ("Answered" status). No correctness, no explanation (deferred to review). | Working |
| History Review | Full post-submission state from the specific attempt | Working |
| Quick Practice | N/A — no revisit mechanism (each question is independent) | N/A |

**Rule:** If a mode shows feedback immediately after submission, that same feedback must be visible when the user revisits the question within the same session. SPEC-030 will fix the Tutor mode violation.

---

## 4. Shared vs. Context-Specific Components

### Always Shared (used by all contexts)

| Component | File | Purpose |
|-----------|------|---------|
| `QuestionCard` | `components/question/question-card.tsx` | Question stem + choice buttons |
| `ChoiceButton` | `components/question/choice-button.tsx` | Individual radio-style choice |
| `Feedback` | `components/question/feedback.tsx` | Correct/incorrect + explanation |
| `ErrorCard` | `components/error-card.tsx` | Error display with recovery |

### Context-Specific (intentionally not shared)

| Component | Why Not Shared |
|-----------|---------------|
| Action bars | Button sets differ per context; a shared component would need too many conditional props |
| `QuestionNavigator` | Callback-based (active sessions); specific aria-label format |
| `ReviewQuestionNavigator` | Link-based (review pages); different color coding and aria-labels |

**Rule:** Don't abstract components just because they look similar. Abstract when they share behavior AND interface. Two navigators that look alike but use different navigation mechanisms (callbacks vs links) are better kept separate.

---

## 5. Cross-Context Consistency Checklist

When building or modifying a question-viewing context, verify:

- [ ] Sequential navigation (Previous/Next) is in Zone 2 (bottom), never Zone 1 (top)
- [ ] "Question X of Y" is a status label in Zone 1, not a clickable element
- [ ] Action bar follows the ordering convention (sequential → primary → secondary → navigation)
- [ ] State persistence matches the mode's expectations (§3)
- [ ] Shared components (`QuestionCard`, `Feedback`) are used — don't rebuild them
- [ ] The context is documented in [Question Rendering Architecture](../practice-engine/question-rendering-architecture.md)

> **Known violations:** History Session Review currently places Previous/Next in Zone 1 (`SessionNavigationBar` inline). Active practice has no Previous button. These are tracked in SPEC-030.

---

## Related Documentation

- [Frontend Standards](./standards.md) — Design tokens, component standards, accessibility, typography
- [Question Rendering Architecture](../practice-engine/question-rendering-architecture.md) — All 6 viewing contexts, component inventory, state flows
- [Practice Engine Frontend Layer](../practice-engine/frontend-layer.md) — Routes, hook architecture, data flow
- [SPEC-030](../specs/spec-030-question-view-ux-unification.md) — Spec that established the navigation zone model
