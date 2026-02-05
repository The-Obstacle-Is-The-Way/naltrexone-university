# DEBT-102: Question Content Pipeline Hardening (Tags, Publishing, and Prod Seeding)

**Status:** Resolved  
**Priority:** P2  
**Date:** 2026-02-05
**Resolved:** 2026-02-05

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

1. **Canonical tag taxonomy (drafts)**
   - Codified canonical draft `substances[]` and `topics[]` slugs in `lib/content/draftTaxonomy.ts`.
   - Hardened the importer schema so non-canonical values fail fast with actionable errors (prevents tag fragmentation).

2. **Explicit treatment/diagnosis tagging (no heuristics)**
   - Extended the draft frontmatter schema to accept optional `treatments[]` and `diagnoses[]` arrays (kebab-case slugs).
   - The importer now maps these to MDX tags with `kind: treatment|diagnosis`, avoiding ambiguous inference from `topics[]`.

3. **Publishing + seeding strategy (documented)**
   - Documented the supported workflow in `docs/dev/question-content-pipeline.md`, including:
     - importing drafts as `published` when you want them to appear in the app
     - excluding/archiving placeholders via `SEED_INCLUDE_PLACEHOLDERS=false`
     - running `pnpm db:migrate` before seeding to avoid “Internal error” failures.

---

## Verification

- [x] Unit tests: `scripts/draft-question-import.test.ts` verifies conversion + schema enforcement.
- [x] Manual: follow `docs/dev/question-content-pipeline.md` to import drafts, seed a clean DB, and verify `/app/practice` serves imported questions (optionally excluding placeholders).

---

## Related

- `docs/dev/question-content-pipeline.md` (process documentation)
- `docs/specs/master_spec.md` (Section 5: Content Pipeline)
- `scripts/import-draft-questions.ts` (draft → MDX)
- `scripts/seed.ts` (MDX → DB)
- `lib/content/schemas.ts` (schema enforcement)
- `lib/content/draftTaxonomy.ts` (canonical draft tag slugs)
