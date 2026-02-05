# Deployment Environments: Source of Truth

This document establishes the relationship between Clerk instances, Vercel deployments, and environment configurations.

---

## The Two Clerk Instances (Completely Separate)

Clerk has **two entirely separate instances** with **no shared data**:

| Instance | Dashboard URL | Users | API Keys |
|----------|---------------|-------|----------|
| **Development** | clerk.com → "Development" tab | Test users, your Gmail | `pk_test_*`, `sk_test_*` |
| **Production** | clerk.com → "Production" tab | Real paying users | `pk_live_*`, `sk_live_*` |

**Key insight:** A user created in Development does NOT exist in Production. They are completely separate databases.

---

## The Three Vercel Environments

| Environment | URL | Git Branch | Purpose |
|-------------|-----|------------|---------|
| **Production** | `addictionboards.com` | `main` | Real users, real payments |
| **Preview** | `*.vercel.app` | Any branch | Testing before merge |
| **Development** | `localhost:3000` | Local | Local development |

---

## Correct Key Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLERK DEVELOPMENT                            │
│  (pk_test_*, sk_test_*)                                         │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  localhost:3000  │    │  Vercel Preview  │                   │
│  │  (pnpm dev)      │    │  (*.vercel.app)  │                   │
│  └──────────────────┘    └──────────────────┘                   │
│                                                                  │
│  Users: Test accounts, your Gmail, E2E test user                │
│  Stripe: Test mode (sk_test_*)                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     CLERK PRODUCTION                             │
│  (pk_live_*, sk_live_*)                                         │
│                                                                  │
│  ┌──────────────────────────────────────────┐                   │
│  │  addictionboards.com (Vercel Production) │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
│  Users: Real paying customers only                              │
│  Stripe: Live mode (sk_live_*)                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Current State Audit (2026-02-05)

### Verified Facts

1. **Branch:** `codex/exploratory-e2e-theme-contrast`
   - **27 commits ahead of main** (not merged)
   - Contains: CSP headers, error boundaries, bug fixes, UI improvements

2. **Vercel Environment Variables (VERIFIED):**
   ```
   Production:    Clerk Production keys (pk_live_*, sk_live_*) - set 2h ago
   Preview:       Clerk Development keys (pk_test_*, sk_test_*) - set 5d ago
   Development:   Clerk Development keys (pk_test_*, sk_test_*) - set 5d ago
   ```
   ✅ This configuration is CORRECT

3. **Code Deployed:**
   - **Production (`addictionboards.com`)**: Running OLD code from `main` branch
   - **Preview (`*.vercel.app`)**: Running current branch code

4. **Production Blank Screen Root Cause:**
   - Clerk Production keys were added 2 hours ago
   - But Production is running OLD code from `main`
   - Likely cause: Clerk Production instance redirect URLs not configured, OR
   - Clerk sign-in redirect breaks on old code

### What Needs Verification (Manual - Clerk Dashboard)

- [ ] Clerk Production instance → Settings → Redirect URLs
  - Must include: `https://addictionboards.com/*`
- [ ] Clerk Production instance → Settings → Allowed Origins
  - Must include: `https://addictionboards.com`

---

## E2E Testing Strategy

### For Local E2E Tests (`pnpm test:e2e`)

```
localhost:3000 → Clerk Development → Test users
```

- Use Clerk Development keys in `.env.local`
- Create E2E test user in Clerk Development instance
- Use `@clerk/testing` package with `clerk.signIn()` helper

### For CI/CD E2E Tests (GitHub Actions)

```
Vercel Preview → Clerk Development → Test users
```

- Set Clerk Development keys in GitHub Secrets
- Same E2E test user from Clerk Development
- Tests run against Preview deployment URL

### For Production Monitoring (if ever needed)

```
addictionboards.com → Clerk Production → Synthetic user
```

- Would need separate Clerk Production test user
- Would need Stripe Live mode test card
- Usually NOT recommended - use Preview for E2E

---

## Action Plan

### ⚠️ IMMEDIATE: Fix Production Blank Screen (P0)

**Diagnosis needed:** Go to Clerk Dashboard → Production instance → Settings

Check these settings:
1. **Allowed redirect URLs** - Must include `https://addictionboards.com/*`
2. **Allowed origins** - Must include `https://addictionboards.com`
3. **Sign-in/Sign-up URLs** - Should be `/sign-in` and `/sign-up`

If these are missing, add them. This should fix the blank screen.

If still broken after fixing redirect URLs, then:
- Temporarily revert Production Clerk keys back to Development keys
- This makes Production use Clerk Development (same as before)
- Allows users to access site while we investigate

### Phase 1: Stabilize Production (Today)

1. **Fix Clerk Production redirect URLs** (manual in Clerk dashboard)
2. **Verify Production site works** at `addictionboards.com`
3. If still broken → Revert to Clerk Development keys temporarily

### Phase 2: Clean Up Current Branch

1. **Commit current uncommitted changes:**
   - `docs/bugs/bug-069-stripe-checkout-fails-localhost.md`
   - `docs/dev/deployment-environments.md`
   - `docs/debt/debt-104-missing-e2e-test-credentials.md`
   - `package.json` changes (`@clerk/testing`)

2. **Run full test suite:**
   ```bash
   pnpm typecheck && pnpm lint && pnpm test --run && pnpm build
   ```

3. **Push to remote** (creates new Preview deployment)

### Phase 3: Merge to Main

1. **Create PR** from `codex/exploratory-e2e-theme-contrast` → `main`
2. **Wait for CodeRabbit review** (mandatory per CLAUDE.md)
3. **Address all CodeRabbit feedback**
4. **Merge PR** - This deploys current branch code to Production

### Phase 4: E2E Testing Setup (After Merge)

1. E2E test user already exists in **Clerk Development** instance
2. E2E tests run against **Preview deployments** (not Production)
3. Configure CI to run E2E tests on Preview URLs
4. Subscribe E2E test user via Preview deployment (uses Stripe Test mode)

### What NOT to Do

- ❌ Don't create E2E test users in Clerk Production
- ❌ Don't run E2E tests against Production
- ❌ Don't use Stripe Live mode for testing
- ❌ Don't merge to main before Production is stable

---

## Environment Variable Checklist

### `.env.local` (localhost)

```bash
# Clerk Development keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Stripe Test mode
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# E2E Test credentials (Clerk Development user)
E2E_CLERK_USER_USERNAME=e2e-test@addictionboards.com
E2E_CLERK_USER_PASSWORD=...
```

### Vercel Preview Environment

```bash
# Same as .env.local - Clerk Development keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### Vercel Production Environment

```bash
# Clerk Production keys (different instance!)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# Stripe Live mode
STRIPE_SECRET_KEY=sk_live_...
```

---

## Common Mistakes to Avoid

1. **Creating test users in Production Clerk** - They should be in Development
2. **Using Production keys for Preview deployments** - Breaks testing
3. **Mixing up Vercel environments** - Preview ≠ Production
4. **Merging to main before E2E tests pass** - Breaks Production
5. **Setting Production Clerk keys before code is ready** - Current P0 bug

---

## Quick Reference Commands

```bash
# Check current branch
git branch --show-current

# Check what's different from main
git log main..HEAD --oneline

# Check Vercel deployments
vercel ls

# Check Vercel env vars (requires Vercel CLI login)
vercel env ls production
vercel env ls preview
```
