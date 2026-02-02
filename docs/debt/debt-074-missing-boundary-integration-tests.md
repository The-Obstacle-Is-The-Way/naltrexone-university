# DEBT-074: Missing Boundary Integration Tests (Uncle Bob's "Humble Object" Gap)

**Status:** Open
**Priority:** P1
**Date:** 2026-02-02

---

## Description

Despite having integration tests for repositories, we lack **boundary integration tests** that verify the seams between:

1. **ORM ↔ Database** — Drizzle-generated SQL actually works with PostgreSQL
2. **Gateway ↔ External API** — Stripe/Clerk responses map correctly
3. **Controller ↔ Business Rules** — Edge cases like "already subscribed" are handled

BUG-046 and BUG-047 both slipped through because:
- Unit tests mocked the database (fast, isolated, but miss SQL generation bugs)
- Integration tests existed but didn't cover the specific edge cases
- No tests verified the actual SQL strings Drizzle generates

---

## What Uncle Bob Would Say

From *Clean Architecture* Chapter 22 ("The Humble Object Pattern"):

> "The Humble Object pattern... separates the hard-to-test behaviors from the easy-to-test behaviors."

The **Humble Object** is the thin layer at the boundary (ORM, HTTP client, etc.). It should be:
- **Tested separately** against the real external system
- **Kept simple** so there's less to go wrong

**Our gap:** We have Clean Architecture layers, but we're not testing the humble objects (Drizzle queries, Stripe SDK calls) against their real external systems in CI.

---

## What Kent Beck Would Say

From *Test-Driven Development: By Example*:

> "Write a test that fails for the right reason."

Our integration test for `listMissedQuestionsByUserId` **passed** even though the production code was broken. Why?

1. Test creates data via direct SQL
2. Test calls the method
3. Method generates broken SQL
4. PostgreSQL rejects the SQL
5. Test fails... **but only if running against real Postgres**

If the test ran with a mock or in-memory DB, it would pass. The test didn't "fail for the right reason" because it wasn't exercising the actual boundary.

---

## Specific Gaps

### 1. ORM Query Verification

**Missing:** Tests that verify Drizzle generates valid SQL for complex queries.

```typescript
// Should exist:
it('generates valid SQL for subquery joins', async () => {
  // Create data
  // Call method
  // Assert results
  // ALSO: Assert no SQL errors in pg_stat_statements or logs
});
```

### 2. Gateway Contract Tests

**Missing:** Tests that verify our gateway code handles real Stripe/Clerk responses.

```typescript
// Should exist:
it('handles Stripe subscription with current_period_end in items', async () => {
  // Mock Stripe with REAL API response structure
  // Not just { current_period_end: 123 }
  // But { items: { data: [{ current_period_end: 123 }] } }
});
```

### 3. Business Flow Integration Tests

**Missing:** Tests that verify complete user journeys.

```typescript
// Should exist:
it('prevents already-subscribed user from creating another subscription', async () => {
  // Create user
  // Create subscription in DB
  // Try to create checkout session
  // Assert error ALREADY_SUBSCRIBED
});
```

---

## Proposed Testing Pyramid Adjustment

**Current:**
```
     /\
    /  \     E2E (Playwright) - few, flaky
   /    \
  /------\   Integration (real DB) - some
 /        \
/__________\ Unit (mocks) - many
```

**Proposed:**
```
     /\
    /  \     E2E (critical paths only)
   /    \
  /------\   Contract Tests (real API responses) - NEW
 /--------\  Boundary Tests (real DB queries) - MORE
/          \
/____________\ Unit (pure logic only)
```

---

## Resolution

1. **Add contract tests** — Use recorded Stripe API responses (VCR pattern)
2. **Add boundary tests** — Test every Drizzle query against real Postgres
3. **CI requires real DB** — No skipping integration tests
4. **Add SQL assertion helper** — Verify generated SQL is valid

---

## Verification

- [ ] Every repository method has an integration test against real Postgres
- [ ] Stripe gateway has contract tests with recorded API responses
- [ ] CI runs integration tests on every PR (not just on merge)
- [ ] No more "SQL works in tests but fails in production" bugs

---

## Related

- BUG-046: Review Page SQL Error — caught by this gap
- BUG-047: Multiple Subscriptions — caught by this gap
- DEBT-072: Drizzle Subquery Join Pattern
- *Clean Architecture* by Robert C. Martin, Chapter 22
- *Test-Driven Development: By Example* by Kent Beck
