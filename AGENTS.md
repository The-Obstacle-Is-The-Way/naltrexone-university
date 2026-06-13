# AGENTS.md

Repository guidelines for AI coding agents (Codex CLI, Claude Code, Cursor, GitHub Copilot, etc.) working with this codebase.

> **This is the single source of truth for all agents.** Claude Code also reads `CLAUDE.md` (slim, Claude-specific supplements) and `.claude/rules/` (path-scoped rules). Keep universal project rules here; keep Claude-only or path-scoped guidance in those Claude-specific files so instructions do not drift or conflict.

---

## ⚠️ CRITICAL: React 19 + Vitest Testing Requirements

**READ THIS FIRST. Tests will fail in git hooks/CI without these requirements.**

### For ALL `.test.tsx` files:

```typescript
// @vitest-environment jsdom   ← MUST be first line
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let MyComponent: typeof import('./MyComponent').default;

beforeAll(async () => {
  MyComponent = (await import('./MyComponent')).default;
});

// Use renderToStaticMarkup for render-output tests
describe('MyComponent', () => {
  it('renders output', () => {
    const html = renderToStaticMarkup(<MyComponent />);
    expect(html).toContain('Expected text');
  });
});
```

### Why:

- `@testing-library/react` has a [known bug](https://github.com/testing-library/react-testing-library/issues/1392) with React 19 + Vitest — **no fix coming**
- Git hooks and CI load production builds where `act()` is undefined
- `renderToStaticMarkup` is a stable first-party React API that works everywhere

### Import placement + timeout policy (DEBT-225):

- Keep dynamic imports, but load them in `beforeAll` (or `beforeEach` only when mock/module-reset order requires it)
- Do **not** import heavy modules inside individual `it()` blocks
- Do **not** add per-test timeout overrides (`it(..., 10_000)` or `{ timeout: 15_000 }`)
- Global Vitest policy is configured in `vitest.config.ts`, `vitest.browser.config.ts`, and `vitest.integration.config.ts`

### DO NOT USE for jsdom component tests:

- `@testing-library/react` — broken, zombie maintenance
- `react-test-renderer` — deprecated in React 19

### Browser Mode for async hooks / interactive UI:

- Use `vitest-browser-react` in `*.browser.spec.tsx`
- Run with `pnpm test:browser`
- This is the approved replacement for async hook/interaction tests (see DEBT-141 resolution)

### Full details: `docs/dev/react-vitest-testing.md`

---

## ⚠️ AGENT-SPECIFIC: Slot Protection — Understand Before Changing

**BEFORE writing ANY code, you MUST study existing codebase patterns.**

This codebase follows strict conventions (Clean Architecture, SOLID, TDD). Code that doesn't match existing patterns will be rejected. **Study first, code second.**

### Mandatory Pre-Work (First-Time Agents)

1. **Read 2-3 existing test files** to understand test structure:
   ```bash
   cat src/adapters/gateways/clerk-auth-gateway.test.ts
   cat src/adapters/repositories/drizzle-user-repository.test.ts
   ```
   - We use **fakes**, NEVER `vi.mock()` for our own code
   - Arrange-Act-Assert pattern
   - Descriptive test names: `it('returns X when Y')`

2. **Read 2-3 source files** to understand code style:
   ```bash
   cat src/adapters/gateways/clerk-auth-gateway.ts
   cat src/adapters/repositories/drizzle-user-repository.ts
   ```
   - Constructor dependency injection
   - `ApplicationError` with typed codes
   - No magic numbers — use constants/configs

3. **Check for existing shared types** before creating new ones:
   ```bash
   ls src/adapters/shared/           # Shared adapter types
   ls src/application/ports/         # Port interfaces
   ls src/application/test-helpers/  # Fakes for testing
   ```

### Why This Matters

| Pattern | Wrong                          | Right                                         |
|---------|--------------------------------|-----------------------------------------------|
| Testing | `vi.mock('./my-repo')`         | `new FakeRepository()`                        |
| DI      | `import { db } from './db'`    | `constructor(private db: DrizzleDb)`          |
| Errors  | `throw new Error('oops')`      | `throw new ApplicationError('CODE', 'msg')`   |
| Types   | Define locally in each file    | Import from `src/adapters/shared/`            |

---

## ⚠️ MANDATORY: Test-Driven Development (TDD)

**ALL CODE MUST BE TEST-DRIVEN. NO EXCEPTIONS.**

Before writing ANY implementation code:
1. **Write the test first** (Red)
2. **Write minimum code to pass** (Green)
3. **Refactor if needed** (Refactor)

If you find yourself writing code without a failing test, STOP. Write the test first.

**Test locations:**
- Domain/Application: Colocate tests (`*.test.ts`) next to source
- Integration: `tests/integration/*.integration.test.ts`
- E2E: `tests/e2e/*.spec.ts`

See Robert C. Martin (Uncle Bob) - Clean Code, Clean Architecture, TDD principles.

---

## ⚠️ MANDATORY: Verify EVERY Change Before Pushing

**Run the full quality gate before EVERY push. NO EXCEPTIONS.**

The pre-push git hook only runs `pnpm typecheck && pnpm test --run`. That is NOT sufficient. Many regressions (build-time prerender errors, browser test failures, integration bugs) are only caught by the full gate. If you push without running the build, you WILL break CI.

### The Rule

**Before every `git push`, run:**

```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

**If the local authenticated billing E2E environment is available, also run before every `git push`:**

That means the full Playwright prereqs documented in `docs/dev/testing-infrastructure.md#environment-variables-for-e2e` are present (typically via `.env.local`): `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `E2E_CLERK_USER_USERNAME`, `E2E_CLERK_USER_PASSWORD`, `E2E_STRIPE_OWNER`, `STRIPE_SECRET_KEY`, and `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY`. `DATABASE_URL` is still required in `.env.local` for normal local app development (`pnpm dev`, migrations, and seed commands), but not for the hermetic local E2E workflow unless you intentionally target an existing external database with `E2E_USE_EXISTING_DATABASE=true DATABASE_URL="<target>" pnpm test:e2e`.

```bash
# Quick file check when you rely on .env.local:
rg '^(CLERK_SECRET_KEY|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY|E2E_CLERK_USER_USERNAME|E2E_CLERK_USER_PASSWORD|E2E_STRIPE_OWNER|STRIPE_SECRET_KEY|NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY)=' .env.local

# Local E2E is hermetic by default: it starts an isolated per-clone Docker
# Postgres, migrates, seeds placeholder content, and runs Playwright against
# the resolved local app and database target.
pnpm test:e2e
```

Never run E2E migrations by relying on implicit `.env.local` resolution alone. Normal local E2E does not need remote migrations. For an intentional deploy-target E2E check, verify the host and use `E2E_USE_EXISTING_DATABASE=true DATABASE_URL="<target>" pnpm test:e2e`; migrate a remote target only when you deliberately mean to mutate it.

This is not optional. This is not "before opening a PR." This is **before every push**, including follow-up fix commits. Every single time.

### Why This Matters

- `pnpm test --run` does NOT catch Next.js prerender errors — only `pnpm build` does
- `pnpm typecheck` does NOT catch runtime `'use cache'` violations — only `pnpm build` does
- Same-repo PR CI runs `pnpm test:e2e`; if the local authenticated billing E2E environment is available, skipping the local Docker-backed E2E run means you are deferring failures to CI
- Pushing without `pnpm build` has caused repeated CI failures that waste human review time
- The pre-push hook is intentionally lightweight for speed — **you** are responsible for the full gate

### Red Flags (STOP if any apply)

- Thinking "the pre-push hook passed, so it's fine" → **WRONG, run the full gate**
- Thinking "this is just a small fix, doesn't need a build" → **WRONG, small fixes cause big regressions**
- Thinking "I'll push now and fix CI later" → **STOP, that's the exact problem**

---

## ⚠️ MANDATORY: Design System Discipline (UI Changes)

Before writing or editing ANY UI code in `app/**` or `components/**`, you MUST consult these design-system docs as sources of truth:

- `docs/frontend/standards.md` — semantic tokens (no raw `.tsx` colors except documented third-party API seams), Button component mandate, single canonical focus-ring pattern, spacing, typography, dark mode strategy
- `docs/frontend/pattern-registry.md` — muted/layer-2 opacity scale (`/20`, `/40`, `/50`, `/60`), foreground-ramp tonal-row tokens (allowlisted in `I-1`/`I-2`/`I-3`/`I-4`/`M-4`), dark-mode override conventions
- `docs/frontend/contrast-policy.md` — WCAG AA contrast targets and required-boundary rules
- `docs/frontend/design-principles.md` — layout composition, navigation zones, action-bar conventions
- `docs/frontend/typography-policy.md` — explicit text-size choices (no implicit inheritance)
- `docs/frontend/bookmark-surface-policy.md` — bookmark appearance decision tree

### Mandates (no exceptions without a registry entry + design review)

- **Component-system** (`standards.md` § 2): All interactive click targets MUST use the `<Button>` component. Raw `<button>` is allowed only inside `components/ui/` primitives and app-shell disclosure toggles per Pattern Registry I-6.
- **Focus ring** (`standards.md` § 3): One canonical pattern — `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`. Never hand-roll variants.
- **Semantic tokens** (`standards.md` § 1): Never use raw hex (`#fff`, `#121212`) or palette colors (`bg-zinc-400`, `text-slate-300`) in `.tsx` UI code except documented third-party API seams such as Clerk `appearance.variables`. Always use semantic tokens (`bg-primary`, `text-foreground`, `border-border`, etc.).
- **Opacity scale** (`pattern-registry.md` § 1.2): Use the canonical muted/layer-2 scale (`/20`, `/40`, `/50`, `/60`) for `bg-muted`-class fills. Documented foreground-ramp arbitrary values are allowed ONLY in their documented Pattern Registry contexts. Undocumented arbitrary values (`/[0.03]`, `/[0.10]`, `/[13%]`) are forbidden — add the pattern to the registry first or choose an existing token.
- **Dark mode** (`pattern-registry.md` § 1.3): Semantic tokens handle light/dark automatically. Component-specific `dark:` overrides are allowed ONLY when they appear in `pattern-registry.md` or `contrast-policy.md`. Duplicated dark overrides across 2+ components must promote to a shared primitive or `lib/shared-styles.ts` constant.

### Discoverability Rule

If you cannot find a pattern in the design docs above, do NOT invent one. Either (a) add it to `pattern-registry.md` with rationale and design review first, then implement, OR (b) file a debt doc proposing the addition.

### Enforcement Status

The formal enforcement layer is live: `.claude/rules/frontend.md` gateways UI work to the design docs, and `components/theme-token-regression.test.tsx` / `components/theme-token-regression-source-scan.ts` fail CI on raw `<button>` drift and undocumented opacity values.

See `docs/_archive/debt/debt-398-design-system-enforcement-gap.md` for the completed enforcement arc. See `docs/_archive/debt/debt-399-component-system-bypass-cleanup.md` for the completed cleanup of existing bypass sites; only the documented `components/mobile-nav.tsx` Pattern Registry I-6 app-shell disclosure exception remains.

---

## Project Overview

**Addiction Boards** (Naltrexone University) is a subscription-based SaaS question bank for Addiction Psychiatry and Addiction Medicine board exam preparation. Users subscribe ($29/mo or $199/yr), practice questions in tutor/exam modes, and track progress.

**Technical source of truth:** `docs/specs/master_spec.md`

## Setup

```bash
# Requirements: Node 24.x, pnpm >=11.0.0
pnpm install                # Install dependencies
cp .env.example .env.local  # Create env file (never commit .env.local)
# Set DATABASE_URL, Clerk keys, and Stripe keys in .env.local
```

## Git Hooks (Husky)

Git hooks are installed automatically on `pnpm install` (via the `prepare` script).

- `pre-commit`: runs staged-file checks via `lint-staged` + Biome auto-fix
- `pre-push`: runs `pnpm typecheck && pnpm test --run`
- `pre-push` is intentionally fast and does **not** run browser/integration/build checks. **The hook passing does NOT mean your code is safe to push.** You MUST run the full quality gate yourself — see "Verify EVERY Change Before Pushing" above.

## Refreshing agent skills

Vendored skills live in `.agents/skills/**`; `.claude/skills/*` and `.codex/skills/*` are committed symlinks to those directories. Do not write to, delete, or recreate the symlinks during a refresh.

Use `.agents/skills/skills.manifest.json` as the source of truth. Refresh one skill at a time with that skill's `refreshCommand`, review `git --no-pager diff -- .agents/skills/<skill>`, then commit the result with the upstream short SHA. Start from a clean skills tree:

```bash
git diff --quiet -- .agents/skills .claude/skills .codex/skills
```

Special cases: `agent-browser` is a first-party fork and must be manually merged while preserving Clerk auth, React click-failure / DEBT-323 guidance, and `docs/tooling/agent-browser.md`; `neon-drizzle-setup` and `stripe-subscriptions` are thin pointer skills, so verify their live recipe URLs and do not vendor the full recipe bodies. After refreshing, re-check the `.claude` / `.codex` symlink invariant and confirm there are 15 `SKILL.md` files. See `docs/_archive/debt/debt-416-agent-skills-provenance-and-refresh.md` for the detailed execution log and rationale.

## Non-Interactive Safety (No Vim / No Pagers)

This repo is frequently worked on in non-interactive shells (CI + AI agents). To avoid hard hangs:

- Prefer non-interactive commands: `cat`, `sed -n`, `rg`, `git --no-pager …`.
- Never rely on an editor opening implicitly: always commit with `git commit -m "…"`.
- Avoid pager-triggering patterns: use `git --no-pager log`, `git --no-pager diff`, etc.
- **pnpm gotcha:** Never prefix a pnpm command with `-s`. `pnpm -s <cmd>` runs `<cmd>` as a package script/binary (e.g. `view` → Vim) instead of the pnpm subcommand, which hard-hangs in non-TTY runs.
- **Local test target isolation:** `pnpm test:e2e`, `pnpm test:integration`, and `pnpm db:test:*` resolve a per-clone local target through `scripts/resolve-local-test-target.ts`. Do not blanket-kill `:3000`; if you bypass the wrappers, set `PORT`, `NEXT_PUBLIC_APP_URL`, `DB_TEST_PORT`, `DATABASE_URL`, and `COMPOSE_PROJECT_NAME` from `pnpm exec tsx scripts/resolve-local-test-target.ts env`.

## Commands

Tip: keep commands non-interactive; see the safety notes above.

```bash
# Development
pnpm dev                    # Start dev server (http://localhost:3000)
pnpm build                  # Production build
pnpm start                  # Run production build

# Quality gates (run before committing)
pnpm lint                   # Biome check (lint + format)
pnpm lint:fix               # Auto-fix lint issues
pnpm typecheck              # TypeScript type checking

# Testing
pnpm test                   # Unit tests (Vitest, watch mode)
pnpm test --run             # Unit tests (single run, CI-style)
pnpm test:browser           # Browser mode tests (vitest-browser-react, Chromium)
pnpm test:integration       # Integration tests (uses .env.test, requires local DB)
pnpm test:e2e               # E2E tests (Playwright)

# Local Test Database (Docker)
pnpm db:test:up             # Start local Postgres for integration tests
pnpm db:test:down           # Stop local test database
pnpm db:test:reset          # Wipe and restart test database

# Database
pnpm db:generate            # Generate migration from schema changes
pnpm db:migrate             # Apply migrations to database
pnpm db:seed                # Seed database with content
pnpm db:studio              # Open Drizzle Studio GUI
```

## Architecture

The project follows **Clean Architecture** (Robert C. Martin) with four layers. Dependencies point inward only.

### Core Principles (Uncle Bob)

All code in this repository MUST adhere to these principles:

1. **Clean Architecture** - Strict layer boundaries with dependencies pointing inward only. Domain has ZERO external imports.

2. **SOLID Principles**
   - **S**ingle Responsibility: Each module has one reason to change
   - **O**pen/Closed: Open for extension, closed for modification
   - **L**iskov Substitution: Implementations are swappable
   - **I**nterface Segregation: Small, specific interfaces
   - **D**ependency Inversion: Depend on abstractions, not concretions

3. **Test-Driven Development (TDD)** - Write tests first (Red → Green → Refactor). Specs define tests before implementation. Domain and application layers must be 100% unit testable without infrastructure.

4. **DRY (Don't Repeat Yourself)** - Single source of truth for every concept. Extract common patterns into shared utilities.

5. **Clean Code** - Meaningful names, small functions, minimal complexity, explicit error handling, no magic numbers.

6. **Design Patterns** - Use appropriate patterns (Repository, Factory, Strategy, Composition Root) where they add clarity, not complexity.

### Layer Structure (implemented, see ADR-012)

```
src/domain/        → Entities, value objects, pure business logic (zero dependencies)
src/application/   → Use cases, port interfaces (depends only on domain)
src/adapters/      → Repository/gateway implementations, server actions (depends on application)
app/, lib/, db/    → Next.js framework code, infrastructure (outermost layer)
```

### Current State

All layers are implemented. See `docs/specs/index.md` for the full spec register (SPEC-001 through SPEC-038, with SPEC-016 and SPEC-017 now implemented).

- **Domain:** entities, value objects, services, errors (`src/domain/**`)
- **Application:** ports, core use cases, app errors (`src/application/**`)
- **Adapters:** schema, repositories, gateways, controllers (`db/schema.ts`, `src/adapters/**`)
- **Composition root:** runtime wiring lives in `lib/container.ts`, focused factories under `lib/container/**`, and controller dependency loaders in `lib/controller-helpers.ts`
- **Feature slices:** paywall, question loop, practice sessions, review + bookmarks, dashboard, UI integration, practice engine, history, observability (`app/**`, `components/**`)

Glossary: `src/adapters/controllers/**` are server-side adapter controllers; client hooks that compose page state are page models (`use-*-page-model.ts`), not controllers.

Framework code lives in:
- `app/` - Next.js App Router pages, layouts, API routes
- `lib/` - Core utilities (auth, Stripe, env, DB). Prefer importing via `@/...`
- `db/schema.ts` - Drizzle ORM schema
- `db/migrations/` - Generated migrations (drizzle-kit)
- `components/` - React components; `components/ui/` has shadcn/ui primitives
- `content/questions/` - MDX question content

### Key Architectural Decisions

1. **Domain entity purity** - Domain entities (User, Subscription, Question) have NO vendor identifiers. External IDs (Clerk user ID, Stripe subscription ID) exist only in the persistence layer.

2. **Vendor-agnostic value objects** - Use `SubscriptionPlan` (monthly/annual) in domain, not Stripe price IDs. Mapping happens in adapters.

3. **Fakes over mocks** - Tests use in-memory fake implementations, not jest.mock().

4. **Composition root** - Dependencies are wired at entry points via `lib/container.ts`, `lib/container/**`, and `lib/controller-helpers.ts`, not ad hoc imports inside use cases.

See `docs/adr/` for all Architecture Decision Records (ADR-001 through ADR-018).

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Auth:** Clerk (`@clerk/nextjs`)
- **Payments:** Stripe (subscriptions + webhooks)
- **Database:** Postgres (Neon) via Drizzle ORM
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Linting:** Biome (no ESLint/Prettier)
- **Testing:** Vitest (unit/integration), Playwright (E2E)
- **Package manager:** pnpm

## Key Files

| File | Purpose |
|------|---------|
| `db/schema.ts` | Drizzle schema (tables, relations, types) |
| `proxy.ts` | Clerk middleware (route protection) |
| `lib/env.ts` | Zod-validated environment variables |
| `lib/db.ts` | Drizzle client singleton |
| `lib/auth.ts` | Clerk auth helpers |
| `lib/stripe.ts` | Stripe SDK initialization |
| `biome.json` | Linter/formatter config |
| `.env.example` | Required environment variables |

## Coding Style

Biome is the source of truth for style:
- 2-space indents
- Single quotes
- Semicolons required
- Trailing commas

Rules:
- TypeScript + React (Next.js). Keep modules small, prefer pure functions in `lib/`
- Avoid non-null assertions (`!`) and unused imports/variables (Biome errors)
- Prefer importing via `@/...` alias
- For E2E-specific import/timeout conventions, see `Playwright E2E Conventions` below.

### Error Handling and Bare Catch Policy

Bare `catch {}` blocks are allowed only for intentionally suppressed secondary failures:
- telemetry, reporting, or logging failures that must not mask the primary user outcome;
- rollback or cleanup best effort when the original error is preserved and returned/thrown;
- parse/decode fallback to a safe default.

Add a short nearby comment when suppressing an error intentionally. Keep UI reporter helpers in `app/(app)/app/shared`; add a shared application/adapters logger-safety helper only after at least three sibling files need the same wrapper.

## Testing

### Framework: Vitest (NOT Jest)

We use **Vitest** exclusively. Do NOT use Jest APIs or `jest.mock()`.

```typescript
// Correct imports
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

### Test Locations (Colocated)

- **Unit tests:** `*.test.ts` colocated next to source files (e.g., `grading.ts` → `grading.test.ts`)
- **Integration tests:** `tests/integration/*.integration.test.ts` (requires local Postgres)
- **E2E tests:** `tests/e2e/*.spec.ts` (Playwright)
- **E2E timeout policy:** `docs/dev/testing-infrastructure.md` → "Playwright Timeout Policy"

### Playwright E2E Conventions

- In `tests/e2e/**/*.spec.ts`, use relative imports for local helper modules (`./helpers/...`)
- Keep `@/...` imports for app/runtime modules outside `tests/e2e/**`
- Prefer Playwright defaults first; only use `test.setTimeout(...)` for full-flow budget increases
- Prefer assertion/locator timeouts before increasing full test timeout
- Any non-default `test.setTimeout(...)` must include a concise in-file rationale comment
- Approved timeout bands: `120_000` (standard authenticated flows), `180_000` (multi-page audits), `300_000` (documented temporary outlier only)

### Browser-Based Visual Verification (Auth Required)

All app pages under `/app/*` are protected by Clerk auth. If you need to visually verify UI changes in a running browser (e.g., `pnpm dev` at `http://localhost:3000`), you **must** authenticate first. Do NOT just navigate to a protected URL and give up when it redirects to sign-in.

**Quick start** (requires `pnpm dev` running first):

```bash
# Reuse existing profile (human must have logged in once via --headed):
agent-browser close # if a daemon is already running with different options
agent-browser --profile /tmp/clerk-profile open http://localhost:3000/app/dashboard
agent-browser get url          # must show /app/dashboard, not Clerk sign-in
```

If no profile exists yet, a human must log in once: `agent-browser --profile /tmp/clerk-profile --headed open http://localhost:3000/sign-in` — then log in through the Chromium window that opens.

Do not use `agent-browser --state` or CDP bridge approaches — both are unreliable with Clerk. Full details: `docs/tooling/agent-browser.md`.

Keep the host exact: `localhost` and `127.0.0.1` are not interchangeable for Clerk cookies.

`agent-browser click @ref` is unreliable on practice-flow React components (DEBT-323). Do not rely on it for Submit/primary action buttons or toggle buttons. For answer choices, `agent-browser eval "document.querySelectorAll('label')[0].click()"` remains the safest fallback even though radio refs may work on some surfaces. Toggle buttons (Tutor/Exam mode) still have no working workaround — use Playwright for those flows.

**If using Claude Code with Chrome MCP tools**, the user's browser is typically already authenticated — use `tabs_context_mcp` to check existing tabs before creating new ones.

### Running Integration Tests Locally

Integration tests require a local Postgres database with migrations **and** seed data. All three setup steps are required:

```bash
pnpm db:test:up
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed
pnpm test:integration
pnpm db:test:down
```

```bash
# One-liner: local setup from scratch (matches CI order)
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)" && pnpm db:test:up && DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate && SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed && pnpm test:integration
```

- `.env.test` is committed and contains test database config (no secrets)
- Integration tests auto-load `.env.test` via `tests/integration/setup.ts`
- The local DB host port is per-clone by default. Use `pnpm exec tsx scripts/resolve-local-test-target.ts env` to inspect the resolved `DB_TEST_PORT`, `DATABASE_URL`, `PORT`, `NEXT_PUBLIC_APP_URL`, and `COMPOSE_PROJECT_NAME`.
- Migrations require explicit `DATABASE_URL` (drizzle-kit reads `.env.local` first, which points to remote Neon)
- **Never use `drizzle-kit push`** for the test DB — it skips migration files (missing `pgcrypto`, constraints)
- **Seeding is required** — `tag-taxonomy-census` tests fail without it (`INTEGRATION_SEED_MISSING`)
- CI also sets `SEED_INCLUDE_PLACEHOLDERS=true` when seeding; plain `pnpm db:seed` is enough for local integration tests, but the flag gives exact CI seed parity

### React 19 Component Testing

**For render-output tests** (checking HTML content), use `renderToStaticMarkup`:

```typescript
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let MyComponent: typeof import('./MyComponent').default;

beforeAll(async () => {
  MyComponent = (await import('./MyComponent')).default;
});

describe('MyComponent', () => {
  it('renders correctly', () => {
    const html = renderToStaticMarkup(<MyComponent />);
    expect(html).toContain('Expected text');
  });
});
```

**For interactive / async tests** (clicking buttons, hooks with `useEffect`/`useState` transitions), use `vitest-browser-react` in `*.browser.spec.tsx`:

```tsx
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

test('updates state after async operation', async () => {
  const screen = await render(<MyComponent />);
  await expect.element(screen.getByText('Loaded')).toBeVisible();
});
```

Run with: `pnpm test:browser` (real Chromium via Playwright — not jsdom).

**DO NOT USE:**
- `@testing-library/react` — broken with React 19 + Vitest, zombie maintenance
- `react-test-renderer` — Deprecated in React 19
- `react-dom/test-utils` — Removed in React 19
- `environmentMatchGlobs` — Removed in Vitest 4

See `docs/dev/react-vitest-testing.md` for full details.

### FAKES OVER MOCKS — MANDATORY

**The Golden Rule: USE EXISTING FAKES FROM `src/application/test-helpers/fakes/`**

If a fake class exists (e.g., `FakeAttemptRepository`), you MUST use it. Do NOT create inline objects with `vi.fn()`.

**Available fakes source of truth:** `src/application/test-helpers/fakes/index.ts`.

Common examples include `FakeQuestionRepository`, `FakeAttemptRepository`, `FakePracticeSessionRepository`, `FakeQuestionFeedbackRepository`, `FakeSubscriptionRepository`, `FakeUserRepository`, `FakeBookmarkRepository`, `FakeTagRepository`, `FakeStripeCustomerRepository`, `FakeStripeEventRepository`, `FakeIdempotencyKeyRepository`, `FakeClerkEventRepository`, `FakeDeletedClerkUserRepository`, `FakePendingStripeCancellationRepository`, `FakeLogger`, `FakeAuthGateway`, `FakePaymentGateway`, and `FakeRateLimiter`. Use-case fakes also exist (e.g. `FakeSubmitAnswerUseCase`, `FakeGetNextQuestionUseCase`). Check the barrel export before adding or listing a fake.

**The Decision Tree:**
```
Does a Fake* class exist in `src/application/test-helpers/fakes/` for this dependency?
  YES → Use it: new FakeAttemptRepository()
  NO  → Is it an external dependency (Drizzle db, Clerk, Stripe SDK)?
    YES → Use vi.fn() inline object OR vi.mock()
    NO  → Add a new Fake* class in `src/application/test-helpers/fakes/`, then use it
```

**NEVER use `vi.mock()` for our own code.** Only for external packages you can't inject.

```typescript
// ✅ CORRECT - Use existing fake classes
const attemptRepo = new FakeAttemptRepository();
const questionRepo = new FakeQuestionRepository([question1, question2]);
const authGateway = new FakeAuthGateway(user);
const useCase = new SubmitAnswerUseCase(attemptRepo, questionRepo);

// ❌ WRONG - Inline vi.fn() when a fake exists (creates DEBT-051!)
const attemptRepo = {
  insert: vi.fn().mockResolvedValue(attempt),
  findByUserId: vi.fn().mockResolvedValue([]),
};  // DON'T DO THIS - use FakeAttemptRepository instead

// ❌ WRONG - Hijacking module imports
vi.mock('./attempt-repository');  // NEVER DO THIS
```

**When vi.fn() inline objects ARE acceptable:**
```typescript
// ✅ OK - Mocking external Drizzle db object (no fake exists)
const fakeDb = {
  query: { users: { findFirst: vi.fn().mockResolvedValue(null) } }
};
const repo = new DrizzleUserRepository(fakeDb);

// ✅ OK - External SDK surface you can't inject
vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

// ✅ OK - Next.js internals
vi.mock('next/link', () => ({ default: (props) => <a {...props} /> }));
vi.mock('server-only', () => ({}));

// ✅ OK - Browser Mode: sealed ESM namespaces (vi.spyOn won't work)
// Server-action controllers can't be dependency-injected into React hooks.
// Use { spy: true } to wrap exports as spies without replacing them.
// { spy: true } preserves unstubbed real exports; factory mocks replace all exports.
vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mocked(practiceController.getSessionHistory).mockResolvedValue(ok({...}));
```

**Why Fakes > Inline vi.fn():**
- Fakes are reusable across all tests
- Fakes have real behavior (filtering, sorting, validation)
- Inline vi.fn() duplicates logic and drifts from real implementations
- Fakes only break when actual behavior changes

### Test Quality Rules

1. **Test behavior, not implementation** — If you refactor, tests should still pass
2. **One concept per test** — Each `it()` verifies one thing
3. **Arrange-Act-Assert pattern** — Setup, execute, verify
4. **Use test factories** — `createQuestion()`, `createChoice()` from `src/domain/test-helpers/`
5. **Descriptive names** — `it('returns isCorrect=false when incorrect choice selected')`

Integration tests run against a real Postgres instance. In CI, a service container provides the database.

## Commit & PR Guidelines

**Commits:**
- Use imperative style: `Add ...`, `Fix ...`, `Refactor ...`, `Enhance ...`
- Use optional tags like `[BASELINE]` when applicable

**Pull Requests:**
- Include short problem/solution summary
- Link any spec/ADR updates in `docs/`
- Add screenshots/GIFs for UI changes

Before opening a PR or pushing, run the canonical full quality gate in **"Verify EVERY Change Before Pushing"** above. Do not duplicate the command block here; keep that section as the single source of truth for the gate and E2E credential rules.

---

## ⚠️ MANDATORY: Never Delete Uncommitted Work

**If you see uncommitted files or changes you didn't create, DO NOT DELETE THEM.**

This is a multi-agent environment. Another agent or the user may be working concurrently. Uncommitted work is **intentional** until proven otherwise.

### The Rule

- See files you didn't create? → **Commit them or leave them alone**
- See edits you didn't make? → **Ask before reverting**
- Unsure if something should exist? → **ASK, don't delete**
- See a file that seems "redundant"? → **It's not your call to delete it**

### Why This Matters

Multiple agents work in parallel on this codebase. One agent creates a file, another sees it as "unexpected" and deletes it. This destroys hours of work and creates frustration.

### Safe Approach

```bash
# If you see unexpected uncommitted work:
git stash -m "Preserving work from another session"
# Then ask the user what to do
```

**Never assume uncommitted work is garbage. It's almost always intentional.**

**When in doubt:** `git stash` to preserve work, then ask the user.

---

## ⚠️ MANDATORY: CodeRabbit Review Before Merge

**NEVER merge a PR without CodeRabbit review. NO EXCEPTIONS.**

This is a **blocking requirement**. Violating this rule wastes human time fixing preventable issues.

### The Rule

1. **Create the PR** via `gh pr create`
2. **WAIT** for CodeRabbit to comment (1-2 minutes)
3. **Read ALL CodeRabbit feedback** — do not skim or skip
4. **Address every issue** before merging:
   - Valid issue → fix it, push, wait for re-review
   - False positive → reply explaining why (for the record)
5. **If CodeRabbit reports a rate limit, STOP.** Do not merge based on a prior partial review, a green CodeRabbit status context, or inline acknowledgements. Wait for the full cooldown shown in the rate-limit message, then explicitly request or wait for a fresh CodeRabbit review on the latest PR head commit.
6. **Only merge after** CodeRabbit has completed a non-rate-limited review of the latest PR head AND all feedback is addressed

### Why This Matters

- CodeRabbit catches bugs, security issues, and architectural problems
- Premature merges bypass this safety net and create rework
- The 1-2 minute wait prevents hours of debugging later
- A rate-limit warning means CodeRabbit may not have reviewed the latest commit completely; acknowledgements or status checks do not substitute for a fresh post-cooldown review

### Red Flags (STOP if any apply)

- PR was just created seconds ago → **WAIT**
- No `coderabbitai[bot]` comment visible → **WAIT**
- CodeRabbit posted `Rate limit exceeded` at any point on the PR after the latest review cycle began → **WAIT THE FULL COOLDOWN, REQUEST/WAIT FOR FRESH REVIEW, THEN RECHECK**
- CodeRabbit status is green but the latest visible review was rate-limited or predates the newest commit → **DO NOT MERGE**
- Thinking "I'll merge now and fix later" → **STOP, that's wrong**
- Thinking "This is just docs, doesn't need review" → **WRONG, everything needs review**

### How to Check

```bash
# List comments on a PR
gh pr view <PR_NUMBER> --comments

# Look for coderabbitai[bot] in the output.
# If not present, DO NOT MERGE.
# If a rate-limit warning is present, DO NOT MERGE until after the cooldown
# and a fresh CodeRabbit review has landed on the latest PR head commit.
```

## Documentation

- `docs/specs/master_spec.md` — Complete technical specification (SSOT)
- `docs/specs/index.md` — Full spec register (SPEC-001 through SPEC-038 archived; SPEC-016 and SPEC-017 active)
- `docs/adr/` — Architecture Decision Records (ADR-001 through ADR-018)
- `docs/debt/index.md` — Technical debt register (active + resolved)
- `docs/bugs/index.md` — Bug report register
- `docs/brainstorming/index.md` — UX audits and design explorations
- `docs/frontend/standards.md` — Canonical frontend standards (components, tokens, accessibility, dark mode)
- `docs/frontend/contrast-policy.md` — WCAG AA contrast targets and rules
- `docs/frontend/pattern-registry.md` — Every visual pattern: hover, border, surface, token scales
- `docs/frontend/design-principles.md` — Layout composition, navigation zones, action bar conventions
- `docs/frontend/pages/` — Per-page dark mode UI audits
- `docs/tooling/agent-browser.md` — Browser automation, Clerk auth, and React click workarounds

---

## ⚠️ AGENT-SPECIFIC: Quick Reference — Slot Protection Checklist

Before writing ANY code, verify you can answer:

- [ ] **Tests:** Have I read 2-3 existing test files? Do I understand the fakes pattern?
- [ ] **Style:** Have I read 2-3 source files? Do I understand constructor injection?
- [ ] **Shared Types:** Have I checked `src/adapters/shared/` for existing types?
- [ ] **Ports:** Have I checked `src/application/ports/` for existing interfaces?
- [ ] **Fakes:** Have I checked `src/application/test-helpers/fakes/` for existing fakes?
- [ ] **Layer:** Do I know which Clean Architecture layer I'm working in?

**If you can't check all boxes, study existing code before proceeding.**
