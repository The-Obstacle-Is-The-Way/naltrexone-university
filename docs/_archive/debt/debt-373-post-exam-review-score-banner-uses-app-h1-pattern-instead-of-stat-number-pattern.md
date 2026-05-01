# DEBT-373: Post-Exam Review Score Banner Uses App-H1 Pattern Instead Of Stat-Number Pattern

**Priority:** P3
**Created:** 2026-05-01
**Status:** Resolved 2026-05-01 ([PR #301](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/301)).
**Source:** Manual UX walkthrough of post-exam review surface, 2026-05-01 (paired observation with [DEBT-372](./debt-372-post-exam-review-summary-button-label-divergence.md))
**Related:** [Typography Policy](../../frontend/typography-policy.md), [Pattern Registry](../../frontend/pattern-registry.md), [Frontend Standards](../../frontend/standards.md), [DEBT-372 Post-exam review summary button label divergence](./debt-372-post-exam-review-summary-button-label-divergence.md)

**Audit verified:** 2026-05-01 against `63a3fa5a`.

---

## Resolution

Shipped Option alpha in PR #301 (merge commit `93eacb33`, 2026-05-01). The post-exam review score banner now renders `Exam complete` as the semantic `<h1>`, the rounded accuracy percentage as a standalone `text-3xl font-bold font-display text-foreground` stat number, and the raw count as natural-language metadata in the description line: `"X of Y correct · Review each question with detailed feedback."`

Production changes were intentionally limited to `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx`: the old `scoreLabel` concatenation and `Score: X% (Y/Z)` app-heading line were removed. The score-banner `Card`, responsive `flex ... sm:flex-row sm:items-start sm:justify-between` layout, top and bottom `View Summary` buttons from DEBT-372, routing handlers, focus restoration, and action bar behavior were unchanged.

Verification and review state:

- Local full gate green: `pnpm typecheck`, `pnpm lint` (19 expected warn-only `nursery/noExcessiveLinesPerFile` warnings on legacy oversized tests), `pnpm test --run` 302/302 files / 2,397 tests, `pnpm test:browser` 47/47 files / 241 tests, `pnpm test:integration` 16/16 files / 97 tests, `pnpm build`, and `pnpm test:e2e` 34/34.
- Tests updated with region-scoped score-banner assertions across direct component, renderer, browser, and E2E coverage; no snapshot rewrites.
- A11y preserved: `Exam complete` remains queryable as the single level-1 heading on the post-exam review surface, the percentage is not a heading, and the description remains a paragraph.
- CodeRabbit latest-head review on `83e29769` approved with no actionable comments. Earlier CodeRabbit feedback to change the semantic heading color from `text-muted-foreground` to `text-foreground` was verified against this doc's SSOT and rejected; CodeRabbit withdrew it and recorded a learning.
- PR #301 also filed DEBT-374 as documentation only. DEBT-374 implementation remains active and is intentionally not bundled into this resolution.

---

## Review Notes

Second-opinion review on 2026-05-01 re-verified the typography and test claims against `63a3fa5a`:

- `docs/frontend/typography-policy.md:35-42` says `App page h1` uses `text-2xl` and `Stat numbers` use `text-3xl font-bold font-display`, with `"72%"` as a stat-number example. The policy does not literally prescribe the full app-h1 implementation string `font-bold font-heading tracking-tight`; that part is an implementation convention visible on app headings such as Dashboard and Session Summary.
- `docs/frontend/standards.md:281-283` independently says prominent statistics use `text-3xl font-bold font-display text-foreground`, and denser contexts may use `text-2xl`.
- `docs/frontend/pattern-registry.md:1053-1056` defines two stat-card tiers: Full (`text-3xl font-bold font-display`) for Dashboard / Session Summary and Compact (`text-2xl font-bold font-display`) for Exam Review. The compact Exam Review stat cards are not counterexamples because they still use `font-display`, not the app-heading font.
- `session-summary-view.tsx:59-82` and `dashboard/page.tsx:60-97` use the canonical full stat-number pattern. No other practice/exam stat surface using `text-2xl font-bold font-heading tracking-tight` was found; `post-exam-review-view.tsx:78-80` is the production counterexample.
- The original implementation sketch dropped the only semantic heading. The recommended fix must preserve a page/surface heading, either by making `Exam complete` the `<h1>` or by adding an equivalent accessible heading while rendering the percentage as the stat number.
- Test blast radius is wider than originally listed. Existing `Score: X% (Y/Z)` assertions appear in `practice-session-page-view-review-stage.browser.spec.tsx`, `practice-session-exam-results-renderer.test.tsx`, `practice-session-page-view-results.browser.spec.tsx`, and `tests/e2e/practice.spec.ts`. `post-exam-review-view.test.tsx` does not currently assert the score string, but this ticket should add direct component coverage for the new split percentage/count shape.

---

## Context

`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx` renders the post-exam review entry banner — the card that greets the student when they enter the per-question review flow after finishing an exam-mode session. The banner stacks three lines:

1. `Exam complete` (small caption)
2. `Score: 33% (1/3)` (large heading)
3. `Review each question with detailed feedback.` (small description)

The middle line is computed as one concatenated string at `post-exam-review-view.tsx:54`:

```ts
const scoreLabel = `Score: ${Math.round(summary.totals.accuracy * 100)}% (${summary.totals.correct}/${summary.questionCount})`;
```

…and rendered in an `<h1>` at `post-exam-review-view.tsx:78-80`:

```tsx
<h1 className="mt-1 text-2xl font-bold font-heading tracking-tight text-foreground">
  {scoreLabel}
</h1>
```

That className uses the app page h1 size from [Typography Policy § Pipeline 1](../../frontend/typography-policy.md) (`text-2xl`) plus the heading-font implementation convention used by surfaces like "Quick Practice" or "Dashboard" (`font-bold font-heading tracking-tight`) — page titles. The score line is not a page title; it is a stat. The pattern is wrong for the role.

## Why This Is Debt

- **Typography policy has a stat-number pattern, and this surface should be using it.** The policy table explicitly defines:
  | Subfamily | Pattern |
  |-----------|---------|
  | Stat numbers | `text-3xl font-bold font-display` |
  …with `"848"` and `"72%"` as example values. The current banner uses the heading pattern (`text-2xl font-bold font-heading tracking-tight`) for what is mechanically a stat (`33%`).

- **The Session Summary screen this view routes back to already does it right.** `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` renders Answered, Correct, Accuracy, and Duration as canonical stat cards:
  ```tsx
  <div className="text-sm text-muted-foreground">Accuracy</div>
  <div className="mt-2 text-3xl font-bold font-display text-foreground">
    {accuracyLabel}
  </div>
  ```
  Same goes for the Dashboard's stat tiles (`text-3xl font-bold font-display text-foreground` for "Total answered", "Overall accuracy", etc.). The post-exam review entry banner is the **only** stat-bearing surface in the practice/exam flow that uses the heading pattern instead of the stat-number pattern.

- **The single-string concatenation makes the slop worse.** Cramming `Score: 33% (1/3)` into one heading with `tracking-tight` produces a horizontally-claustrophobic line: a label (`Score:`), a percentage, a parenthetical fraction, all squished together by tightened letter-spacing. Each token would breathe better on its own visual stratum (caption / stat number / metadata line). The current shape is also redundant: `Score:` is belt-and-suspenders since the `Exam complete` subhead one line above already says what this number is, and `33%` plus `(1/3)` express the same fact in two adjacent forms.

- **No prior ticket covers this.** DEBT-283 (archived 2026-03-07) normalized supporting-copy inheritance drift. DEBT-282 (archived 2026-03-07) unified Feedback's Markdown call sites onto correct content tiers. Neither addressed Pipeline 1 stat-number compliance on the post-exam review entry banner.

## Options

### Option α (recommended): Switch to the canonical stat-number pattern; move the count into the description line as natural language

```tsx
<h1 className="text-sm font-medium text-muted-foreground">Exam complete</h1>
<div className="mt-1 text-3xl font-bold font-display text-foreground">
  {`${Math.round(summary.totals.accuracy * 100)}%`}
</div>
<p className="mt-1 text-sm text-muted-foreground">
  {`${summary.totals.correct} of ${summary.questionCount} correct · Review each question with detailed feedback.`}
</p>
```

- Drops the `Score:` label — the `Exam complete` heading already labels the role of the number below.
- Drops the `(1/3)` parenthetical from the heading — the count moves into the description line as `"1 of 3 correct"` separated by a middot from the existing instruction copy.
- Replaces `text-2xl font-bold font-heading tracking-tight` with `text-3xl font-bold font-display` — matches the typography policy's stat-number pattern and the Session Summary / Dashboard treatment.
- Removes the `scoreLabel` template-string concatenation; the percentage and the count become two different render slots.

**Pro:** Aligns the banner with the existing repo-wide stat pattern. Eliminates the horizontal squish without losing any information. Smallest defensible change that resolves the issue.
**Con:** Two more JSX nodes than today. The existing score-string assertions need hand-written updates, and `post-exam-review-view.test.tsx` should gain direct coverage for the split percentage/count shape.

### Option β: Keep `Score:` label, switch only to stat-number type and split the count off

```tsx
<h1 className="text-sm font-medium text-muted-foreground">Exam complete</h1>
<div className="mt-1 text-sm text-muted-foreground">Score</div>
<div className="mt-1 text-3xl font-bold font-display text-foreground">
  {`${Math.round(summary.totals.accuracy * 100)}%`}
</div>
<p className="mt-1 text-sm text-muted-foreground">
  {`${summary.totals.correct} of ${summary.questionCount} correct · Review each question with detailed feedback.`}
</p>
```

- Keeps an explicit `Score` caption above the stat while preserving `Exam complete` as the surface heading.
- Same stat-number treatment and same description-line move as Option α.

**Pro:** Preserves an explicit `Score` label some users may want.
**Con:** Adds another caption line to a compact banner and partially reintroduces the label/value clutter that Option α removes.

### Option γ (rejected): Keep the heading pattern, just add letter-spacing or padding

Twiddle `tracking-tight` → `tracking-normal`, add inter-token spacing or `space-x` between concatenated tokens.

**Con:** Treats the symptom, not the cause. The line still uses the heading pattern for a stat. The squish is reduced but the typographic role is still wrong, and the surface still diverges from the Session Summary / Dashboard stat treatment.

## Recommendation

Ship **Option α**. Use the typography policy's canonical stat-number pattern, drop the redundant `Score:` label (the `Exam complete` heading already labels the number), and move the raw count into the description line as natural-language metadata (`"1 of 3 correct"`). This is the smallest defensible change that puts this surface on the same Pipeline 1 stat pattern the rest of the practice/exam flow already follows while keeping the surface semantically headed.

If product disagrees and wants an explicit `Score` label visible, Option β is acceptable — but only by accepting a denser three-line heading/stat/caption stack.

Do **not** ship Option γ — twiddling letter-spacing or padding hides a typographic role mismatch that the policy already addresses.

## Constraints

- **Pipeline 1 only.** This is hardcoded UI text, not Markdown content. Do not change Pipeline 2 (`<Markdown>`) call sites or content-tier classNames as part of this ticket.
- **Do NOT make DEBT-372 a prerequisite for this fix.** The button label divergence and the score-banner pattern misuse are paired observations from the same walkthrough but are independently correctable. Separate PRs remain the default for product-review clarity; a single small polish PR is acceptable only if product explicitly approves both recommendations and the commits/tests stay easy to review.
- **Do NOT change `summary.totals` shape, `accuracy` rounding, or `questionCount` derivation.** This is a presentation-layer fix; the data path stays identical.
- **Do NOT replace the `Card` wrapper, `rounded-2xl`, `p-4`, `shadow-sm`, or the `flex … sm:flex-row sm:items-start sm:justify-between` layout.** Those govern the responsive layout and the right-aligned `View Summary` button slot, both of which DEBT-365 / DEBT-372 already touched. Keep them.
- **Do NOT leave the post-exam review surface without a semantic heading.** Today the score string is the `<h1>`. If the percentage becomes a stat `<div>`, `Exam complete` (or an equivalent accessible heading) must take over the heading role.
- **Do NOT promote a new shared "stat banner" component during this fix.** Two callers (Dashboard tiles, Session Summary) plus this one banner is exactly three sites, but the Dashboard and Session Summary use a multi-stat-card grid while this banner is a single-stat header. Different layouts, same typographic primitive. Helper extraction across them would be premature; revisit if a fourth single-stat-banner caller appears.
- **Update test assertions intentionally.** Existing concatenated `Score: X% (Y/Z)` assertions live in `practice-session-page-view-review-stage.browser.spec.tsx`, `practice-session-exam-results-renderer.test.tsx`, `practice-session-page-view-results.browser.spec.tsx`, and `tests/e2e/practice.spec.ts`. Add or update direct component coverage in `post-exam-review-view.test.tsx` so the percentage stat slot and the `"X of Y correct"` description metadata are asserted by hand; do not silently accept snapshot rewrites.

## Why P3

The surface ships, the score is correct, the user can read it. The cost is one moment of "this looks crammed" friction per exam completion plus a documented typographic-role inconsistency with the rest of the practice/exam flow. Same severity as the other recent post-exam-review polish tickets (DEBT-359, DEBT-361, DEBT-362, DEBT-365 — all P3 copy/layout cleanups).

## Verification

- After the change: `rg "Score: " app/ components/` returns zero hits in the rendered review-entry banner. The percentage renders alone in a `text-3xl font-bold font-display` node; the count renders as `"X of Y correct"` in the description line.
- `pnpm test --run` and `pnpm test:browser` pass with hand-written copy assertions reflecting the split shape (no snapshot blob rewrites).
- Manual visual check on a 3-question exam: `Exam complete` heading/caption above, single percentage in stat-number type, description line below carrying both the count metadata and the existing "Review each question with detailed feedback." instruction. Should match the typographic feel of the Session Summary stat cards the user has already seen.
- No regression in mobile responsive layout (`flex-col` → `sm:flex-row` with the right-aligned button slot stays intact).
- Typography policy compliance status (`docs/frontend/typography-policy.md` § Current Compliance Status) updated in the same PR if a compliance row needs adding for this surface.
