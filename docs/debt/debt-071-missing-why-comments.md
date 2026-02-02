# DEBT-071: Missing WHY Comments on Non-Obvious Business Logic

**Status:** Open
**Priority:** P3
**Date:** 2026-02-02

---

## Description

The codebase correctly follows TypeScript/React conventions — types serve as documentation, code is self-descriptive, and JSDoc is used on port interfaces. However, several locations contain non-obvious business logic or external service quirks that would benefit from brief WHY comments explaining the reasoning behind the code, not what it does.

This is not urgent debt — the code works and is maintainable. These comments would improve navigability for both humans and AI agents working on the codebase.

## Impact

- **Developer impact:** Low — experienced developers will figure it out
- **Agent impact:** Medium — AI agents waste context investigating non-obvious patterns
- **Onboarding impact:** Medium — new developers may misunderstand edge cases

## Specific Locations Requiring Comments

### 1. Stripe Metadata Race Condition

**File:** `src/adapters/gateways/stripe-payment-gateway.ts:230-237`

```typescript
const userId = subscription.metadata?.user_id;
if (!userId) {
  throw new ApplicationError(
    'STRIPE_ERROR',
    'Stripe subscription metadata.user_id is required',
  );
}
```

**Needs comment explaining:**
- Stripe sends `subscription.created` before checkout completes
- At that moment, metadata.user_id is not yet attached
- This is a known Stripe race condition, not a bug in our code
- BUG-041 tracks making this non-fatal for `subscription.created` events

**Suggested comment:**
```typescript
// Stripe quirk: subscription.created fires BEFORE checkout.session.completed,
// so metadata.user_id may not be attached yet. This is expected for that event;
// BUG-041 tracks handling it gracefully. For all other events, metadata must exist.
const userId = subscription.metadata?.user_id;
```

---

### 2. Checkout Success Silent Validation

**File:** `app/(marketing)/checkout/success/page.tsx:118-155`

Each validation check redirects to the same error URL without explanation. When BUG-042 is fixed (adding logging), comments should explain WHY each condition can fail.

**Needs comments explaining:**

- Line 118 (`!sessionId`): User arrived without query param (direct navigation, link tampering)
- Line 129 (`!stripeCustomerId || !subscriptionId`): Stripe session not fully formed (rare race)
- Line 137-138 (`metadataUserId !== user.id`): User switched accounts mid-checkout
- Line 141-142 (`!isValidSubscriptionStatus`): Subscription in unexpected state (fraud, canceled)
- Line 145-146 (`currentPeriodEnd`): Stripe returned malformed subscription object
- Line 149 (`cancelAtPeriodEnd`): Stripe returned malformed subscription object
- Line 152 (`!priceId`): Subscription has no line items (possible test mode artifact)
- Line 155 (`!plan`): Price ID doesn't match configured plans (environment mismatch)

**Suggested pattern:**
```typescript
// User switched Clerk accounts mid-checkout — the subscription belongs to a different user
if (metadataUserId && metadataUserId !== user.id) {
  logger.error('User ID mismatch', { metadataUserId, currentUserId: user.id });
  redirectFn(CHECKOUT_ERROR_ROUTE);
}
```

---

### 3. Dummy Clerk Key Fallbacks

**File:** `lib/env.ts:79-86`

```typescript
return {
  ...parsed.data,
  CLERK_SECRET_KEY: parsed.data.CLERK_SECRET_KEY ?? 'sk_test_dummy',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    parsed.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_dummy',
  CLERK_WEBHOOK_SIGNING_SECRET:
    parsed.data.CLERK_WEBHOOK_SIGNING_SECRET ?? 'whsec_dummy',
};
```

**Needs comment explaining:**
- These dummy keys exist ONLY for `NEXT_PUBLIC_SKIP_CLERK=true` mode
- When SKIP_CLERK is true, Clerk SDK is bypassed entirely
- Dummy keys satisfy TypeScript and SDK initialization without causing runtime auth
- Line 73-77 prevents this from reaching production

**Suggested comment:**
```typescript
// When SKIP_CLERK=true (local dev only), provide dummy keys to satisfy TypeScript
// and SDK initialization. Auth is bypassed entirely via FakeAuthGateway.
// Line 73-77 above prevents SKIP_CLERK from reaching production.
return {
  ...parsed.data,
  CLERK_SECRET_KEY: parsed.data.CLERK_SECRET_KEY ?? 'sk_test_dummy',
  // ...
};
```

---

### 4. Question Selection Algorithm

**File:** `src/domain/services/question-selection.ts`

Already has a good JSDoc comment. No changes needed.

---

### 5. Orphaned Reference Handling in Controllers

**Files:**
- `src/adapters/controllers/bookmark-controller.ts:131-139`
- `src/adapters/controllers/review-controller.ts` (similar pattern)
- `src/adapters/controllers/stats-controller.ts` (similar pattern)

```typescript
for (const bookmark of bookmarks) {
  const question = byId.get(bookmark.questionId);
  if (!question) {
    d.logger?.warn(
      { questionId: bookmark.questionId },
      'Bookmark references missing question',
    );
    continue;
  }
  // ...
}
```

**Needs comment explaining:**
- Questions can be unpublished/deleted while bookmarks remain
- Silently skipping preserves user experience (partial list > error page)
- Logger captures the orphan for later cleanup
- This is intentional graceful degradation, not a bug

**Suggested comment:**
```typescript
// Graceful degradation: questions can be unpublished/deleted while bookmarks persist.
// Skip orphaned references to show a partial list rather than error.
// Logger captures orphans for manual review/cleanup.
if (!question) {
  d.logger?.warn({ questionId: bookmark.questionId }, 'Bookmark references missing question');
  continue;
}
```

---

### 6. Choice Shuffling Seed

**File:** `src/application/use-cases/get-next-question.ts:69-76`

```typescript
private mapChoicesForOutput(
  question: Question,
  userId: string,
): PublicChoice[] {
  const seed = createQuestionSeed(userId, question.id);
  const stableInput = question.choices.slice().sort((a, b) => {
    const bySortOrder = a.sortOrder - b.sortOrder;
    if (bySortOrder !== 0) return bySortOrder;
    return a.id.localeCompare(b.id);
  });
  const shuffledChoices = shuffleWithSeed(stableInput, seed);
  // ...
}
```

**Needs comment explaining:**
- Choices are shuffled deterministically per user+question
- Same user sees same order on revisit (prevents memorizing position)
- Different users see different orders (prevents cheating via position sharing)
- Stable sort before shuffle ensures reproducibility across code changes

**Suggested comment:**
```typescript
// Deterministic shuffle: same user always sees same choice order for a given question.
// This prevents position memorization while ensuring reproducibility across sessions.
// The stable pre-sort guarantees consistent input order regardless of DB row ordering.
const seed = createQuestionSeed(userId, question.id);
```

---

### 7. Port Interfaces (Already Good)

**Files:**
- `src/application/ports/repositories.ts`
- `src/application/ports/gateways.ts`

These files already have JSDoc comments on complex methods. No changes needed.

---

## Resolution

Add the suggested comments to each location. This is a single PR touching ~7 files, adding ~30 lines of comments total.

**Acceptance criteria:**
- [ ] Each location above has a brief WHY comment
- [ ] Comments explain business logic decisions, not what code does
- [ ] Comments reference bug/debt IDs where relevant
- [ ] No multi-line JSDoc blocks — keep comments concise (1-3 lines)

## Verification

- [ ] Code review confirms comments are accurate
- [ ] No functional changes — comments only
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- BUG-041: Webhook subscription.created missing metadata (Stripe race condition)
- BUG-042: Checkout success silent validation failure
- ADR-014: Stripe eager sync pattern (referenced in checkout success JSDoc)
- The Pragmatic Programmer: "Document decisions, not code"
