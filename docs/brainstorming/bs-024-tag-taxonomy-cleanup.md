# BS-024: Tag Taxonomy Cleanup — Unify Pipeline and Eliminate Drift

**Date:** 2026-02-17  
**Last Re-Verified:** 2026-02-17  
**Triggered by:** Practice filter audit surfaced overlap, rogue tags, and fragile domain assignment  
**Scope:** Move from 4 visible filter categories to 3 (Topic, Substance, Treatment), harden draft→MDX→DB tag pipeline, and remove taxonomy cruft  
**Related:**
- [`docs/content/tag-taxonomy-pipeline.md`](../content/tag-taxonomy-pipeline.md) — Current-state pipeline trace (source-accurate)
- [`docs/content/tag-taxonomy-golden-spec.md`](../content/tag-taxonomy-golden-spec.md) — Target taxonomy and migration map
- [`docs/practice-engine/content-pipeline.md`](../practice-engine/content-pipeline.md) — End-to-end content pipeline and seed behavior
- [`content/drafts/questions/SCHEMA.md`](../../content/drafts/questions/SCHEMA.md) — Draft authoring format and vocabulary constraints

---

## Verified Baseline (Current State)

This baseline is verified from repository code + local content files:

| Metric | Verified Value |
|--------|----------------|
| Draft source files | 296 `.md` + 1 `META.MD` under `content/drafts/questions/` |
| Imported MDX files | 948 under `content/questions/imported/` |
| Placeholder MDX files | 10 under `content/questions/placeholder/` |
| Total seedable MDX files | 958 under `content/questions/**/*.mdx` |
| Published status in MDX corpus | 958/958 are `status: published` |
| Domain tag presence | 949 have domain tag, 9 do not (placeholders) |
| Domain mismatch risk | 948/948 imported files have domain slug ≠ imported root directory |

Current MDX corpus tag values:
- Domain: 8 values
- Substance: 10 values (taxonomy has 11; `caffeine` + `inhalants` unused in corpus)
- Topic: 17 values (15 canonical + 2 rogue: `topic`, `psychosocial`)
- Treatment: 3 values
- Diagnosis: 0 values

---

## Vertical Tracer Bullet (Tag Flow)

| Stage | Source of Truth | Verified Behavior |
|------|------------------|-------------------|
| Draft vocabulary | `content/drafts/questions/CLAUDE.md`, `content/drafts/questions/AGENTS.md`, `lib/content/draftTaxonomy.ts` | Canonical lists exist only for `substances` and `topics` |
| Draft parsing | `scripts/draft-question-import.ts` | `substances[]` / `topics[]` validated against canonical lists; `treatments[]` / `diagnoses[]` are free-form kebab-case |
| Domain assignment at import | `scripts/import-draft-questions.ts` | `domainFromPath()` uses first directory segment, not question content |
| MDX conversion | `scripts/draft-question-import.ts` | `titleCaseFromSlug()` auto-generates names; no canonical slug→name map |
| Post-import repair | `scripts/migrate-domain-tags.ts` | Rewrites old source-based domain slugs to blueprint slugs using topic inference + fallback |
| MDX schema validation | `lib/content/schemas.ts` | Validates tag shape and enum kind; does **not** enforce canonical slug sets or required domain tag |
| Seed to DB | `scripts/seed.ts` | `upsertTags()` enforces slug uniqueness + name/kind consistency, but not canonical lists |
| Database model | `db/schema.ts`, `db/migrations/0000_jazzy_vermin.sql` | `tag_kind` enum has 5 kinds (`domain`, `topic`, `substance`, `treatment`, `diagnosis`) |
| Read path | `src/adapters/repositories/drizzle-tag-repository.ts`, `src/adapters/controllers/tag-controller.ts` | Returns distinct tags attached to published questions |
| UI consumers | `app/(app)/app/practice/components/practice-session-starter.tsx`, `app/(app)/app/history/page.tsx`, `app/(app)/app/history/components/history-questions-tab.tsx` | Practice groups by kind; History exposes all tags in a single dropdown |

---

## Horizontal Tracer Bullet (Where Drift Enters/Spreads)

1. **Taxonomy asymmetry:** only substance/topic have canonical draft vocab; domain/treatment/diagnosis do not.  
2. **Two-step domain pipeline:** importer writes directory domain, migration script rewrites later.  
3. **Placeholder bleed-through:** placeholders are published and included by default unless `SEED_INCLUDE_PLACEHOLDERS=false`.  
4. **Schema permissiveness:** MDX tag schema allows non-canonical slugs and missing domain tags.  
5. **UI propagation:** any seeded slug immediately appears in Practice filter chips and History tag dropdown.

---

## Confirmed Problems (What Must Be Fixed)

1. **Exam Section overlaps Topic** (semantic duplication in filter UX).  
2. **Importer cannot reproduce correct domain tags** without post-import repair.  
3. **No centralized domain/treatment taxonomy** (drift can continue).  
4. **Rogue topic slugs in placeholders** (`topic`, `psychosocial`).  
5. **Domain tag not enforced per question** (9 published placeholders have no domain).  
6. **Operational fragility from gitignored imported MDX** (canonical content not reproducible in one step).  
7. **Practice/History both consume raw seeded tags** (scope is broader than Practice page only).

Historical documentation drift is now corrected in `docs/practice-engine/content-pipeline.md` and `content/drafts/questions/SCHEMA.md`; the remaining issue is pipeline design, not doc wording.

---

## Severity Assessment

| Issue | Severity | Impact |
|-------|----------|--------|
| Importer domain mismatch | High | Re-import can reintroduce wrong domain tags across 948 imported MDX files |
| Missing canonical domain/treatment lists | High | Enables silent taxonomy drift and inconsistent UI filters |
| Overlapping Domain/Topic semantics | Medium | Confusing filter model and weaker discoverability |
| Missing required domain tag | Medium | Questions can publish without exam-section classification |
| Placeholder rogue tags | Medium | Pollutes filter options in environments that include placeholders |
| Two-step domain assignment | Medium | Easy to skip migration step and ship bad tags |

---

## What Has Already Been Done

| Date | Action | Artifact |
|------|--------|----------|
| 2026-02-17 | Full current-state pipeline trace completed | `docs/content/tag-taxonomy-pipeline.md` |
| 2026-02-17 | Golden target taxonomy defined (3 visible categories) | `docs/content/tag-taxonomy-golden-spec.md` |
| 2026-02-17 | Content pipeline doc corrected to warn imported content is not blindly regenerable | `docs/practice-engine/content-pipeline.md` |
| 2026-02-17 | Draft schema doc updated to match real importer domain behavior | `content/drafts/questions/SCHEMA.md` |
| 2026-02-17 | First-principles re-audit completed (vertical + horizontal tracer bullets) | This BS-024 update |

---

## Spec Scope Required to Implement Safely

A follow-up implementation spec must cover all of the below, or drift will remain:

### Phase 1: Content Migration (MDX corpus)
- Map all legacy domain tags to target topic slugs per golden-spec migration table
- Map all legacy topic slugs to target topic slugs
- Remove `domain` tags from MDX frontmatter
- Retag rogue placeholder topic slugs (`topic`, `psychosocial`)
- Add missing treatment tags where clinically present
- Validate every question has at least one topic + one substance tag

### Phase 2: Pipeline Hardening (Draft → MDX)
- Introduce canonical lists for all active kinds in `lib/content/draftTaxonomy.ts` (including treatment; domain decision depends on whether domain survives)
- Replace ad hoc slug-to-name generation with explicit slug→display-name maps
- Eliminate two-step domain repair flow (single authoritative assignment strategy)
- Add validation guardrails at import and/or seed time for required kinds and allowed slugs

### Phase 3: UI + Query Alignment
- Practice page: remove Exam Section filter and reorder to Topic → Substance → Treatment
- History page: ensure Tag dropdown only reflects intended taxonomy after migration (no legacy domain slugs)
- Confirm count/query behavior remains correct for tag filters after taxonomy changes

### Phase 4: Cruft Cleanup Policy
- Decide placeholder strategy: delete, keep as compliant templates, or exclude from default seed
- Remove orphan/legacy tags from DB once no published questions reference them
- Keep pipeline docs and schema docs aligned with implemented behavior

### Phase 5: Verification
- Add/adjust unit + integration coverage for importer/seed/tag query behavior
- Add deterministic taxonomy report check (counts by kind + slug) to catch regressions
- Re-run content census after migration and record in docs

---

## Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Keep `diagnosis` kind in schema (internal-only) or remove entirely? | Open |
| 2 | Canonical source of truth: drafts-first or MDX-first? | Open |
| 3 | Should placeholder files remain in runtime seed by default? | Open |
| 4 | Remove `domain` from DB enum now, or deprecate first and remove later? | Open |
| 5 | How much manual review is required for `co-occurring-complications` split mapping? | Open |
| 6 | Should treatment tagging stay meds-only or include psychosocial modalities? | Open |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Kill Exam Section filter; target 3 visible categories (Topic, Substance, Treatment) | Exam Section and Topic overlap is high and confusing |
| 2026-02-17 | Golden taxonomy approved (13 Topics, 11 Substances, 12 Treatments) | Aligns with board blueprint coverage goals |
| 2026-02-17 | Correct documentation first, then spec implementation | Prevents accidental destructive workflows while design is finalized |
| 2026-02-17 | Completed first-principles tracer-bullet audit and refreshed BS-024 | Makes BS-024 spec-ready and source-accurate across code, content, and docs |
