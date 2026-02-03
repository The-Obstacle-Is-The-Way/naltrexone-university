# SPEC-018: UI Integration (v0 Templates)

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Proposed
**Layer:** Feature
**Date:** 2026-02-03

---

## Objective

Integrate the imported v0 community UI templates (marketing landing page + dashboard shell) into the main app **without violating Clean Architecture boundaries** and while meeting **security, accessibility, and performance** expectations.

This spec is intentionally UI-focused and should not require changes to:

- `src/domain/**`
- `src/application/**`
- `src/adapters/**` (except adding new controllers where UI needs new reads/writes)

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

- `components/kokonutui/**` is a dashboard UI template (not wired into routes).
- `components/premium-landing-page/**` is a standalone template app (not wired into routes).
- To prevent shipping unused CSS / toolchain conflicts:
  - `components/premium-landing-page/**` is excluded from the root TS project (`tsconfig.json`).
  - Both template folders are excluded from Tailwind content scanning (`tailwind.config.js`).

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
3. Replace routes/layouts incrementally behind a feature flag if needed.

---

## Proposed File/Folder Targets (After Extraction)

### Marketing

- `components/marketing/**`
  - `components/marketing/hero-section.tsx`
  - `components/marketing/features-section.tsx`
  - `components/marketing/testimonials-section.tsx`
  - `components/marketing/pricing-section.tsx`
  - `components/marketing/footer.tsx`

### App Shell

- `components/app-shell/**`
  - `components/app-shell/app-shell.tsx` (layout wrapper)
  - `components/app-shell/sidebar.tsx` (nav)
  - `components/app-shell/top-nav.tsx`

### Keep Templates as Reference

- Keep `components/premium-landing-page/**` and `components/kokonutui/**` as reference until extraction is complete.
- When extracted components replace them, decide whether to delete/archive templates in a dedicated cleanup PR.

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

### Phase 0 — Baseline Safety (This PR Set)

- Ensure templates compile in isolation and do not break build/test/lint.
- Ensure a11y basics: focus-visible styles and aria labeling where present.

### Phase 1 — Extract Marketing Sections

1. Add tests for each extracted section component (`renderToStaticMarkup`).
2. Create `components/marketing/**` by porting template sections and:
   - Replacing template-local imports (`@/components/...`) with main-app paths.
   - Replacing missing primitives with existing `components/ui/**` or adding new shadcn primitives as needed.
3. Replace `app/page.tsx` to use extracted sections.
4. Keep `AuthNav` + `GetStartedCta` as the CTA/auth SSOT.

### Phase 2 — Extract App Shell (Dashboard UI)

1. Add tests for extracted shell components (static render).
2. Create `components/app-shell/**` from kokonutui:
   - Sidebar must map to the app IA routes.
   - Top nav should be data-driven (props for breadcrumbs, avatar, etc.).
3. Update `app/(app)/app/layout.tsx`:
   - Preserve `enforceEntitledAppUser()` behavior.
   - Swap the header/nav UI for the new app shell wrapper.

### Phase 3 — Remove Tailwind Exclusions (Only When Wired)

1. When extracted components are used in `app/`, Tailwind will pick up their classes automatically.
2. Keep template folders excluded until they are no longer referenced.
3. If you decide to keep templates permanently as reference, keep them excluded to avoid CSS bloat.

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

---

## Related

- `docs/specs/master_spec.md`
- `docs/specs/spec-010-server-actions.md`
- `docs/specs/spec-015-dashboard.md`
- `docs/dev/react-vitest-testing.md`
