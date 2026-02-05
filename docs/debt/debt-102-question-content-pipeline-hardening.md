# DEBT-102: Question Content Pipeline Hardening (Tags, Publishing, and Prod Seeding)

**Status:** Open  
**Priority:** P2  
**Date:** 2026-02-05

---

## Description

The repo seeds questions from `content/questions/**/*.mdx` via `pnpm db:seed` (`scripts/seed.ts`).

To support a large proprietary question bank authored in draft files (`content/drafts/questions/**/{recall.md,vignettes.md}`), we introduced an importer (`pnpm content:import:drafts`) that generates MDX into `content/questions/imported/` (gitignored).

This works end-to-end locally, but there are unresolved “product + taxonomy + ops” decisions that will affect long-term maintainability and production correctness.

---

## Impact

- **Tag hygiene risk:** Without a canonical tag taxonomy (and a mapping strategy), the tag filter UI can fragment (synonyms, inconsistent capitalization, overlapping meanings).
- **Publishing ambiguity:** The app serves only `status='published'`. We need a deliberate policy for when/what gets published vs kept as draft.
- **Production seeding ambiguity:** Because real content is gitignored, we need a deterministic, documented path for staging/prod seeding that doesn’t rely on tribal knowledge.

---

## Resolution

1. **Canonical tag taxonomy**
   - Define the canonical list (or canonical rules) for `TagKind` usage:
     - `domain`, `topic`, `substance`, `treatment`, `diagnosis`
   - Decide if/when the importer should infer `treatment`/`diagnosis` kinds (currently it only generates `domain|substance|topic`).
   - Decide canonical slugs for high-value concepts (e.g., “psychosocial” vs “psychotherapy”, abbreviations like “OUD”).

2. **Publishing policy**
   - Decide whether “imported” content should default to `draft` forever, with an explicit publish step (recommended), or be imported directly as `published` for local/staging.
   - Decide what to do with committed placeholder questions:
     - keep them `published` (demo-friendly)
     - or archive them in production to avoid mixing

3. **Staging/production seeding strategy**
   - Document the accepted approach:
     - “Run `pnpm db:seed` locally against the remote DB” vs
     - “CI job pulls from private content repo and seeds”
   - Add a checklist to prevent accidental seeding with wrong `DATABASE_URL`.

---

## Verification

- Run `pnpm content:import:drafts -- --dry-run` and confirm counts match expected draft inventory.
- Run `pnpm content:import:drafts -- --status published` and `pnpm db:seed` against a clean DB and confirm:
  - `/app/practice` serves non-placeholder questions
  - tag filter UI is usable (no obvious fragmentation for core tags)
- Run `pnpm db:seed` twice and confirm it is idempotent (second run mostly `skipped=`).

---

## Related

- `docs/dev/question-content-pipeline.md` (process documentation)
- `docs/specs/master_spec.md` (Section 5: Content Pipeline)
- `scripts/import-draft-questions.ts` (draft → MDX)
- `scripts/seed.ts` (MDX → DB)
- `lib/content/schemas.ts` (schema enforcement)

