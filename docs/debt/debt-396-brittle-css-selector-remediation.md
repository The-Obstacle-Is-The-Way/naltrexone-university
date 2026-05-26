# DEBT-396: Brittle CSS Selector Remediation

**Priority:** P2 (active bug class — two unfixed query-string href selector sites remain after PR #328 established the fix. They are exposed to the same selector-engine fragility that broke dashboard tests during the jsdom 26→29 bump. Without a documented rule and an enforcement mechanism, the same pattern will keep getting written.)
**Created:** 2026-05-26
**Source:** Deep adversarial test-suite audit conducted alongside DEBT-394 archival. Direct precedent is PR #328 (jsdom 26→29 bump) where three tests in `app/(app)/app/dashboard/page.test.tsx` failed because `querySelector('a[href="${ROUTES.APP_HISTORY}?tab=sessions"]')` stopped matching under jsdom 29's tightened CSS attribute-selector parser when the value contained URL-encoded `&` characters. PR #328 introduced a `findAnchorByHref()` helper using `getAttribute('href')` comparison. Two additional sites in the codebase still use the unsafe pattern and were not caught by the original sweep.
**Related:** [.claude/rules/testing-react19.md](../../.claude/rules/testing-react19.md), [docs/dev/dependency-update-protocol.md](../dev/dependency-update-protocol.md), PR #328

**Status:** Active

---

## Problem

`document.querySelector('a[href="..."]')` couples the test to CSS attribute-selector parsing semantics. Those semantics change between jsdom (and Playwright/Chromium) versions. When the URL contains characters that the selector parser treats specially — `?`, `&`, `=`, `#`, encoded entities — the selector silently stops matching, the assertion produces a misleading "element not found" error, and the developer is forced to debug a "broken test" that's actually a "broken selector."

The right pattern is to query for the tag and filter by attribute value imperatively:

```typescript
Array.from(doc.querySelectorAll('a')).find(
  (anchor) => anchor.getAttribute('href') === expectedHref,
);
```

This is identical in intent but routes around the selector parser entirely. It tests the actual behavior (the anchor's `href` attribute matches the expected route) rather than the byproduct (does the CSS engine match this selector string).

PR #328 demonstrated this fix and inlined it as `findAnchorByHref()` in `app/(app)/app/dashboard/page.test.tsx`. The fix worked. **Two query-string href sites in the codebase still use the unsafe selector-string pattern.** They should be migrated before the next selector-engine/jsdom churn.

---

## Findings

### A. Unfixed CSS attribute selectors with query strings

| File | Line | Pattern | Risk |
|---|---|---|---|
| `app/(app)/app/dashboard/page.test.tsx` | 355 | `doc.querySelector(\`li a[href="${ROUTES.APP_HISTORY}?tab=sessions"]\`)` | Same bug class as PR #328 |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | 220 | `doc.querySelector('a[href="/app/history?tab=sessions"]')` | Same bug class as PR #328 |

Both selectors contain `?tab=sessions`. Under jsdom 29 the dashboard cases fixed in PR #328 were migrated to `getAttribute()` comparison; the other dashboard occurrence at line 355 and the question-page case were missed because they use different patterns the sweep didn't grep for. Both are exposed to the same failure mode on future selector-engine tightening.

Verify the sites with a regex that requires the `?` to appear inside the attribute selector brackets (the looser `querySelector\(.*\[href.*\?` form also matches optional chaining after the selector call and produces false positives):

```sh
rg -n 'querySelector\([^\n]*\[href[^\]]*[?][^\]]*\]' app/ src/ components/ --glob '*.ts' --glob '*.tsx'
```

### B. Broader query-string-in-attribute-selector anti-pattern

A wider grep finds additional attribute selectors. Most are safe because the attribute value has no query-string/special-character payload, but the sweep should classify each match before remediation:

```sh
rg -n "querySelector.*\[(href|src|action|data-\w+)=" app/ src/ components/ --glob '*.ts' --glob '*.tsx' | rg -v "_archive|node_modules"
```

Audit each. Most are safe (the attribute value contains no special characters). The ones with `?`, `&`, `=`, `#`, encoded entities, or interpolated URL values are at risk and should switch to `getAttribute()` comparison.

### C. The fix exists but is not extracted as a shared helper

PR #328 inlined `findAnchorByHref()` in `app/(app)/app/dashboard/page.test.tsx`. It is not exported. Other test files reinventing the same helper will produce inconsistent shapes. The helper belongs in a shared test utility module (e.g., `tests/shared/dom-helpers.ts` or `tests/shared/find-by-attribute.ts`) so every test imports the same battle-tested implementation.

### D. No documented rule prevents the pattern from being re-introduced

`.claude/rules/testing-react19.md` mentions stable markers ("Prefer stable markers (`role`, visible text, `href`, `data-testid`) for UI tests"), but does not explain WHY CSS attribute selectors with URL-encoded values are dangerous, does not cite PR #328, and does not name the `findAnchorByHref` helper. An agent reading the rule today would not learn to avoid the pattern.

---

## Why Existing Docs Were Not Enough

`docs/dev/dependency-update-protocol.md` lines 49-54 document the jsdom 26→29 incident as a "Dev-Tooling Majors" precedent — but that doc only loads when an on-call engineer is triaging a Dependabot PR. It does not load when an agent is writing a new test. The rule needed to live in `.claude/rules/testing-react19.md` and explain the WHY, not just the WHAT.

The "Styling Assertions" section in `.claude/rules/testing-react19.md` lines 43-47 says to prefer stable markers but is silent on selector engine fragility. An agent following the existing rule would write `querySelector('a[href="/some?path"]')` and consider it "stable" because `href` is a stable marker — without realizing the SELECTOR ENGINE is the unstable layer.

---

## Required Remediation

Ship in two single-concern PRs.

### PR 1 — Fix the two unfixed sites and extract the shared helper

Branch: `fix/debt-396-css-selector-brittleness`

Steps:

1. **Create `tests/shared/dom-helpers.ts`** exporting `findAnchorByHref(doc: Document, href: string): HTMLAnchorElement | null` (or place it in an existing shared test-utils module if one is the canonical home — verify against repo conventions). Implementation:

   ```typescript
   export function findAnchorByHref(
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

2. **Migrate `app/(app)/app/dashboard/page.test.tsx`** — replace the line 355 occurrence (and any other inline copies of the same pattern within the file from PR #328 if they were not extracted) with imports from the shared helper. Delete the local inline definition.

3. **Migrate `app/(app)/app/questions/[slug]/question-page-client.test.tsx`** — replace line 220 with the shared helper.

4. **Sweep**: run the grep from Finding B and convert every additional site that contains query-string characters in its attribute value to the shared helper. Document the sweep result in the PR body (file:line list).

5. **Full local gate**, including `pnpm test --run` and `pnpm test:browser`.

Verification: a fresh jsdom upgrade should no longer require sweep-the-codebase fixes for this pattern.

### PR 2 — Document the rule and the helper

Branch: `docs/debt-396-css-selector-rule`

Edit `.claude/rules/testing-react19.md` — add a section after "Styling Assertions":

```markdown
### CSS Selector Brittleness and Dev-Tool Upgrade Risk

Never assert URLs or query parameters inside CSS attribute-selector strings.
Selector engines tighten between jsdom versions (precedent: PR #328 broke
three tests when jsdom 26 → 29 stopped matching `?` and `&` inside
`querySelector('a[href="..."]')`).

**Bad** (will silently fail on the next jsdom major):

```typescript
doc.querySelector('a[href="/path?tab=sessions&sort=desc"]');
```

**Good** (tests behavior, not selector-engine parsing):

```typescript
import { findAnchorByHref } from '../../tests/shared/dom-helpers';

findAnchorByHref(doc, '/path?tab=sessions&sort=desc');
```

The helper compares `anchor.getAttribute('href') === href` imperatively,
which routes around the selector parser entirely. Same intent, no
selector-engine coupling.

**The rule applies to any attribute selector with special characters**,
not just hrefs. `[data-key="value?with&special"]`, `[action="/route?x=1"]`,
and similar patterns have the same failure mode. If your selector value
contains `?`, `&`, `=`, `#`, encoded entities, or any interpolated URL,
switch to `getAttribute()` comparison.

See `docs/dev/dependency-update-protocol.md` § "Dev-Tooling Majors" for
the jsdom isolation strategy that surfaces this class.
```

No code changes in this PR — pure doc.

---

## Optional Hardening (Defer if Out of Scope)

Two enforcement mechanisms worth considering but NOT required for archive:

1. **Lint rule**: add an ESLint custom rule (or contribute to `eslint-plugin-vitest`) that flags `querySelector` / `querySelectorAll` calls with attribute selectors containing `?`, `&`, `=`, `#`, or template-literal interpolation. Hard mode — write a Biome rule instead, since Biome is the active linter.

2. **Pre-push grep guard**: a shell script in `.husky/pre-push` that greps the staged diff for the pattern and warns. Less robust than a real lint rule but trivial to ship.

Both are P3 follow-ups that could be filed as a separate small debt entry if the team wants enforcement beyond documentation. Not required for DEBT-396 to archive.

---

## Acceptance Criteria

PR 1 done when:

- `tests/shared/dom-helpers.ts` (or chosen location) exists and exports `findAnchorByHref`.
- `app/(app)/app/dashboard/page.test.tsx:355` no longer uses `querySelector('a[href="..."]')` for query-string URLs.
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx:220` same.
- Any other sites discovered by the sweep are converted.
- No inline copies of `findAnchorByHref` remain (consolidated to the shared helper).
- Full local gate green.

PR 2 done when:

- `.claude/rules/testing-react19.md` has the "CSS Selector Brittleness" section.
- The section names the helper path and cites PR #328.
- A future agent writing a test for a URL-containing href will be reminded by the auto-loaded rule.

---

## Risk and Reversibility

- **PR 1 (helper extraction + migrations)** — low risk. Failure mode is "test passes for a different reason," which the full local gate catches. The conversion is mechanical and the helper is trivially correct.
- **PR 2 (rule doc)** — zero risk. Doc-only.

Both PRs are independently revertable.

---

## Done When

Both PRs merged to `dev` and synced to `main`. A grep of the codebase for `querySelector\([^\n]*\[(href|src|action|data-[[:alnum:]_-]+)[^\]]*[?&=#][^\]]*\]` returns zero unfixed sites. The shared helper is the single canonical implementation. The rule file documents the WHY. DEBT-396 doc archived to `docs/_archive/debt/` with resolution paragraph.

A future agent or contributor who writes `querySelector('a[href="/path?x=1"]')` will be flagged at code-review time by either the documented rule (in their loaded context) or by the optional lint/grep hardening if it ships later.
