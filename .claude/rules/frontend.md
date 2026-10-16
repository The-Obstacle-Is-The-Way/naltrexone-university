---
paths:
  - "app/**"
  - "components/**"
---

# Frontend Rules (Next.js App Router)

## Tech stack

- **Next.js 16** (App Router) with React 19
- **Tailwind CSS v4** + **shadcn/ui** (primitives in `components/ui/`)
- **Clerk** for auth (`@clerk/nextjs`)
- **Biome** for lint + format (not ESLint/Prettier)

## Canonical UI Patterns (Standards Enforcement)

ALWAYS refer to these design docs as sources of truth when editing
files in `app/**`, `components/**`, or any UI surface:

- `docs/design-system/standards.md` — tokens, focus rings, spacing, typography
- `docs/design-system/pattern-registry.md` — opacity scale, foreground ramps, dark-mode rules
- `docs/design-system/contrast.md` — WCAG AA contrast targets
- `docs/design-system/layout.md` — layout composition
- `docs/design-system/typography.md` — text-size discipline
- `docs/design-system/bookmark-surfaces.md` — bookmark appearance decision tree

Mandatory patterns — never diverge:

### 1. Focus rings (single canonical pattern)

Use the `<Button>` component (which has the ring built in) OR copy the
canonical pattern EXACTLY:

    focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]

Never hand-roll variants. Never change the ring opacity or width. If
your interactive element cannot use Button, copy the pattern, then ADD
the new component to `components/theme-token-regression.test.tsx` in
the same PR so the regression guard covers it.

### 2. Opacity scale (background + hover)

When using `bg-muted`, `bg-foreground`, or similar layer fills, use
ONLY the canonical opacities from `pattern-registry.md` § 1.2:

| Opacity | Use |
|---|---|
| `/20` | Tint (non-interactive backgrounds inside cards) |
| `/40` | Subtle hover inside cards |
| `/50` | Standard hover on page background |
| `/60` | Exception-only emphasized hover (requires design review) |
| `/80` | RESERVED — do not use |
| `/100` | RESERVED for solid fills only — do not use for hover |
| Documented foreground-ramp values (`/5`, `/[0.06]`, `/[0.07]`, `/[0.08]`, `/[0.12]`, `dark:hover:bg-foreground/[0.05]`) | Allowed ONLY in the exact Pattern Registry contexts (`I-1`, `I-2`, `I-3`, `I-4`, `M-4`) |
| Undocumented arbitrary values (`/[0.03]`, `/[0.10]`, `/[13%]`, etc.) | NEVER USE — add the pattern to the registry first or choose an existing token |

If your use case is not on the scale, add it to `pattern-registry.md`
with a rationale, THEN implement.

### 3. Semantic tokens (NEVER raw colors)

Use `bg-primary`, `text-foreground`, `text-muted-foreground`,
`border-border`, etc.

NEVER use raw hex (`#fff`, `#121212`) or palette colors (`bg-zinc-400`,
`text-slate-300`) in `.tsx` UI code except documented third-party API
seams such as Clerk `appearance.variables`.

Enforcement: `components/theme-token-regression.test.tsx` blocks raw
palette regressions in selected high-risk components. Add new components
to this test when they expand the design surface and need token/opacity
coverage.

### 4. Component-system mandate

All production UI interactive click targets MUST use the `<Button>`
component (standards.md § 2). Raw `<button>` is allowed in production
only inside `components/ui/` primitives and app-shell disclosure toggles
per Pattern Registry I-6. The production Biome restriction intentionally excludes
`*.test.tsx`, `*.browser.spec.tsx`, `*test-helpers.tsx`, and
`*.probes.tsx`; native semantic controls are allowed there only in
test-only hook/state-machine probes, while tests whose subject is Button
or design-system behavior must still use `<Button>`.

Only the
documented `components/mobile-nav.tsx` Pattern Registry I-6 app-shell
disclosure exception remains; its exact-one count stays enforced by the
theme regression test because a file-level lint exception cannot bound it.

### 5. Dark-mode strategy

Semantic tokens handle light/dark automatically. Component-specific
`dark:` overrides are allowed ONLY when they appear in
`pattern-registry.md` or `contrast.md`. If the same dark
override appears in 2+ components, promote it into a shared primitive
or a constant in `lib/shared-styles.ts`.

---

## Discoverability rule

If you cannot find a pattern documented in the design docs above, do
not invent one. Either:

(a) Add it to `pattern-registry.md` with rationale and design review,
    THEN implement.

(b) File a debt record in `docs/records/` proposing the addition, with a
    row in `docs/records/README.md`.

NEVER ship a one-off pattern that diverges from the documented system
without a corresponding doc entry.

## Routing

Import routes from `lib/routes.ts` — NEVER hard-code route strings.

```typescript
import { ROUTES } from '@/lib/routes';

// Correct
<Link href={ROUTES.APP_DASHBOARD}>Dashboard</Link>

// Wrong
<Link href="/app/dashboard">Dashboard</Link>
```

A test may assert a public path as a literal: production reads `ROUTES`, so a test that read it too would pass with a wrong constant.


## Component patterns

- Keep components small (target <300 lines per file)
- Extract custom hooks into `hooks/` subdirectories
- Use `components/ui/` shadcn primitives, don't reinvent
- Server Components by default; add `'use client'` only when needed

## Key files

| File | Purpose |
|------|---------|
| `proxy.ts` | Clerk middleware (route protection) |
| `lib/env.ts` | Zod-validated environment variables |
| `lib/routes.ts` | Route constants (ROUTES object) |
| `lib/container.ts` | Composition root; `createAuthGateway()` reads the signed-in user |
| `components/ui/` | shadcn/ui primitives |

## Error handling in UI

- Every error state MUST have an escape hatch (navigation away, not just "Try again")
- Loading states must be shown for all async operations
