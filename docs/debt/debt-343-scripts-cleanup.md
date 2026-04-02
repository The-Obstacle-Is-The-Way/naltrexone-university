# DEBT-343: Scripts Directory Cleanup

**Priority:** P3
**Created:** 2026-04-01
**Status:** Resolved (2026-04-02)
**Audited by:** Independent agent audit (2026-04-01) — verified imports, git history, CI usage, and test suites for every file. 65/65 tests passing across all script test files.

---

## Problem

The `scripts/` directory contains a mix of active pipeline scripts, one-off migration tools, and unused tooling. Without clear documentation of what's active vs. stale, it's easy to waste time understanding scripts that are no longer needed, or worse, accidentally delete something that's actively imported.

---

## Full Inventory

### KEEP — Active Pipeline

These scripts are wired to `package.json`, imported by active code, or enforced by git hooks.

| Script | Verdict | npm Command | Imported By | Last Touched | Purpose |
|--------|---------|-------------|-------------|--------------|---------|
| `seed.ts` | KEEP | `pnpm db:seed` | CLI entrypoint | 2026-02-19 | Seeds PostgreSQL from MDX files. Idempotent (SHA256 hash skip). |
| `seed/` directory (5 files) | KEEP (support) | via seed.ts | `seed.ts` | 2026-03-28 | Decomposed modules: `file-reader.ts`, `placeholder-archiver.ts`, `question-parser.ts`, `question-syncer.ts`, `tag-manager.ts` |
| `seed-helpers.ts` | KEEP (support) | via seed/ | `question-parser.ts`, `question-syncer.ts` | 2026-03-28 | Shared choice-sync logic (`computeChoiceSyncPlan`) |
| `seed.test.ts` | KEEP | Vitest glob | Vitest include | 2026-03-28 | 21/21 tests passing. Active seed pipeline tests. |
| `seed-helpers.test.ts` | KEEP | Vitest glob | Vitest include | 2026-03-28 | 8/8 tests passing. Regression suite for seed helpers. |
| `import-draft-questions.ts` | KEEP | `pnpm content:import:drafts` | CLI entrypoint | 2026-02-18 | Converts drafts → MDX. Imports from `draft-question-import.ts`. |
| `draft-question-import.ts` | **KEEP (support)** | — | **`import-draft-questions.ts`** imports `splitDraftQuestionsFile`, `parseDraftQuestionBlock`, `convertDraftQuestionToMdx` | 2026-03-28 | **NOT dead code.** Core parsing/conversion module for the active draft importer. 9 commits of active development. |
| `draft-question-import.test.ts` | KEEP | Vitest glob | Vitest include | 2026-03-28 | 19/19 tests passing. Tests the active support module above. |
| `check-file-size.sh` | KEEP | lint-staged pre-commit hook | `.husky/pre-commit` | 2026-02-19 | Rejects staged files exceeding 350 lines. |

### CAUTION — One-Off Migration Tools (Still in Test Suite)

These scripts are not wired to any `package.json` command and their original migration purpose (SPEC-033) is complete. However, their test files are picked up by the Vitest glob and **run on every `pnpm test --run` and pre-push hook** (17/17 tests passing). Deleting them removes those tests from the suite.

| Script | Verdict | Imported By | Last Touched | Notes |
|--------|---------|-------------|--------------|-------|
| `migrate-tag-taxonomy.ts` | CAUTION | `migrate-tag-taxonomy.test.ts` | 2026-02-19 | One-off tool for SPEC-033 taxonomy overhaul. Migration is complete. |
| `migrate-tag-taxonomy/` (4 files) | CAUTION | `migrate-tag-taxonomy.ts` | 2026-02-19 | Support modules: `tag-migration-logic.ts`, `tag-parsers.ts`, `tag-taxonomy-mappers.ts`, `types.ts` |
| `migrate-tag-taxonomy.test.ts` | CAUTION | Vitest glob | 2026-02-19 | 17/17 tests passing. Active in CI via Vitest glob match. |
| `tag-census.ts` | CAUTION | None | 2026-02-18 | Not in package.json, CI, or hooks. But `docs/content/reports/` and several active docs reference it. Delete only with doc cleanup. |

**To safely delete these:** Remove the scripts, their test files, and update these docs:
- `docs/practice-engine/file-index.md`
- `docs/content/tag-taxonomy-pipeline.md`
- `docs/content/tag-taxonomy-golden-spec.md`

### SAFE TO DELETE — Unused Tooling

Confirmed by independent audit: no package.json, no CI, no hooks, no code imports. Only self-references.

| Script/Docs | Verdict | Last Touched | Purpose | Why Delete |
|-------------|---------|--------------|---------|------------|
| `ralph-loop.sh` | SAFE TO DELETE | 2026-02-14 | Runs agent loops in tmux | Never used on this codebase per owner. No runtime, CI, or hook usage. |
| `docs/_ralphwiggum/protocol.md` | SAFE TO DELETE | 2026-01-31 | Ralph Wiggum protocol docs | Only referenced by `ralph-loop.sh`. |
| `docs/_ralphwiggum/PROMPT.md` | SAFE TO DELETE | 2026-02-14 | Ralph Wiggum prompt template | Only referenced by `ralph-loop.sh`. |
| `docs/_ralphwiggum/PROGRESS.md` | SAFE TO DELETE | 2026-02-14 | Ralph Wiggum progress log | Only referenced by `ralph-loop.sh`. |

---

## Audit Correction Log

| Original Claim | Correction | How Caught |
|----------------|------------|------------|
| `draft-question-import.ts` marked as dead code for deletion | **WRONG — it's a support module.** `import-draft-questions.ts` imports 3 functions from it. Deleting it would break `pnpm content:import:drafts`. | Independent agent grep of imports |
| `migrate-tag-taxonomy.*` marked SAFE TO DELETE | Upgraded to CAUTION — test files are in the active Vitest glob and run on pre-push. Deletion is safe but removes 17 passing tests. | Agent verified CI and pre-push hook behavior |

---

## Recommended Actions

### Phase 1: Safe Deletions (Zero Risk)

```bash
git rm scripts/ralph-loop.sh
git rm -r docs/_ralphwiggum/
```

**Files removed:** 4 files
**Risk:** Zero — completely self-contained, no imports, no CI, no hooks.

### Phase 2: Migration Tool Cleanup (Low Risk, Needs Doc Updates)

Only proceed after updating doc references listed above.

```bash
git rm scripts/migrate-tag-taxonomy.ts
git rm scripts/migrate-tag-taxonomy.test.ts
git rm -r scripts/migrate-tag-taxonomy/
git rm scripts/tag-census.ts
```

**Files removed:** 7 files
**Risk:** Low — removes 17 passing tests from suite. No runtime impact.

### Phase 3: Add Corpus Seeding Script (New)

Create `scripts/seed-all-environments.sh` to replace the manual multi-step process and explicitly handle local + Vercel targets without committing secrets:

```bash
#!/bin/bash
set -euo pipefail

# 1. Pull Vercel Development / Preview / Production env files into mktemp
# 2. Read DATABASE_URL from .env.local plus the temp env files
# 3. Deduplicate identical URLs so a shared non-production DB is seeded once
# 4. Refuse to proceed if production matches any non-production URL
# 5. Dry-run import in published mode
# 6. Rebuild content/questions/imported/
# 7. Seed each unique DATABASE_URL with explicit env override
```

Wire to package.json: `"db:seed:all": "bash scripts/seed-all-environments.sh"`

### Phase 4: Update Documentation References

After Phase 2, update these docs to remove references to deleted scripts:

- `docs/practice-engine/file-index.md` — remove `tag-census.ts`, `migrate-tag-taxonomy.ts` entries
- `docs/content/tag-taxonomy-pipeline.md` — remove `tag-census.ts` references
- `docs/content/tag-taxonomy-golden-spec.md` — remove migration script references

Archive docs (`docs/_archive/`) can keep their historical references.

---

## Post-Cleanup Scripts Directory

```text
scripts/
├── seed/                          # Seed modules (active)
│   ├── file-reader.ts
│   ├── placeholder-archiver.ts
│   ├── question-parser.ts
│   ├── question-syncer.ts
│   └── tag-manager.ts
├── check-file-size.sh             # Pre-commit hook (active)
├── draft-question-import.ts       # Draft parsing/conversion (support module — DO NOT DELETE)
├── draft-question-import.test.ts  # 19 passing tests for above
├── import-draft-questions.ts      # Draft → MDX importer (active CLI)
├── seed.ts                        # DB seeder (active CLI)
├── seed.test.ts                   # 21 passing seed tests
├── seed-helpers.ts                # Shared seed logic (support)
├── seed-helpers.test.ts           # 8 passing seed helper tests
└── seed-all-environments.sh       # NEW: Full corpus update pipeline
```

Every file has a clear purpose, a `package.json` command, is imported by one that does, or is a test for active code.
