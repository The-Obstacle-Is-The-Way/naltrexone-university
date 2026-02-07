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

## Routing

Import routes from `lib/routes.ts` — NEVER hard-code route strings.

```typescript
import { ROUTES } from '@/lib/routes';

// Correct
<Link href={ROUTES.APP_DASHBOARD}>Dashboard</Link>

// Wrong
<Link href="/app/dashboard">Dashboard</Link>
```

See BUG-097 for the systemic hard-coded route problem being addressed.

## Component patterns

- Keep components small (target <300 lines per file)
- Extract custom hooks into `hooks/` subdirectories
- Use `components/ui/` shadcn primitives, don't reinvent
- Server Components by default; add `'use client'` only when needed

## Imports

- Use `@/...` alias for all imports
- `lib/` for core utilities (auth, Stripe, env, DB)

## Key files

| File | Purpose |
|------|---------|
| `proxy.ts` | Clerk middleware (route protection) |
| `lib/env.ts` | Zod-validated environment variables |
| `lib/routes.ts` | Route constants (ROUTES object) |
| `lib/auth.ts` | Clerk auth helpers |
| `components/ui/` | shadcn/ui primitives |

## Error handling in UI

- Every error state MUST have an escape hatch (navigation away, not just "Try again")
- Loading states must be shown for all async operations
- See BUG-089 (loading gaps) and BUG-090 (error escape hatches) for patterns to avoid
