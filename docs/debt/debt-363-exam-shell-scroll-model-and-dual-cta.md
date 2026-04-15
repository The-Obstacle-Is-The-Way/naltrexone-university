---
id: DEBT-363
title: Exam shell scroll model + dual-CTA disambiguation
status: Open (decision doc)
priority: P2
created: 2026-04-14
area: practice / exam
supersedes_decision_from: DEBT-360
related: DEBT-322, DEBT-360, DEBT-361, DEBT-362
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

Both resolve to the exact same `onEndSession` path and both navigate to the same intermediate destination: the pre-submit `Review & Submit` screen (`ExamReviewView`). The exam is not actually submitted from the question screen; submission happens later inside `ExamReviewView` through `onFinalizeReview` with a confirmation dialog. Source:
- `app/(app)/app/practice/components/practice-view.tsx:385` — header button click → `props.onEndSession`
- `app/(app)/app/practice/components/practice-view.tsx:203` — `onMiddleAction` resolves to `props.onEndSession` on the last question
- `app/(app)/app/practice/components/practice-view.tsx:234` — footer `Review & Submit` button click → `onMiddleAction`
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:224` — `endSessionLabel={mode === 'exam' ? 'Finish exam' : 'End session'}`
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:236-279` — actual exam submission path via `Submit exam` → confirmation dialog → `onFinalizeReview`

User reaction:

> "If there's two divergent buttons, people are gonna wonder, okay. Review and submit. Is that different than finish exam?"

That reaction is exactly the failure mode research warns about (see "Research: dual CTAs" below).

---

## Architecture audit — where did the scroll-shell come from?

### Stage map (current code)

Before evaluating Concern 1 or Concern 2, the current exam flow needs to be separated into four distinct stages. They do **not** all share the same layout shell:

1. **Active question-taking** — `PracticeSessionPageView` renders `PracticeView`, which wraps the active question stage in `StickyActionBarLayout`.
   - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:182`
   - `app/(app)/app/practice/components/practice-view.tsx:318`
2. **Pre-submit `Review & Submit` screen** — `PracticeSessionPageView` renders `ExamReviewView` in plain document flow. This stage does **not** use `StickyActionBarLayout`.
   - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:157`
   - `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:136`
3. **Post-submit review** — the exam-results renderer renders `PostExamReviewView`, which does use `StickyActionBarLayout`.
   - `app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.tsx:112`
   - `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:61`
4. **Session summary** — `SessionSummaryView` is plain document flow, not `StickyActionBarLayout`.
   - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:114`
   - `app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.tsx:51`
   - `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:46`

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
   - `<main>` is `flex-1 min-h-0` — a bounded flex region that lets child layouts consume the remaining viewport height.
   - **This matters because `StickyActionBarLayout` can fill that remaining space. It does not, by itself, prove that every stage in the app is inner-scrolling.** `SessionSummaryView` already demonstrates plain document-flow behavior under the same `AppLayoutShell`.

2. **`StickyActionBarLayout`** — `app/(app)/app/practice/components/sticky-action-bar.tsx:10`
   ```
   <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
     <div className="min-h-0 flex-1 overflow-y-auto pb-6">{children}</div>
     {actionBar ? <StickyActionBar>{actionBar}</StickyActionBar> : null}
   </div>
   ```
   - Outer wrapper: `overflow-hidden` — clips overflow and caps the shell to the bounded flex height.
   - Inner content region: `overflow-y-auto` — this is the inner scroll box the user is reacting to.
   - Sticky footer: sibling of the inner scroll region, anchored within that bounded shell.

**Net effect on the stages that use it:** scrolling a long question or a long feedback block scrolls the inner region only. The header, app chrome, and sticky footer never move. The user sees what looks like "a window within a window" — which is exactly the visual they're objecting to.

### The DEBT-360 decision-log claim

`docs/_archive/debt/debt-360-action-bar-below-fold.md:132` records:

> "Shipped a hybrid shared-shell solution instead of a pure end-of-document sticky wrapper — Pure `sticky bottom-0` on a footer that still rendered after the full content stack did not keep the controls visible."

**This claim should be revisited, but carefully.** The recorded rationale in the DEBT-360 archive is incomplete — no commit or PR comment documents what the pure-sticky attempt actually looked like or which specific CSS rule blocked it. Revisiting the decision is warranted, but this doc should not assert `overflow: hidden` was the cause without evidence.

### Does this permeate other surfaces?

Yes, but not every exam-flow stage. `PracticeView` (tutor + exam) and `PostExamReviewView` route their footers through `StickyActionBarLayout`. `ExamReviewView` does not. The bounded-scroll visual affects:

- tutor mode question-taking
- exam mode question-taking
- the post-submit review screen

---

## Research: sticky vs fixed vs document-flow footers

### CSS root cause of the DEBT-360 symptom

From CSS-Tricks, Polypane, and BrowserStack write-ups on `position: sticky` failure modes: any ancestor with `overflow: hidden`, `overflow: auto`, or `overflow: scroll` creates a new scroll context, and `sticky` sticks *within that ancestor* rather than the viewport. Fix: use `overflow: clip` instead of `overflow: hidden`, or remove overflow from the ancestor entirely. A sticky element also needs the parent to be tall enough to actually scroll before it will engage.

This is one concrete failure mode to verify if a new sticky-based shell is prototyped. It does **not** prove that DEBT-360 failed for this reason, and it does **not** change the separate limitation that an end-of-document sticky footer can still begin below the fold on long content.

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

### Option 1A — Whole-page scroll + in-flow `position: sticky` footer

- Replace the bounded `StickyActionBarLayout` shell with normal document-flow content on the stages that currently use it.
- Render the action bar in flow, after the content stack, with `position: sticky; bottom: 0`.
- The page becomes a top-down scroll surface, but the footer remains part of normal document flow.

**Pros:** Restores whole-page scroll and removes the inner scroll box entirely. If the footer reaches the viewport, `sticky` can keep it pinned while the user continues scrolling nearby content.

**Cons:** This does **not** keep the footer always visible on long content. An end-of-document sticky footer still starts below the fold until the user scrolls near it. That means 1A likely does **not** satisfy the user's stated preference or DEBT-360's original goal of keeping controls persistently visible.

### Option 1B — Whole-page scroll + `position: fixed` footer + main padding

- Replace the bounded `StickyActionBarLayout` pattern with normal document-flow content for `PracticeView` and `PostExamReviewView`.
- Keep the current `AppLayoutShell` unless implementation evidence proves a shell-level change is required; `SessionSummaryView` already demonstrates plain document-flow behavior under the same app shell.
- Render the action bar as `position: fixed; bottom: 0; left: 0; right: 0`.
- Reserve bottom space in the affected content region so the last line is never occluded.

**Pros:** Footer is *always* anchored to viewport bottom regardless of content length — solves DEBT-360's original concern definitively, without an inner scroll box. This is the most predictable behavior and best matches "it should always just be at the bottom" from the user verbatim.

**Cons:** `fixed` is less flexible than `sticky` (ignores ancestor stacking contexts, can fight with modals/dialogs). Mobile safe-area inset handling needs to be re-validated. The bottom-space reservation is also not trivial because the action bars wrap and stack differently by mode and breakpoint, so the footer does not have one stable height.

**Adjacency to verify during implementation:**

- Scroll-reset behavior on question navigation must be verified explicitly. Do **not** assume the current bounded shell resets scroll "for free" — the scroll region is a stable DOM node, and whatever current reset behavior exists is coming from question-mount side effects, not from the shell contract itself.
- Focus restoration on question navigation must be re-validated so Next/Previous still land the user at the right heading/panel boundary under whole-page scroll.
- `PostExamReviewView`'s current focus effect (`panelRef.current?.focus()`) needs to be checked against the new scroll model so focus movement does not produce disorienting page jumps.
- The fixed footer must align to the app shell's max-width and horizontal padding so it does not span edge-to-edge while content stays centered.
- The footer-height reservation must handle dynamic heights across exam mode, tutor mode, and post-submit review at mobile and desktop breakpoints.
- Browser back/forward scroll restoration needs verification because whole-page scroll changes how the browser remembers position.
- The affected browser specs and E2E tests need updates because the current test contracts assume `sticky-action-bar-layout` / `sticky-action-bar-scroll-region` markers and viewport-bounded geometry.

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

### Supplemental Option 1E — CSS Grid shell (`grid-template-rows: minmax(0,1fr) auto`)

- Keep the affected stages in a bounded shell, but replace the current flex/overflow implementation with a grid shell such as `grid-template-rows: minmax(0, 1fr) auto`.
- Let the content row own scrolling and let the footer row stay structurally separate at the bottom of the shell.

**Pros:** Technically viable. It avoids some of the flex/min-height/overflow footguns that motivated the DEBT-360 follow-up commits and can make the shell easier to reason about.

**Cons:** It still preserves a bounded-shell interaction model rather than the user's stated top-down page scroll preference. So it is worth documenting for completeness, but it is probably not the direction the user is asking for.

**Current assessment on Concern 1:** 1A is now documented accurately and is likely too weak for the stated goal; 1B remains the most direct whole-page-scroll path to verify; 1E is a technically credible bounded-shell alternative if the team decides to preserve that interaction model.

---

## Concern 2 — Options for the dual-CTA disambiguation

### What the current dual-CTA semantics actually are

The current collision is not "two different actions with confusing copy." It is "two differently labeled controls that both resolve to the same `onEndSession` handler and go to the same `ExamReviewView` stage." The actual final submission happens later in `ExamReviewView` via `Submit exam` → confirmation dialog → `onFinalizeReview`.

That means any option that wants the header button to mean something materially different from the footer button requires a **new behavior path**, not just a rename.

### Option 2A — Drop the header `Finish exam` button entirely

- Remove the top-right `Finish exam` button in exam mode.
- The only way to end an exam is to walk Previous/Next to the last question and hit `Review & Submit`, or to reach the question navigator directly.

**Behavior change:** No. This is a visibility/layout change only.

**Pros:** One unambiguous visible path into `ExamReviewView`. It eliminates the label collision without changing downstream review/submit behavior.

**Cons:** No early exit. A student who wants to bail after question 3 of 50 has to scroll through the remaining questions or go back to the dashboard. That's hostile.

### Option 2B — Keep both controls, but give the header a real early-exit behavior

- Keep the footer button as the natural path into `ExamReviewView`.
- Change the header button so it no longer calls the existing `onEndSession` review-stage path.
- Introduce a **new** handler for the header control that truly ends/submits the exam early, likely behind a confirmation dialog.
- Rename and visually demote the header control to match the new semantics (`Exit exam`, `Finish early`, or similar).

**Behavior change:** Yes. This is not a copy-only fix.

**Pros:** This is the only honest way to keep both controls while making them represent different intents.

**Cons:** Requires a new controller path, new confirmation semantics, and a product decision about whether early exit bypasses the review screen or partially reuses it.

### Option 2C — Drop the footer label swap

- Keep the existing routing exactly as it is today: the last-question middle button still resolves to `onEndSession`.
- Change the footer copy back so the middle button remains `Next` on every question, including the last question.

**Behavior change:** No. This is a copy change only.

**Pros:** Restores one consistent footer label across the active exam stage and removes one source of visible divergence.

**Cons:** It reintroduces the DEBT-361 problem: the last-question footer label no longer matches the destination screen heading or the user's sense that they are leaving the question flow.

### Option 2D — Context-swap (header hides on last question)

- Header `Finish exam` is present on questions 1 through N-1, then hides on question N when the footer shows `Review & Submit`.
- Only one completion affordance is visible at a time, but both still route to the same `onEndSession` review-stage path.

**Behavior change:** No. This is a visibility/layout change only.

**Pros:** Reduces visible CTA duplication without inventing a new early-exit behavior.

**Cons:** The header button appearing/disappearing as you navigate feels janky. Student on question N-1 reaches for the header button, then on question N it's gone and there's a different button in a different place. Spatial consistency is valuable during timed exams.

### Supplemental Option 2E — Merge the visible CTA and move early-exit behind secondary chrome

- Keep one visible primary path into `ExamReviewView`.
- Move the secondary "end now" affordance into a header overflow menu, or into a confirmation dialog launched from the header button, so the user is not presented with two competing visible CTAs on the question screen.
- If that secondary path still routes to `ExamReviewView`, this is mostly a placement/copy cleanup.
- If that secondary path is meant to truly bypass the review screen, it becomes the same kind of behavior change described in 2B and needs a new handler.

**Behavior change:** Maybe. Copy/placement only if it still routes to `ExamReviewView`; real behavior change if it becomes a true early-exit path.

**Pros:** Preserves a single visible primary CTA while still allowing an escape hatch to exist in secondary chrome.

**Cons:** Adds another chrome pattern (overflow or confirm-driven secondary path) and still requires product clarity on whether the secondary path is semantically distinct or just visually tucked away.

**Current assessment on Concern 2:** the repo facts narrow the decision space. 2A, 2C, and 2D are presentation/copy changes around one shared behavior path. 2B only makes sense if the team wants a true early-exit behavior and is willing to introduce a new handler. 2E is the cleanest "single visible CTA" option if the team wants to preserve an escape hatch without two competing visible buttons.

---

## Relationship to prior debt

### DEBT-322 (archived)

DEBT-322 renamed the header copy from `Review answers` → `Finish exam`. Reading its decision log, that was a quality-of-copy decision made before the last-question footer label changed.

### DEBT-361 (archived)

DEBT-361 introduced `Review & Submit` as the last-question footer label while preserving the existing `onEndSession` routing. Neither DEBT-322 nor DEBT-361 considered that both the header and footer controls would resolve to the same `onEndSession` handler and the same `ExamReviewView` destination. That unexamined overlap is the source of the current collision.

### DEBT-360 (archived)

DEBT-360's shipped resolution is the source of Concern 1. The technical claim that "pure sticky didn't keep controls visible" is still part of the archive trail, but the supporting evidence is incomplete. Revisiting that decision is warranted, but the correction should live here rather than by rewriting the archive doc.

### DEBT-362 (archived)

DEBT-362 shipped yesterday (the chevron affordance on the exam-review three-card list). That surface is `ExamReviewView`, which is plain document flow and does **not** live inside `StickyActionBarLayout`. Concern 1 therefore does **not** apply to DEBT-362's surface by construction; any future change to that stage would need to be a separate explicit decision.

---

## Open decisions (for user sign-off)

| # | Decision | Status |
|---|----------|--------|
| 1 | Which scroll-shell option? (1A / 1B / 1C / 1D / 1E) | **Open** |
| 2 | Which dual-CTA option? (2A / 2B / 2C / 2D / 2E) | **Open** |
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
| 2026-04-15 | Corrected DEBT-363 after an independent code audit | Fixed the stale `practice-view.tsx:233` citation, narrowed the scroll-shell claim so it no longer mis-scopes `ExamReviewView`, replaced the unsupportable DEBT-360 misdiagnosis assertion with an evidence-bounded correction, and rewrote the dual-CTA section around the actual shared `onEndSession` semantics. |

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
