# Master Prompt — All Remaining Debt & Polish

**Date:** 2026-02-08
**Branch:** Create from `dev`
**Baseline:** All 117 bugs resolved, all DEBT-001 through DEBT-191 resolved/invalidated

---

## Inventory

| Category | Count | Priority Range |
|----------|-------|---------------|
| DEBT items (active) | 3 | P3–P4 |
| FE items (active) | 23 | P2–P3 |
| Bugs (active) | 0 | — |
| **Total open items** | **26** | — |

---

## Instructions for the Agent

You are working on `naltrexone-university`. Read `AGENTS.md` and `CLAUDE.md` first. All project rules in those files are mandatory — TDD, fakes-over-mocks, Clean Architecture, non-interactive safety.

### Phase 0: Green Baseline

```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm build
```

Do NOT proceed until all four gates pass. If anything fails, fix it before touching new code.

---

### Phase 1: Source-Reading Test Conversion (DEBT-192) — P3

**Goal:** Convert 3 fragile source-reading tests to behavioral render assertions.

#### 1a. Pricing source-reading tests

**Files:**
- `components/marketing/marketing-home.test.tsx` — the `it('uses shared pricing data constants...')` test
- `app/pricing/page.test.tsx` — the `it('uses shared pricing data constants...')` test

**Current (fragile):**
```typescript
const source = readFileSync(path.resolve(process.cwd(), '...'), 'utf8');
expect(source).toContain("from '@/lib/pricing-data'");
expect(source).not.toContain('$29');
```

**Replace with (behavioral):**
```typescript
import { MONTHLY_PRICE_DISPLAY, ANNUAL_PRICE_DISPLAY, ANNUAL_SAVINGS_DISPLAY } from '@/lib/pricing-data';

// Render the component and verify it contains the pricing data constants
const html = renderToStaticMarkup(<Component {...props} />);
expect(html).toContain(MONTHLY_PRICE_DISPLAY);
expect(html).toContain(ANNUAL_PRICE_DISPLAY);
```

Import the pricing constants from `@/lib/pricing-data` and verify the rendered output contains them. Read the file first to understand the exact constant names. Remove the `readFileSync` and `path` imports if they become unused.

#### 1b. Global error suppressHydrationWarning test

**File:** `app/global-error.test.tsx`

**Current (fragile):**
```typescript
const source = readFileSync(path.resolve(process.cwd(), 'app/global-error.tsx'), 'utf8');
expect(source).toContain('suppressHydrationWarning');
```

**Replace with (behavioral):** The rendered `<html>` element should have the `suppresshydrationwarning` attribute (lowercase, as React renders boolean attributes). Use the existing `DOMParser` already in the test to query the `<html>` element:

```typescript
const htmlEl = doc.querySelector('html');
expect(htmlEl?.hasAttribute('suppresshydrationwarning')).toBe(true);
```

Remove the `readFileSync` and `path` imports if they become unused.

#### 1c. DO NOT TOUCH these tests — they are legitimate guardrails:
- `practice-page-logic.test.ts` (line-count cap)
- `card-adoption-regression.test.ts` (Tailwind pattern enforcement)

**Verify:** `pnpm test --run`
**Commit:** `Resolve DEBT-192 convert source-reading tests to behavioral assertions`

---

### Phase 2: Design System Convergence — P2

This is the largest batch. Tackle in sub-phases.

#### 2a. Component primitive adoption (FE-007, FE-008, FE-037)

Replace raw `<button>` and raw styled `<Link>` elements with the `Button` component:

- **FE-007:** `app/pricing/pricing-client.tsx` — `SubscribeButton` uses raw `<button>`. Replace with `<Button>` from `@/components/ui/button`, preserving the `useFormStatus` pending logic.
- **FE-008:** `components/marketing/marketing-home.tsx` — 11 raw styled `<Link>` elements. Replace CTA-style links (those with `px-6 py-3` styling) with `<Button asChild><Link>`. Nav links with just color styling can use `<Button variant="link" asChild><Link>` or remain as links with proper focus rings.
- **FE-037:** `components/theme-toggle.tsx` — raw `<button>`. Replace with `<Button variant="ghost" size="icon">`.

**Verify:** `pnpm typecheck && pnpm test --run`
**Commit:** `Resolve FE-007/008/037 adopt Button primitive for all interactive elements`

#### 2b. Card component adoption (FE-009, FE-010, FE-016, FE-017)

- **FE-009:** `components/marketing/marketing-home.tsx` — replace card-like `<div className="rounded-2xl border border-border bg-card ...">` with `<Card>` component (10 instances: 4 stats, 4 features, 2 pricing)
- **FE-010:** `components/question/` — rename `QuestionCard.tsx` to `question-card.tsx`, `ChoiceButton.tsx` to `choice-button.tsx`, `Feedback.tsx` to `feedback.tsx`. Update all imports. Replace card-like divs with `<Card>` where appropriate.
- **FE-016:** `components/ui/card.tsx` — update defaults from `rounded-xl gap-6 py-6` to `rounded-2xl gap-0 p-6 shadow-sm` so consumers don't need to override.
- **FE-017:** `components/loading/page-loading.tsx` — change skeleton from `rounded-xl` to `rounded-2xl` to match cards.

**Verify:** `pnpm typecheck && pnpm test --run`
**Commit:** `Resolve FE-009/010/016/017 adopt Card component and fix naming conventions`

#### 2c. Focus ring unification (FE-011, FE-012, FE-013)

- **FE-011:** Audit all files using the legacy `ring-2 ring-ring ring-offset-2` pattern. Replace with `ring-ring/50 ring-[3px]` (the Button standard). Search with: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **FE-012:** Add `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` to all interactive text links that currently lack focus indicators.
- **FE-013:** `pricing-client.tsx` and `ChoiceButton.tsx` — change `opacity-60` to `opacity-50` on disabled states.

**Verify:** `pnpm typecheck && pnpm test --run`
**Commit:** `Resolve FE-011/012/013 unify focus rings and disabled opacity`

#### 2d. Style consistency (FE-018, FE-022, FE-023, FE-024, FE-025)

- **FE-018:** `metallic-border.tsx` and `notification-provider.tsx` — use `cn()` for class merging
- **FE-022:** Unify stat card hover to `transition-colors hover:border-border/80 hover:bg-muted/50`
- **FE-023:** Add `transition-colors` to all hover color changes in `not-found.tsx`, `pricing-view.tsx`, `layout.tsx`
- **FE-024:** Add `font-display` to price numbers in `pricing-view.tsx`
- **FE-025:** Replace `h-X w-X` with `size-X` for icons in `metallic-cta-button.tsx`, `marketing-home.tsx`, `theme-toggle.tsx`

**Verify:** `pnpm typecheck && pnpm test --run`
**Commit:** `Resolve FE-018/022/023/024/025 style consistency cleanup`

---

### Phase 3: Structural Decomposition — P2/P3

#### 3a. Checkout success decomposition (FE-035)

**File:** `app/(marketing)/checkout/success/checkout-success-sync.tsx` (437 lines)

Split into focused modules:
1. Extract types (~lines 23-115) into `checkout-success-types.ts`
2. Extract assertion/validation helpers into `checkout-success-assertions.ts`
3. Keep the main sync orchestration in `checkout-success-sync.tsx`

Goal: get `checkout-success-sync.tsx` under 300 lines.

**Verify:** `pnpm typecheck && pnpm test --run`
**Commit:** `Resolve FE-035 decompose checkout-success-sync into focused modules`

#### 3b. Question flow hook unification (FE-045)

**Files:**
- `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts` (182 lines)
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` (222 lines)

Strategy:
1. Read both files carefully — identify shared vs unique state/callbacks
2. Extract shared state+submit+load logic into `app/(app)/app/practice/shared/use-question-flow-core.ts`
3. Both hooks consume the core hook and add their specific extras
4. All existing browser specs and unit tests must still pass

**Verify:** `pnpm typecheck && pnpm test --run && pnpm test:browser`
**Commit:** `Resolve FE-045 unify question flow hooks via shared core`

#### 3c. Review stage hook (FE-002)

**File:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` (212 lines)

If natural seams exist after the FE-045 unification, extract further. Target: under 150 lines. If the hook is genuinely cohesive at 212 lines, document acceptance with justification and close.

#### 3d. Question page client (FE-031)

**File:** `app/questions/[slug]/question-page-client.tsx` (240 lines)

Extract ~90 lines of inline hook logic into `use-question-page-controller.ts`. The page component should only render UI.

**Verify:** `pnpm typecheck && pnpm test --run`
**Commit:** `Resolve FE-031 extract question page controller hook`

---

### Phase 4: Error Boundaries & Route Completeness — P3

#### 4a. Extract shared error boundary (FE-015)

9 `error.tsx` files are copy-pasted. Create a shared `components/error-boundary-page.tsx`:

```tsx
export function ErrorBoundaryPage({
  error,
  reset,
  title,
  backHref,
  backLabel,
}: ErrorBoundaryPageProps) { ... }
```

Then each route's `error.tsx` becomes:
```tsx
export default function ErrorPage({ error, reset }: Props) {
  return <ErrorBoundaryPage error={error} reset={reset} title="..." backHref={ROUTES.APP_DASHBOARD} backLabel="Back to Dashboard" />;
}
```

**Commit:** `Resolve FE-015 extract shared error boundary component`

#### 4b. Missing error.tsx and metadata (FE-020, FE-021)

- **FE-020:** Add `error.tsx` to `app/(app)/app/practice/[sessionId]/`
- **FE-021:** Add `export const metadata` to all page.tsx files. Format: `{Page Name} - Addiction Boards`

**Commit:** `Resolve FE-020/021 add missing error boundary and per-page metadata`

---

### Phase 5: Accessibility Polish — P3

- **FE-026:** Add `aria-label` with context to repeated buttons in `bookmarks/page.tsx`, `review/page.tsx`, `practice-session-history-panel.tsx`, `exam-review-view.tsx`
- **FE-019:** Add `target="_blank" rel="noreferrer noopener"` to external `<a>` in `metallic-cta-button.tsx`

**Commit:** `Resolve FE-019/026 accessibility: external link target and aria-labels`

---

### Phase 6: UX Polish — P3

- **FE-028:** Add confirmation dialogs (AlertDialog) for: abandon session, remove bookmark (bookmarks page), submit/end exam
- **FE-029:** Expand toast usage for success feedback (bookmark toggle, session start)
- **FE-030:** Add success toast after bookmark removal on bookmarks page
- **FE-034:** Add helpful CTAs to empty states (bookmarks, review, practice history)
- **FE-032:** Make Clerk theme dynamic (respect system/user preference, not hardcoded dark)
- **FE-033:** Create shared marketing layout for `/` and `/pricing`

**Commit one per logical group.** These are independent and can be split across PRs.

---

### Phase 7: Code Cleanup — P3/P4

- **FE-036:** Delete `avatar.tsx`, `radio-group.tsx`, `label.tsx` and their test files (0 consumers, no spec need). Do NOT delete `dropdown-menu.tsx` (spec-mandated).
- **FE-049:** Add `createBookmark()` factory to `src/domain/test-helpers/factories.ts`
- **FE-038:** Leave card sub-components as-is (KEEP for SPEC-019 Phase 2)
- **DEBT-193:** Decompose the 2 largest backend files (practice-session-repository 446 lines, attempt-repository 353 lines) by extracting codecs/schemas/mappers
- **DEBT-194:** Remove `console.error` defaults from `fire-and-forget.ts`, `practice-page-bookmarks.ts`, `practice-page-tags.ts` — make `logError` required instead of optional

**Commit per item.**

---

### Phase 8: Debt Registry Update

For every item resolved above:
1. Move FE-XXX entries from "Active" to "Resolved" in `docs/debt/index.md`
2. Update `docs/frontend/standards.md` Section 17 to remove resolved violations
3. Move DEBT-192/193/194 to "Resolved" if completed
4. Update `docs/debt/index.md` next IDs

---

### Phase 9: Final Verification

```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build
```

All gates must pass. Create PR, wait for CodeRabbit, address all feedback, then merge.

---

## Priority Order (if time-constrained)

If you can't do everything in one session, tackle in this order:

1. **Phase 1** (DEBT-192) — 30 min, mechanical
2. **Phase 2a** (Button adoption) — 1 hr, high visual impact
3. **Phase 3a** (checkout-success decomposition) — 1 hr, structural
4. **Phase 3b** (question flow unification) — 2 hr, structural
5. **Phase 2b** (Card adoption) — 1 hr, visual consistency
6. **Phase 4** (error boundaries + metadata) — 1 hr, completeness
7. **Phase 2c-2d** (focus rings, style) — 1 hr, polish
8. **Phase 5-7** (accessibility, UX, cleanup) — 2-3 hr, polish

Phases 1-4 are the highest impact. Phases 5-7 are polish that can wait for a future PR.
