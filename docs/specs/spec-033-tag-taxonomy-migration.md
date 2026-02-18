# SPEC-033: Tag Taxonomy Migration

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development. Write failing tests FIRST for every behavioral change.

**Status:** Proposed  
**Layer:** Feature  
**Date:** 2026-02-17  
**Resolves:** [BS-024](../brainstorming/bs-024-tag-taxonomy-cleanup.md)

---

## 1. Overview

BS-024 confirms taxonomy drift across the full tag pipeline: draft authoring, draft import, MDX frontmatter, seed, DB enum/model, repository/controller read path, and Practice/History UI consumers. The current system still carries `domain` tags, allows non-canonical values in key places, and depends on a brittle two-step domain rewrite flow (`content:import:drafts` then `migrate-domain-tags`).

This spec migrates to the approved target model in `tag-taxonomy-golden-spec.md`: **3 visible filter categories** (Topic, Substance, Treatment), removes `domain` from runtime taxonomy, hardens validation end-to-end, and cleans existing MDX/DB data so future imports cannot reintroduce drift.

### Verified code-truth deltas this spec resolves

1. `lib/content/draftTaxonomy.ts` currently has no treatment list, no domain list, and a substance list that still includes `caffeine`.
2. Current draft taxonomy (`DRAFT_SUBSTANCE_SLUGS`) **omits `cocaine`**; 1 imported MDX file (`kast-2021-009.mdx`) carries a `cocaine` substance tag that is not in the canonical list.
3. `scripts/import-draft-questions.ts` derives `domain` from directory path (`domainFromPath()`), which does not match per-question blueprint tagging.
4. `scripts/draft-question-import.ts` auto-title-cases slugs and injects domain tags from importer input.
5. `lib/content/schemas.ts` validates tag shape but not canonical slug sets per kind.
6. `scripts/seed.ts` enforces slug consistency but not canonical taxonomy or required kind presence.

### Scope boundaries

In scope:
- MDX corpus migration and validation hardening
- Draft/import/seed pipeline hardening
- DB schema migration for `tag_kind`
- Practice + History taxonomy display alignment
- Cleanup + verification docs/reports/tests

Out of scope:
- Attempt scoring/session logic changes
- Bookmark model changes
- New admin UI for taxonomy management

---

## 2. Resolved Decisions

| BS-024 Open Question | Resolution | Rationale |
|---|---|---|
| 1) Keep `diagnosis` kind or remove it? | **Keep `diagnosis` in schema, internal-only** | Preserves forward compatibility while removing user-facing complexity now. |
| 2) Canonical SSOT: drafts-first or MDX-first? | **Drafts-first canonical authoring; MDX is deterministic build output** | Aligns with existing authoring workflow and enables reproducible import once hardened. |
| 3) Keep placeholders in runtime seed by default? | **No** (default exclude; opt-in via env) | Prevents placeholder drift from polluting production/runtime tag options. |
| 4) Remove `domain` enum now or deprecate first? | **Remove now in this migration**, after data cleanup gate | Avoids carrying dead taxonomy paths; guarded by pre-migration assertions. |
| 5) Manual review for `co-occurring-complications` split? | **No manual review required** | Corpus audit verified: all 165 co-occurring-complications files have a disambiguating topic tag (123 `comorbidity` → `co-occurring-disorders`, 42 `medical-complications` → `medical-complications`, 0 ambiguous). Split is 100% deterministic. |
| 6) Treatment tagging scope? | **Medications-only** | Keeps Treatment orthogonal to Topic (`psychosocial-interventions` owns non-med modalities). |

### Additional implementation decision (required by current architecture)

`tags.slug` is globally unique and filter APIs are slug-based. To preserve API compatibility and avoid cross-kind slug collisions, Treatment fallback slug is **`other-treatment`** (display name: `Other`) instead of reusing `other`.

---

## 3. Phase 1: Content Migration (MDX corpus)

### 3.1 Files touched

- `content/questions/imported/**/*.mdx` (948 files)
- `content/questions/placeholder/**/*.mdx` (10 files)

Total target set: **958 MDX files**.

### 3.2 New migration script (one-time)

Create `scripts/migrate-tag-taxonomy.ts` with modes:
- `--dry-run` (default in CI)
- `--write`
- `--report <path>` (JSON report with per-file changes + unresolved items)

This script is **one-time corpus migration**. It is not a permanent runtime dependency.

### 3.3 Domain → Topic mapping

#### Conceptual mapping (from golden spec)

| Old Exam Section (domain tag) | New Topic |
|---|---|
| Co-occurring & Medical Complications | Split: psychiatric comorbidity → `co-occurring-disorders`, medical consequences → `medical-complications` |
| Epidemiology & Prevention | `epidemiology-prevention` |
| Ethics, Legal & Policy | `ethics-legal` |
| General | `general` |
| Pharmacology & Neuroscience | `pharmacology-neuroscience` |
| Psychosocial Interventions | `psychosocial-interventions` |
| Screening & Diagnosis | `screening-diagnosis` |
| Treatment & Pharmacotherapy | `treatment-pharmacotherapy` |

#### Implementation slug-to-slug mapping (what the migration script uses)

Current domain slugs (post-`migrate-domain-tags.ts`, verified across 948 files):

| Current Domain Slug | File Count | Target Topic Slug | Notes |
|---|---|---|---|
| `treatment-pharmacotherapy` | 236 | `treatment-pharmacotherapy` | Direct 1:1 (change kind only) |
| `pharmacology-neuroscience` | 184 | `pharmacology-neuroscience` | Direct 1:1 (change kind only) |
| `co-occurring-complications` | 165 | Split by existing topic tag (see §3.7) | 123 → `co-occurring-disorders`, 42 → `medical-complications` |
| `epidemiology-prevention` | 148 | `epidemiology-prevention` | Direct 1:1 (change kind only) |
| `screening-diagnosis` | 92 | `screening-diagnosis` | Direct 1:1 (change kind only) |
| `psychosocial-interventions` | 91 | `psychosocial-interventions` | Direct 1:1 (change kind only) |
| `ethics-legal-policy` | 32 | `ethics-legal` | **Slug changes** |

Note: No files carry domain slug `general` in the current corpus; `general` will exist as an empty canonical topic tag.

### 3.4 Old Topic → New Topic mapping (verbatim golden mapping)

| Old Topic Slug | New Topic Slug |
|---|---|
| `comorbidity` | `co-occurring-disorders` |
| `diagnosis` | `screening-diagnosis` |
| `epidemiology` | `epidemiology-prevention` |
| `ethics-legal` | `ethics-legal` |
| `harm-reduction` | `harm-reduction` |
| `intoxication` | `intoxication-toxicology` |
| `medical-complications` | `medical-complications` |
| `neurobiology` | `pharmacology-neuroscience` |
| `pharmacology` | `pharmacology-neuroscience` |
| `psychosocial` | `psychosocial-interventions` |
| `psychotherapy` | `psychosocial-interventions` |
| `screening` | `screening-diagnosis` |
| `special-populations` | `special-populations` |
| `topic` | DELETE — retag manually based on content |
| `toxicology` | `intoxication-toxicology` |
| `treatment` | `treatment-pharmacotherapy` |
| `withdrawal` | `withdrawal-management` |

### 3.5 Required migration behavior

1. Parse each MDX frontmatter tag entry.
2. Build new topic set from:
   - mapped old topic tags
   - mapped former domain tag(s)
3. Remove all `kind: domain` tags.
4. Deduplicate resulting topic tags by slug.
5. Apply canonical display names (do not preserve legacy auto-title names).
6. Preserve existing substance tags, then validate against canonical substance list.
7. Preserve existing treatment tags, validate/remap to canonical treatment list.
8. Keep diagnosis tags unchanged (if any).

### 3.6 Rogue topic cleanup

- `content/questions/placeholder/placeholder-07-stimulant-intoxication-management.mdx`
  - `topic` → `intoxication-toxicology`
- `content/questions/placeholder/placeholder-08-psychosocial-tx-motivational-interviewing.mdx`
  - `psychosocial` → `psychosocial-interventions`

### 3.7 Co-occurring split rule (verified deterministic)

Corpus audit confirmed all 165 `co-occurring-complications` domain files have a disambiguating topic tag. Zero ambiguous rows.

For former `co-occurring-complications` domain:
- If old topics include `comorbidity`, add `co-occurring-disorders` (123 files)
- If old topics include `medical-complications`, add `medical-complications` (42 files)
- If neither signal exists, fail with error (defensive — no current files hit this path)

### 3.8 Treatment scanning strategy (medications only)

Script scans stem + explanation + choices for medication mentions and adds canonical treatment tags when absent:
- `acamprosate`
- `buprenorphine`
- `bupropion`
- `disulfiram`
- `gabapentin`
- `methadone`
- `naloxone`
- `naltrexone`
- `nrt` (aliases: nicotine replacement therapy, nicotine patch/gum/lozenge/inhaler/spray)
- `topiramate`
- `varenicline`

Fallback for true medication content not in list: `other-treatment` (manual confirmation required).

### 3.9 Required post-migration invariants

Every MDX question must satisfy:
- `>= 1` `topic` tag
- `>= 1` `substance` tag
- `0` `domain` tags
- No rogue topic slugs (`topic`, `psychosocial`)

---

## 4. Phase 2: Pipeline Hardening

### 4.1 `lib/content/draftTaxonomy.ts`

Replace taxonomy constants with canonical active lists.

#### Topics (13)
`screening-diagnosis`, `epidemiology-prevention`, `pharmacology-neuroscience`, `intoxication-toxicology`, `withdrawal-management`, `treatment-pharmacotherapy`, `psychosocial-interventions`, `co-occurring-disorders`, `medical-complications`, `harm-reduction`, `ethics-legal`, `special-populations`, `general`

#### Substances (11)
`alcohol`, `cannabis`, `cocaine`, `hallucinogens`, `inhalants`, `opioids`, `polysubstance`, `sedatives`, `stimulants`, `tobacco`, `other`

#### Treatments (12)
`acamprosate`, `buprenorphine`, `bupropion`, `disulfiram`, `gabapentin`, `methadone`, `naloxone`, `naltrexone`, `nrt`, `topiramate`, `varenicline`, `other-treatment`

Also add explicit slug→display-name maps for all three kinds (no implicit title-casing).

### 4.2 `scripts/import-draft-questions.ts`

- Remove `domainFromPath()` from taxonomy assignment.
- Keep path grouping as source organization only (directory name may remain for output structure).
- Stop passing domain info into conversion.
- `convertDraftQuestionToMdx` call becomes `{ draft, status }`.

### 4.3 `scripts/draft-question-import.ts`

- Add canonical treatment validation (`DraftTreatmentSlugSchema`).
- Keep diagnosis as kebab-case free-form.
- Require `substances` and `topics` to be non-empty.
- Remove `domainTagSlug` input and all domain tag generation.
- Replace `titleCaseFromSlug()` usage for topic/substance/treatment with explicit canonical name maps.
- Deduplicate tags by composite key `${kind}:${slug}` during conversion.

### 4.4 `lib/content/schemas.ts`

- Remove `domain` from `TagFrontmatterSchema.kind`.
- Enforce canonical slug sets by kind for `topic`, `substance`, `treatment`.
- Keep `diagnosis` permissive kebab-case.
- Add frontmatter-level assertions:
  - at least one topic
  - at least one substance
  - no duplicate tag slugs

### 4.5 `scripts/seed.ts`

- Add canonical validation gate before `upsertTags()`:
  - reject any `kind === 'domain'`
  - reject non-canonical topic/substance/treatment slugs
  - reject questions missing topic or substance tags
- Keep slug uniqueness checks as-is.
- Change default placeholder behavior to excluded unless explicitly enabled:
  - include placeholders only when `SEED_INCLUDE_PLACEHOLDERS=true`

### 4.6 `scripts/migrate-domain-tags.ts`

- Delete after Phase 1 + Phase 2 pass.
- It is obsolete once domain tags are removed from corpus and importer no longer creates them.

---

## 5. Phase 3: Schema Migration

### 5.1 `src/domain/value-objects/tag-kind.ts`

Update `AllTagKinds` to:
- `topic`
- `substance`
- `treatment`
- `diagnosis`

Remove `domain`.

### 5.2 `db/schema.ts`

Update `tagKindEnum` to:
- `topic`
- `substance`
- `treatment`
- `diagnosis`

### 5.3 Migration SQL

Create new migration file (next index) in `db/migrations/` with safe enum replacement:

1. Assert no domain tags remain:
```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tags WHERE kind = 'domain') THEN
    RAISE EXCEPTION 'Cannot remove domain from tag_kind: domain rows still exist in tags';
  END IF;
END $$;
```
2. Create replacement enum (without domain)
3. Cast `tags.kind` to new enum
4. Drop old enum
5. Rename new enum to `tag_kind`

### 5.4 Controller/adapters type alignment

Update union types that currently include `domain`, including:
- `src/adapters/controllers/tag-controller.ts` (`TagRow.kind`)

### 5.5 Diagnosis decision

`diagnosis` stays in domain/DB enum, but is not shown in Practice filter UI.

---

## 6. Phase 4: UI Alignment

### 6.1 Practice filter UI

Update `app/(app)/app/practice/components/practice-session-starter.tsx`:
- Remove Exam Section label mapping (`domain`)
- Do not render diagnosis in starter filters
- Set visible filter order to:
  1. Topic
  2. Substance
  3. Treatment

### 6.2 History tag exposure

Update `app/(app)/app/history/page.tsx`:
- When deriving `questionsTagOptions`, include only:
  - `topic`
  - `substance`
  - `treatment`
- Exclude `diagnosis` and any legacy `domain` rows defensively.

### 6.3 Filter behavior verification

- Practice available count and session start continue filtering by selected tag slugs.
- History question filter continues filtering by selected tag slug.
- No legacy domain slugs appear in either Practice chips or History tag dropdown after reseed.

---

## 7. Phase 5: Cleanup & Verification

1. Remove remaining rogue/legacy tag rows from DB:
   - any `kind='domain'`
   - topic slugs `topic`, `psychosocial`
   - any non-canonical topic/substance/treatment slug
2. Ensure `caffeine` is removed from draft taxonomy and authoring docs.
3. Update docs to match implementation:
   - `docs/content/tag-taxonomy-pipeline.md`
   - `docs/content/tag-taxonomy-golden-spec.md`
   - `docs/practice-engine/content-pipeline.md`
   - `content/drafts/questions/SCHEMA.md`
   - `content/drafts/questions/CLAUDE.md`
   - `content/drafts/questions/AGENTS.md`
4. Add and commit taxonomy census report:
   - `docs/content/reports/tag-census-YYYY-MM-DD.md` (or `.json`)
5. Keep placeholders as templates but compliant with canonical taxonomy.

---

## 8. Tests First

Every behavioral change below follows Red → Green → Refactor.

### Phase 1 tests (content migration)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `scripts/migrate-tag-taxonomy.test.ts` | `maps legacy domain/topic tags to canonical topics and removes domain tags` | Domain + topic mapping table is applied exactly; no `domain` tags remain | Unit (`.test.ts`) |
| `scripts/migrate-tag-taxonomy.test.ts` | `retags placeholder rogue topics` | `topic` and `psychosocial` are removed/replaced as specified | Unit |
| `scripts/migrate-tag-taxonomy.test.ts` | `fails when migrated question has no topic or no substance` | Validation gate rejects invalid output | Unit |
| `scripts/migrate-tag-taxonomy.test.ts` | `fails for co-occurring-complications domain with no disambiguating topic` | Defensive error if a file has co-occurring-complications domain but no comorbidity or medical-complications topic | Unit |

### Phase 2 tests (pipeline hardening)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `scripts/draft-question-import.test.ts` | `does not emit domain tags during draft conversion` | Converted MDX contains only topic/substance/treatment/diagnosis tags | Unit |
| `scripts/draft-question-import.test.ts` | `rejects non-canonical treatment slugs` | Draft parser fails for treatment slugs outside canonical list | Unit |
| `scripts/draft-question-import.test.ts` | `requires at least one topic and one substance` | Empty arrays fail validation | Unit |
| `lib/content/schemas.test.ts` | `rejects domain kind and non-canonical topic/substance/treatment slugs` | Frontmatter schema enforces kind-specific canonical values | Unit |
| `scripts/seed.test.ts` (new) | `rejects domain tags and unknown canonical slugs during seed validation` | Seeder hard-stop guardrails work before DB writes | Unit |

### Phase 3 tests (schema/types)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `src/domain/value-objects/tag-kind.test.ts` | `contains canonical tag kinds without domain` | `AllTagKinds` excludes domain | Unit |
| `src/adapters/repositories/drizzle-tag-repository.test.ts` | `returns published tags ordered by kind then slug` | Ordering expectations remain correct after kind set change | Unit |
| `tests/integration/repositories.integration.test.ts` | `lists tags without domain kind after migration` | Integration query path no longer returns domain kinds | Integration |

### Phase 4 tests (UI)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `app/(app)/app/practice/components/practice-session-starter.test.tsx` | `renders Topic, Substance, Treatment sections in order` | Exam Section is absent; only 3 visible filter groups | Component (`.test.tsx`, jsdom + renderToStaticMarkup) |
| `app/(app)/app/practice/page.test.tsx` | `does not render Exam Section filter labels` | Starter UI reflects 3-category model | Component (`.test.tsx`) |
| `app/(app)/app/history/page.test.tsx` | `excludes non-visible tag kinds from questionsTagOptions` | History dropdown excludes diagnosis/domain | Component (`.test.tsx`) |

### Phase 5 tests (verification)

| Test File | Test Name | Assertion | Type |
|---|---|---|---|
| `tests/integration/tag-taxonomy-census.integration.test.ts` (new) | `matches canonical taxonomy counts and zero domain rows` | DB state: domain=0; canonical slugs only for visible kinds | Integration |

### Test convention enforcement

- Every new `*.test.tsx` starts with `// @vitest-environment jsdom` on line 1.
- Render-output tests use `renderToStaticMarkup`.
- Interactive checks use `*.browser.spec.tsx` with `vitest-browser-react`.
- Use existing fakes from `src/application/test-helpers/fakes/` (no module mocks for app code).

---

## 9. Non-Functional Requirements

1. Existing attempts/session history remain queryable and unchanged.
2. Bookmark records and review flows continue to work without data loss.
3. In-progress practice session params remain backward-compatible (`tagSlugs` stays slug-based).
4. `getTags` action shape remains `{ rows: [{ id, slug, name, kind }] }`.
5. Migration must be deterministic and idempotent in `--dry-run` mode.
6. No performance regression in Practice/History filter loading.

---

## 10. Implementation Notes

### Recommended PR sequencing

1. **PR A (Phase 1):** MDX corpus migration script + tests + generated report
2. **PR B (Phase 2):** Draft/import/schema/seed hardening + tests
3. **PR C (Phase 3 + 4):** Enum/type migration + Practice/History UI alignment + tests
4. **PR D (Phase 5):** Cleanup + docs alignment + census verification

### Ordering dependencies

- Phase 1 must land before Phase 3 (enum drop fails if domain data remains).
- Phase 2 must land before any re-import/reseed operations used for verification.
- Phase 3 and Phase 4 can share one PR (compile-time kind unions).

### Rollback strategy

Before Phase 1 write-mode or Phase 3 DB migration:
1. Tag git state (`git tag pre-spec-033-taxonomy`).
2. Export `tags` + `question_tags` tables from DB.
3. Keep migration report artifact from Phase 1.

If bad data is detected:
1. Revert MDX migration commit.
2. Restore DB tables from pre-migration export.
3. Re-run seed from restored MDX.

---

## 11. Success Criteria

1. Practice filter UI shows exactly 3 groups in order: Topic → Substance → Treatment.
2. History tag dropdown exposes only topic/substance/treatment slugs.
3. `domain` is absent from:
   - MDX frontmatter tags
   - `AllTagKinds`
   - `db/schema.ts` `tagKindEnum`
   - runtime `tags.kind` rows
4. Canonical visible taxonomy is enforced:
   - Topic: 13 slugs
   - Substance: 11 slugs
   - Treatment: 12 slugs
5. Rogue topic slugs (`topic`, `psychosocial`) are fully removed.
6. `scripts/migrate-domain-tags.ts` is removed and no longer required.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, and `pnpm test:integration` pass.

---

## 12. Deferred Items

1. Defining a canonical diagnosis taxonomy list (still internal-only).
2. NLP-grade treatment extraction beyond deterministic medication keyword mapping.
3. Product decision on eventually exposing diagnosis as a first-class filter.
4. Optional future move to DB-level taxonomy reference tables per kind.

---

## 13. Related

- [BS-024](../brainstorming/bs-024-tag-taxonomy-cleanup.md)
- [Tag Taxonomy Pipeline Trace](../content/tag-taxonomy-pipeline.md)
- [Tag Taxonomy Golden Spec](../content/tag-taxonomy-golden-spec.md)
- [`content/drafts/questions/SCHEMA.md`](../../content/drafts/questions/SCHEMA.md)
- [Content Pipeline](../practice-engine/content-pipeline.md)
