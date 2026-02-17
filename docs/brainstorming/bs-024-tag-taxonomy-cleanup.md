# BS-024: Tag Taxonomy Cleanup — Unify Pipeline and Eliminate Drift

**Date:** 2026-02-17
**Triggered by:** Practice page filter audit — discovering 4 overlapping filter categories (Exam Section, Substance, Topic, Treatment) with redundant values, rogue tags, and a broken import pipeline
**Scope:** Simplify from 4 tag categories to 3 (Topic, Substance, Treatment), fix the import pipeline, and align all content
**Related:**
- [`docs/content/tag-taxonomy-pipeline.md`](../content/tag-taxonomy-pipeline.md) — Full pipeline trace (how tags flow today)
- [`docs/content/tag-taxonomy-golden-spec.md`](../content/tag-taxonomy-golden-spec.md) — Approved target taxonomy (what we're migrating to)
- [`docs/practice-engine/content-pipeline.md`](../practice-engine/content-pipeline.md) — Content pipeline doc (updated with safety warnings)
- [`content/drafts/questions/SCHEMA.md`](../../content/drafts/questions/SCHEMA.md) — Draft question schema (corrected domain inference claim)

---

## The Problem

The tag taxonomy has accumulated drift from multiple sources:

1. **Exam Section overlaps Topic.** "Ethics, Legal & Policy" (Exam Section) vs "Ethics Legal" (Topic) test the same concept. "Treatment & Pharmacotherapy" (Exam Section) vs "Treatment" (Topic) are nearly identical. Users see both in the filter UI, which is confusing and redundant.

2. **The import pipeline produces wrong domain tags.** `domainFromPath()` derives domain from directory names (`cochrane`, `prescribers-guide`) which are source-based, not exam-section-based. The current MDX files have correct blueprint-aligned domain tags only because `migrate-domain-tags.ts` was run as a one-off fix.

3. **No centralized taxonomy for domain or treatment tags.** Substance and Topic slugs are validated against `lib/content/draftTaxonomy.ts`, but domain and treatment tags have no canonical list — they're whatever appears in MDX frontmatter.

4. **Rogue tags exist.** Two placeholder files introduced `topic` (slug) and `psychosocial` as topic tags that don't match any canonical value.

5. **Documentation was wrong.** `content-pipeline.md` said imported/ was "safe to delete and regenerate" (it's not — domain tags would be lost). `SCHEMA.md` said domain was "inferred from topics" (it's actually derived from directory path). Both have been corrected as of 2026-02-17.

## Root Cause Analysis

The tag system was built incrementally:
- **Phase 1:** Draft taxonomy defined substance and topic slugs, validated at import time
- **Phase 2:** Domain tags added to MDX files from an external question-generation workflow, organized by exam blueprint sections
- **Phase 3:** Treatment and diagnosis tag kinds added to the schema but never given a canonical slug list
- **No phase** ever unified these into a single, centralized taxonomy with validation across all tag kinds

The result: substance and topic are validated, domain is ad hoc, treatment has 3 values, diagnosis has 0 values, and the import pipeline can't reproduce the correct domain assignments.

## Severity Assessment

| Issue | Severity | Impact |
|-------|----------|--------|
| Overlapping Exam Section / Topic filters | Medium | Confuses users, weakens filter utility |
| Import pipeline produces wrong domain tags | High | Re-running import would corrupt 948 questions |
| No domain/treatment taxonomy validation | Medium | Allows drift to continue unchecked |
| Rogue placeholder tags | Low | 2 junk values appear in Topic filter |
| Stale documentation | High | Could lead someone to delete imported/ and lose data |

## What We've Already Done

| Date | Action | Artifact |
|------|--------|----------|
| 2026-02-17 | Full pipeline trace — documented how tags flow from content to UI | `docs/content/tag-taxonomy-pipeline.md` |
| 2026-02-17 | Golden spec approved — decided on 3-category taxonomy (13 Topics, 11 Substances, 12 Treatments) | `docs/content/tag-taxonomy-golden-spec.md` |
| 2026-02-17 | Fixed dangerous "safe to delete" claim in content-pipeline.md | `docs/practice-engine/content-pipeline.md` |
| 2026-02-17 | Fixed wrong domain inference claim in SCHEMA.md | `content/drafts/questions/SCHEMA.md` |
| 2026-02-17 | Other agent audited pipeline doc for factual accuracy — all claims verified | Pipeline doc updated with corrections |

## What Still Needs to Happen (Spec Scope)

The golden spec (`tag-taxonomy-golden-spec.md`) defines the target. A future implementation spec should cover:

### Phase 1: Content Migration (MDX files)
- Map every existing domain tag → new topic tag per the migration table
- Map every existing topic tag → new topic slug per the migration table
- Remove all `domain` kind tags from MDX frontmatter
- Retag questions with the rogue `topic` slug based on actual content
- Scan questions for treatment medication mentions and add treatment tags
- Validate: every question has at least one topic tag and one substance tag

### Phase 2: Pipeline Code
- Remove `domain` from `AllTagKinds` in `src/domain/value-objects/tag-kind.ts`
- Remove `domain` from the PostgreSQL enum (requires migration)
- Update `lib/content/draftTaxonomy.ts` with canonical topic, substance, and treatment slug lists
- Fix or remove `domainFromPath()` in the import script
- Replace `titleCaseFromSlug()` with explicit slug→name lookup
- Update `upsertTags()` to validate against canonical lists

### Phase 3: UI
- Remove `domain` from `tagKindLabels` and `tagKindOrder` in `practice-session-starter.tsx`
- Update display order to: Topic → Substance → Treatment
- Remove "Exam Section" references

### Phase 4: Cleanup
- Delete rogue tags from database
- Update pipeline doc and SCHEMA.md to reflect new state
- Run tag count report to identify content generation priorities

## Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should we keep the `diagnosis` tag kind in the schema even though it has 0 values? | Open |
| 2 | Can we write a migration script for MDX files, or must some questions be manually reviewed? | Open — the "Co-occurring & Medical Complications" → split requires human judgment |
| 3 | Should the draft taxonomy (`SCHEMA.md`, `CLAUDE.md`) be updated to the new topic slugs before or after MDX migration? | Open |
| 4 | Do we need a database migration to remove `domain` from the PostgreSQL enum, or can we leave it and just stop using it? | Open |

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Kill Exam Section filter, reduce to 3 categories (Topic, Substance, Treatment) | Exam Section overlaps Topic heavily; 3 categories are simpler and sufficient for board exam prep filtering |
| 2026-02-17 | 13 Topics, 11 Substances, 12 Treatments approved | Based on ABPN Addiction Psychiatry and ABAM/ASAM Addiction Medicine exam blueprints |
| 2026-02-17 | Fix stale docs immediately, defer code changes to spec | Dangerous misinformation in docs was urgent; code changes need proper planning |
