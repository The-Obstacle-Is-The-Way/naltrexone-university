# DEBT-254: Headings + ErrorCard Compliance

**Status:** Not started
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

#### Step 3: Add explicit `p-4` to compact-context sites (3 sites)

| # | File | Current className | New className |
|---|------|-------------------|---------------|
| 1 | `app/(app)/app/dashboard/page.tsx:134` | `"mt-4"` | `"mt-4 p-4"` |
| 2 | `app/(app)/app/practice/practice-page-client.tsx:58` | _(none)_ | `"p-4"` |
| 3 | `app/(app)/app/history/components/history-sessions-tab.tsx:88` | _(none)_ | `"p-4"` |

**Already explicit (no change needed):**
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:194` — already has `className="p-4"`
- `app/(app)/app/history/components/history-questions-tab.tsx:121` — add `className="p-4"`

**Note:** `history-questions-tab.tsx:121` currently has no className. Add `className="p-4"` to preserve current behavior.

#### Step 4: Update compact-context site count

Total changes: 8 `p-6` overrides removed, 4 explicit `p-4` added. Net: cleaner code, majority-case default.

---

## TDD Approach

1. **COMP-1 test:** Render `ErrorCard` with no className. Assert default includes `p-6` (not `p-4`). Render with `className="p-4"` → assert `p-4` overrides.
2. **D-17 tests:** For each of the 5 pages, render the heading component and assert `font-heading` and `tracking-tight` are present.

**Test files:** Colocated with each source file.

---

## Verification

```bash
# COMP-1: ErrorCard default is p-6
rg -n 'p-6' components/error-card.tsx
# Expected: 1 match (the default)

# COMP-1: No call sites override to p-6
rg -n 'ErrorCard.*p-6' app
# Expected: 0 matches

# D-17: All auth/error headings include font-heading tracking-tight
rg -n 'font-semibold.*text-foreground' \
  app/sign-in app/sign-up \
  app/global-error.tsx components/error-boundary-page.tsx
# Expected: every match includes font-heading tracking-tight

# D-17: Checkout success heading
rg -n 'font-semibold.*text-foreground' \
  'app/(marketing)/checkout/success/checkout-success-sync.tsx'
# Expected: includes font-heading tracking-tight
```

---

## Visual QA

1. **Sign In/Up pages** (with `NEXT_PUBLIC_SKIP_CLERK=true`): H1 should use heading font with tighter tracking
2. **Error boundary:** Trigger an error → heading uses consistent typography
3. **ErrorCard spacing:** Compare `p-6` default sites (majority) vs `p-4` compact sites → both look correct in their contexts

---

## Sequencing Note

COMP-1 touches `history-sessions-tab.tsx:88` and `history-questions-tab.tsx:121` (adding explicit `p-4`). These are trivial className additions that won't conflict with DEBT-252's changes to hover/role attributes on different elements. However, if both PRs are open simultaneously, coordinate the merge order: **DEBT-252 first** (more complex), then DEBT-254 rebases.
