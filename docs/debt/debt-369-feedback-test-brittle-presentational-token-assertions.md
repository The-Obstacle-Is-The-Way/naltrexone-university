# DEBT-369: Brittle Presentational-Token Assertions in `Feedback.test.tsx`

**Priority:** P3
**Created:** 2026-04-25
**Source:** Test suite quality audit, 2026-04-25
**Related:** [.claude/rules/testing.md](../../.claude/rules/testing.md) — "Avoid asserting full space-delimited class strings for purely presentational styles"

**Audit verified:** 2026-04-27 against `87284372`.

---

## Context

`components/question/Feedback.test.tsx` (1,874 LOC) is heavy on direct Tailwind-utility-class assertions, many of which test pure presentation rather than behavior. A fresh grep on 2026-04-27 found 70 direct assertions matching the presentational-token pattern `(toContain|.has)('text-sm' | 'text-base' | spacing tokens | exact opacity tokens)`. The densest cluster remains lines ~410–650, with additional instances later in the file. Examples include:

- Line 421-425:
  ```typescript
  expect(fallbackClassName).toContain('text-sm');
  expect(fallbackClassName).toContain('text-muted-foreground');
  expect(fallbackClassName).not.toContain('text-base');
  expect(fallbackClassName).not.toContain('text-foreground');
  expect(fallbackClassName).not.toContain('mt-2');
  ```
- Line 489-499 block:
  ```typescript
  expect(destructiveCardTokens.has('border-destructive')).toBe(true);
  expect(destructiveCardTokens.has('border-destructive/20')).toBe(false);
  expect(destructiveCardTokens.has('border-destructive/30')).toBe(false);
  expect(destructiveCardTokens.has('bg-destructive/5')).toBe(true);
  expect(destructiveCardTokens.has('p-4')).toBe(true);
  expect(destructiveCardTokens.has('mt-2')).toBe(false);
  ```
- Similar token-by-token blocks for success cards (`gap-3`, `border-success`, `bg-success/15`).

Some of these *are* behavior-relevant — e.g., asserting that the destructive card uses a destructive-colored border distinguishes wrong-answer affordance from right-answer affordance, which is a real UX guarantee. The brittle ones are the **exact-opacity** assertions (`/20` vs `/30`), the **spacing** tokens (`p-4`, `mt-2`), and the **pure typography** (`text-sm` vs `text-base`).

## Why This Is Debt

`.claude/rules/testing.md` is explicit:

> Exact Tailwind class-string assertions are allowed only when the class itself encodes behavior (e.g. `sr-only`, breakpoint visibility, focus-ring presence, active-state tokens). Avoid asserting full space-delimited class strings for purely presentational styles.

Today, a future Tailwind config change — bumping default opacity values, swapping `text-sm` for a `--text-body` design token, adjusting card padding from `p-4` to `p-6` — breaks these tests for zero behavioral reason. The test churn discourages design-token cleanups.

The volume in this one file has also spawned a private DOM-helper kit (`getClassTokens`, `findRoundedBadge`, `findAnswerRow`, `findStyledCard`) that other component tests are now reaching for instead of asserting structure or content. Promoting that kit before cleaning up the brittle layer would cement the wrong pattern repo-wide.

## Remediation

Triage the ~70 affected assertions in `Feedback.test.tsx`:

1. **Keep** assertions where the class encodes a behavioral guarantee:
   - Card semantic role: assert `class.includes('border-destructive')` (without the `/20` suffix) so the test fails if the card is no longer destructive-colored. Tighten to the family, not the exact opacity.
   - `sr-only`, `focus-visible`, `aria-*`-coupled state classes, breakpoint-visibility classes (`md:hidden`, `lg:flex`).
2. **Replace** brittle ones with structural / semantic assertions:
   - Typography → assert the rendered text content + role, not the size class.
   - Spacing → drop unless it gates layout behavior; otherwise rely on visual review.
   - Exact opacity values → drop or relax to the destructive/success token *family*.
3. After the cleanup, re-evaluate whether the private DOM-helper kit (`findStyledCard`, etc.) should move to a shared `components/question/test-helpers.ts` for the few cases that remain. **Do not promote it until the brittle layer is gone** — promoting cements the pattern.

## Constraints

- Do NOT delete the test file or wholesale-rewrite it. Many of the tests are valuable behavior assertions; only the presentational-token portion is brittle.
- Do NOT replace utility-class assertions with snapshot tests. Snapshots have their own brittleness mode and the existing structural assertions are healthier.
- Pair this cleanup with [DEBT-370](./debt-370-oversized-test-files-without-enforced-size-rule.md) when this file is split. The split should land *after* the brittle cleanup, not before.

## Why P3 (not P2)

The current tests pass and provide value; they are not blocking shipped features. The cost shows up as friction on every design-token refactor (e.g., the next time someone moves to CSS variables for spacing). Pay it down before the next big design-system change, not before.

## Verification

- After the cleanup, the file is meaningfully smaller (target: <1,000 LOC after removing brittle assertions; further reduction via DEBT-370 splits).
- A grep `(toContain|\.has)\(['"](text-sm|text-base|p-[0-9]|mt-[0-9]|gap-[0-9]|bg-.*\/[0-9]+|border-.*\/[0-9]+)['"]` in `Feedback.test.tsx` returns zero hits, except where the rule justifies them.
- All remaining assertions reference DOM structure, accessible roles/labels, semantic content, or behaviorally meaningful classes.
- `pnpm test --run components/question/Feedback.test.tsx` stays green.
