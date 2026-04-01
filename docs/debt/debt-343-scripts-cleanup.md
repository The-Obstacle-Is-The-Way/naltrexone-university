# DEBT-343: Scripts Directory Cleanup

**Priority:** P3
**Created:** 2026-04-01
**Status:** Open

---

## Problem

The `scripts/` directory contains a mix of active pipeline scripts, one-off migration tools, and dead code. Without clear documentation of what's active vs. stale, it's easy to waste time understanding scripts that are no longer needed, or worse, accidentally run the wrong one.

---

## Full Inventory

### Active — Keep and Maintain

These scripts are wired to `package.json` and are part of the current pipeline.

| Script | npm Command | Created | Purpose |
|--------|-------------|---------|---------|
| `seed.ts` | `pnpm db:seed` | 2026-01-31 | Seeds PostgreSQL from MDX files. Idempotent (SHA256 hash skip). Upserts questions, choices, tags. Archives placeholders unless `SEED_INCLUDE_PLACEHOLDERS=true`. |
| `seed/` directory | (imported by seed.ts) | 2026-02-20 (DEBT-230 decomposition) | Focused modules: `file-reader.ts`, `placeholder-archiver.ts`, `question-parser.ts`, `question-syncer.ts`, `tag-manager.ts` |
| `seed-helpers.ts` | (imported by seed/) | 2026-02-01 | Shared choice-sync logic (`computeChoiceSyncPlan`, `ChoiceRef` types) |
| `import-draft-questions.ts` | `pnpm content:import:drafts` | 2026-02-05 | Converts `content/drafts/questions/**/{recall,vignettes}.md` → individual MDX files in `content/questions/imported/`. Supports `--dry-run`, `--status`. |
| `check-file-size.sh` | lint-staged pre-commit hook | 2026-02-19 (DEBT-224) | Rejects staged files exceeding 350 lines. Prevents bloat at commit time. |

### Delete — Dead Code

| Script | Created | Why It's Dead | Evidence |
|--------|---------|---------------|----------|
| `draft-question-import.ts` | 2026-02-05 | Superseded by `import-draft-questions.ts` on the same day. Both were added in commit `ef4ae42`. The active one is wired to `package.json`; this one is not. DEBT-340 explicitly removed legacy draft import support from this file, leaving it as an empty shell. | Not in `package.json`. No non-test imports reference it. |
| `draft-question-import.test.ts` | 2026-02-05 | Test file for the dead script above. | Tests dead code. |

### Delete — One-Off Migration (Completed)

| Script | Created | Original Purpose | Why It's Done |
|--------|---------|------------------|---------------|
| `migrate-tag-taxonomy.ts` | 2026-02-18 (SPEC-033) | Mass-rewrote tag slugs across all draft files during the taxonomy overhaul. | SPEC-033 is resolved. Tag taxonomy is stable. Migration was a one-time operation. |
| `migrate-tag-taxonomy/` directory | 2026-02-20 (DEBT-235) | Decomposed modules for the migration script: `tag-migration-logic.ts`, `tag-parsers.ts`, `tag-taxonomy-mappers.ts`, `types.ts` | Same — all support code for the completed migration. |
| `migrate-tag-taxonomy.test.ts` | 2026-02-18 | Tests for the migration script. | Tests completed one-off. |
| `tag-census.ts` | 2026-02-18 (SPEC-033) | Audits tag usage across MDX files, writes JSON/markdown reports. Used during taxonomy migration to verify correctness. | Reports already generated and stored in `docs/content/reports/`. Can be re-derived from MDX files at any time if needed. Not wired to any command. |

### Delete — Unused Tooling

| Script/Docs | Created | Purpose | Why Delete |
|-------------|---------|---------|------------|
| `ralph-loop.sh` | 2026-01-31 | Runs agent loops (Claude/Codex/OpenCode) in tmux for automated iteration. | Never used on this codebase per owner. Dev tooling experiment that didn't land. |
| `docs/_ralphwiggum/` directory | 2026-01-31 | Protocol docs (`protocol.md`, `PROMPT.md`, `PROGRESS.md`) for the Ralph Wiggum loop. | Supporting docs for unused tooling. |

---

## Recommended Actions

### Phase 1: Delete Dead Code (Safe, No Behavior Change)

```bash
# Dead import script + test
git rm scripts/draft-question-import.ts
git rm scripts/draft-question-import.test.ts

# Completed one-off migration + test + modules
git rm scripts/migrate-tag-taxonomy.ts
git rm scripts/migrate-tag-taxonomy.test.ts
git rm -r scripts/migrate-tag-taxonomy/

# Unused census script
git rm scripts/tag-census.ts

# Unused Ralph Wiggum tooling
git rm scripts/ralph-loop.sh
git rm -r docs/_ralphwiggum/
```

**Files removed:** 11 files + 1 directory
**Risk:** Zero — none are imported, wired to package.json, or referenced by active code.

### Phase 2: Add Corpus Seeding Script (New)

Create `scripts/seed-all-environments.sh` to replace the manual multi-step process:

```bash
#!/bin/bash
set -euo pipefail

# 1. Clear stale imported files
rm -rf content/questions/imported/*

# 2. Import drafts as published
pnpm content:import:drafts -- --status published

# 3. Seed dev/preview (uses DATABASE_URL from .env.local)
pnpm db:seed

# 4. Seed production (pulls URL from Vercel at runtime — no secrets committed)
PROD_DB=$(npx vercel env pull /dev/stdout --environment=production 2>/dev/null \
  | grep DATABASE_URL | cut -d'"' -f2)
DATABASE_URL="$PROD_DB" pnpm db:seed
```

Wire to package.json: `"db:seed:all": "bash scripts/seed-all-environments.sh"`

### Phase 3: Update Documentation References

These docs reference deleted scripts and should be updated:

- `docs/practice-engine/file-index.md` — remove `draft-question-import.ts`, `tag-census.ts`, `migrate-tag-taxonomy.ts` entries
- `docs/content/tag-taxonomy-pipeline.md` — remove `tag-census.ts` references
- `docs/content/tag-taxonomy-golden-spec.md` — remove migration script references
- `docs/debt/index.md` — no change needed (migration debt was already resolved/archived)

Archive docs can keep their historical references since they're explicitly archival.

---

## Post-Cleanup Scripts Directory

After cleanup, `scripts/` will contain only:

```
scripts/
├── seed/                          # Seed modules (active)
│   ├── file-reader.ts
│   ├── placeholder-archiver.ts
│   ├── question-parser.ts
│   ├── question-syncer.ts
│   └── tag-manager.ts
├── check-file-size.sh             # Pre-commit hook (active)
├── import-draft-questions.ts      # Draft → MDX importer (active)
├── seed.ts                        # DB seeder (active)
├── seed.test.ts                   # Seed tests
├── seed-helpers.ts                # Shared seed logic
├── seed-helpers.test.ts           # Seed helper tests
└── seed-all-environments.sh       # NEW: Full corpus update pipeline
```

Every file has a clear purpose, a `package.json` command, or is a test for one that does.
