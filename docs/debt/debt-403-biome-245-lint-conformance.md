# DEBT-403: Biome 2.4.15 lint-rule conformance

**Priority:** P3 (blocks Dependabot PR #385 from going green; the fix is small — deterministic autofixes plus one manual key change — but the standalone Biome bump cannot merge until the codebase conforms to the new rule surface.)
**Created:** 2026-06-03
**Source:** Dependabot PR #385 (`chore(deps): bump @biomejs/biome from 2.3.13 to 2.4.15 in the biome group`). The standalone `biome` Dependabot group exists precisely because [DEBT-393](../_archive/debt/debt-393-dependabot-triage-and-config-hardening.md) §C split Biome out of `npm-minor-and-patch` so its lint-rule shift could be handled independently. DEBT-393 §C named two complementary remedies for a Biome lint-rule shift — split Biome out of the group (shipped in PR #344) **and** "accept the lint changes (fix the affected files)." With the split already in place, this doc carries out the remaining recommended handling — accepting the lint shift — for the 2.3.13 → 2.4.15 bump.
**Related:** [DEBT-393](../_archive/debt/debt-393-dependabot-triage-and-config-hardening.md) (Dependabot triage + the Biome group split that anticipated this), PR #385 (the lockfile bump this unblocks), PR #384 (sibling `npm-minor-and-patch` group, independent).
**Status:** Open — doc written 2026-06-03 and passed two independent citation audits (internal + external; all 13 load-bearing claims confirmed, caller-uniqueness gate resolved SAFE, plan judged sufficient: fixes A+B+E remove every Biome 2.4.15 error). Ready to implement on branch `chore/biome-245-lint-conformance`.

---

## Problem

`biome.json` configures the linter with `"recommended": true`, which is **not version-pinned**. Biome 2.4.15 promotes/adds rules to the recommended set and to its assist actions, so upgrading the binary surfaces violations in the *existing* codebase that 2.3.13 never flagged. `package.json` pins Biome with a caret (`"@biomejs/biome": "^2.3.13"`), and PR #385 is **lockfile-only** — so the bump itself carries no code change, and CI goes red purely because the conformance work hasn't landed.

`lint:ci` runs `biome ci .` (see `package.json`). `biome ci` fails on **errors** only; **warnings** do not fail it. Running biome 2.4.15 against `dev` (ephemerally, no install) reports:

```text
pnpm dlx @biomejs/biome@2.4.15 ci .
=> Found 11 errors, 22 warnings, 1 info   (before any fix)
```

### Breakdown (verified against biome 2.4.15 output on dev @ 85078eec)

| Diagnostic | Count | Severity | Fails `biome ci`? | Disposition |
|---|---|---|---|---|
| Assist — `source.organizeImports` (9 export/name sorts + 1 blank-line-before-statement) | 10 | error | **yes** | **autofix** (`biome check --write`, deterministic) |
| `lint/suspicious/noArrayIndexKey` — `components/error-boundary-page.tsx:59:48` | 1 | error | **yes** | **manual** (the one judgment call) |
| `lint/complexity/useOptionalChain` | 3 | warning | no | optional cleanup (recommended) |
| `lint/nursery/noExcessiveLinesPerFile` | 19 | warning | no | **out of scope** (leave) |

After the safe autofix, `biome ci` reports **1 error** (`noArrayIndexKey`) + 22 warnings. So the entire CI-blocking surface is: **10 export-sort autofixes + 1 manual key fix + a `$schema` bump.**

---

## Findings

### A. `organizeImports` assist autofixes (10 files) — REQUIRED, deterministic

`biome check --write` (safe fixes only) applies the `source.organizeImports` assist: 9 files get export-specifier / exported-name lists reordered alphabetically, and 1 file (`checkout-success-sync.tsx:25`) gets a required blank line inserted before a statement. All same assist category, same autofix, behavior-preserving. Affected files:

```text
app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts
app/(app)/app/practice/[sessionId]/page.tsx
app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx
app/(app)/app/questions/[slug]/page.tsx
app/(marketing)/checkout/success/checkout-success-sync.tsx
app/(marketing)/checkout/success/page.tsx
app/pricing/page.tsx
components/ui/dropdown-menu.tsx
src/application/use-cases/get-next-question-test-helpers.ts
src/application/use-cases/submit-answer-test-helpers.ts
```

These were generated, verified, then **stashed** (`git stash@{0}` on this branch) so the doc-first workflow runs on a pristine tree; they are 100% reproducible via `biome check --write`.

### B. `noArrayIndexKey` (1 error) — REQUIRED, manual

`components/error-boundary-page.tsx:57-65` maps `links` to `<Button>` elements with:

```tsx
{links.map((link, index) => (
  <Button key={`${link.href}_${link.label}_${index}`} asChild variant="outline">
```

Biome 2.4.15 flags the array `index` in the key. Fix: drop the index →

```tsx
{links.map((link) => (
  <Button key={`${link.href}_${link.label}`} asChild variant="outline">
```

**Correctness gate:** dropping the index is only safe if no caller passes two links with the same `href` AND `label`. `ErrorBoundaryPageLink` is `{ href: string; label: string }` (file lines 8-11); nav links are destination-unique in practice. The fix MUST be verified by enumerating every caller of `ErrorBoundaryPage` (`error.tsx` boundaries that pass `links`) and confirming no duplicate `href+label` pair. If any caller could collide, fall back to a stable caller-supplied id rather than reintroducing the index.

### C. `useOptionalChain` ×3 (warnings) — OPTIONAL, recommended

Warning-level in 2.4.15 recommended; does **not** fail CI. Behavior-preserving `a || a.b` → `a?.b`:

- `app/(app)/app/questions/[slug]/question-page-logic.ts:389` — `if (!res || !res.ok)` → `if (!res?.ok)`
- `src/application/use-cases/get-completed-session-questions-with-feedback.test.ts:146`
- `src/application/use-cases/get-completed-session-questions-with-feedback.test.ts:173`

Recommend including these (trivial, reduces warning noise) but they are not required for #385 to go green. Apply via reviewed `--write --unsafe` or by hand; each must be read and confirmed behavior-preserving.

### D. `noExcessiveLinesPerFile` ×19 (warnings) — OUT OF SCOPE, leave

These are test/spec files exceeding the 800-line threshold already configured as `"warn"` in the `biome.json` test-file override (`overrides[0]`, `level: "warn"`, `maxLines: 800`). They are **pre-existing on `dev`** under 2.3.13 and warning-level — they do not fail CI. Refactoring 19 large test files is unrelated to a dependency bump and would balloon the diff. Leave them; revisit under a dedicated test-hygiene doc if ever desired.

### E. `$schema` bump — REQUIRED (cosmetic)

`biome.json` line 2 pins `"$schema": "https://biomejs.dev/schemas/2.3.13/schema.json"`. Bump to `.../2.4.15/schema.json` so editor validation matches the binary. Biome ignores `$schema` for linting, so this is non-functional but keeps config honest.

---

## Branch strategy — two-PR split (honors DEBT-393 single-purpose rule)

Because `package.json` already allows 2.4.15 via caret and #385 is lockfile-only, the conformance and the version bump cleanly separate:

1. **PR-A — `chore/biome-245-lint-conformance` (this branch):** source conformance (A + B + C) + `$schema` (E). **No `package.json` / `pnpm-lock.yaml` change.** Green under `dev`'s installed biome 2.3.13 (the new rules aren't enforced there) *and* green under 2.4.15 (verified locally). Merge → FF `main`.
2. **PR #385 (Dependabot):** the pure lockfile bump to 2.4.15. After PR-A lands, rebase → `biome ci` is green because the code already conforms → merge → FF `main`.

This keeps #385 a single-purpose Dependabot PR with **no manual commits on the Dependabot branch** — the exact discipline DEBT-393 (and CodeRabbit's recorded learning) require. The alternative (couple bump + fixes in one manual PR and close #385) is viable but contaminates Dependabot's single-purpose model, so it is the fallback only if PR-A cannot be made green under 2.3.13.

---

## Verification plan

**Before fixing:** independent-agent audit of this doc — confirm every file:line, rule id, severity, and count against actual code + `pnpm dlx @biomejs/biome@2.4.15 ci .` output. Correct any discrepancy before touching code.

**During fix:** independent-agent review of the manual `noArrayIndexKey` change (Finding B), specifically the caller-uniqueness gate.

**After fix (full gate on PR-A)** — run under Node 24 to match CI (Node 22 shells emit a non-blocking `Unsupported engine` warning):
- `pnpm dlx @biomejs/biome@2.4.15 ci .` → **0 errors** (warnings permitted: the 19 noExcessiveLines, and 0 or 3 useOptionalChain depending on whether C is included).
- `pnpm lint:ci` (installed biome 2.3.13) → green (proves PR-A passes `dev` CI in the intermediate state).
- `pnpm typecheck && pnpm test --run && pnpm test:browser && pnpm build` → green. (Integration/E2E unaffected by sort/key/optional-chain changes; run if the local DB/E2E env is available.)

## Acceptance criteria

- [ ] PR-A green under both biome 2.3.13 and 2.4.15; CodeRabbit-clean; merged; `main` FF'd.
- [ ] PR #385 rebased, `biome ci` green, CodeRabbit-clean; merged; `main` FF'd.
- [ ] No CI warnings introduced beyond the pre-existing `noExcessiveLinesPerFile` set (and the 3 `useOptionalChain` resolved if Finding C is included).
- [ ] `biome.json` `$schema` reflects 2.4.15.
