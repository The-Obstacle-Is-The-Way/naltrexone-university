# DEBT-283: Hardcoded UI Typography Explicit Sizing Alignment

**Priority:** P3
**Created:** 2026-03-07
**Status:** Resolved
**Resolved:** 2026-03-07 — commit `08a4ecdb`
**Source:** Typography policy + UI codebase audit
**Governing Policy:** [Typography Policy](../../frontend/typography-policy.md)
**Scope:** Align non-Markdown supporting copy to explicit typography roles and remove inherited-size drift across app, utility, and standard marketing sections

---

## Current Status

As of **March 7, 2026**, commit `08a4ecdb` resolved the DEBT-283 implementation scope in full:

- all 19 audited supporting-copy occurrences across the original 13 files now use explicit `text-base text-muted-foreground`
- representative regression coverage landed for `dashboard/page.tsx`, `sign-in-page-client.tsx`, and `marketing-home.tsx`
- the full verification gate passed: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build`

This archived document preserves the pre-fix audit and implementation plan that guided the work.

---

## Problem

The codebase has a real typography drift outside the Markdown/content pipeline: multiple app, utility, and standard marketing surfaces render supporting copy with `text-muted-foreground` but no explicit `text-*` class.

Today those strings usually inherit browser/root `1rem`, so the visual output is often acceptable. The problem is that the role is implicit rather than claimed. That creates three issues:

1. **Contract drift:** docs and code stopped agreeing about whether inherited subtitle/helper-copy sizing is intentional.
2. **Regression risk:** if parent composition or root sizing changes, these strings can drift without any explicit typography token changing.
3. **Ambiguous hierarchy:** developers cannot tell whether a string is meant to be dense chrome (`text-sm`) or standard supporting copy (`text-base`) just by reading the JSX.

This debt is about the **regular React/UI pipeline**, not Markdown content. [DEBT-282](../../debt/debt-282-feedback-visual-unification.md) already covers the Markdown-backed feedback mismatch inside the question flow.

---

## Pre-Fix Audit

Before the fix landed, the drift lived in **13 files / 19 occurrences**. Every audited occurrence was a supporting-copy `<p>` with `text-muted-foreground` and no explicit `text-*` size class. None of the listed elements should stay `text-sm`; they were standard supporting copy and needed to normalize to explicit `text-base text-muted-foreground`.

### Authenticated app pages

- `app/(app)/app/dashboard/page.tsx`
  - `:53` `className="mt-1 text-muted-foreground"` — `Track your progress and keep your streak alive.`
  - `:285` `className="mt-1 text-muted-foreground"` — `Unable to load stats.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/(app)/app/bookmarks/page.tsx`
  - `:50` `className="mt-1 text-muted-foreground"` — `Review questions you've bookmarked.`
  - `:211` `className="mt-1 text-muted-foreground"` — `Unable to load bookmarks.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/(app)/app/billing/page.tsx`
  - `:145` `className="mt-1 text-muted-foreground"` — `Manage your subscription and billing details.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/(app)/app/history/history-page-client.tsx`
  - `:38` `className="text-muted-foreground"` — `Review completed sessions and your Quick Practice questions.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/(app)/app/questions/[slug]/question-page-client.tsx`
  - `:201` `className="mt-1 text-muted-foreground"` — one of the `originUi.subtitle` strings: `Reviewing a question from your history.`, `Reviewing a bookmarked question.`, `Review a question from your practice history.`, or `Review a question from your recent activity.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/(app)/app/practice/practice-page-client.tsx`
  - `:28` `className="mt-1 text-muted-foreground"` — `Choose how you want to practice.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/(app)/app/practice/components/practice-view.tsx`
  - `:149` `className="mt-1 text-muted-foreground"` — default `Answer one question at a time.` and session descriptions like `Question 2 of 10 — Explanations shown after each answer.` / `Question 2 of 10 — Explanations shown after you submit the exam.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`
  - `:113` `className="mt-1 text-muted-foreground"` — `Check answered, unanswered, and marked questions before final submit.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`
  - `:36` `className="mt-1 text-muted-foreground"` — `Here's how you did.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`

### Utility / auth surfaces

- `app/sign-in/[[...sign-in]]/sign-in-page-client.tsx`
  - `:9` `className="text-muted-foreground"` — `Loading sign-in…`
  - `:28` `className="mt-2 text-muted-foreground"` — `Authentication unavailable in this environment.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/sign-up/[[...sign-up]]/sign-up-page-client.tsx`
  - `:9` `className="text-muted-foreground"` — `Loading sign-up…`
  - `:28` `className="mt-2 text-muted-foreground"` — `Authentication unavailable in this environment.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`
- `app/(marketing)/checkout/success/checkout-success-sync.tsx`
  - `:286` `className="mt-2 text-muted-foreground"` — `You’ll be redirected to your dashboard shortly.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`

### Standard marketing section ledes

- `components/marketing/marketing-home.tsx`
  - `:141` `className="mt-3 text-muted-foreground"` — `Clean workflows, zero fluff. Stay in the question loop and learn from every attempt.`
  - `:179` `className="mt-3 text-muted-foreground"` — `One subscription unlocks the full question bank and all study modes.`
  - `:248` `className="mt-4 text-muted-foreground"` — `Join physicians and psychiatrists preparing for addiction boards. Full access, cancel anytime.`
  - Correct role: standard supporting copy -> `text-base text-muted-foreground`

### Horizontal Scan Result

A repo-wide `rg -n 'text-muted-foreground' app components` sweep found **no additional files** beyond the 13 above that match this debt pattern.

The following apparent matches were audited and excluded:

- `app/(app)/app/shared/components/session-breakdown-list.tsx:68` — `Unanswered` is a dense status label inheriting `text-sm` from the parent `li` (`className="flex items-center gap-2 py-2 text-sm"`). This should stay dense chrome.
- `app/(app)/app/dashboard/page.tsx:168` — the accuracy suffix span inherits `text-sm` from the parent `div` (`className="mt-2 text-sm text-foreground"`). This is dense row metadata, not a subtitle.
- `app/pricing/pricing-view.tsx:48-57` — the pricing banner inherits `text-sm` from the alert container (`className="... p-4 text-sm shadow-sm ..."`). This is compact alert chrome, not standard supporting copy.
- `app/not-found.tsx:23`, `app/pricing/pricing-view.tsx:42`, and `components/marketing/marketing-home.tsx:78` already claim explicit `text-base` or `text-lg` roles and are compliant.
- Nav/icon utility classes in `components/app-desktop-nav.tsx`, `components/mobile-nav.tsx`, `components/marketing/marketing-layout.tsx`, `components/theme-toggle.tsx`, `components/auth-nav.tsx`, and `components/ui/*` are interactive chrome or icon tinting, not supporting-copy typography.
- `components/question/feedback.tsx` remains intentionally excluded from this debt and is still tracked by [DEBT-282](../../debt/debt-282-feedback-visual-unification.md).

Representative current pattern:

```tsx
<p className="mt-1 text-muted-foreground">Track your progress...</p>
```

Target pattern:

```tsx
<p className="mt-1 text-base text-muted-foreground">Track your progress...</p>
```

---

## What Is NOT Debt

These typography differences were audited and are **intentional exceptions**, not part of this debt:

- **Marketing hero / pricing-page subtitle typography** using `text-lg`
- **Marketing CTA labels** using `text-base`
- **Dense operational chrome** using `text-sm` (card body text, labels, metadata)
- **Shared `Input` primitive** using `text-base md:text-sm` as a mobile accessibility safeguard
- **Exam review compact stat cards** using `text-xs` labels + `text-2xl` values (documented compact tier)
- **Markdown content sizing** (question stems, choices, feedback answers/explanations) — covered by DEBT-282 and the content tier system

The horizontal scan also confirmed that inherited `text-muted-foreground` inside a parent that already claims `text-sm` is **not** debt. That pattern remains correct for dense labels, metadata, compact alerts, and row status text.

---

## Root Cause

The drift came from two sources:

1. Supporting strings were often styled by color only (`text-muted-foreground`) without claiming a text role.
2. Documentation diverged, so inherited-size supporting copy stopped looking suspicious during reviews.

This is a policy-enforcement problem, not a “should subtitles be 14px or 16px?” design debate. The ideal is explicit role-based typography.

---

## Solution

### Change 1: Make standard supporting copy explicit

For app pages, centered utility surfaces, and standard marketing sections, subtitle/help/loading/fallback copy should use:

- `text-base text-muted-foreground`

This applies to page subtitles, centered auth loading/fallback copy, checkout success helper text, and comparable non-Markdown support copy.

### Change 2: Keep dense chrome dense

Do not expand genuinely dense chrome/body/meta copy to `text-base`. These remain:

- `text-sm text-muted-foreground`

Examples: card body text, row metadata, section labels, compact alerts, operational scaffolding inside cards.

### Change 3: Preserve documented exceptions

Do not “normalize” the following into `text-base`:

- marketing hero and pricing-page subtitles
- premium/hero CTA button text
- shared `Input` text sizing
- compact exam-review stat tier

### Change 4: Add regression coverage

Add or expand targeted render tests so the typography contract is enforced on representative surfaces:

- one authenticated app page subtitle
- one utility/auth supporting-copy path (loading or unavailable state)
- one standard marketing section lede

The goal is not to test every file exhaustively. It is to prevent the “color only, no explicit size” regression pattern from reappearing unnoticed.

### Governing docs consistency check

The governing docs agree on the intended typography roles:

- `docs/frontend/typography-policy.md` tracks the open Pipeline 1 drift set and says standard supporting copy should be `text-base text-muted-foreground`.
- `docs/frontend/standards.md` Section 4 Typography says standard page/section subtitles and page/section supporting copy use `text-base text-muted-foreground`, while labels/secondary text use `text-sm text-muted-foreground`.
- `docs/frontend/pattern-registry.md` Part 12.3 says standard UI page/section subtitles use `text-base text-muted-foreground`, marketing hero/pricing subtitles use `text-lg`, dense helper copy uses `text-sm`, the shared `Input` keeps `text-base md:text-sm`, and exam-review stat labels stay `text-xs`.

No contradictions were found between those three docs. The accuracy gap was in the debt ticket precision: the original file list was directionally correct, but it did not record the full audited occurrence count or the false-positive exclusions from the horizontal sweep.

---

## Implementation Notes

- This should be a focused typography-alignment PR, not a visual redesign.
- No meaningful visual delta is expected in the default root-font context; the main change is making the role explicit in code.
- Do not mix this with DEBT-282 or other question-flow styling work.
- Prefer shared constants only if multiple files truly share the same composed subtitle class. A mass extraction that obscures usage is not automatically better.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | App page subtitle render (`dashboard/page.tsx` or `question-page-client.tsx`) | Subtitle includes `text-base text-muted-foreground` |
| T2 | Utility/auth supporting copy (`sign-in-page-client.tsx` or `sign-up-page-client.tsx`, loading or unavailable path) | Description includes `text-base text-muted-foreground` |
| T3 | Standard marketing section lede (`marketing-home.tsx`) | Lede includes `text-base text-muted-foreground` |
| T4 | Dense card/helper copy (`session-breakdown-list.tsx`, pricing banner, dashboard row metadata) | Remains `text-sm text-muted-foreground` or inherits from an explicit `text-sm` parent |
| T5 | Marketing hero/pricing subtitle (`marketing-home.tsx`, `pricing-view.tsx`) | Remains on marketing scale (`text-lg` or page-specific display scale) |
| T6 | Input primitive | Retains `text-base md:text-sm` |
| T7 | Exam review stat labels (`exam-review-view.tsx`) | Retain compact `text-xs` tier |

### Existing tests and gap check

Existing tests currently assert text presence, not the target subtitle/helper-copy classNames:

- `app/(app)/app/dashboard/page.test.tsx` checks `Unable to load stats.` text but does not assert its typography class.
- `app/(app)/app/bookmarks/page.test.tsx` checks `Unable to load bookmarks.` text but does not assert its typography class.
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx` checks the origin subtitle text strings but does not assert the subtitle `className`.
- `app/sign-in/[[...sign-in]]/page.test.tsx` and `app/sign-up/[[...sign-up]]/page.test.tsx` check the `Authentication unavailable in this environment.` fallback text only.
- `components/marketing/marketing-home.test.tsx` checks section presence but not the lede `className`.

The only nearby class-based selector is `app/(app)/app/questions/[slug]/question-page-client.test.tsx:737-743`, which asserts the absence of a removed inline progress indicator (`span.text-sm.text-muted-foreground`). That selector is unrelated to the subtitle `<p>` and would not need updating for DEBT-283.

---

## Definition of Done

- All 19 audited supporting-copy occurrences across the listed 13 files use explicit `text-base text-muted-foreground`
- Intentional exceptions remain unchanged
- Representative regression tests cover the explicit-size rule
- `typography-policy.md`, `standards.md`, and `pattern-registry.md` remain in sync
