# Stabilization Checklist

**Date:** 2026-02-05
**Purpose:** Verify all core functionality works end-to-end before any refactoring

> **Principle:** Fix first, then refactor. Never refactor on a broken foundation.

---

## Current State

| Component | Status | Notes |
|-----------|--------|-------|
| Database seeded | ✅ | 958 published questions |
| Auth (Clerk) | ❓ | Needs verification |
| Payments (Stripe) | ❓ | Needs verification |
| Practice (Ad-hoc) | ❓ | Needs verification |
| Practice (Session) | ❌ | BUG-062 - Not working |
| Review/Bookmarks | ❓ | Needs verification |
| Dashboard | ❓ | Needs verification |

---

## Pre-Flight Checks

### 1. Environment

- [ ] `.env.local` exists with all required keys
- [ ] `DATABASE_URL` connects to correct database
- [ ] Clerk keys match dashboard configuration
- [ ] Stripe keys match dashboard configuration
- [ ] Dev server starts without errors (`pnpm dev`)

### 2. Database

- [ ] Migrations applied (`pnpm db:migrate`)
- [ ] Questions seeded (`pnpm db:seed`)
- [ ] At least one user exists with active subscription

```bash
# Verify database state
psql $DATABASE_URL -c "SELECT COUNT(*) FROM questions WHERE status = 'published';"
psql $DATABASE_URL -c "SELECT u.email, ss.status FROM users u LEFT JOIN stripe_subscriptions ss ON u.id = ss.user_id;"
```

---

## Core Flows to Verify

### Flow 1: New User Subscription

1. [ ] Visit `/pricing` (not logged in)
2. [ ] Click "Subscribe" → redirects to sign-up
3. [ ] Complete Clerk sign-up
4. [ ] Redirects to Stripe Checkout
5. [ ] Complete payment (use test card `4242 4242 4242 4242`)
6. [ ] Redirects to `/checkout/success`
7. [ ] Redirects to `/app/dashboard`
8. [ ] Dashboard shows user is subscribed

### Flow 2: Ad-hoc Practice

1. [ ] Visit `/app/practice` (as subscribed user)
2. [ ] Question loads automatically at bottom
3. [ ] Select an answer choice
4. [ ] Click "Submit" → see correct/incorrect + explanation
5. [ ] Click "Next Question" → new question loads
6. [ ] Click "Bookmark" → bookmark saved
7. [ ] Refresh page → question still loads

### Flow 3: Session Practice (CURRENTLY BROKEN)

1. [ ] Visit `/app/practice` (as subscribed user)
2. [ ] Configure session:
   - Mode: Tutor
   - Count: 5
   - Tags: leave empty
   - Difficulty: leave empty
3. [ ] Click "Start session"
4. [ ] **EXPECTED:** Redirects to `/app/practice/[sessionId]`
5. [ ] **EXPECTED:** Shows progress (1/5)
6. [ ] Answer question → see explanation immediately (tutor mode)
7. [ ] Click "Next" → progress updates (2/5)
8. [ ] Complete all questions OR click "End session"
9. [ ] **EXPECTED:** Summary shows stats (answered, correct, accuracy, duration)

### Flow 4: Exam Mode

1. [ ] Start session with Mode: Exam
2. [ ] Answer question → **NO explanation shown**
3. [ ] Complete session or click "End session"
4. [ ] **EXPECTED:** Summary shows stats AND explanations now visible

### Flow 5: Bookmarks

1. [ ] Visit `/app/bookmarks`
2. [ ] See list of bookmarked questions
3. [ ] Click on a question → navigate to question
4. [ ] Remove bookmark → removed from list

### Flow 6: Review (Missed Questions)

1. [ ] Visit `/app/review`
2. [ ] See list of missed questions (answered incorrectly)
3. [ ] Click on a question → navigate to question

### Flow 7: Dashboard

1. [ ] Visit `/app/dashboard`
2. [ ] Stats display correctly (total questions, answered, accuracy)
3. [ ] Recent activity shows last attempts
4. [ ] "Continue practicing" button works

### Flow 8: Billing

1. [ ] Visit `/app/billing`
2. [ ] Shows current subscription status
3. [ ] "Manage in Stripe" opens Stripe portal

---

## Debugging Session Practice (BUG-062)

### Step-by-Step Debug

1. **Start dev server with verbose logging:**
   ```bash
   pnpm dev
   ```

2. **Open browser DevTools before clicking:**
   - Network tab (filter: Fetch/XHR)
   - Console tab

3. **Click "Start session" and capture:**
   - [ ] Network request URL
   - [ ] Request payload
   - [ ] Response status code
   - [ ] Response body
   - [ ] Console errors

4. **Check server terminal for:**
   - [ ] Controller logs
   - [ ] Error stack traces
   - [ ] Database query errors

5. **Common error codes and meanings:**
   | Code | Meaning | Fix |
   |------|---------|-----|
   | `UNAUTHENTICATED` | No Clerk session | Sign in |
   | `UNSUBSCRIBED` | No active subscription | Subscribe or check DB |
   | `NOT_FOUND` | No questions match filters | Verify database seeded |
   | `RATE_LIMITED` | Too many requests | Wait or check config |
   | `INTERNAL_ERROR` | Uncaught exception | Check server logs |
   | `VALIDATION_ERROR` | Bad input | Check request payload |

---

## After Stabilization

Once all flows above pass:

1. Run full test suite:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build
   ```

2. Commit working state with tag `[BASELINE]`

3. THEN proceed to SPEC-019 refactoring

---

## Related Documents

- [BUG-062: Practice Session Modes Not Working](../bugs/bug-062-practice-session-modes-not-working.md)
- [SPEC-019: Practice UX Redesign](../specs/spec-019-practice-ux-redesign.md)
- [Foundation Audit Report](../bugs/foundation-audit-report.md)
