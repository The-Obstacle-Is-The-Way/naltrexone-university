---
id: DEBT-363
title: Exam shell scroll model + dual-CTA disambiguation
status: Open (decision doc)
priority: P2
created: 2026-04-14
area: practice / exam
supersedes_decision_from: DEBT-360
related: DEBT-322, DEBT-360, DEBT-362
---

# DEBT-363: Exam shell scroll model + dual-CTA disambiguation

**Priority:** P2
**Status:** Open — **decision doc, not a locked spec**
**Created:** 2026-04-14
**Affected surfaces:** PracticeView (exam + tutor), PostExamReviewView, ExamReviewView
**Discovered via:** Visual walkthrough at 1280×1100 on 2026-04-14 during the DEBT-362 post-merge verification

---

## The user-observed problems

Two concerns were raised in the same walkthrough. They landed on different symptoms but share the same file (`practice-view.tsx`) and the same conceptual area (exam-mode footer behavior).

### Concern 1 — The shell feels "cut off" / "claustrophobic"

The exam (and tutor, and post-exam review) shell uses a viewport-bounded inner-scroll region. The body of the page does **not** scroll top-down. Instead, the sticky action bar anchors to the bottom of the viewport and content scrolls *inside* a bounded region above it. From the user's perspective:

> "It sequesters you into the window and it's really annoying. I'd rather just have a simple scroll of the whole window from top down."

This is not inadvertent slop — this is the shipped resolution of **DEBT-360**. See the architecture audit below.

**Measured evidence (independent design review, 2026-04-14):** An independent design-critique pass measured the content-to-visible-scroll-area ratio across the exam flow:

- **Desktop (1280×800):** post-exam review content is ~1653px crammed into a ~537px scroll region — a **3:1** ratio.
- **Short desktop (1280×600):** the question navigator for a 20-question session consumes the *entire* visible scroll area. The question stem is not visible without scrolling.
- **Mobile (390×844):** post-exam review content is ~5365px in a ~417px scroll region — a **12.87:1** ratio. Dense medical review content becomes a peephole read.

The numbers make the user's "cut off" reaction unarguable. This is not acclimation friction; this is a measurable viewport-compression problem on mobile and short-desktop viewports.

**Cross-screen inconsistency (second finding from the same review):** the scroll model is not uniform across the exam flow:

- Exam question view: bounded inner scroll
- Post-exam review: bounded inner scroll
- Review & Submit (the three-card list): fits in one viewport, no scroll exercised
- Session Summary: **uses normal body scroll** (not routed through `StickyActionBarLayout`)

A user's scroll muscle memory breaks as they move from last-question → review-submit → post-exam review → session summary. This is an argument for unification regardless of which scroll model wins — the current mix is incoherent.

### Concern 2 — Two buttons, one action, on the last exam question

On the last question of an exam, the user sees **both** of these simultaneously:

- **Top-right header button:** `Finish exam` — always visible on every exam question
- **Bottom footer button:** `Review & Submit` — only on the last question, replacing `Next`

Both call the exact same handler (`onEndSession`). Source:
- `app/(app)/app/practice/components/practice-view.tsx:385` — header button click → `props.onEndSession`
- `app/(app)/app/practice/components/practice-view.tsx:233` — `Review & Submit` click → `onEndSession` (when `isLastSessionQuestion && onEndSession`)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:224` — `endSessionLabel={mode === 'exam' ? 'Finish exam' : 'End session'}`

User reaction:

> "If there's two divergent buttons, people are gonna wonder, okay. Review and submit. Is that different than finish exam?"

That reaction is exactly the failure mode research warns about (see "Research: dual CTAs" below).

---

## Architecture audit — where did the scroll-shell come from?

### Timeline (git history)

```
5a891ad7  Fix exam last-question review CTA label        ← "Review & Submit" introduced
68528986  Add sticky action bar shell for practice flows ← DEBT-360 initial
5a478ab3  Replace sticky action bar shim with real CSS tests
ba1d9d53  Tighten sticky action bar server boundary
48ff7e0b  Deduplicate sticky shell viewport offset token
d7949ea4  Make sticky shell banner-safe by structure
```

Everything above the `Resolve DEBT-356` baseline is DEBT-360-era work.

### Current shell structure

1. **`AppLayoutShell`** — `app/(app)/app/layout.tsx:63`
   ```
   <div className="flex h-dvh min-h-screen flex-col bg-background">
     {banner}
     <header>…</header>
     <main className="flex min-h-0 flex-1 flex-col …">…</main>
   </div>
   ```
   - `h-dvh` forces the root to exactly the dynamic viewport height.
   - `<main>` is `flex-1 min-h-0` — takes remaining space, does not grow past viewport.
   - **This means the whole app shell is viewport-bounded. The document body cannot scroll.**

2. **`StickyActionBarLayout`** — `app/(app)/app/practice/components/sticky-action-bar.tsx:10`
   ```
   <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
     <div className="min-h-0 flex-1 overflow-y-auto pb-6">{children}</div>
     {actionBar ? <StickyActionBar>{actionBar}</StickyActionBar> : null}
   </div>
   ```
   - Outer wrapper: `overflow-hidden` — creates a new scroll context.
   - Inner content region: `overflow-y-auto` — this is the inner scroll box the user is reacting to.
   - Sticky footer: sibling of inner scroll region, anchored by the outer `overflow-hidden` parent.

**Net effect:** scrolling a long question or a long feedback block scrolls the inner region only. The header, app chrome, and sticky footer never move. The user sees what looks like "a window within a window" — which is exactly the visual they're objecting to.

### The DEBT-360 decision-log claim

`docs/_archive/debt/debt-360-action-bar-below-fold.md:132` records:

> "Shipped a hybrid shared-shell solution instead of a pure end-of-document sticky wrapper — Pure `sticky bottom-0` on a footer that still rendered after the full content stack did not keep the controls visible."

**This claim should be revisited.** Web research on the `position: sticky` failure modes (see "Research: sticky vs fixed" below) identifies **`overflow: hidden` on an ancestor** as the #1 reason `sticky bottom-0` silently fails. It is entirely plausible that the DEBT-360 trial attempt had a containing `overflow: hidden` (or was placed inside a `flex-1 min-h-0` parent without the page being tall enough to scroll) and misdiagnosed the result as "sticky doesn't work."

In other words: the shipped shell may have been solving a problem *created by its own earlier iteration* rather than an inherent sticky limitation.

### Does this permeate other surfaces?

Yes. Both `PracticeView` (tutor + exam) and `PostExamReviewView` and `ExamReviewView` route their footers through `StickyActionBarLayout`. The bounded-scroll visual affects:

- tutor mode question-taking
- exam mode question-taking
- the post-exam review screen (the three-card review we just shipped in DEBT-362)
- the post-exam full review view

---

## Research: sticky vs fixed vs document-flow footers

### CSS root cause of the DEBT-360 symptom

From CSS-Tricks, Polypane, and BrowserStack write-ups on `position: sticky` failure modes: any ancestor with `overflow: hidden`, `overflow: auto`, or `overflow: scroll` creates a new scroll context, and `sticky` sticks *within that ancestor* rather than the viewport. Fix: use `overflow: clip` instead of `overflow: hidden`, or remove overflow from the ancestor entirely. A sticky element also needs the parent to be tall enough to actually scroll before it will engage.

This is consistent with the DEBT-360 trial-and-error history and gives us a concrete technical answer: **`sticky bottom-0` on a document-flow footer will work as long as we don't `overflow: hidden` its ancestors.**

### UX guidance

Across Smashing Magazine, LogRocket, and the Adobe "Ask a UXpert" write-up on fixed elements, the consensus for primary actions on long-form content is:

- **Sticky/persistent primary actions reduce scroll friction** on long pages and flows where the user needs the CTA repeatedly. They lift conversion in commerce and engagement in content.
- **Bounded inner-scroll regions are a red flag on mobile.** They steal vertical real estate and trap the user in a narrow scroll lane. Mobile sticky footers should be compact utility rows, respect safe-area insets, and not create nested scroll containers.
- **Sticky is preferred over fixed when** the footer should fade away from the flow naturally (e.g., once you scroll past the end). **Fixed is preferred over sticky when** the CTA must always be visible regardless of content length and you're willing to pay the cost of a bottom-padding reservation.
- **Always reserve bottom padding equal to footer height** when using `fixed` so the last line of content isn't occluded.

### Research: dual CTAs for the same action

From the UX Collective, Telerik, and the "How Many CTAs Are Too Many" write-up:

- **Repeating the same CTA with the same label** on a long page is fine and often beneficial ("Start free trial" appearing in hero + mid + footer).
- **Repeating the same action with *different labels*** is the worst pattern — users read label differences as intent differences and hesitate. This is exactly our `Finish exam` + `Review & Submit` situation.
- If two CTAs must coexist and represent different intents, they must be **visually differentiated** (primary/secondary hierarchy) and **labeled in a way that telegraphs the difference** — "Save draft" vs "Publish," not "Submit" vs "Submit now."

### Research: board-exam platform conventions

The USMLE-style Q-bank platforms (UWorld, AMBOSS, Kaplan) are the closest comparables. Published UX write-ups don't show a clean standard, but the recurring pattern is:

- A persistent top chrome showing block progress and a **destructive/exit** affordance (usually "End block" or a menu item, *not* a primary-colored button).
- A bottom navigation for **Previous / Next / Flag / Notes**.
- End-of-block is reached either by walking Next to the last question or by selecting the explicit exit affordance; the two paths are **visually and semantically differentiated** so the student knows which they're invoking.

**Takeaway:** a top "exit" affordance and a bottom "proceed to end" affordance can coexist, but only if they read as *different actions* — one is an early bail-out, the other is natural completion.

---

## Concern 1 — Options for the scroll shell

### Option 1A — Whole-page scroll + `position: sticky` footer (revert DEBT-360 architecture)

- Remove `h-dvh` / `flex-1 min-h-0` / `overflow-hidden` from `AppLayoutShell` and `StickyActionBarLayout`.
- Let `<main>` grow naturally with its content. The body becomes the scroll container.
- Render the action bar as a direct child of the page content with `position: sticky; bottom: 0`.
- Works on long content (footer anchors to viewport bottom while scrolling). On short content, footer sits at the natural bottom of content — which may be mid-viewport.

**Pros:** Matches the user's mental model ("simple top-down scroll"). Eliminates the inner-scroll box. The research-identified root cause (`overflow: hidden` ancestor) is fixed by construction.

**Cons:** On short content (e.g., a 2-line exam stem), the footer may sit mid-viewport rather than anchored to the bottom — which is the exact failure mode DEBT-360 cited. Needs verification on the shortest-possible question to confirm the concern was real.

### Option 1B — Whole-page scroll + `position: fixed` footer + main padding

- Same shell changes as 1A (remove `h-dvh`, remove `overflow-hidden`, let body scroll).
- Action bar becomes `position: fixed; bottom: 0; left: 0; right: 0`.
- Add `padding-bottom: var(--exam-footer-height)` to the content region so the last line is never occluded.

**Pros:** Footer is *always* anchored to viewport bottom regardless of content length — solves DEBT-360's original concern definitively, without an inner scroll box. This is the most predictable behavior and best matches "it should always just be at the bottom" from the user verbatim.

**Cons:** `fixed` is less flexible than `sticky` (ignores ancestor stacking contexts, can fight with modals/dialogs). Requires the bottom-padding reservation. Mobile safe-area inset handling needs to be re-validated.

**Adjacency to verify during implementation:** when switching to whole-page scroll, the question-change handler must explicitly reset window scroll to `(0, 0)` on every Next/Previous navigation. The current bounded-scroll shell effectively resets this "for free" because each question mounts a fresh inner scroll container. Under whole-page scroll, a user who scrolls to the bottom of a long Q1 and clicks Next would land on Q2 already scrolled past the stem. This is not a reason to reject 1B — it's a two-line `window.scrollTo({ top: 0 })` or `element.scrollIntoView()` in the question-change effect — but it MUST be in the implementation checklist.

### Option 1C — Keep current bounded shell (status quo)

- No code change.
- Document the current behavior as intentional in the decision log.

**Pros:** Zero risk. Proven to work. No regression surface.

**Cons:** The "cut off" / "claustrophobic" feeling persists. This is the option that loses the user's trust in the shell.

### Option 1D — Hybrid: whole-page scroll *except* for tall content

- Whole-page scroll at the shell level (remove `h-dvh` and `overflow-hidden`).
- Apply bounded-scroll only when content exceeds some threshold (e.g., feedback block taller than 2× viewport).

**Pros:** Best of both worlds on paper.

**Cons:** Almost certainly over-engineered. Two scroll modes is confusing. Skip unless 1A/1B both fail verification.

**Recommendation on Concern 1:** **Option 1B** (whole-page scroll + fixed footer + padding). It is the only option that (a) gives the user the top-down scroll they want, (b) keeps the footer always visible which was DEBT-360's real goal, (c) does not depend on content being tall enough for `sticky` to engage. The padding reservation is trivial; mobile safe-area handling we already solved in `StickyActionBar`.

---

## Concern 2 — Options for the dual-CTA disambiguation

### Option 2A — Drop the header `Finish exam` button entirely

- Remove the top-right `Finish exam` button in exam mode.
- The only way to end an exam is to walk Previous/Next to the last question and hit `Review & Submit`, or to reach the question navigator directly.

**Pros:** One unambiguous completion path. Matches the cleanest interpretation of board-exam convention (natural-completion only).

**Cons:** No early exit. A student who wants to bail after question 3 of 50 has to scroll through the remaining questions or go back to the dashboard. That's hostile.

### Option 2B — Differentiate by label + visual hierarchy (recommended)

- **Keep both buttons.** They represent two legitimate different intents:
  - Header button = **early exit** (student wants to stop now, submit what they have)
  - Footer button = **natural completion** (student has walked through all questions and is done)
- Rename the header button to telegraph the early-exit intent: **`Exit exam`** or **`Finish early`**. Do *not* call it `Finish exam` — that reads as synonymous with `Review & Submit`.
- Keep the footer button as `Review & Submit` (primary, filled).
- Demote the header button visually: `variant="outline"` or `variant="ghost"`, smaller weight, not primary color. It should read as "escape hatch," not "main action."

**Pros:** Preserves early-exit. Eliminates label collision. Matches the research finding that duplicate CTAs are fine when they're visually differentiated and labeled to signal different intents.

**Cons:** Two controls is still more cognitive load than one. Label must be well-chosen.

### Option 2C — Keep header, drop footer `Review & Submit` affordance

- Remove the `Review & Submit` footer swap on the last question.
- Footer just shows Previous / Mark for review on the last question.
- The only completion button is the header `Finish exam`.

**Pros:** Single completion CTA.

**Cons:** Removes the natural-completion moment from the end of the exam flow. User reaches the last question and the footer gives them nothing — they have to look up and right to find the completion button. Worst of both worlds.

### Option 2D — Context-swap (header hides on last question)

- Header `Finish exam` is present on questions 1 through N-1, then hides on question N when the footer shows `Review & Submit`.
- Only one completion affordance visible at a time.

**Pros:** Single CTA at each point in the flow.

**Cons:** The header button appearing/disappearing as you navigate feels janky. Student on question N-1 reaches for the header button, then on question N it's gone and there's a different button in a different place. Spatial consistency is valuable during timed exams.

**Recommendation on Concern 2:** **Option 2B** (rename + visually demote the header to `Exit exam` / `Finish early`, keep `Review & Submit` as the primary footer CTA on the last question). It's the option that takes the research seriously — research says duplicate CTAs are fine *as long as* they read as different intents, and 2B is the only option that makes that true.

---

## Relationship to prior debt

### DEBT-322 (archived)

DEBT-322 renamed `Review answers` → `Finish exam`. Reading its decision log, the rename was a quality-of-copy decision made without the footer-CTA context — at that time the footer did not yet show `Review & Submit` on the last question. So DEBT-322's rename was correct for its context but the subsequent footer change introduced the collision we're now documenting.

### DEBT-360 (archived)

DEBT-360's shipped resolution is the source of Concern 1. The technical claim that "pure sticky didn't keep controls visible" appears to have been misdiagnosed — the actual failure mode was almost certainly an `overflow: hidden` or insufficient-height ancestor, per the CSS research above. Revisiting that decision is not "changing our minds" — it's correcting a diagnosis with better information. The DEBT-360 archive doc should be cross-linked from this doc but not modified; the history is part of the trail.

### DEBT-362 (archived)

DEBT-362 shipped yesterday (the chevron affordance on the exam-review three-card list). The scroll-shell affects that surface too — the review rows also live inside the bounded-scroll region. Concern 1's fix will apply to the review screen by construction. No separate work needed.

---

## Open decisions (for user sign-off)

| # | Decision | Status |
|---|----------|--------|
| 1 | Which scroll-shell option? (1A / 1B / 1C / 1D) | **Open** |
| 2 | Which dual-CTA option? (2A / 2B / 2C / 2D) | **Open** |
| 3 | Does the DEBT-360 decision log need a correction note, or do we leave the archive untouched and let DEBT-363 carry the correction? | **Open** |
| 4 | Is Concern 1 priority P2 (ship soon) or P3 (tolerate)? Concern 2 is clearly P2. | **Open** |

**No implementation until these are resolved.** The doc is a decision artifact; a second pass will lock choices, a third pass will spec the implementation.

---

## Future concerns deliberately out of scope

An independent design-critique pass surfaced several adjacent UX concerns. They were evaluated and deliberately kept out of DEBT-363 to prevent scope creep. They should become their own debt items when picked up — do **not** bundle any of them into the DEBT-363 implementation PR.

### Deferred to separate debt items (real, non-overlapping)

- **Navigation guard during active exam sessions.** The global site nav (Dashboard, Practice, History, Bookmarks, Billing) remains active during an exam, which means a misclick can abandon an in-progress session. Serious exam-prep platforms either hide the nav during an active block or intercept navigation with a confirmation dialog. Session state is already persisted via DEBT-321's save-draft path, so the risk is "lost place," not "lost data" — still worth guarding. **Separate debt item.**
- **"Mark for review" lacks visible confirmation feedback.** Clicking the control produces no toast, no animation, and no immediate state change on the question navigator pill. The user cannot confirm the action registered without navigating away and back. Verify current behavior first (the navigator may be carrying state that isn't reflected in the pill styling), then a separate debt item if confirmed.

### Dissolved or partially dissolved by the DEBT-363 fix

- **"Question navigator dominates short viewports on large question sets."** For sessions with 20+ questions, the pill grid consumes most of the available scroll area. Under Option 1B (whole-page scroll), the navigator just becomes part of the natural page scroll and stops competing for a bounded viewport slice. The remaining piece — whether the navigator should collapse into a compact indicator for very large sets — is a separate design question that only makes sense to evaluate *after* the scroll-shell fix lands.

### Rejected as either out of scope or contradicting the user's stated preference

- **"Pin the question title, progress indicator, and navigator into a fixed header zone above the scroll content."** This is a three-zone layout (fixed header + scroll content + fixed footer). It directly contradicts the user's request for "simple top-down scroll from top to bottom" — it would trade one kind of viewport bounding for another. Rejected.
- **"Insert a disabled Previous button on Question 1 for spatial consistency."** Pedantry at the cost of accessibility noise. Rejected.
- **Keyboard shortcuts (A/B/C/D answer selection, arrow-key nav, Enter to submit).** Feature addition, not debt cleanup. Out of scope for a debt cycle.
- **Feature requests for two-panel layouts, in-question highlighting/annotation, NBME-style timed blocks, per-question time tracking, and submit-dialog unanswered/marked counts.** All legitimate feature ideas; none of them are *debt*. Route through product planning, not the debt register.

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-14 | Opened DEBT-363 as a decision doc, not a locked spec | Two concerns surfaced from visual review of the DEBT-362 ship; root causes include a probable misdiagnosis in DEBT-360 and a label collision introduced by DEBT-322 + subsequent footer changes. Decision before code per the documented collaboration preference. |
| 2026-04-14 | Grouped Concern 1 (scroll shell) and Concern 2 (dual CTA) into one debt item | Both live in `practice-view.tsx`, both are exam-footer-related, and both will be touched by the same file in the same PR. Splitting creates unnecessary bookkeeping. |
| 2026-04-14 | Incorporated independent design-critique findings from a Chrome-agent walkthrough | Added measured viewport ratios (3:1 desktop, 12.87:1 mobile), cross-screen scroll-model inconsistency as a second argument for the fix, and a scroll-reset-on-navigation adjacency note on Option 1B. Kept DEBT-363 scoped tight; non-overlapping findings routed to "Future concerns deliberately out of scope." |

---

## Sources consulted

- [Smashing Magazine — Designing Sticky Menus: UX Guidelines](https://www.smashingmagazine.com/2023/05/sticky-menus-ux-guidelines/)
- [LogRocket — Should navigation bars be sticky or fixed?](https://blog.logrocket.com/ux-design/sticky-vs-fixed-navigation/)
- [Adobe Blog — Ask a UXpert: What Is the Best Way to Use Fixed Elements?](https://theblog.adobe.com/ask-a-uxpert-what-is-the-best-way-to-use-fixed-elements)
- [CSS-Tricks — Dealing with overflow and position: sticky](https://css-tricks.com/dealing-with-overflow-and-position-sticky/)
- [Polypane — Getting stuck: all the ways position:sticky can fail](https://polypane.app/blog/getting-stuck-all-the-ways-position-sticky-can-fail/)
- [BrowserStack — Why CSS Position Sticky is Not Working](https://www.browserstack.com/guide/why-css-position-sticky-is-not-working)
- [UX Collective — Button differentiation done right](https://uxdesign.cc/button-differentiation-done-right-5553605ea08a)
- [Telerik — How Many CTAs Are Too Many?](https://www.telerik.com/blogs/how-many-ctas-are-too-many)
- [Forge and Smith — 7 CTA Best Practices for UX and Accessibility](https://forgeandsmith.com/blog/cta-best-practices-user-experience-accessibility/)
