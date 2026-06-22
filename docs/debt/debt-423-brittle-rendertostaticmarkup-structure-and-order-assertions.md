# DEBT-423: Brittle Raw-Markup & DOM-Order Assertions in `renderToStaticMarkup` Tests

**Status:** Open
**Priority:** P3
**Date:** 2026-06-21
**Owner:** Testing
**Source:** Saved session note — surfaced while doing an E2E copy/wording update; the author noticed the *real* fragility was not the wording assertion being changed but a separate class of leftover `renderToStaticMarkup` assertions.

> Saved note (verbatim):
>
> *"I found the real weak spot: not the E2E wording update, but some leftover render-to-static-markup tests that still assert raw HTML fragments and string order. That's the kind of thing that passes today and breaks on harmless markup refactors, so I'm tightening those now instead of just blessing them."*

**Related (all resolved — this is the uncovered sibling):**
- [DEBT-153](../_archive/debt/debt-153-brittle-css-class-string-assertions.md) — brittle CSS **class-string** assertions in `renderToStaticMarkup` tests
- [DEBT-369](../_archive/debt/debt-369-feedback-test-brittle-presentational-token-assertions.md) — brittle presentational-**token** assertions in `Feedback.test.tsx`
- [DEBT-271](../_archive/debt/debt-271-structural-ast-test-brittleness.md) — structural/AST-coupled test brittleness (Drizzle object shape)
- [.claude/rules/testing.md](../../.claude/rules/testing.md) — "Prefer stable markers (role, visible text, href, data-testid)"; "Avoid asserting full space-delimited class strings for purely presentational styles"

---

## Why this note was worth saving

DEBT-153 and DEBT-369 paid down one flavor of `renderToStaticMarkup` brittleness — **Tailwind class-string / presentational-token** assertions — and were both resolved. Neither touched a second, distinct flavor that lives in the same test layer:

1. **Raw HTML tag/structure fragments** — `expect(html).toContain('<main id="main-content"')`, `toContain('<html')`, `toContain('<fieldset')`, `toContain('<h1')`, `toContain('class="dark "')`, `toContain('style="color-scheme:dark"')`, and the regex `toMatch(/<button[^>]*disabled=""[^>]*>Submit<\/button>/)`.
2. **DOM string-order assertions** — comparisons of `html.indexOf('A')` vs `html.indexOf('B')` to assert that one element renders *before* another in the serialized markup.

This is exactly the gap the note flags: these pass today but break on a **behaviorally inert markup refactor** — renaming a wrapper tag, wrapping content in an extra `<div>`, reordering attributes, swapping `<section>` for `<div>`, or moving a sibling above another in source while the *visual/accessible* output is unchanged. The class-string cleanups never covered the structure/order dimension, so it was never filed. The note is the breadcrumb that says: *this sibling exists, don't just re-bless it the next time it breaks.*

This is **test-quality debt, not a bug.** The tests are green and do catch real removals. The cost is refactor friction and false confidence (asserting a `<main>` tag exists in a string is not the same as asserting the accessible landmark works).

## Scope (verified 2026-06-22)

**Precise totals (re-grepped on the current branch):** **22** rendered-markup `indexOf`-order assertions across **7** test files (Table A); **24** raw tag/structure-fragment assertions across **16** test files (Table B), after excluding the lone SQL false positive at `src/adapters/repositories/drizzle-stripe-event-repository.test.ts:410` (25 / 17 including it). The verdicts below were **re-audited against each source component** (not just the test): rating-after-action-bar, the `beforeQuestionCard` slot, the marketing hero "decision sequence", and the history backend-order test are all genuine behavioral contracts → **Keep, but harden** (express the order via parsed-DOM node order), **not** Relax.

### A. String-order (`indexOf`) assertions

| File | Lines | Asserts order of… | Verdict |
|------|-------|-------------------|---------|
| `app/layout.test.tsx` | 92–100 | `<html>` before `<main>`, `class="dark "` / `style="color-scheme:dark"` before `<main>` | **Relax** — the *behavioral* guarantee is "forced dark applied on `<html>`"; tag-position math is incidental. Assert the `<html>` attributes directly (already done at 95–96), drop the positional `indexOf` math. |
| `app/(app)/app/history/page.test.tsx` | 469–471, 548–550 | page renders the **backend-provided** row order faithfully (test: "…renders backend order") | **Keep, but harden** — the contract is "render the server's row order, do **not** client re-sort", so render order *is* the behavior. Assert the order of stable DOM nodes (row `data-testid` / accessible text in document order) instead of substring `indexOf` into the raw string. |
| `app/(app)/app/practice/components/practice-view-answer-feedback.test.tsx` | 264–265 | rating renders **after** `data-testid="bottom-action-bar"` | **Keep, but harden** — rating-after-action-bar is a deliberate UX contract (DEBT-405 / Pattern Registry F-9 "Post-Action Rating Footer"; the rating must *follow* the action bar, not gate it). DEBT-405's own position tests were explicitly "hardened against `indexOf` false positives." Assert the action bar precedes the rating fieldset via parsed-DOM node order, not raw-string `indexOf`. |
| `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx` | 294–295 | rating renders **after** `data-testid="bottom-action-bar"` | **Keep, but harden** (same DEBT-405 / F-9 contract). |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | 1024–1025 | rating renders **after** `data-testid="bottom-action-bar"` | **Keep, but harden** (same DEBT-405 / F-9 contract). |
| `components/question/question-surface-body.test.tsx` | 162–163 | `beforeQuestionCard` slot renders before the stem | **Keep, but harden** — `beforeQuestionCard` is a named slot prop (`question-surface-body.tsx:20`) deliberately rendered ahead of the card; the order is a slot contract, not cosmetics. Assert the slot node precedes the stem node via parsed-DOM order, not `indexOf`. |
| `components/marketing/marketing-home.test.tsx` | 104–111 | hero "intended decision sequence" (pill → heading → subtitle → CTAs → credibility) | **Keep** — the test ("renders hero content in the intended decision sequence") is a deliberate content-order contract and **already** parses the DOM and reads `section[aria-label="Hero"]` `textContent` (not raw HTML), so it is already resilient to markup refactors. Leave as-is, or tighten to visible reading-order of stable nodes. Downgrade to Relax **only** on an explicit owner decision that hero order is no longer a contract. |

### B. Raw HTML tag/structure fragments (`toContain('<…')` / tag regex)

| File | Line(s) | Fragment | Verdict |
|------|---------|----------|---------|
| `app/not-found.test.tsx` | 14 | `<main id="main-content"` | **Keep as behavior** — but assert via the skip-link target / landmark role, not the literal tag string. |
| `app/error.test.tsx` | 25 | `<main id="main-content"` | Keep-as-behavior (relax form). |
| `app/global-error.test.tsx` | 28–29 | `<html`, `<head` | Keep — `global-error` must render its own document shell; this is a real contract. Consider a comment marking it intentional. |
| `app/sign-up/[[...sign-up]]/page.test.tsx` | 35 | `<main id="main-content"` | Keep-as-behavior (relax form). |
| `app/(app)/app/layout-shell.test.tsx` | 67 | `<main id="main-content"` | Keep-as-behavior (relax form). |
| `app/(marketing)/checkout/success/page.test.ts` | 362 | `<main id="main-content"` | Keep-as-behavior (relax form). |
| `app/(marketing)/checkout/success/error.test.tsx` | 18 | `<main id="main-content"` | Keep-as-behavior (relax form). |
| `app/sign-in/[[...sign-in]]/page.test.tsx` | 35 | `<main id="main-content"` | Keep-as-behavior (relax form). |
| `app/layout.test.tsx` | 95–96 | `class="dark "`, `style="color-scheme:dark"` | **Keep** — forced-dark contract (DEBT-421 sentinel); the *positional* part (lines 99–100) is what's brittle. |
| `app/(app)/app/practice/page.test.tsx` | 516 | `<fieldset` | Keep — `<fieldset>` is an a11y grouping guarantee; assert via role/structure if cleaner. |
| `app/(app)/app/billing/page.test.tsx` | 238 | `<h1` | **Relax** — assert the heading via parsed-DOM (the `<h1>` / `role="heading"` node + its text), **not** a raw `<h1` substring. (No `getByRole` — @testing-library/react is banned here; parse the serialized markup or use a shared helper.) |
| `app/(app)/app/questions/[slug]/page.test.tsx` | 535 | `/<button[^>]*disabled=""[^>]*>Submit<\/button>/` | **Relax** — the *behavior* is "Submit is disabled"; the regex couples to tag name + attribute serialization. Assert the disabled state semantically. |
| `components/ui/filter-chip.test.tsx` | 29 | `<button` | Keep — primitive renders a real `<button>` (component-system contract). |
| `components/ui/segmented-control.test.tsx` | 88, 104, 123, 141, 156 | `<fieldset` / `<legend>` (present/absent) | **Keep** — `<fieldset>`/`<legend>` presence/absence is an accessibility contract for the control. |
| `components/ui/metallic-cta-button.test.tsx` | 44, 55 | `<svg`, `<a` | Keep-ish — anchor vs button is behavioral; the `<svg>` presence is cosmetic, relax that one. |
| `components/markdown/markdown.test.tsx` | 28–29, 61 | `<h1>Title</h1>`, `not <script>`, `not <strong>` | **Keep** — `not.toContain('<script>')` is an XSS-sanitization guarantee; the rest verifies the markdown→HTML contract. This is behavior, not styling. |
| `components/question/question-card.test.tsx` | 38 | `<fieldset` | Keep — a11y grouping (same as segmented-control). |

> Excluded false positive: `src/adapters/repositories/drizzle-stripe-event-repository.test.ts:410` `toContain('<')` asserts on a **SQL** string, not rendered HTML — out of scope.

## Why this is debt

`.claude/rules/testing.md` already says to prefer stable markers (role, text, href, `data-testid`) and to avoid full presentational class strings — but it has **no explicit guidance** against raw tag-shape fragments or DOM `indexOf`-order assertions. So these slip through review the same way class-string assertions did before DEBT-153 added the rule. A future markup refactor (a wrapper element, a tag swap, an attribute-order change, PPR shell tweaks) breaks them for **zero behavioral reason**, which discourages otherwise-safe cleanups and trains authors to re-bless brittle assertions rather than fix them.

## Remediation

A **triage**, identical in shape to DEBT-153/369 — *not* a wholesale removal:

1. **Keep** assertions where the tag/structure/order encodes a real contract:
   - accessibility landmarks/grouping (`<main>` skip-link target, `<fieldset>`/`<legend>`),
   - document-shell contracts (`global-error` `<html>`/`<head>`),
   - sanitization guarantees (`not.toContain('<script>')`),
   - component-system contracts (primitive renders a `<button>`/anchor),
   - genuinely order-dependent behavior — **rating-after-action-bar** (DEBT-405 / Pattern Registry F-9), the **`beforeQuestionCard`** slot, the **marketing hero "decision sequence"**, and the **history backend-row order** — but expressed as **parsed-DOM node order** (assert node A precedes node B), never raw substring `indexOf` offsets.
2. **Relax** the cosmetic ones to semantic assertions:
   - landmark *presence* → assert via role / skip-link target rather than the literal `<main id="…"` string,
   - heading → role + level + text via parsed DOM, not `<h1`,
   - disabled control → semantic disabled state, not a tag+attribute regex,
   - genuinely cosmetic structure/order → drop: the layout forced-dark **position** math (`layout.test.tsx` 99–100; keep the `<html>` attribute sentinels), and the decorative `<svg>`-presence check in `metallic-cta-button`. (Note: action-bar / slot / hero / history order are **not** here — they are Keep+harden above.)
3. **Extend `.claude/rules/testing.md`** (Option-C style, the DEBT-153 precedent): add a line that raw HTML tag-shape fragments and DOM `indexOf`-order assertions on `renderToStaticMarkup` output are acceptable only when the tag/order encodes behavior (a11y, sanitization, document shell, genuinely order-dependent output), and to prefer role/text/`data-testid`/`findAnchorByHref` otherwise. This is what stops the pattern from regrowing.

Lean on the existing helpers: `@/tests/shared/dom-helpers` (`findAnchorByHref`) and the React-19 jsdom patterns in `.claude/rules/testing-react19.md`.

## Constraints

- Do **not** delete the affected test files or convert to snapshots — snapshots have their own brittleness mode and are explicitly rejected by DEBT-369.
- Do **not** churn the keep-as-behavior sites for style alone; only relax the cosmetic structure/order assertions.
- The forced-dark sentinels in `app/layout.test.tsx` (95–96) and the DEBT-421 regression intent must remain — only the positional `indexOf` math (99–100) is in scope to relax.
- Pair the rule extension with the code triage in the same change so the guidance and the cleanup land together.

## Why P3 (not P2)

The tests pass and provide value; nothing is broken or blocking a shipped feature. The cost is friction on every markup refactor and the false confidence of string-shape checks. Pay it down before the next structural/markup refactor (e.g., further PPR/Cache-Components shell changes), not before.

## Verification

- [ ] `.claude/rules/testing.md` updated with the raw-markup / DOM-order guidance.
- [ ] Cosmetic order assertions (action-bar-before-rating, hero text order, slot order, billing `<h1`, layout positional `indexOf`) relaxed to semantic assertions.
- [ ] Keep-as-behavior sites (a11y landmarks/grouping, document shell, sanitization, component-system) left intact or expressed semantically — none silently dropped.
- [ ] `grep -rEn "\.indexOf\('<" --include="*.test.tsx" app components` returns only behavior-justified, commented sites.
- [ ] `pnpm test --run` stays green for every touched file.
