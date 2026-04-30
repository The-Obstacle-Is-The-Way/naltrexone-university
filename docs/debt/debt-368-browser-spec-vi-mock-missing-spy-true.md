# DEBT-368: Browser-Mode `vi.mock()` Missing `{ spy: true }` in Multiple Specs

**Priority:** P3
**Created:** 2026-04-25
**Source:** Test suite quality audit, 2026-04-25
**Related:** [.claude/rules/testing-browser.md](../../.claude/rules/testing-browser.md), [.claude/rules/testing.md](../../.claude/rules/testing.md)

**Resolution State:** Fix on branch `debt-368-browser-spec-vi-mock-spy-true-sweep`, PR #296.

**Audit verified:** 2026-04-27 against `87284372`.

---

## Context

`.claude/rules/testing-browser.md` codifies the controller-mocking pattern for `*.browser.spec.tsx` tests:

> Server-action controllers are Node-only and can't execute in Chromium. Use `vi.mock()` with `{ spy: true }`.
> `{ spy: true }` preserves unstubbed real exports; factory mocks replace all exports. This is a targeted exception for non-injectable module boundaries.

And `.claude/rules/testing.md`:

> `vi.mock()` is ONLY acceptable for: ... Browser Mode sealed ESM: `vi.mock(path, { spy: true })` for controller modules.

Several browser specs violate this rule today by using factory-form `vi.mock(path, () => ({...}))` against internal application-layer modules without `{ spy: true }`. Confirmed examples (verified by reading the files):

- `app/(app)/app/practice/hooks/use-practice-question-flow.browser.spec.tsx:24-32` — factory-mocks `bookmark-controller` and `question-controller`
- `app/(app)/app/practice/hooks/use-practice-session-start.browser.spec.tsx:16-25`
- `app/(app)/app/practice/hooks/use-practice-session-controls.browser.spec.tsx:22-26`
- `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx:15`
- `app/(app)/app/history/hooks/use-history-sessions.browser.spec.tsx:16`
- `app/(app)/app/questions/[slug]/use-question-page-controller.browser.spec.tsx:30-43`

Fresh audit count on 2026-04-27:

- The broad internal-module grep from the verification checklist returns **26 internal `vi.mock` calls without `{ spy: true }`** in `*.browser.spec.tsx` files. This line-oriented grep only catches `{ spy: true }` when the exception appears on the same line as `vi.mock(...)`; if formatting changes, use a multiline-aware PCRE/AST scan for the `vi.mock` call plus the `{ spy: true }` exception:
  `rg -n "vi\.mock\(['\"]@/(src|app|components|lib)/" --glob '**/*.browser.spec.tsx' | rg -v '\{\s*spy:\s*true\s*\}'`
- Of those, **17 are controller-module factory mocks** under `@/src/adapters/controllers/...`, which is the specific pattern covered by `.claude/rules/testing-browser.md`.
- The remaining internal mocks are mostly `@/lib/report-client-error` plus one `@/components/ui/notification-provider` mock. Those still match the broad grep, but the documented `{ spy: true }` exception is specifically for sealed browser-mode controller modules.

## Why This Is Debt

Factory-form `vi.mock(path, () => ({...}))` replaces **every** export of a module with the factory's return value. Tests using this pattern silently lose access to any real exports they don't override, and adding a new export to the controller can break tests that "looked unrelated."

`{ spy: true }` keeps the real exports in place and only stubs the ones each test calls `vi.mocked(...).mockResolvedValue(...)` on. That matches the docs and avoids the silent-coupling failure mode.

The current shape also makes it harder to:

- Reason about which symbols a given test depends on (the factory enumerates them up front, but reality may have drifted).
- Migrate tests toward fakes-first later (every factory mock is a separate refactor with its own hoisted-mock cleanup).

## Remediation

For each affected `*.browser.spec.tsx` file:

1. Replace `vi.mock(path, () => ({...}))` with `vi.mock(path, { spy: true })`.
2. Replace top-of-file `vi.hoisted(() => ({ fooMock: vi.fn() }))` + `vi.mock(...)` factory pairs with per-test `vi.mocked(controllerModule.foo).mockResolvedValue(...)` setup against an `import * as controllerModule from '@/...'`.
3. Drop the now-unused hoisted mock variables.
4. Keep browser Vitest `optimizeDeps.include` aligned with any real server-side dependencies pulled into the browser graph by `{ spy: true }` imports, so coverage runs do not trigger Vite dependency reloads mid-suite.

Do this file-by-file as the touched tests are otherwise edited; no need for a single sweep.

## Constraints

- Do NOT migrate jsdom `*.test.tsx` files in this ticket. Those frequently mock internal hooks/components for component-only assertions; many should be replaced with Fakes or rendered as real components rather than spy-mocked. That is a separate, larger refactor.
- Do NOT touch `vi.mock('@clerk/nextjs', ...)`, `vi.mock('next/link', ...)`, `vi.mock('server-only', ...)`, or other documented external-SDK mocks. Those are explicit exceptions in the testing rules.
- Do NOT silently fold this work into an unrelated PR. CodeRabbit will flag the diff anyway; a focused PR makes the change reviewable.

## Why P3

The current tests pass. The cost is hidden coupling and refactor-friction risk that compounds as the controller surface evolves. Pay it down opportunistically when each affected spec is otherwise touched.

## Verification

- [x] Each migrated file passes `pnpm test:browser` for that file.
- [x] A grep `vi\.mock\(['"](@/(src|app|components|lib)/[^'"]+)['"]` in `**/*.browser.spec.tsx` returns zero hits without `{ spy: true }` (excluding documented external-SDK exceptions): 26 → 0 on 2026-04-28.
- [x] No regression in `pnpm test:browser` overall pass count: 241 → 241 on 2026-04-28.
- [x] `pnpm test:browser:coverage` passes from a cold Vite cache after browser Vitest dependency pre-optimization was updated for the real modules now imported by spy-based mocks.
