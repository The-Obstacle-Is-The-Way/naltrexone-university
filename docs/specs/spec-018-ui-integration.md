# SPEC-018: UI Integration (v0 Templates)

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Layer:** Feature
**Date:** 2026-02-03

---

## Objective

Integrate the imported v0 community UI templates (marketing landing page + dashboard shell) into the main app **without violating Clean Architecture boundaries** and while meeting **security, accessibility, and performance** expectations.

This spec is intentionally UI-focused and should not require changes to:

- `src/domain/**`
- `src/application/**`
- `src/adapters/**` (except adding new controllers where UI needs new reads/writes)

> **Note (CodeRabbit limit):** CodeRabbit skips automated review when a PR changes too many files.
> Net-changes must stay under the tool’s limit (150 files) to get review coverage.
> This spec includes a cleanup phase to remove template folders once extraction is complete.

---

## Non-Goals (For This Spec)

- Rewriting business logic or domain rules to “fit” the UI.
- Introducing client-side data fetching for app data (keep app data reads/writes on the server).
- Adding interactive component tests via `@testing-library/react` (React 19 + Vitest limitations in this repo).

---

## Principles / Guardrails (Non-Negotiable)

### Clean Architecture

- UI is an **outer layer**. It may change freely as long as inner layers do not depend on it.
- The UI **must not** import infrastructure details (DB client, Stripe SDK, Clerk SDK) directly.
- UI reads/writes happen through:
  - server actions/controllers (`'use server'`) per `docs/specs/spec-010-server-actions.md`, and/or
  - server components that call the container to obtain a use case/gateway (composition-root pattern).

### Next.js App Router

- **App Router only**. Do not introduce Pages Router (`pages/`) stubs.
- Default to **Server Components**. Add `'use client'` only when hooks/DOM APIs are required.
- Do not pass functions as props from Server Components to Client Components (unless the function is a server action supported by Next).

### Testing (React 19 + Vitest)

- All `*.test.tsx` files MUST start with:
  - `// @vitest-environment jsdom`
- Use `renderToStaticMarkup` for render-output tests.
- Do not use `@testing-library/react` for component tests in this repo (see `docs/dev/react-vitest-testing.md`).

---

## Current State (What’s in the Repo Today)

- Marketing UI is implemented in `components/marketing/**` and wired into `app/page.tsx`.
- App shell UI is implemented in `components/app-shell/**` and wired into `app/(app)/app/layout.tsx`.
- Template source folders and artifacts are removed after extraction to:
  - keep the repository clean and reviewable
  - avoid shipping unused code and assets
  - reduce Tailwind and TypeScript configuration workarounds

---

## Requirements

### Functional

1. **Marketing UI**
   - Replace the current minimal `app/page.tsx` layout with the v0 marketing landing page design (sections, hero, pricing CTA), while keeping:
     - Auth-aware nav behavior (`components/auth-nav.tsx`)
     - Primary CTA behavior (`components/get-started-cta.tsx`)

2. **App Shell / Dashboard UI**
   - Replace the current app shell header/nav in `app/(app)/app/layout.tsx` with the v0 dashboard shell (sidebar + top nav), while keeping:
     - Subscription gating behavior (server-side redirect for non-entitled users)
     - Routes and IA: `/app/dashboard`, `/app/practice`, `/app/review`, `/app/bookmarks`, `/app/billing`

3. **No Feature Regression**
   - UI swap must not change application behavior or entitlement enforcement.

### Non-Functional

1. **Security**
   - No XSS primitives:
     - Keep markdown rendering sanitized (`components/markdown/Markdown.tsx` already does `rehype-sanitize` + `skipHtml`).
     - No new `dangerouslySetInnerHTML` unless content is fully developer-controlled and explicitly sanitized/validated.
   - External links opened in new tabs must include `rel="noopener noreferrer"`.
   - No secrets in client bundles; no auth bypasses other than explicit CI-only fallback flags already used in the repo.

2. **Accessibility**
   - Visible focus states for all interactive elements (links/buttons/menu triggers).
   - Icon-only controls must have an accessible name (`aria-label` or `sr-only` text).
   - Mobile navigation controls must use `aria-expanded` and `aria-controls` to bind the trigger to the menu.

3. **Performance**
   - Do not ship unused Tailwind classes from template directories until they’re actually integrated.
   - Use `next/image` for marketing imagery where feasible.
   - Avoid client-side waterfalls; keep app data on the server and pass minimal serialized props to client components.

---

## Design

## High-Level Integration Strategy

**Do not “mount the template app inside the app.”** Instead:

1. Treat the v0 templates as a **source** of layout/section components.
2. Extract/adapt them into the main app using the main app’s:
   - Tailwind tokens (shadcn-style CSS variables in `app/globals.css`)
   - `components/ui/**` primitives
   - routing conventions under `app/`
3. Replace routes/layouts incrementally behind a feature flag if needed (default: direct replacement in this PR).

### Theme Strategy (Avoid Flash + Keep User Preference)

If the integrated UI exposes theme switching (via `next-themes`):

- Root layout must include the repo’s `ThemeProvider` with `attribute="class"`.
- The “beforeInteractive” theme script must:
  - Prefer persisted user choice from `localStorage` (`light`/`dark`/`system`)
  - Fall back to system preference when `system`
  - Avoid overriding the user’s selected theme after hydration

This prevents “dark-mode flash” while keeping `ThemeToggle` reliable.

---

## Proposed File/Folder Targets (After Extraction)

### Marketing

- `components/marketing/**`
  - `components/marketing/marketing-home.tsx`

### App Shell

- `components/app-shell/**`
  - `components/app-shell/app-shell.tsx`

---

## Composition Root Wiring (How UI Talks to Use Cases)

### Rule

App Router pages and layouts are responsible for wiring dependencies via `lib/container.ts`.

### Recommended Patterns

1. **Server layout performs gating**
   - Keep entitlement enforcement server-side (already in `app/(app)/app/layout.tsx`).
2. **Server components fetch app data**
   - Use the container to obtain use cases/gateways.
   - Convert to serializable “view models” before passing to client components.
3. **Client components remain “dumb”**
   - UI state only (drawer open, tabs, theme toggle, etc.).
   - No direct access to auth, billing, DB, or use cases.

---

## Migration Plan (Ordered, TDD)

### Phase 0 — Baseline Safety

- Ensure extracted components compile and do not break build/test/lint.
- Ensure a11y basics: focus-visible styles and accessible naming.

### Phase 1 — Integrate Marketing Home

1. Add static render tests for `components/marketing/marketing-home.tsx`.
2. Implement `MarketingHomeShell` (synchronous) + `renderMarketingHome` (async wiring).
3. Replace `app/page.tsx` to call `renderMarketingHome()`.
4. Keep `AuthNav` + `GetStartedCta` as the auth/CTA SSOT.

### Phase 2 — Integrate App Shell (Dashboard UI)

1. Add static render tests for `components/app-shell/app-shell.tsx`.
2. Implement `AppShell` with a sidebar that maps to the app IA routes.
3. Update `app/(app)/app/layout.tsx` to wrap children with `AppShell` while preserving `enforceEntitledAppUser()`.

### Phase 3 — Remove Template Workarounds

1. Delete template folders and artifacts once extraction is complete.
2. Remove any `tailwind.config.js` and `tsconfig.json` exclusions that referenced template folders.

### Phase 4 — Reduce PR Surface Area (CodeRabbit Review)

1. Ensure template folders are deleted in the same PR once extraction is complete.
2. Confirm the PR file count drops below the CodeRabbit review limit.
3. Trigger CodeRabbit review after the PR is within limits.

---

## Tests First (Concrete Checklist)

### Render-output tests (default)

For each new component file `X.tsx`:

- Add `X.test.tsx` with:
  - `// @vitest-environment jsdom` as the first line
  - `renderToStaticMarkup(<X ... />)`
  - `expect(html).toContain(...)` assertions

### Interaction tests (when needed)

- Prefer Playwright E2E for true interactions (navigation, dialogs, forms).
- For simple UI state transitions, extract pure helpers into separate `*.logic.ts` modules (avoid test-only exports from production components).

### Fakes

- If a `Fake*` exists in `src/application/test-helpers/fakes.ts`, use it.
- Do not `vi.mock()` internal modules for dependency injection. Prefer passing explicit deps into render helpers/components.

---

## Definition of Done

- New marketing UI replaces `app/page.tsx` with no behavior regressions.
- New app shell replaces the current app layout UI while preserving subscription gating.
- `pnpm lint && pnpm typecheck && pnpm test --run && pnpm build` pass.
- No new XSS surfaces introduced; external links safe; markdown remains sanitized.
- Focus-visible and accessible naming requirements met for interactive elements.
- Template folders are removed and config exclusions cleaned up.

---

## Related

- `docs/specs/master_spec.md`
- `docs/specs/spec-010-server-actions.md`
- `docs/specs/spec-015-dashboard.md`
- `docs/dev/react-vitest-testing.md`
