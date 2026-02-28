# DEBT-254: Headings + ErrorCard Compliance

**Status:** Resolved (2026-02-28)
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-17, COMP-1
**Files:** 5 auth/error pages + `components/error-card.tsx` (13 call sites)

---

## Items

### D-17: Auth/Error Page Heading Inconsistency

All app pages use `text-2xl font-bold font-heading tracking-tight text-foreground` for H1. Five utility/error pages diverge.

**Target for utility pages** (smaller context = smaller heading):
```
text-xl font-semibold font-heading tracking-tight text-foreground
```

**Target for Global Error** (already uses `text-2xl font-bold`):
```
text-2xl font-bold font-heading tracking-tight text-foreground
```

#### Sign In (`app/sign-in/[[...sign-in]]/sign-in-page-client.tsx:25`)

**Current:**
```tsx
<h1 className="text-xl font-semibold text-foreground">Sign In</h1>
```

**Target:**
```tsx
<h1 className="text-xl font-semibold font-heading tracking-tight text-foreground">Sign In</h1>
```

**Change:** Add `font-heading tracking-tight`

#### Sign Up (`app/sign-up/[[...sign-up]]/sign-up-page-client.tsx:25`)

**Current:**
```tsx
<h1 className="text-xl font-semibold text-foreground">Sign Up</h1>
```

**Target:**
```tsx
<h1 className="text-xl font-semibold font-heading tracking-tight text-foreground">Sign Up</h1>
```

**Change:** Add `font-heading tracking-tight`

#### Checkout Success (`app/(marketing)/checkout/success/checkout-success-sync.tsx:283`)

**Current:**
```tsx
<h1 className="text-xl font-semibold text-foreground">
```

**Target:**
```tsx
<h1 className="text-xl font-semibold font-heading tracking-tight text-foreground">
```

**Change:** Add `font-heading tracking-tight`

**Note:** This H1 only renders during the transient "Finalizing…" state before redirect. Low visibility, but consistency matters.

#### Global Error (`app/global-error.tsx:29`)

**Current:**
```tsx
<h1 className="text-2xl font-bold font-heading text-foreground">
```

**Target:**
```tsx
<h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
```

**Change:** Add `tracking-tight`

#### Error Boundary (`components/error-boundary-page.tsx:39,43`)

**Current** (both h1 and h2 paths):
```tsx
<h1 className="text-xl font-semibold font-heading text-foreground">
<h2 className="text-xl font-semibold font-heading text-foreground">
```

**Target:**
```tsx
<h1 className="text-xl font-semibold font-heading tracking-tight text-foreground">
<h2 className="text-xl font-semibold font-heading tracking-tight text-foreground">
```

**Change:** Add `tracking-tight` to both heading variants

---

### COMP-1: ErrorCard Default Padding Mismatch

**Pattern:** F-3 (ErrorCard) — majority usage is `p-6`, but default is `p-4`

#### Step 1: Change ErrorCard default

**File:** `components/error-card.tsx:15`

**Current:**
```
rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-sm
```

**Target:**
```
rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive shadow-sm
```

#### Step 2: Remove redundant `p-6` overrides (8 call sites)

| # | File | Current className | New className |
|---|------|-------------------|---------------|
| 1 | `app/(app)/app/bookmarks/page.tsx:218` | `"p-6"` | _(remove)_ |
| 2 | `app/(app)/app/bookmarks/page.tsx:258` | `"p-6"` | _(remove)_ |
| 3 | `app/(app)/app/dashboard/page.tsx:289` | `"p-6"` | _(remove)_ |
| 4 | `app/(app)/app/billing/page.tsx:150` | `"p-6"` | _(remove)_ |
| 5 | `app/(app)/app/questions/[slug]/question-page-client.tsx:222` | `"p-6"` | _(remove)_ |
| 6 | `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:127` | `"p-6"` | _(remove)_ |
| 7 | `app/(app)/app/practice/components/practice-view.tsx:168` | `"p-6"` | _(remove)_ |
| 8 | `app/(app)/app/practice/components/practice-view.tsx:193` | `"p-6"` | _(remove)_ |

#### Step 3: Add explicit `p-4` to compact-context sites that currently rely on the default (4 sites)

| # | File | Current className | New className |
|---|------|-------------------|---------------|
| 1 | `app/(app)/app/dashboard/page.tsx:134` | `"mt-4"` | `"mt-4 p-4"` |
| 2 | `app/(app)/app/practice/practice-page-client.tsx:58` | _(none)_ | `"p-4"` |
| 3 | `app/(app)/app/history/components/history-sessions-tab.tsx:88` | _(none)_ | `"p-4"` |
| 4 | `app/(app)/app/history/components/history-questions-tab.tsx:121` | _(none)_ | `"p-4"` |

**Already explicit (no change needed):**
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:194` — already has `className="p-4"`

#### Step 4: Update compact-context site count

Total changes: 8 `p-6` overrides removed, 4 explicit compact-context `p-4` declarations after migration (3 newly added className props + 1 existing className expansion from `mt-4` to `mt-4 p-4`).

---

## TDD Approach

1. **COMP-1 test:** Render `ErrorCard` with no className. Assert default includes `p-6` (not `p-4`). Render with `className="p-4"` → assert `p-4` overrides.
2. **D-17 tests:** Render each heading surface and assert target class string:
   - utility headings use `text-xl font-semibold font-heading tracking-tight text-foreground`
   - global error heading uses `text-2xl font-bold font-heading tracking-tight text-foreground`

**Test files:**
1. Existing: `components/error-card.test.tsx` (extend to assert default `p-6` and className override behavior)
2. Existing: `app/global-error.test.tsx` (extend to assert `tracking-tight` on the heading)
3. New: `components/error-boundary-page.test.tsx` (assert both h1/h2 paths include `tracking-tight`)
4. Existing: `app/sign-in/[[...sign-in]]/page.test.tsx` (extend skip-clerk fallback assertions to include heading classes on `SignInPageClient`)
5. Existing: `app/sign-up/[[...sign-up]]/page.test.tsx` (extend skip-clerk fallback assertions to include heading classes on `SignUpPageClient`)
6. Existing: `app/(marketing)/checkout/success/page.test.ts` (extend fallback-shell assertion to include finalizing heading classes from `runCheckoutSuccessPage`)

---

## Verification

```bash
# COMP-1: ErrorCard default is p-6
rg -n 'p-6' components/error-card.tsx
# Expected: 1 match (the default)

# COMP-1: No call sites override to p-6
rg -n 'ErrorCard className="p-6"' app
# Expected: 0 matches

# COMP-1: Compact-context explicit p-4 preserved
rg -n 'ErrorCard className="mt-4 p-4"|ErrorCard className="p-4"|return <ErrorCard className="p-4"' \
  'app/(app)/app/dashboard/page.tsx' \
  'app/(app)/app/practice/practice-page-client.tsx' \
  'app/(app)/app/history/components/history-sessions-tab.tsx' \
  'app/(app)/app/history/components/history-questions-tab.tsx' \
  'app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx'
# Expected: 5 matches (4 migrated compact contexts + existing explicit p-4 site)

# D-17: Utility/error headings include tracking-tight targets
rg -n 'text-xl font-semibold font-heading tracking-tight text-foreground' \
  'app/sign-in/[[...sign-in]]/sign-in-page-client.tsx' \
  'app/sign-up/[[...sign-up]]/sign-up-page-client.tsx' \
  'app/(marketing)/checkout/success/checkout-success-sync.tsx' \
  components/error-boundary-page.tsx
# Expected: 5 matches (SignIn h1, SignUp h1, Checkout h1, ErrorBoundary h1 + h2)

# D-17: Global error heading includes tracking-tight
rg -n 'text-2xl font-bold font-heading tracking-tight text-foreground' app/global-error.tsx
# Expected: 1 match
```

---

## Visual QA

1. **Sign In/Up pages** (with `NEXT_PUBLIC_SKIP_CLERK=true`): H1 should use heading font with tighter tracking
2. **Error boundary:** Trigger an error → heading uses consistent typography
3. **ErrorCard spacing:** Compare `p-6` default sites (majority) vs `p-4` compact sites → both look correct in their contexts

---

## Sequencing Note

COMP-1 touches `history-sessions-tab.tsx:88` and `history-questions-tab.tsx:121` (adding explicit `p-4`). These are trivial className additions that won't conflict with DEBT-252's changes to hover/role attributes on different elements. However, if both PRs are open simultaneously, coordinate the merge order: **DEBT-252 first** (more complex), then DEBT-254 rebases.
