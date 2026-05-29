# DEBT-396: Brittle CSS Selector Remediation

**Priority:** P2 (active bug class — PR #328 proved jsdom selector-engine changes can break URL-bearing `a[href="..."]` assertions. Two query-string selector sites remain, and the shared helper + rule are still missing.)
**Created:** 2026-05-26
**Source:** Deep adversarial test-suite audit conducted alongside DEBT-394 archival. Direct precedent is PR #328 (jsdom 26 -> 29 bump), which migrated generated dashboard question-route href assertions away from CSS attribute selectors after jsdom selector/CSS parsing changed. The broken pattern was a quoted `a[href="..."]` selector whose expected value came from `toQuestionRoute(...)` and contained multi-parameter query strings such as `?from=dashboard&mode=review&attemptId=...`; PR #328 introduced a local `findAnchorByHref()` helper in `app/(app)/app/dashboard/page.test.tsx`.
**Related:** [.claude/rules/testing-react19.md](../../../.claude/rules/testing-react19.md), [docs/dev/dependency-update-protocol.md](../../dev/dependency-update-protocol.md), PR #328

**Status:** Resolved 2026-05-28 — shipped in one consolidated PR ([#366](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/366)). Extracted `findAnchorByHref(root: ParentNode, href)` from its local home in `app/(app)/app/dashboard/page.test.tsx` to the shared `tests/shared/dom-helpers.ts` (compares `getAttribute('href')` directly, bypassing CSS attribute-selector parsing), and migrated the two query-string fragile sites: `app/(app)/app/dashboard/page.test.tsx` (the missed `li a[href="${ROUTES.APP_HISTORY}?tab=sessions"]` site, with the `li` scoping preserved by iterating list items as the `ParentNode` root) and `app/(app)/app/questions/[slug]/question-page-client.test.tsx` (`/app/history?tab=sessions`). The "Anchor href assertions" rule was added to `.claude/rules/testing-react19.md` citing PR #328 and the jsdom 26→29 selector-parser fragility. The 39 simple-static-href `querySelector('a[href="..."]')` sites were intentionally NOT churned (no special-char payload → no jsdom-parser risk), and the `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx` `href*=` substring negative-assertion site was left out of scope. Verified by the full local gate, 100% patch coverage (including the helper's missing-link/null path), and the DEBT-398 regression scan remaining 16/16.

---

## Audit Update — 2026-05-28

Pre-execution audit on branch `feat/debt-396-pr-1-css-selector-helper` re-verified the current repo at `ebb0de7d` and locks the execution scope below.

Corrections from the original doc:

- PR #328 did introduce `findAnchorByHref()` and did ship the jsdom 26 -> 29 context, but the migrated dashboard selectors were generated `toQuestionRoute(...)` hrefs with multi-parameter query strings, not the remaining `ROUTES.APP_HISTORY?tab=sessions` selector.
- `.claude/rules/testing-react19.md` exists and auto-loads for `**/*.test.tsx`, but it no longer has a "Styling Assertions" section. Add the new anchor/href section after "Synchronous hook capture" and before "Full details."
- `tests/shared/dom-helpers.ts` does not exist today. `tests/shared/README.md` says suite-agnostic shared helpers belong under `tests/shared/`, which is the canonical home for the extracted helper.
- A broader `[href]` sweep found 42 href-selector hits in tests. Only the two query-string exact href selectors are in scope. Thirty-nine are known-ok do-not-churn sites, and one substring selector is distinct.

## Execution Update — 2026-05-28

Consolidated PR implementation is complete on branch `feat/debt-396-pr-1-css-selector-helper`; PR number to be filled in during stop-and-grade.

Implemented scope:

- Added `tests/shared/dom-helpers.ts` with `findAnchorByHref(root: ParentNode, href: string): HTMLAnchorElement | null`.
- Removed the local dashboard `findAnchorByHref()` copy and switched existing dashboard consumers to the shared helper.
- Migrated the two fragile query-string selector sites listed below.
- Added the "Anchor href assertions" rule to `.claude/rules/testing-react19.md`.
- Left the 39 known-ok simple-href sites and the one `href*=` substring site untouched.

Archive remains a separate follow-up after this PR merges.

---

## Problem

`document.querySelector('a[href="..."]')` couples a test to CSS attribute-selector parsing. PR #328 showed that jsdom dev-tooling majors can change that parsing enough to break tests even when the rendered anchor behavior is correct.

The stable pattern is to query anchors and compare the actual attribute value imperatively:

```typescript
Array.from(root.querySelectorAll('a')).find(
  (anchor) => anchor.getAttribute('href') === expectedHref,
);
```

This tests the behavior the user sees — the rendered anchor has the expected `href` — without routing the expected URL through the selector parser.

Current jsdom 29 still matches simple single-parameter selectors such as `a[href="/app/history?tab=sessions"]`, but it does not match the multi-parameter `&` hrefs that PR #328 migrated. The execution boundary is intentionally conservative and mechanical: remove the remaining query-string href selectors, extract the proven helper, and document the rule so future generated/query-string URL assertions do not reintroduce the bug class.

---

## Findings

### A. FRAGILE / In Scope — Migrate

These are the only remaining exact `a[href="..."]` selector assertions whose href value contains a query string. They are the migration target list.

| File | Line | Pattern | Decision |
|---|---:|---|---|
| `app/(app)/app/dashboard/page.test.tsx` | 355 | ``doc.querySelector(`li a[href="${ROUTES.APP_HISTORY}?tab=sessions"]`)`` | Migrate, preserving the current `li a` scope so the assertion still targets a session-card link rather than the header "View all" link. |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | 220 | `doc.querySelector('a[href="/app/history?tab=sessions"]')` | Migrate to the shared helper. |

Verification commands:

```sh
rg -n 'querySelector\([^\n]*\[href[^\]]*[?][^\]]*\]' app/ components/ src/ --glob '*.test.ts' --glob '*.test.tsx'
rg -n '\[href[^]]*[?&]' -g '*.test.ts' -g '*.test.tsx'
```

Both commands currently identify only the two sites above.

### B. KNOWN-OK / Out of Scope — Do Not Churn

The full href-selector sweep found these 39 known-ok sites. They are simple static href assertions, href-presence selectors, or static route constants with no query-string payload. They are not part of DEBT-396 remediation.

| File | Lines | Why out of scope |
|---|---:|---|
| `components/auth-nav.test.tsx` | 36, 84, 119, 141, 182, 257, 338, 383 | Helper/local assertions use simple `#features`, `/pricing`, `/sign-in`, and `/app/dashboard` values. |
| `components/app-desktop-nav.test.tsx` | 47, 67, 68, 87, 89 | Presence selector `a[href]` plus simple app routes. |
| `app/pricing/page.test.tsx` | 133, 780, 810 | Simple `/` and `/sign-in` hrefs. |
| `components/marketing/marketing-layout.test.tsx` | 89, 90, 112, 126, 196, 199, 215 | Simple auth/pricing/home routes; `/#features` is a static fragment selector and matches under current jsdom 29. |
| `components/marketing/marketing-home.test.tsx` | 69, 72, 212, 215, 230, 245, 290, 313 | Simple `/sign-in` and `/pricing` hrefs. |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | 97, 182, 243, 276 | Simple `/app/...` routes; line 220 is the only query-string site in this file. |
| `app/(app)/app/layout-shell.test.tsx` | 32, 179 | Simple `/app/dashboard` and `/app/billing` hrefs. |
| `app/(app)/app/practice/[sessionId]/error.test.tsx` | 26 | Simple `/app/practice` href. |
| `app/(app)/app/practice/quick/error.test.tsx` | 28 | Simple `ROUTES.APP_PRACTICE` href. |

The execution PR must not rewrite these sites for style consistency. The point is to remove the fragile query-string selector pattern, not churn stable tests.

### C. DISTINCT / Explicitly Out of Scope

| File | Line | Pattern | Decision |
|---|---:|---|---|
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx` | 418 | `doc.querySelector('a[href*="/app/questions/"]')` | Leave unchanged. This is a substring negative assertion ("no review question link exists"), not an exact href assertion. `findAnchorByHref()` cannot replace it 1:1, and a substring helper would broaden the API for one unrelated case. |

### D. Existing Helper Location

`findAnchorByHref()` currently exists only in `app/(app)/app/dashboard/page.test.tsx:29-38`:

```typescript
function findAnchorByHref(
  doc: Document,
  href: string,
): HTMLAnchorElement | null {
  return (
    Array.from(doc.querySelectorAll('a')).find(
      (anchor) => anchor.getAttribute('href') === href,
    ) ?? null
  );
}
```

Current dashboard consumers are at lines 214, 224, 305, 617, and 625. The execution PR should remove the local helper, import the shared helper, and keep those consumers on the shared implementation.

---

## Required Remediation

Ship one consolidated PR on branch `feat/debt-396-pr-1-css-selector-helper`.

Rationale: helper extraction, two migrations, and the React 19 testing rule are small and tightly coupled. Splitting the rule into a second PR would leave the code fix temporarily undocumented and repeat the documentation-drift trap already resolved in DEBT-395.

### 1. Create the Shared Helper

Create `tests/shared/dom-helpers.ts`:

```typescript
export function findAnchorByHref(
  root: ParentNode,
  href: string,
): HTMLAnchorElement | null {
  return (
    Array.from(root.querySelectorAll('a')).find(
      (anchor) => anchor.getAttribute('href') === href,
    ) ?? null
  );
}
```

Use `ParentNode`, not `Document`, so tests can preserve scoped assertions by passing a container element when the old selector was scoped (for example `li a`). Do not add `findAnchorByHrefContaining()` for DEBT-396; the single `href*=` site is distinct and out of scope.

### 2. Migrate Dashboard Test

Edit `app/(app)/app/dashboard/page.test.tsx`:

- Import `findAnchorByHref` from `@/tests/shared/dom-helpers`.
- Delete the local helper at lines 29-38.
- Existing helper consumers at lines 214, 224, 305, 617, and 625 should continue to call `findAnchorByHref(...)`, now through the shared import.
- Replace the fragile line 355 selector with the shared helper while preserving the original `li a` intent. Do not weaken it to "any matching link in the document" if the test is meant to prove a session-card fallback link exists.

### 3. Migrate Question Page Test

Edit `app/(app)/app/questions/[slug]/question-page-client.test.tsx`:

- Import `findAnchorByHref` from `@/tests/shared/dom-helpers`.
- Replace line 220 with `findAnchorByHref(doc, '/app/history?tab=sessions')`.
- Leave the simple-href selectors at lines 97, 182, 243, and 276 unchanged.

### 4. Document the Rule

Edit `.claude/rules/testing-react19.md` after "Synchronous hook capture" and before "Full details." Add a short section named `### Anchor href assertions` with this content contract:

- For exact anchor assertions where the expected href contains a query string, `&`, or a generated/interpolated URL value, use `findAnchorByHref()` from `@/tests/shared/dom-helpers`.
- Prefer `findAnchorByHref()` for new exact anchor href assertions when it reads clearly, but do not churn existing simple static selectors.
- Explain why: PR #328 showed jsdom 26 -> 29 selector/CSS parsing changes can break URL-bearing CSS attribute selectors while the rendered `href` remains correct.
- Bad example: `doc.querySelector('a[href="/path?tab=sessions&sort=desc"]')`.
- Good example: `findAnchorByHref(doc, '/path?tab=sessions&sort=desc')`.
- Mention that the helper compares `anchor.getAttribute('href') === href`, bypassing selector parsing.

Do not add unrelated guidance about module-cache ordering, database isolation, or generic mutable state. DEBT-396 is only about brittle CSS attribute selectors in React 19 render-output tests.

### 5. Update This Debt Doc

After execution, update this file with:

- PR number.
- Final migrated file list.
- Verification results.
- Note that archive is a separate follow-up after merge.

Do not move this doc to `docs/_archive/debt/` in the execution PR.

---

## Execution File List

The consolidated execution PR changes exactly these files:

- `tests/shared/dom-helpers.ts` (new)
- `app/(app)/app/dashboard/page.test.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
- `.claude/rules/testing-react19.md`
- `docs/debt/debt-396-brittle-css-selector-remediation.md`

No production files are in scope.

---

## Verification

Run targeted tests:

```sh
pnpm test --run app/'(app)'/app/dashboard/page.test.tsx
pnpm test --run app/'(app)'/app/questions/'[slug]'/question-page-client.test.tsx
```

Run the scope guard:

```sh
rg -n 'querySelector\([^\n]*\[href[^\]]*[?][^\]]*\]' app/ components/ src/ --glob '*.test.ts' --glob '*.test.tsx'
```

Expected after execution: zero hits.

Run the DEBT-398 regression sanity check:

```sh
pnpm test --run components/theme-token-regression.test.tsx
```

Expected: 16/16 pass. This PR touches test docs/helpers and render-output tests, not scanned UI implementation surfaces.

Before push, run the full local gate:

```sh
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

Run E2E only if the local authenticated billing E2E environment is present per `AGENTS.md`.

---

## Acceptance Criteria

The consolidated PR is done when:

- [x] `tests/shared/dom-helpers.ts` exists and exports `findAnchorByHref(root: ParentNode, href: string): HTMLAnchorElement | null`.
- [x] No local inline copies of `findAnchorByHref()` remain.
- [x] `app/(app)/app/dashboard/page.test.tsx:355` no longer uses a query-string CSS attribute selector, and the assertion still targets the session-card fallback link.
- [x] `app/(app)/app/questions/[slug]/question-page-client.test.tsx:220` no longer uses a query-string CSS attribute selector.
- [x] The known-ok simple href selectors listed above are not churned.
- [x] `.claude/rules/testing-react19.md` documents the anchor/href rule, names `@/tests/shared/dom-helpers`, and cites PR #328.
- [x] The query-string selector guard returns zero hits.
- [x] Targeted tests, DEBT-398 regression test, and the full local gate are green.

---

## Optional Hardening (Defer)

Two enforcement mechanisms are worth considering but are not required for DEBT-396:

1. A Biome-compatible lint/enforcement path that flags `querySelector` / `querySelectorAll` calls with URL-bearing attribute selector values.
2. A pre-push grep guard for new query-string href selector assertions.

Both are P3 follow-ups. Do not fold them into the consolidated execution PR unless separately requested.

---

## Done When

The consolidated PR is merged to `dev` and synced to `main`; the shared helper is the single canonical implementation; the React 19 testing rule documents the WHY; and the DEBT-396 doc is archived in a later follow-up PR with a resolution paragraph.
