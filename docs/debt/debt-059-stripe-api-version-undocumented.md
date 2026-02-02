# DEBT-059: Stripe API Version Hardcoded Without Documentation

## Category: Code Clarity

## Summary
The Stripe API version is hardcoded without a comment explaining why that version was chosen or how to update it.

## Location
- `lib/stripe.ts:6`

## Current Code
```typescript
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-01-28.clover',
  typescript: true,
});
```

No comment explaining:
- Why this specific version
- When it was pinned
- How to safely update it
- What breaking changes to watch for

## Impact
- **Upgrade uncertainty:** Developers don't know if version can be bumped
- **Debugging difficulty:** Version mismatch issues hard to diagnose
- **Technical debt:** Version may become outdated without clear upgrade path

## Effort: Trivial
Just needs a comment.

## Recommended Fix
```typescript
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  // Pinned to match Stripe Dashboard API version
  // Update only after reviewing Stripe changelog for breaking changes
  // Last reviewed: 2026-01-28
  // Changelog: https://stripe.com/docs/upgrades#api-versions
  apiVersion: '2026-01-28.clover',
  typescript: true,
});
```

## Related
- SPEC-009: Stripe Integration (line 94-99)
