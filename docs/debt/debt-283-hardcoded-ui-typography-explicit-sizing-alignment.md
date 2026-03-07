# DEBT-283: Hardcoded UI Typography Explicit Sizing Alignment

**Priority:** P3
**Created:** 2026-03-07
**Source:** Typography policy + UI codebase audit
**Governing Policy:** [Typography Policy](../frontend/typography-policy.md)
**Scope:** Align non-Markdown supporting copy to explicit typography roles and remove inherited-size drift across app, utility, and standard marketing sections

---

## Problem

The codebase has a real typography drift outside the Markdown/content pipeline: multiple app, utility, and standard marketing surfaces render supporting copy with `text-muted-foreground` but no explicit `text-*` class.

Today those strings usually inherit browser/root `1rem`, so the visual output is often acceptable. The problem is that the role is implicit rather than claimed. That creates three issues:

1. **Contract drift:** docs and code stopped agreeing about whether inherited subtitle/helper-copy sizing is intentional.
2. **Regression risk:** if parent composition or root sizing changes, these strings can drift without any explicit typography token changing.
3. **Ambiguous hierarchy:** developers cannot tell whether a string is meant to be dense chrome (`text-sm`) or standard supporting copy (`text-base`) just by reading the JSX.

This debt is about the **regular React/UI pipeline**, not Markdown content. [DEBT-282](./debt-282-feedback-visual-unification.md) already covers the Markdown-backed feedback mismatch inside the question flow.

---

## Verified Current Drift

The following files currently rely on inherited size for supporting copy and should be normalized to explicit `text-base text-muted-foreground` in a follow-up implementation:

### Authenticated app pages

- `app/(app)/app/dashboard/page.tsx`
- `app/(app)/app/bookmarks/page.tsx`
- `app/(app)/app/billing/page.tsx`
- `app/(app)/app/history/history-page-client.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.tsx`
- `app/(app)/app/practice/practice-page-client.tsx`
- `app/(app)/app/practice/components/practice-view.tsx`
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

### Utility / auth surfaces

- `app/sign-in/[[...sign-in]]/sign-in-page-client.tsx`
- `app/sign-up/[[...sign-up]]/sign-up-page-client.tsx`
- `app/(marketing)/checkout/success/checkout-success-sync.tsx`

### Standard marketing section ledes

- `components/marketing/marketing-home.tsx`

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

This applies to page subtitles, centered auth fallbacks, checkout success helper text, and comparable non-Markdown support copy.

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
- one utility/auth supporting-copy path
- one standard marketing section lede

The goal is not to test every file exhaustively. It is to prevent the “color only, no explicit size” regression pattern from reappearing unnoticed.

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
| T1 | App page subtitle render | Subtitle includes `text-base text-muted-foreground` |
| T2 | Utility/auth fallback description | Description includes `text-base text-muted-foreground` |
| T3 | Standard marketing section lede | Lede includes `text-base text-muted-foreground` |
| T4 | Dense card/helper copy | Remains `text-sm text-muted-foreground` |
| T5 | Marketing hero/pricing subtitle | Remains on marketing scale (`text-lg` or page-specific display scale) |
| T6 | Input primitive | Retains `text-base md:text-sm` |
| T7 | Exam review stat labels | Retain compact `text-xs` tier |

---

## Definition of Done

- All listed app/utility/standard-marketing files use explicit `text-base text-muted-foreground` for supporting copy
- Intentional exceptions remain unchanged
- Representative regression tests cover the explicit-size rule
- `typography-policy.md`, `standards.md`, and `pattern-registry.md` remain in sync
