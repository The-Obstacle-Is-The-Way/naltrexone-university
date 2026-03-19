# Frontend Design Principles

**Last Updated:** 2026-03-17

Canonical reference for layout composition patterns and UX design rules. While [standards.md](./standards.md) covers atoms (tokens, components, accessibility), this document covers how those atoms compose into consistent page layouts.

---

## 1. Navigation Zone Model

**Defined by:** SPEC-030 (Question View UX Unification)
**Applies to:** All question-viewing contexts (practice sessions, review pages, quick practice)
**Current compliance:** Compliant (SPEC-030 implemented). Previous/Next relocated to Zone 2 bottom bar. `SessionNavigationBar` removed.

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

Action bars are rendered inline per context (not via a shared component). The button sets differ enough that abstraction would add complexity without benefit. There is no single universal slot order across every question surface; instead, each context keeps related actions adjacent and preserves stable left-to-right sequencing within that family.

```
[← Previous] [Submit / Try Again / Finish exam] [Bookmark / Mark for review] [Next →] [Back link]
 sequential    primary learning / session action   secondary action         sequential   navigation
```

### By Context

| Context | Bottom Action Bar |
|---------|-------------------|
| Practice — before submit | [← Previous] [Submit] [Next →] [Bookmark] |
| Practice — after submit (Tutor) | [← Previous] [Next →] [Bookmark] |
| Practice — exam before submit | [← Previous] [Next →] [Mark for review] |
| Practice — exam after submit | [← Previous] [Next →] [Mark for review] |
| Quick Practice | [Submit] [Next →] [Bookmark] |
| Quick Practice — after submit | [Next →] [Bookmark] |
| History Session Review (answered) | [← Previous] [Try Again / Practice Again] [Bookmark] [Next →] [Back to ...] |
| History Session Review (unanswered reveal) | [← Previous] [Try Again] [Bookmark] [Next →] [Back to ...] |
| Standalone Question Review (dashboard / bookmarks, unanswered) | [Submit] [Bookmark] |
| Standalone Question Review (answered) | [Try Again / Practice Again] [Bookmark] [Back to ...] |
| Exam Review Stage | [Submit Exam] |

**Rules:**
- Previous only appears when there's a session-ordered question list
- Quick Practice has no Previous (no session context, no ordering)
- Individual review has no Previous/Next (no session context)
- Review-mode bookmark actions belong on the question detail surface, not the navigator/list surface
- History origin suppresses the duplicate top-right back link; other standalone review origins keep the header back link until the bottom-bar back action becomes relevant

---

## 3. State Persistence Expectations

| Mode | On revisit, user expects to see... | Current Status |
|------|------------------------------------|----------------|
| Tutor (active session) | Full post-submission state: selected answer, correct/incorrect highlighting, explanation | Working (fixed by SPEC-030: `previousSubmission` in `NextQuestion`) |
| Exam (active session) | Selected answer only ("Answered" status). No correctness, no explanation (deferred to review). | Working |
| History Review | Full post-submission state from the specific attempt | Working |
| Quick Practice | N/A — no revisit mechanism (each question is independent) | N/A |

**Rule:** If a mode shows feedback immediately after submission, that same feedback must be visible when the user revisits the question within the same session.

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
- [ ] Active exam contexts do not expose correctness/explanations before session end (see [Exam Answer Secrecy Policy](../practice-engine/exam-answer-secrecy-policy.md))
- [ ] Shared components (`QuestionCard`, `Feedback`) are used — don't rebuild them
- [ ] Disclosure panels avoid duplicate primary CTAs when the parent row/header already performs the same navigation
- [ ] The context is documented in [Question Rendering Architecture](../practice-engine/question-rendering-architecture.md)

---

## Related Documentation

- [Frontend Standards](./standards.md) — Design tokens, component standards, accessibility, typography
- [Pattern Registry](./pattern-registry.md) — Every visual pattern with canonical classes, token scales, and decision trees
- [Question Rendering Architecture](../practice-engine/question-rendering-architecture.md) — All 6 viewing contexts, component inventory, state flows
- [Exam Answer Secrecy Policy](../practice-engine/exam-answer-secrecy-policy.md) — Canonical correctness/explanation exposure timing rules
- [Practice Engine Frontend Layer](../practice-engine/frontend-layer.md) — Routes, hook architecture, data flow
- [SPEC-030](../_archive/specs/spec-030-question-view-ux-unification.md) — Spec that established the navigation zone model (Implemented)
