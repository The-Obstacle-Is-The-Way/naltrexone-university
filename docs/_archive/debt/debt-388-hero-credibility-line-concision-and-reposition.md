# DEBT-388: Hero Credibility Line — Concise Wording, Reposition Below the CTAs, and Cleaner Hero Wrapping

**Priority:** P3
**Created:** 2026-05-21
**Source:** Visual iteration on the hero after DEBT-382 (credibility line + hero copy) and DEBT-387 (features card) shipped. Three small issues remain on `/`: (1) the credibility line is wordier than it needs to be; (2) it sits *between* the pill and the h1, crowding "Master the Addiction Boards." out of the first-read slot; and (3) the hero subtitle wraps mid-first-sentence rather than breaking by sentence.
**Related:** [DEBT-382](../_archive/debt/debt-382-landing-page-content-refresh-question-count-and-author-credibility.md) (parent — set the original placement/wording), [DEBT-387](../_archive/debt/debt-387-features-card-understates-study-modes.md)

**Status:** Active — wording + position locked (below); wrapping is a visual-tune to verify in-browser.

---

## Decisions (locked by user 2026-05-21)

| Question | Decision |
|----------|----------|
| Credibility wording | Drop `practicing`: **`Authored by a double board-certified addiction psychiatrist. Grounded in primary literature with citations.`** Trade-off accepted: loses the "currently in clinical practice" signal in exchange for concision. |
| Credibility position | **Move below the CTA button row.** New hero order: pill → h1 → subtitle → `[Get Started] [View pricing]` → credibility line. Reads as a closing trust line at the decision point and gives the h1 a clean entrance directly under the pill. |
| Line breaks | **No hard `<br>` breaks.** Tune `max-width` + `text-balance` so the credibility line and the subtitle each read cleanly (target ~one sentence per line) on desktop and wrap naturally on mobile. Visual-iterate; verify in-browser. A desktop-only responsive break (`<br className="hidden sm:inline" />`) is the sanctioned fallback ONLY if tuning can't get clean desktop breaks. |

---

## Why This Is Debt

Concrete, user-visible on `/` today, not speculative:

- **Crowded headline.** The credibility `<p>` between the pill and the h1 pushes the headline down and competes for the first thing the eye reads. The headline is the product's identity statement and should land first.
- **Clunky wording.** `Authored by a practicing, double board-certified addiction psychiatrist.` reads heavy; the leading "practicing," comma adds words without proportional signal for this audience.
- **Awkward subtitle wrap.** The subtitle currently breaks mid-sentence (`...Addiction Psychiatry` / `and Medicine. Practice...`), which reads less cleanly than a sentence-aligned wrap.

This is the visual-polish tail of the landing-page thread, deferred from DEBT-382 deliberately (382 locked the original placement; this revisits it after seeing it live).

---

## Current State (re-verified 2026-05-21 against `debt-388-hero-credibility-line` @ `84b37666`)

| File | Lines | Element | Current |
|------|-------|---------|---------|
| `components/marketing/marketing-home.tsx` | 75-77 | Hero badge (pill) | `Board prep, built for outcomes` |
| `components/marketing/marketing-home.tsx` | 78-81 | Credibility `<p>` (in `MarketingHeroCopy`, `max-w-4xl`) | `Authored by a practicing, double board-certified addiction psychiatrist. Grounded in primary literature with citations.` |
| `components/marketing/marketing-home.tsx` | 82-87 | Hero h1 | `Master the Addiction Boards.` (two-span gradient) |
| `components/marketing/marketing-home.tsx` | 88-91 | Hero subtitle `<p>` (`max-w-2xl text-balance`) | `High-yield questions ... for Addiction Psychiatry and Medicine. Practice with confidence and track your progress.` |
| `components/marketing/marketing-home.tsx` | 308-320 | Hero `<section>` | `{heroCopy}` then the CTA row `<div className="mt-10 flex ...">` at 311-318 (`Get Started` slot + `View pricing`) |

The credibility line is rendered inside the cached `MarketingHeroCopy` fragment (`'use cache'` at lines 70-72); the CTA buttons are rendered separately in `MarketingHomeShell`'s hero section after `{heroCopy}`. The CTA row includes the auth-aware `primaryCtaSlot` / `DeferredGetStartedCta` inside `Suspense`, so the implementation must lift only the static credibility text out of the cached fragment. Do not move the CTA row into `MarketingHeroCopy`.

---

## Proposed Change (copy + placement + wrapping; no new card/section)

1. **Remove** the credibility `<p>` from `MarketingHeroCopy` (`marketing-home.tsx:78-81`). The top of the fragment becomes pill → h1 directly.
2. **Re-render** it as a new `<p>` immediately after the CTA row `<div>` (after `marketing-home.tsx:318`), inside the hero's centered container. Keep muted/secondary text styling. Because the text is static, it can live directly in `MarketingHomeShell` without a new cached fragment or runtime dependency.
3. **Update the wording** to the locked line (drop `practicing`).
4. **Tune wrapping** on both the relocated credibility line and the subtitle (`max-width` / `text-balance`) for clean desktop breaks; no hard `<br>` unless the sanctioned fallback is needed. The subtitle TEXT does not change — only its wrapping.

**Treatment note (visual-iterate, not locked):** as a closing line under the CTAs, the credibility text may read better slightly smaller/quieter than it did up top, but it must stay visually attached to the CTA row and legible enough to read as trust support, not legal fine print or a stranded footer note. Decide by eye during implementation; do not over-spec.

---

## What This Debt Item Does NOT Touch

- Hero h1, the stat row, features, pricing, footer, the CTA buttons themselves.
- Any product behavior or routing — marketing copy/placement/styling only.
- The subtitle's words (wrapping only).

---

## Test Surfaces

- **Verified grep result (2026-05-21):** the old credibility string (`Authored by a practicing, double board-certified addiction psychiatrist`) appears only in `components/marketing/marketing-home.tsx:79` and `components/marketing/marketing-home.test.tsx:89` across `*.ts` / `*.tsx`. No E2E, browser, or integration test currently asserts this copy.
- `components/marketing/marketing-home.test.tsx`: update the credibility assertion to the new wording and add a negative assertion that the old `practicing,` phrasing no longer renders. The subtitle assertion stays valid (text unchanged) — confirm it still passes.
- Add a DOM-order assertion in `components/marketing/marketing-home.test.tsx` for the placement change. The current test is position-agnostic (`toContain` at lines 84-93), so implementation must add coverage proving the hero order is pill → h1 → subtitle → CTA row → credibility line.
- Confirm no pre-existing test asserts the credibility line's DOM *position* relative to the CTAs; none exists as of this audit.

---

## Acceptance Criteria

- [ ] Credibility line reads `Authored by a double board-certified addiction psychiatrist. Grounded in primary literature with citations.` and renders **below** the CTA row.
- [ ] The top of the hero is pill → h1 with nothing between them.
- [ ] Subtitle text is unchanged and wraps cleanly (sentence-aligned target) on desktop, naturally on mobile.
- [ ] No hard `<br>` unless the sanctioned desktop-only fallback was required (note it in the PR if so).
- [ ] Tests updated test-first, including a DOM-order assertion for the new hero order; `pnpm test --run` and `pnpm build` pass; full gate green.
- [ ] Visual verification on `localhost:3000/` in light + dark, desktop + mobile widths, no layout shift.

---

## Implementation Constraints

Per repo memory rules: `feedback_docs_before_code` (review this before code), strict TDD (update the render test first, red, then move/edit), `feedback_full_gate_before_push`, and `feedback_verify_doc_citations_mechanically` (citations re-verified against `debt-388-hero-credibility-line` @ `84b37666` on 2026-05-21; re-verify if the PR opens more than a few commits later).
