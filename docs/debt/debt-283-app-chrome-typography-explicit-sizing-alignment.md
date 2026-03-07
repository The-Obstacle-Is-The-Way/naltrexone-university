# DEBT-283: App Chrome Typography Explicit Sizing Alignment

**Priority:** P2
**Created:** 2026-03-07
**Source:** Typography policy + UI codebase audit
**Governing Policy:** [Typography Policy](../frontend/typography-policy.md)
**Scope:** Align non-Markdown app/utility supporting copy to explicit app-chrome typography roles and remove inherited-size drift

---

## Problem

The codebase has a real typography drift outside the Markdown/content pipeline: multiple app and utility surfaces render subtitle/helper copy with `text-muted-foreground` but no explicit `text-*` class. Those strings inherit browser/root `1rem` instead of opting into the app's explicit secondary-text role.

That creates two problems:

1. **Visual inconsistency:** some page subtitles render at inherited 16px while comparable app-chrome secondary text uses `text-sm` (14px).
2. **SSOT drift:** the docs were contradictory. `typography-policy.md` said app chrome defaults to `text-sm`, while `pattern-registry.md` previously canonized no-size app subtitles.

This debt is about the **regular React/UI pipeline**, not Markdown content. DEBT-282 already covers the Markdown-backed feedback mismatch inside the question flow.

---

## Verified Current Drift

The following files currently rely on inherited size for app/utility supporting copy and should be normalized to explicit `text-sm text-muted-foreground` in a follow-up implementation:

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

Representative current pattern:

```tsx
<p className="mt-1 text-muted-foreground">Track your progress...</p>
```

Target pattern:

```tsx
<p className="mt-1 text-sm text-muted-foreground">Track your progress...</p>
```

---

## What Is NOT Debt

These typography differences were audited and are **intentional exceptions**, not part of this debt:

- **Marketing/editorial typography** on pricing and landing pages (`text-lg` subtitles, display headings)
- **Marketing CTA labels** using `text-base`
- **Shared `Input` primitive** using `text-base md:text-sm` as a mobile accessibility safeguard
- **Exam review compact stat cards** using `text-xs` labels + `text-2xl` values (documented compact tier)
- **Markdown content sizing** (question stems, choices, feedback answers/explanations) — covered by DEBT-282 and the content tier system

---

## Root Cause

The drift came from two sources:

1. Secondary/supporting strings were often styled by color only (`text-muted-foreground`) without claiming a text role.
2. Documentation diverged, so inherited-size subtitles were not being flagged as non-compliant.

This is a policy-enforcement problem, not a "pick larger or smaller text" design debate. The ideal is explicit role-based typography.

---

## Solution

### Change 1: Make app/utility supporting copy explicit

For app and utility pages, subtitle/help/loading/fallback copy should use explicit secondary-text sizing:

- `text-sm text-muted-foreground`

This applies to page subtitles, auth fallback descriptions, checkout success helper text, and similar non-Markdown support copy.

### Change 2: Preserve documented exceptions

Do not "normalize" the following into `text-sm`:

- pricing/marketing hero and section subtitles
- premium/hero CTA button text
- shared `Input` text sizing
- compact exam-review stat tier

### Change 3: Add regression coverage

Add or expand targeted render tests so the typography contract is enforced on representative surfaces:

- one authenticated app page subtitle
- one utility/auth subtitle
- one loading/help text path

The goal is not to test every file exhaustively, but to prevent the "color only, no size" regression pattern from reappearing unnoticed.

---

## Implementation Notes

- This should be a focused typography-alignment PR, not a visual redesign.
- Do not mix this with DEBT-282 or other question-flow styling work.
- Prefer shared constants only if multiple files truly share the same composed subtitle class. A mass extraction that obscures usage is not automatically better.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | App page subtitle render | Subtitle includes `text-sm text-muted-foreground` |
| T2 | Utility/auth fallback description | Description includes `text-sm text-muted-foreground` |
| T3 | Loading copy path | Loading copy includes explicit `text-sm` |
| T4 | Marketing subtitle | Remains on marketing scale (`text-lg` or page-specific display scale) |
| T5 | Input primitive | Retains `text-base md:text-sm` |
| T6 | Exam review stat labels | Retain compact `text-xs` tier |

---

## Definition of Done

- All listed app/utility files use explicit `text-sm text-muted-foreground` for subtitle/helper copy
- Intentional exceptions remain unchanged
- Representative regression tests cover the explicit-size rule
- `typography-policy.md`, `standards.md`, and `pattern-registry.md` remain in sync
