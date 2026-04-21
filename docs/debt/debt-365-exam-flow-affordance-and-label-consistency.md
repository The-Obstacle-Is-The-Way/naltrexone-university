---
id: DEBT-365
title: Exam flow affordance and label consistency pass
status: Open (Concern 2 deferred only; 3A + 5A shipped 2026-04-21; Concerns 1, 4, 6, and 7 resolved)
priority: P3
created: 2026-04-17
area: practice / exam / post-exam review / session summary
related: DEBT-363, DEBT-364, DEBT-330, DEBT-359
discovered_via: Independent Chrome-agent UX audit on 2026-04-17 (exam mode, 3 questions, desktop)
---

# DEBT-365: Exam flow affordance and label consistency pass

**Priority:** P3
**Status:** Open — only Concern 2 remains active, deferred pending a product naming call. Concern 3A and 5A refined shipped on 2026-04-21; Concerns 1, 4, 6, and 7 are resolved.
**Created:** 2026-04-17
**Affected surfaces:** `PracticeView` (exam mode), `ExamReviewView`, `PostExamReviewView`, `SessionSummaryView`
**Adjacent unchanged surface:** tutor mode (out of scope for this pass)

---

## Why this debt exists

A Chrome-agent UX audit on 2026-04-17 walked the complete exam flow (Active Exam → Review & Submit → Submit → Post-Exam Review → Session Summary → Review Answers loop) and produced a finding list. Two findings (dual CTA, re-entry cursor) are already captured in DEBT-363 Concern 2 and DEBT-364. Six other findings — all consistent with the same "visual/label consistency across exam-flow stages" problem space — were not captured by any existing debt item.

Rather than fragmenting these into six standalone debts, they are bundled here because:

1. They all live within the same four-stage exam flow.
2. Several of them interact — for example, the `Review Answers` vs `View Summary` weight asymmetry is related to whether `View Summary` belongs in the top-right at all (Concern 5 and Concern 6 overlap in the chrome pattern).
3. Any implementation pass that touches exam-flow footers/labels should consider the whole flow at once, not one button at a time — that is exactly the pattern that produced the current inconsistency (DEBT-322 renamed one thing, DEBT-361 renamed another, DEBT-330 shuffled a third, and the sum became inconsistent).

Each concern has an independent decision and can ship in its own PR if that is the team's preference. They are bundled for analysis, not for delivery.

---

## Concerns

### Concern 1 — Cross-stage verb inconsistency on "end of list" CTAs

**Historical observation (2026-04-17).** The same structural action ("you're at the last item in this list, proceed to the next stage") used three different verbs across three stages:

- **Active exam Q3 footer:** `Review & Submit`
- **Post-exam review Q3 footer:** `Finish review`
- **Active exam header (all Qs):** `Finish exam`

Sources:
- `app/(app)/app/practice/components/practice-view.tsx:239` — footer last-question label
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:267` — `endSessionLabel` derivation
- `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:178-186` — `Finish review` fallback when no `nextRow`

**Why it feels wrong.** A student walking through the four stages sees "Review & Submit" when finishing the active exam, "Submit exam" on the pre-submit screen, and "Finish review" on the post-exam review. Three different verbs for three different "you're done with this stage" moments. Each verb was chosen locally and correctly for its own stage; together they read as lack of a voice.

**Options.**

- **1A — Unify to a single verb family** (e.g., `Finish N`, where N is the stage: `Finish exam`, `Finish review`, `Finish session`). Pros: clear pattern. Cons: requires coordinating label changes across three stages, and `Review & Submit` is specifically descriptive of what happens next (you review, then submit); replacing it with `Finish exam` loses that information.
- **1B — Keep descriptive verbs but document the pattern.** Each button tells the user what the next screen is: `Review & Submit` (going to review), `Submit exam` (submitting), `Finish review` (returning to summary). Lock the verb choice as intentional and document it so future changes do not drift. Pros: preserves information density. Cons: codifies the current inconsistency.
- **1C — Defer until DEBT-363 Concern 2 lands.** DEBT-363 Concern 2 Option 2A (drop the `Finish exam` header button) removes one of the three labels from the equation, at which point the remaining two (`Review & Submit`, `Finish review`) may feel less chaotic by virtue of being the only two. Pros: avoids pre-emptive churn. Cons: delays until DEBT-363 Concern 2 resolves.

**Resolution (2026-04-20).** DEBT-363 Concern 2A removed the `Finish exam` header in [PR #281](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/281). The remaining verbs — `Review & Submit`, `Submit exam`, and `Finish review` — describe distinct destinations, so this concern closes with no further code change.

### Concern 2 — `Mark for review` vs `Bookmark`: same slot, different labels, unclear relationship

**Observation.** The active-exam footer has a `Mark for review` button in the same spatial slot where the post-exam review footer has a `Bookmark` button. Different labels, different semantics (flag-for-this-session vs persist-across-sessions), but the visual placement is nearly identical.

Sources:
- `app/(app)/app/practice/components/practice-view.tsx` — active exam footer, `Mark for review`
- `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:188-199` — post-exam review footer, `Bookmark` / `Remove bookmark`

**What the two actually do.**

- `Mark for review` (active exam): flags the current question so it shows a pill indicator on the question navigator. Session-scoped. Exists so students can skip and return during a timed/paced exam.
- `Bookmark` (post-exam review): persists the question into the user's global bookmark list (Bookmarks navbar entry). Cross-session.

These are different actions. The problem is not that they share a label — the problem is that **nothing in the UI signals the difference.** A student who sees `Mark for review` during the exam and later sees `Bookmark` after submitting has no way to know whether they are the same underlying concept or not. The audit's "flag as untested whether Bookmark toggles to Remove bookmark or persists across navigation" is a direct expression of this confusion.

**Options.**

- **2A — Rename `Mark for review` → `Flag this question` (or similar, session-scoped verb).** Breaks the surface similarity and telegraphs "this is a session-local action." Cons: introduces yet another verb into the flow.
- **2B — Rename `Bookmark` (post-exam) → consistent verb, e.g., `Save` or `Keep`.** Aligns with broader product language if the Bookmarks feature has a canonical verb elsewhere. Audit whether `Bookmarks` nav entry uses `Bookmark` as a verb or noun first.
- **2C — Surface the state visually on the navigator pill during the exam** so `Mark for review` has visible feedback, and the difference from `Bookmark` becomes obvious because only `Bookmark` persists past the exam.
- **2D — Leave labels, add microcopy.** Tooltip or `aria-describedby` hint on each button explaining the scope. Pros: cheap. Cons: microcopy is rarely read; this is a bandaid.

**Leaning:** 2A + 2C (rename + surface state). Requires product confirmation on the verb.

### Concern 3 — Button order and grouping discipline across exam-flow footers

**Observation.** The audit captured different button groupings on structurally identical footers:

- **Active exam Q2 footer:** `Previous | Next | Mark for review` (three buttons clustered together)
- **Post-exam review Q2 footer:** `Previous | Next | … | Bookmark` (`Bookmark` right-aligned with `sm:ml-auto`, separated from the navigation cluster)

Sources:
- `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:155-200` — post-exam review uses `sm:ml-auto` on `Bookmark`
- `app/(app)/app/practice/components/practice-view.tsx` — active exam footer groups all three together

DEBT-330 (archived, 2026-03-21) explicitly grouped `Previous` and `Next/Finish review` ahead of `Bookmark` in the post-exam review with desktop trailing separation. That decision was made for the post-exam review in isolation and was not propagated to the active exam footer.

**Options.**

- **3A — Apply DEBT-330's grouping to the active exam footer.** `Previous | Next` clustered, `Mark for review` right-aligned. Preserves the Navigation-primary / Metadata-secondary distinction DEBT-330 articulated. This is the simplest move.
- **3B — Walk back DEBT-330 and re-cluster the post-exam review.** Unlikely — DEBT-330's rationale was sound; unclustering `Bookmark` from nav was intentional.
- **3C — Define an exam-flow footer layout contract** and apply it uniformly. Scope: document the canonical `[Prev] [Next/Finish] ... [Metadata buttons]` pattern and enforce it via a shared layout component. Bigger, but prevents future drift.

**Leaning:** 3A immediately, 3C as a follow-up cleanup if the pattern sticks.

### Concern 4 — Session Summary question rows under-signal that they are interactive

**Observation.** Two adjacent stages present question-row lists with related but not identical affordances:

- **Review & Submit (Stage 2):** each row is a clickable semantic button with a right-chevron, navigating to that question. DEBT-351 + DEBT-362 established this pattern.
- **Session Summary (Stage 4):** each available row is already interactive today, but through `SessionBreakdownList`'s inline button/link branch with hover/focus states and no trailing chevron.

The visual similarity is still a trap, but for a narrower reason than the audit reported. A student who just learned "rows-with-questions are tappable" on the Review & Submit screen will find that Session Summary rows *do* open targeted review, but they do so with materially weaker affordance weight than the whole-card + chevron Stage 2 pattern.

**Historical context.** DEBT-316 (2026-03-16) added a breakdown row CTA to Session Summary, and the current branch confirms it did not regress:

- `app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.tsx:52-63` — summary route passes `onOpenReviewQuestion={input.onReenterPostExamReview}`
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:104-112` — `SessionSummaryView` forwards that callback into `SessionBreakdownList`
- `app/(app)/app/shared/components/session-breakdown-list.tsx:38-49` — available summary rows render as `<button>` when `onOpenQuestion` exists
- `app/(app)/app/shared/components/session-breakdown-list.tsx:41-43` — summary rows already have hover/focus states, but no trailing chevron / whole-card treatment

The audit misread current behavior. The remaining question is affordance weight, not whether the targeted-review path exists.

**Options.**

- **4A — Keep the current targeted-review path but add the same chevron/whole-row affordance** so the existing interactivity is obvious. Pros: consistent affordance, uses the already-wired code path. Cons: adds visual weight to a terminal summary surface that may intentionally want to feel calmer than Stage 2.
- **4B — Visually differentiate Session Summary rows** so they don't read as clickable — e.g., remove the card-style chrome, use a plainer list layout, or make the chips large enough to be the focal point. Pros: prevents the affordance trap. Cons: may feel like a downgrade in visual weight.
- **4C — Verification complete; interactivity is not the problem.** Any follow-up should be re-scoped as affordance-weight polish, not as a broken or missing targeted-review path.

**Leaning:** 4C (verification complete; re-scope before implementation).

### Concern 5 — Summary ↔ post-exam review round-trip weight asymmetry

**Observation.** The two directions of the Summary ↔ review loop use different visual weights:

- **Summary → Review:** primary button `Review Answers` (filled, prominent, bottom-center of summary).
- **Review → Summary:** ghost/text-link `View Summary` (top-right corner of the post-exam review card, subtle).

Going in is heavy; coming out is a whisper. DEBT-350 shipped the loop itself; neither direction's visual weight was explicitly decided.

Sources:
- `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:85-93` — `View Summary` as `Button variant="ghost"` on the review header card
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` — `Review Answers` primary button (verify variant)

**Why this matters.** Once a student has seen the review, they cycle between Summary and Review to double-check specific questions. If one direction is visually dominant and the other is visually hidden, the cycle feels one-way — which is exactly what the audit noted: "going in is easy, coming out is visually hidden."

**Options.**

- **5A — Promote `View Summary` to primary or at least `variant="outline"` in the post-exam review,** matching the visual weight of `Review Answers`. Decision: does it live in the top-right header card or in the bottom footer? Leaning footer, alongside `Previous`/`Next`/`Bookmark`, because that is where students already reach for navigation buttons.
- **5B — Demote `Review Answers` on the Session Summary to match `View Summary`'s ghost weight.** Unlikely — the summary is the terminal screen and `Review Answers` is its primary affordance.
- **5C — Rework the top-right placement convention across both stages.** Either both have a top-right chrome CTA or neither does. Ties into Concern 6.

**Refined decision (2026-04-17, after independent Codex review):** Promote the visual weight of `View Summary` **in the existing top-right position** — switch from ghost/text-link to `variant="outline"` (or similar) so it reads as a proper button, not a header afterthought. **Do NOT move it into the footer.** After PR #280, both `PracticeView` and `PostExamReviewView` render in plain document flow, which means the `bottom-action-bar` can land below the fold on long feedback content (asserted by `expectBottomActionBarBelowFold` in `tests/e2e/practice.spec.ts:56-70` and exercised in `tests/e2e/practice.spec.ts:305-344`). Moving the escape-to-summary CTA below the fold would trade a visual-weight problem for a discoverability problem, and a more serious one — on a dense explanation block, the student now has to scroll past everything to go back to summary. Keeping `View Summary` pinned at the top of the review card preserves always-visible exit regardless of content length, which is the real requirement.

### Concern 6 — Top-right chrome used inconsistently across post-exam stages

**Observation.** Post-exam review uses a top-right `View Summary` button on its header card. Session Summary has nothing in the equivalent top-right position. The two stages are peer substages of the same `examResultsSubstage` state machine; the top-right should either be used consistently or not at all.

Related to Concern 5 — if `View Summary` moves to the post-exam review footer (Concern 5 Option 5A), the top-right of the post-exam review becomes empty and Concern 6 is partially resolved.

**Options.**

- **6A — Drop the top-right CTA from both stages.** Keep the chrome clean; move navigation affordances into the bottom action bar where the existing `bottom-action-bar` testid already lives.
- **6B — Add a symmetric top-right CTA to Session Summary** (e.g., `Review Answers` as a header affordance in addition to the bottom primary button). Adds visual redundancy; DEBT-363 Concern 2 just argued against redundant CTAs in the active exam, so this would be inconsistent with that decision.
- **6C — Keep current asymmetry and document it as intentional.** Hard to justify without a reason.

**Refined decision (2026-04-17, after independent Codex review):** **Option 6C — keep the asymmetry; it is intentional given task-shape differences.** The two stages are peer substages of the same state machine, but their tasks are not symmetric: post-exam review is a long-form read with dense feedback that needs a top-of-content escape hatch that does not require scrolling; Session Summary is a short terminal screen where the primary affordance is correctly bottom-anchored. Different task shapes justify different chrome. Combined with Concern 5's refinement, `View Summary` stays top-right (promoted weight), Session Summary keeps no top-right CTA, and the asymmetry is documented as deliberate rather than drift.

### Concern 7 — Post-exam review Next/Previous scroll-reset

The audit reported: *"After clicking Next in the post-exam review, the new question loaded but the page did not scroll to the top of the new question — the viewport stayed near the bottom of the prior feedback."*

This should have been fixed by PR #280 (DEBT-363 Concern 1). The code at `post-exam-review-view.tsx:60-70` reads:

```ts
useEffect(() => {
  if (focusedQuestionId === null) return;
  const panel = panelRef.current;
  focusElementWithoutScroll(panel);
  if (!shouldRestorePanelRef.current) return;
  shouldRestorePanelRef.current = false;
  panel?.scrollIntoView({ block: 'start' });
}, [focusedQuestionId]);
```

And `navigateToQuestion` sets `shouldRestorePanelRef.current = true` before changing the question, so `Next`/`Previous` clicks should trigger `scrollIntoView`. The `tests/e2e/practice.spec.ts:305-344` E2E test covers this explicitly.

**Verification result (2026-04-21).** Local Chromium verification on dev head confirmed the shipped behavior: `Next`/`Previous` in post-exam review restores the panel to the top of the newly focused question, matching the existing E2E coverage in `tests/e2e/practice.spec.ts`. The audit observation was not reproducible, so no DEBT-366 was filed.

---

## Implementation scope (if all concerns ship together)

- `app/(app)/app/practice/components/practice-view.tsx` — active exam footer grouping (Concern 3A)
- `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx` — promote `View Summary` visual weight in place (top-right of the review summary card, switch from ghost to outline style). Do NOT relocate to footer (Concern 5 refined decision). Concern 6 keeps the current asymmetric top-right chrome intentionally (6C refined decision).
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` / `app/(app)/app/shared/components/session-breakdown-list.tsx` — no change required on the current branch. Rows are already interactive and route through the targeted `onReenterPostExamReview(questionId)` path. If product re-opens Concern 4 as an affordance-weight change (e.g., adding a chevron or clearer hover state), the change is localized to `SessionBreakdownList`.
- `app/(app)/app/practice/components/practice-view.tsx` label (Concern 2A rename, if product re-opens the deferred naming work)
- Shared exam-flow footer layout contract (Concern 3C, optional follow-up)
- `docs/practice-engine/interaction-contracts.md` — update label references and footer layout description
- Browser specs + E2E: re-assert the new label/layout contracts

Each concern can ship independently. Bundling is a delivery choice.

---

## What this debt does NOT cover

- **DEBT-364** (re-entry cursor persistence) — still lives in DEBT-364. DEBT-365 does not touch the cursor mechanics.
- **Tutor mode affordances** — this pass is exam-mode-scoped. A parallel audit for tutor mode can open a separate item if needed.
- **Further copy unification beyond the shipped `Review & Submit` / `Submit exam` / `Finish review` set** — DEBT-365 now treats those verbs as intentional because each names a distinct destination.
- **Accessibility audit of the exam flow** — color contrast, focus order, ARIA landmarks. A real accessibility pass would find more. Out of scope here; file separately if prioritized.

---

## Relationship to prior work

### DEBT-322 (archived)

Renamed header copy from `Review answers` → `Finish exam`. That historical decision later fed into the Concern 1 / Concern 2 analysis and was superseded in exam mode by DEBT-363 Concern 2A, which removed the header CTA entirely.

### DEBT-330 (archived)

Set the post-exam review footer grouping (`[Prev][Next/Finish] ... [Bookmark]`). Concern 3A ships the same grouping pattern onto the active exam footer.

### DEBT-351 / DEBT-362 (archived)
Made Review & Submit rows whole-card semantic buttons with a trailing chevron. Concern 4 asks whether Session Summary rows should follow the same pattern or visually differentiate from it.

### DEBT-359 (archived)
Renamed `Back to Practice` → `New Session` and `Review your answers` → `Review Answers` on the Session Summary. Concern 5 depends on `Review Answers` being the stable primary CTA name.

### DEBT-363 (resolved 2026-04-20)
Both concerns shipped: Concern 1 (document-flow shell, PR #280) and Concern 2A (drop `Finish exam` header in exam mode, PR #281). That unblocked DEBT-365 Concern 1, which closes as a no-op because the remaining verbs now describe distinct destinations.

### DEBT-364 (resolved 2026-04-21)
Cursor-persistence fix shipped in PR #282. Untargeted Summary → Review Answers re-entry now resets to the first available row. DEBT-365 does not touch cursor mechanics; this relationship is historical only.

---

## Severity rationale

**P3** — the only remaining work is a deferred naming/iconography call around `Mark for review` vs `Bookmark`.

- No data loss, no broken navigation, and the shipped footer-grouping / `View Summary` weight issues are resolved.
- The remaining concern is latent semantic confusion between a session-scoped flag and a persistent bookmark.
- Product naming and iconography need to be decided together; that is follow-up polish, not a blocker.

---

## Open decisions

| # | Concern | Decision | Status |
|---|---------|----------|--------|
| 1 | Concern 1 verb unification | 1A / 1B / 1C | **Resolved 2026-04-20.** Unblocked by DEBT-363 Concern 2A / [PR #281](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/281). Remaining verbs (`Review & Submit`, `Submit exam`, `Finish review`) each describe a distinct destination, so no further change is needed. |
| 2 | Concern 2 `Mark for review` vs `Bookmark` | 2A / 2B / 2C / 2D | **Deferred 2026-04-17 — re-open as P3 follow-up.** Different actions (session-flag vs permanent-save) that happen to share a footer slot. Fixing correctly requires product call on naming + iconography. Latent confusion, not blocking; parked. |
| 3 | Concern 3 footer grouping | 3A / 3C | **Shipped 2026-04-21 → 3A.** The active exam footer now right-aligns `Mark for review` in a trailing metadata group so it matches the DEBT-330 post-exam review pattern. 3C remains an optional cleanup follow-up. |
| 4 | Concern 4 Session Summary rows | 4A / 4B / 4C | **Resolved 2026-04-17 → 4C.** Verification showed the rows were already interactive through `SessionBreakdownList` and targeted `onReenterPostExamReview(questionId)`. Any future work is affordance-weight polish, not a missing path. |
| 5 | Concern 5 View Summary weight | 5A / 5B | **Shipped 2026-04-21 → 5A refined.** `View Summary` is promoted in place to an outline button in the existing top-right header position. It stays out of the footer so the escape hatch remains visible even when long feedback pushes the bottom action bar below the fold. |
| 6 | Concern 6 top-right chrome | 6A / 6B / 6C | **Resolved 2026-04-21 as a shipped no-op → 6C.** The top-right asymmetry is intentional: post-exam review needs an always-visible escape hatch at the top of long-form content, while Session Summary does not. |
| 7 | Concern 7 scroll reset verification | file new concern if reproducible | **Resolved 2026-04-21.** Dev-head browser verification confirmed that post-exam review question navigation restores the viewport to the top of the focused panel, so no DEBT-366 was filed. |

**Concern status:** 1 deferred (2), 2 shipped (3A, 5A refined), 4 resolved/no-op (1, 4, 6, 7).

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-17 | Opened DEBT-365 after independent Chrome-agent UX audit | Six audit findings fell outside DEBT-363 and DEBT-364 coverage. Bundling as multi-concern debt because all six live in the same exam-flow affordance space and share implementation surface. |
| 2026-04-17 | Decomposed findings into 6 concerns + 1 verification item | Each has an independent decision. Bundling is for analysis, not delivery. |
| 2026-04-17 | Flagged scroll-reset as verification-first | PR #280 already shipped the fix and E2E covers it; the audit observation may be a viewport artifact. No new debt until confirmed. |
| 2026-04-17 | Verified Concern 4 against the current branch | `SessionSummaryView` still routes available rows through `SessionBreakdownList`, which renders interactive button rows when `onOpenQuestion` is supplied. The audit misread the current state; the remaining question is affordance weight, not missing interactivity. |
| 2026-04-17 | Refined Concerns 5 and 6 after independent Codex review | Codex flagged that moving `View Summary` into the document-flow footer (original 5A / 6A) would push the escape-to-summary affordance below the fold on long post-exam review content, trading one problem for a worse one. Refined: Concern 5 → promote weight in the existing top-right position (outline style); Concern 6 → keep current top-right asymmetry as intentional given task-shape differences. Always-visible exit beats chrome symmetry. |
| 2026-04-17 | Locked Concerns 1, 3, 5, 6; deferred 2; verification-resolved 4; verification-only 7 | Product-design pass after independent Chrome-agent UX audit, later refined after Codex review. Decisions favor: shipping the obvious consistency wins (3A, 5A refined), deferring the ambiguous semantic work (`Mark for review` vs `Bookmark` needs product naming call), deferring Concern 1 until DEBT-363 Concern 2A lands, documenting Concern 6's top-right asymmetry as intentional, and requiring manual reproduction before filing the scroll-reset as shipped debt (Concern 7). Keeps scope tight and avoids pre-emptive churn. |
| 2026-04-20 | Closed Concern 1 without new code after PR #281 | DEBT-363 Concern 2A removed the `Finish exam` header, leaving `Review & Submit`, `Submit exam`, and `Finish review` as three distinct destination labels rather than inconsistent duplicates. |
| 2026-04-21 | Shipped Concern 3A and Concern 5A refined | `PracticeView` now groups primary navigation separately from `Mark for review`, and `PostExamReviewView` promotes the existing top-right `View Summary` control from ghost to outline without moving it into the below-the-fold footer. |
| 2026-04-21 | Closed Concern 7 after dev-head verification | Local Chromium verification confirmed that post-exam review `Next`/`Previous` navigation scrolls the focused panel back into view, matching the existing E2E contract. |

---

## Sources consulted

- Independent Chrome-agent UX audit of the exam flow, 2026-04-17 (3-question exam mode walk, desktop viewport)
- `docs/_archive/debt/debt-363-exam-shell-scroll-model-and-dual-cta.md` (resolved 2026-04-20)
- `docs/_archive/debt/debt-364-post-exam-review-reentry-cursor-persistence.md` (resolved 2026-04-21)
- `docs/_archive/debt/debt-330-review-action-bar-bookmark-placement.md`
- `docs/_archive/debt/debt-322-exam-action-bar-ux-polish.md`
- `docs/_archive/debt/debt-351-exam-review-submit-affordance-cleanup.md`
- `docs/_archive/debt/debt-362-review-submit-screen-affordances.md`
- `docs/_archive/debt/debt-359-session-summary-cta-labels.md`
