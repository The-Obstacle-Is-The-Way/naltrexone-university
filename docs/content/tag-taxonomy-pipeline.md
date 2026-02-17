# Content Tag Taxonomy — Full Pipeline Trace

> **Scope:** How question tags (Exam Section, Substance, Topic, Treatment, Diagnosis) flow from authored content through the ingestion pipeline to the UI filter buttons on the Practice page
> **Last Verified:** 2026-02-17

---

## 1. Why This Document Exists

The Practice page shows four filter accordion sections (Exam Section, Substance, Topic, Treatment) populated by tag values from the database. Understanding where these values originate — and whether they're controlled by a centralized taxonomy — is critical before modifying, adding, or removing tags.

**Key question this doc answers:** If I change a tag value, where do I change it so it carries through the entire system?

---

## 2. Content Directory Structure (Full Tree)

```text
content/
├── drafts/                          ← GITIGNORED (local-only working area)
│   ├── README.md                    ← Workflow instructions
│   └── questions/
│       ├── AGENTS.md                ← Agent instructions for question generation
│       ├── CLAUDE.md                ← Question gen instructions + vocabulary lists
│       ├── SCHEMA.md                ← Draft format schema
│       ├── PLAN.md                  ← Targets and progress tracker
│       ├── NOTES.md                 ← Working notes
│       ├── META.MD                  ← Metadata notes
│       │
│       │   Directories organized by SOURCE (where papers came from):
│       ├── 50-studies-every-psychiatrist-should-know/  (4 papers)
│       ├── article-based-pathway/                      (41 subfolders: 40 papers + 1 correction notice)
│       │   ├── 01-screening-evaluation-prevention/
│       │   ├── 02-alcohol/
│       │   ├── 03-cannabis/
│       │   ├── 04-opioids/
│       │   ├── 05-stimulants/
│       │   ├── 06-tobacco/
│       │   ├── 07-other/
│       │   ├── 08-dual-diagnoses/
│       │   ├── 09-therapy/
│       │   └── 10-special-populations/
│       ├── asam-guidelines/         (9 guideline sets)
│       ├── cochrane/                (2 reviews)
│       ├── personal-inquiries/      (empty)
│       ├── personal-papers/         (11 papers)
│       ├── prescribers-guide/       (36 medication folders + stahls-chunked)
│       └── therapy/                 (1 guideline)
│
│       Typical paper folder contains:
│         <paper-name>.md   ← Source article notes
│         recall.md         ← 6 recall questions (2 easy, 2 medium, 2 hard)
│         vignettes.md      ← 6 vignette questions (2 easy, 2 medium, 2 hard)
│
│       Exceptions:
│         prescribers-guide medication folders → recall.md only (no vignettes.md)
│         article-based-pathway/.../2024-cooperman-more-trial-correction/ → source-only (no recall/vignettes)
│
└── questions/                       ← What pnpm db:seed actually reads
    ├── README.md                    ← Format documentation
    ├── placeholder/                 ← COMMITTED (10 example MDX files, public)
    │   └── placeholder-*.mdx
    └── imported/                    ← GITIGNORED (948 MDX files from drafts)
        │
        │   Directories mirror drafts but are organized by SOURCE:
        ├── 50-studies-every-psychiatrist-should-know/
        ├── article-based-pathway/   (40 subdirs, one per paper)
        ├── asam-guidelines/         (9 subdirs)
        ├── cochrane/                (2 subdirs)
        ├── personal-papers/         (11 subdirs)
        ├── prescribers-guide/       (2 subdirs: stahls-7e, stahls-8e)
        └── therapy/                 (1 subdir)
```

**File counts (current filesystem):**
- 296 draft `.md` files + 1 draft `META.MD` file under `content/drafts/questions/`
- 948 imported `.mdx` files under `content/questions/imported/`
- 10 placeholder `.mdx` files under `content/questions/placeholder/`
- 958 total seedable `.mdx` questions (`pnpm db:seed` reads `content/questions/**/*.mdx`)

### Critical Distinction: Directory Names ≠ Domain Tags

The directories are organized by **source** (where the paper/article came from). But the domain tags inside the MDX files are assigned per-question by **exam blueprint section** (what board exam area it covers). A single directory can span many exam sections:

| Directory | Domain Tags Inside (per-question) |
|-----------|----------------------------------|
| `50-studies-every-psychiatrist-should-know` | 6 different sections |
| `article-based-pathway` | 7 sections total (includes Ethics) |
| `asam-guidelines` | 7 sections total (includes Ethics) |
| `cochrane` | 3 sections |
| `personal-papers` | 6 sections |
| `prescribers-guide` | 3 sections |
| `therapy` | Psychosocial Interventions only |

**The import script's `domainFromPath()` function assigns the DIRECTORY NAME as the domain tag — this is wrong.** It would produce `domain: article-based-pathway` for all 40+ papers, when the correct behavior is per-question assignment like `domain: epidemiology-prevention` or `domain: treatment-pharmacotherapy`.

### Why This Is Fragile Today

What is directly verifiable from the repository:
- `scripts/import-draft-questions.ts` derives `domainTagSlug` from the first directory segment under `content/drafts/questions/`.
- All 948 imported MDX files currently use exam-blueprint domain slugs (for example `pharmacology-neuroscience`), not source-directory slugs (for example `article-based-pathway`).
- `scripts/migrate-domain-tags.ts` exists to migrate old source-based domain slugs to blueprint domain slugs.

Operational implication: **re-running the importer against current drafts would assign directory-derived domain slugs unless the importer is changed.**

---

## 3. Tag Architecture Overview

### Tag Kinds (5 enum values)

**Source of truth:** `src/domain/value-objects/tag-kind.ts`

```typescript
export const AllTagKinds = [
  'domain',      // exam blueprint area → UI label: "Exam Section"
  'topic',       // clinical topic → UI label: "Topic"
  'substance',   // substance of abuse → UI label: "Substance"
  'treatment',   // medication/intervention → UI label: "Treatment"
  'diagnosis',   // DSM/ICD category → UI label: "Diagnosis"
] as const;
```

**Enforced at:**
- PostgreSQL enum `tag_kind` in `db/schema.ts` (lines 34–40)
- TypeScript type `TagKind` at compile time
- Zod schema `TagFrontmatterSchema` in `lib/content/schemas.ts`

### Tag Entity

Each tag has three fields: `slug` (unique identifier, kebab-case), `name` (display text), `kind` (one of the 5 enum values above).

**Database table:** `tags` with unique index on `slug`
**Junction table:** `question_tags` (many-to-many between questions and tags)

### UI Display Order

**File:** `app/(app)/app/practice/components/practice-session-starter.tsx` (lines 57–63)

```typescript
const tagKindOrder: TagRow['kind'][] = [
  'domain',      // "Exam Section" — shown first
  'substance',   // "Substance"
  'topic',       // "Topic"
  'treatment',   // "Treatment"
  'diagnosis',   // "Diagnosis" — shown last (if any tags exist)
];
```

A kind only renders if at least one published question has a tag of that kind. Currently, `diagnosis` tags don't appear because no published questions use them.

---

## 4. Full Pipeline: Tag Flow Diagram

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. DRAFT AUTHORING                                                      │
│    content/drafts/questions/<directory>/<source>/{recall,vignettes}.md  │
│                                                                         │
│    YAML frontmatter:                                                    │
│      substances: [alcohol, opioids]    ← validated vs DRAFT_SUBSTANCE  │
│      topics: [withdrawal, pharmacology] ← validated vs DRAFT_TOPIC     │
│      treatments: [naltrexone]           ← NOT validated (free-form)    │
│      diagnoses: []                      ← NOT validated (free-form)    │
│                                                                         │
│    Domain tag: NOT in frontmatter — derived from directory name         │
│    e.g., content/drafts/questions/cochrane/... → domain: "cochrane"    │
├────────────────────────────────────────────────────────────────────────┤
│ 2. IMPORT: pnpm content:import:drafts                                   │
│    scripts/import-draft-questions.ts                                     │
│    scripts/draft-question-import.ts                                      │
│                                                                         │
│    Transforms:                                                          │
│      substances: [alcohol] → { slug: "alcohol", name: "Alcohol",       │
│                                 kind: "substance" }                     │
│      topics: [withdrawal]  → { slug: "withdrawal", name: "Withdrawal", │
│                                 kind: "topic" }                         │
│      directory "cochrane"  → { slug: "cochrane", name: "Cochrane",     │
│                                 kind: "domain" }                        │
│                                                                         │
│    Name derivation: titleCaseFromSlug(slug)                             │
│      "ethics-legal" → "Ethics Legal"                                    │
│      "special-populations" → "Special Populations"                      │
│                                                                         │
│    Output: content/questions/imported/<domain>/<source>/<qid>.mdx       │
├────────────────────────────────────────────────────────────────────────┤
│ 3. MDX FILES (canonical format)                                         │
│    content/questions/**/*.mdx                                           │
│                                                                         │
│    tags:                                                                │
│      - slug: "psychosocial-interventions"                               │
│        name: "Psychosocial Interventions"                               │
│        kind: "domain"                                                   │
│      - slug: "alcohol"                                                  │
│        name: "Alcohol"                                                  │
│        kind: "substance"                                                │
│                                                                         │
│    ⚠️  CURRENT STATE: Imported MDX domain tags do NOT match             │
│    directory-derived domain slugs (948/948 imported files mismatch       │
│    root directory slug vs domain tag slug).                              │
├────────────────────────────────────────────────────────────────────────┤
│ 4. SEED: pnpm db:seed                                                   │
│    scripts/seed.ts                                                       │
│                                                                         │
│    upsertTags(): For each tag in frontmatter:                           │
│      - If slug exists → validate name+kind match (error if mismatch)   │
│      - If new → INSERT INTO tags(slug, name, kind)                     │
│    question_tags: Link question ↔ tag IDs                               │
├────────────────────────────────────────────────────────────────────────┤
│ 5. DATABASE                                                             │
│    tags table: { id, slug (unique), name, kind }                        │
│    question_tags: { questionId, tagId } (composite PK)                  │
│                                                                         │
│    Only tags attached to published questions appear in the UI.          │
├────────────────────────────────────────────────────────────────────────┤
│ 6. QUERY: DrizzleTagRepository.listAll()                                │
│    src/adapters/repositories/drizzle-tag-repository.ts                   │
│                                                                         │
│    SELECT DISTINCT tags.*                                               │
│    FROM tags                                                            │
│    INNER JOIN question_tags ON ...                                       │
│    INNER JOIN questions ON ... WHERE status = 'published'               │
│    ORDER BY kind ASC, slug ASC                                          │
├────────────────────────────────────────────────────────────────────────┤
│ 7. SERVER ACTION: getTags                                               │
│    src/adapters/controllers/tag-controller.ts                            │
│    Returns TagRow[] = { id, slug, name, kind }[]                        │
├────────────────────────────────────────────────────────────────────────┤
│ 8. UI: PracticeSessionStarter                                           │
│    app/(app)/app/practice/components/practice-session-starter.tsx        │
│                                                                         │
│    Groups by kind → renders accordions → FilterChip per tag             │
│    Chip label = tag.name (displayed exactly as stored in DB)            │
│    Filter matching = by tag.slug via inArray(tags.slug, [...slugs])    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Current Tag Values (Current MDX Corpus)

These values are from `content/questions/**/*.mdx` in the repository.  
They are what `pnpm db:seed` can ingest.

Note: UI values can differ by environment if seeded with `SEED_INCLUDE_PLACEHOLDERS=false` (placeholder questions excluded/archived).
All 958 current MDX files have `status: published`.

### Domain (Exam Section) — 8 values

| Slug | Display Name | Source in repo |
|------|-------------|--------|
| `co-occurring-complications` | Co-occurring & Medical Complications | Imported MDX |
| `epidemiology-prevention` | Epidemiology & Prevention | Imported MDX |
| `ethics-legal-policy` | Ethics, Legal & Policy | Imported MDX |
| `general` | General | Placeholder |
| `pharmacology-neuroscience` | Pharmacology & Neuroscience | Imported MDX |
| `psychosocial-interventions` | Psychosocial Interventions | Imported MDX |
| `screening-diagnosis` | Screening & Diagnosis | Imported MDX |
| `treatment-pharmacotherapy` | Treatment & Pharmacotherapy | Imported MDX |

**No centralized taxonomy list exists for domain slugs.** Values come directly from MDX frontmatter.

**Domain coverage exception:** 9 published placeholder files have **no** domain tag at all. Only 949 of 958 published MDX questions currently include a `kind: domain` tag.

### Substance — 10 published values (11 in taxonomy)

| Slug | Display Name | In Taxonomy? |
|------|-------------|--------------|
| `alcohol` | Alcohol | Yes |
| `cannabis` | Cannabis | Yes |
| `cocaine` | Cocaine | Yes |
| `hallucinogens` | Hallucinogens | Yes |
| `opioids` | Opioids | Yes |
| `other` | Other | Yes |
| `polysubstance` | Polysubstance | Yes |
| `sedatives` | Sedatives | Yes |
| `stimulants` | Stimulants | Yes |
| `tobacco` | Tobacco | Yes |

**Taxonomy source:** `lib/content/draftTaxonomy.ts` → `DRAFT_SUBSTANCE_SLUGS` (11 values; `caffeine` and `inhalants` exist in taxonomy but have no published questions).

### Topic — 17 published values (15 in taxonomy)

| Slug | Display Name | In Taxonomy? | Notes |
|------|-------------|--------------|-------|
| `comorbidity` | Comorbidity | Yes | |
| `diagnosis` | Diagnosis | Yes | |
| `epidemiology` | Epidemiology | Yes | |
| `ethics-legal` | Ethics Legal | Yes | Overlaps with domain `ethics-legal-policy` |
| `harm-reduction` | Harm Reduction | Yes | |
| `intoxication` | Intoxication | Yes | |
| `medical-complications` | Medical Complications | Yes | Overlaps with domain `co-occurring-complications` |
| `neurobiology` | Neurobiology | Yes | |
| `pharmacology` | Pharmacology | Yes | Overlaps with domain `pharmacology-neuroscience` |
| `psychosocial` | Psychosocial | **No** | Rogue — from placeholder-08. Not in taxonomy. |
| `psychotherapy` | Psychotherapy | Yes | |
| `screening` | Screening | Yes | Overlaps with domain `screening-diagnosis` |
| `special-populations` | Special Populations | Yes | |
| `topic` | Topic | **No** | Rogue — from placeholder-07. Literal category name. |
| `toxicology` | Toxicology | Yes | |
| `treatment` | Treatment | Yes | Confusing — same word as the Treatment kind. |
| `withdrawal` | Withdrawal | Yes | |

**Taxonomy source:** `lib/content/draftTaxonomy.ts` → `DRAFT_TOPIC_SLUGS` (15 values).

**Rogue values:** `psychosocial` and `topic` are NOT in the taxonomy. They originate from committed placeholder files:
- `content/questions/placeholder/placeholder-07-stimulant-intoxication-management.mdx` → tagged with `topic` (kind: topic)
- `content/questions/placeholder/placeholder-08-psychosocial-tx-motivational-interviewing.mdx` → tagged with `psychosocial` (kind: topic)

### Treatment — 3 values

| Slug | Display Name | In Taxonomy? |
|------|-------------|--------------|
| `buprenorphine` | Buprenorphine | No taxonomy exists |
| `naloxone` | Naloxone | No taxonomy exists |
| `naltrexone` | Naltrexone | No taxonomy exists |

**No centralized taxonomy list exists for treatment slugs.** Any kebab-case slug is accepted.

### Diagnosis — 0 published values

No published questions currently use `kind: diagnosis` tags. The kind exists in the schema but is unused.

---

## 6. Validation Rules (What's Enforced Where)

| Layer | What's Validated | What's NOT Validated |
|-------|-----------------|---------------------|
| **Draft frontmatter** (`DraftFrontmatterSchema`) | `substances[]` vs `DRAFT_SUBSTANCE_SLUGS`, `topics[]` vs `DRAFT_TOPIC_SLUGS`, slugs are kebab-case | `treatments[]` and `diagnoses[]` — any kebab-case slug accepted |
| **MDX frontmatter** (`TagFrontmatterSchema`) | Slug is kebab-case, name is non-empty, kind is valid enum | No validation of slug VALUES against any list |
| **Seed script** (`upsertTags()`) | Same slug can't have different name/kind across questions (error if mismatch) | No validation that slugs belong to any canonical list |
| **Database** (`tags` table) | `kind` is PostgreSQL enum, `slug` is unique | No CHECK constraints on (kind, slug) combinations |
| **UI** (`DrizzleTagRepository.listAll()`) | Only tags on published questions are shown | No filtering of "bad" tags |

**Bottom line:** Substance and topic slugs are validated at draft-import time. Everything else (domain, treatment, diagnosis) passes through unchecked.

---

## 7. Known Gaps and Issues

### Gap 1: Domain tags are not centrally defined

**Problem:** Domain tag values (Exam Section) have no canonical list. They originate from:
- Directory names during `pnpm content:import:drafts` (e.g., `cochrane` → domain slug `cochrane`)
- Existing MDX files (current state) where domain tags are already blueprint-aligned (`psychosocial-interventions`, etc.)
- A one-off migration path (`scripts/migrate-domain-tags.ts`) that maps old source-based domain slugs to blueprint slugs

**Risk:** Re-running `pnpm content:import:drafts` would overwrite the correct domain tags with directory-based ones. The directory names (`cochrane`, `prescribers-guide`, `therapy`) don't match the exam-board section names (`Psychosocial Interventions`, `Pharmacology & Neuroscience`).

**Where to fix:** Add `DRAFT_DOMAIN_SLUGS` to `lib/content/draftTaxonomy.ts`, or add a domain-mapping configuration to the import script.

### Gap 2: Rogue topic slugs from placeholder files

**Problem:** Two placeholder questions use topic slugs (`topic`, `psychosocial`) that are not in `DRAFT_TOPIC_SLUGS`. These pass MDX validation (which doesn't check slug values) and appear as filter buttons.

**Where to fix:** Edit the placeholder MDX files to use valid topic slugs, or add the values to the taxonomy if intentional.

- `placeholder-07`: `topic` → should probably be removed or mapped to a real topic
- `placeholder-08`: `psychosocial` → could be added to taxonomy, or mapped to `psychotherapy`

### Gap 3: Treatment tags have no taxonomy

**Problem:** Treatment slugs are free-form. Currently only 3 values exist (`buprenorphine`, `naloxone`, `naltrexone`), but nothing prevents adding arbitrary values like `tylenol` during import.

**Where to fix:** Add `DRAFT_TREATMENT_SLUGS` to `lib/content/draftTaxonomy.ts`.

### Gap 4: Exam Section overlaps with Topic

**Problem:** Several concepts appear in both "Exam Section" (domain) and "Topic" filters:

| Domain (Exam Section) | Topic | Overlap |
|-----------------------|-------|---------|
| Ethics, Legal & Policy | Ethics Legal | Same concept |
| Pharmacology & Neuroscience | Pharmacology | Subset |
| Screening & Diagnosis | Screening, Diagnosis | Split into two topics |
| Co-occurring & Medical Complications | Medical Complications | Subset |
| Treatment & Pharmacotherapy | Treatment | Same word, different meaning |

These are independent dimensions (a question can be in any exam section AND any topic), but the overlap is confusing for users.

### Gap 5: Topic slug `treatment` collides with the Treatment kind

**Problem:** `treatment` as a topic slug (display: "Treatment") is confusingly close to the Treatment filter section (Buprenorphine, Naloxone, Naltrexone). A user selecting "Treatment" in Topic expects something different from selecting treatments in the Treatment section.

### Gap 6: Domain tag names use inconsistent formatting

**Problem:** `titleCaseFromSlug()` produces names like "Ethics Legal" but the actual MDX files have "Ethics, Legal & Policy" with ampersands and commas. These manual names are better but bypassed the auto-generation. If new questions are imported via the draft pipeline, their domain names will use `titleCaseFromSlug()` and won't match.

### Gap 7: Import script assigns domain from directory, not from content

**Problem:** `domainFromPath()` in `scripts/import-draft-questions.ts` uses the first directory segment under `content/drafts/questions/` as the domain tag slug. This produces source-based tags like `cochrane`, `prescribers-guide`, `article-based-pathway` — but the correct domain tags are per-question exam blueprint sections like `pharmacology-neuroscience`, `treatment-pharmacotherapy`.

**Impact:** The import script CANNOT correctly assign domain tags. Re-running `pnpm content:import:drafts` would replace correct per-question domain assignments with a single wrong per-directory value.

**Root cause:** The draft format has no `domain:` field in its frontmatter. Domain was bolted on via directory structure as a convenience — but the relationship between source directory and exam section is many-to-many, not one-to-one.

**Where to fix:** Either:
1. Add a `domain:` field to the draft frontmatter schema (alongside `substances:`, `topics:`, etc.) so each question explicitly declares its exam section
2. Create a mapping file that maps `(source-directory, paper)` → domain slug — but this is fragile and duplicates information
3. Accept that the MDX files (not drafts) are the canonical source and stop treating the import script as the primary pipeline

### Gap 8: MDX files are canonical but treated as generated artifacts

**Problem:** `content/questions/imported/` is gitignored, and `docs/practice-engine/content-pipeline.md` currently states these files are safe to delete/regenerate. With the current importer, regeneration would produce directory-derived domain tags (not the current blueprint-aligned tags).

**Impact:** If someone follows the documented workflow ("Delete `content/questions/imported/` any time and re-run the importer"), they would lose all correct domain tags and get wrong directory-based ones.

**Where to fix:** Either:
1. Commit the imported MDX files (make them the permanent source of truth, not gitignored)
2. Add domain information to draft files so the import can fully reconstruct correct MDX
3. Clearly document that `imported/` is NOT safe to delete in its current state

### Gap 9: Domain tag requirement is not enforced in MDX schema

**Problem:** `QuestionFrontmatterSchema` requires `tags: Tag[]` but does not require at least one `kind: domain` tag. Current corpus contains 9 published placeholders without any domain tag.

**Impact:** Questions can seed and publish without an exam section, which weakens the "Exam Section" filter and taxonomy completeness.

**Where to fix:** Add validation for exactly one domain tag per question (import-time and/or seed-time), then backfill existing files.

### Gap 10: Draft documentation contradicts importer implementation for domain assignment

**Problem:** `content/drafts/questions/SCHEMA.md` says draft domain is inferred from `topics`, but `scripts/import-draft-questions.ts` actually derives domain from directory root (`domainFromPath()`).

**Impact:** Author guidance and pipeline behavior diverge; agents/authors can follow docs and still produce unexpected domains.

**Where to fix:** Align docs and code to a single strategy (explicit `domain` field strongly preferred).

---

## 8. Key Files Reference

### Taxonomy & Validation

| File | Purpose |
|------|---------|
| `lib/content/draftTaxonomy.ts` | Canonical substance/topic slug lists (`DRAFT_SUBSTANCE_SLUGS`, `DRAFT_TOPIC_SLUGS`) |
| `lib/content/schemas.ts` | Zod schemas for MDX frontmatter validation (`TagFrontmatterSchema`) |
| `src/domain/value-objects/tag-kind.ts` | Tag kind enum (`AllTagKinds`) |
| `src/domain/entities/tag.ts` | Tag entity type definition |

### Content Pipeline

| File | Purpose |
|------|---------|
| `scripts/import-draft-questions.ts` | CLI entry point for `pnpm content:import:drafts` — discovers files, derives domain from directory |
| `scripts/draft-question-import.ts` | Core import logic — parses drafts, converts to MDX, applies `titleCaseFromSlug()` |
| `scripts/seed.ts` | Seeds MDX files into database — `upsertTags()` function |
| `scripts/migrate-domain-tags.ts` | One-off migration utility that maps old source-based domain slugs to exam-blueprint domain slugs |
| `content/drafts/questions/CLAUDE.md` | Question generation instructions with vocabulary lists |
| `content/drafts/questions/SCHEMA.md` | Draft format schema and vocabulary reference |
| `content/drafts/questions/AGENTS.md` | Agent-specific generation instructions (mirrors CLAUDE + SCHEMA constraints) |

### Database & Query

| File | Purpose |
|------|---------|
| `db/schema.ts` (lines 34–40, 280–310) | PostgreSQL schema — `tagKindEnum`, `tags` table, `question_tags` table |
| `db/migrations/0000_jazzy_vermin.sql` | Initial migration that creates `tag_kind`, `tags`, and `question_tags` (later migrations do not modify tag schema) |
| `src/adapters/repositories/drizzle-tag-repository.ts` | `listAll()` — fetches distinct tags from published questions |
| `src/adapters/repositories/drizzle-question-repository.ts` | Tag-based filtering via `inArray(tags.slug, [...slugs])` |

### UI

| File | Purpose |
|------|---------|
| `app/(app)/app/practice/components/practice-session-starter.tsx` | Practice page filter UI — groups tags by kind, renders FilterChip buttons |
| `app/(app)/app/practice/hooks/use-practice-session-tags.ts` | Client hook that calls `getTags` server action |
| `src/adapters/controllers/tag-controller.ts` | `getTags` server action — calls `tagRepository.listAll()` |

### Content Files

| Path | Purpose |
|------|---------|
| `content/drafts/questions/` | Draft question source files (human-authored, gitignored) |
| `content/questions/placeholder/` | 10 committed example MDX files (some have rogue tags) |
| `content/questions/imported/` | Gitignored imported MDX files currently used by seeding; not fully reproducible with current importer domain logic |

---

## 9. How to Safely Modify Tags

### To rename a tag's display name

1. Find all MDX files with that tag slug: `grep -r "slug: old-slug" content/questions/`
2. Update the `name:` field in every MDX file
3. Re-seed: `pnpm db:seed` — the seeder will error if the name changes for an existing slug
4. **Workaround:** Delete the tag from the database first, then re-seed

### To add a new tag value

1. If substance or topic: add to `DRAFT_SUBSTANCE_SLUGS` or `DRAFT_TOPIC_SLUGS` in `lib/content/draftTaxonomy.ts`
2. Use the new slug in draft or MDX frontmatter
3. Re-import and/or re-seed

### To remove a tag value

1. Remove from all MDX files
2. Re-seed — orphaned tags will remain in the database but won't appear in the UI (no published questions reference them)
3. Optionally: manually DELETE from the `tags` table

### To add a new tag kind

1. Update `AllTagKinds` in `src/domain/value-objects/tag-kind.ts`
2. Update `tagKindEnum` in `db/schema.ts`
3. Run database migration
4. Update `tagKindLabels`, `tagKindPluralLabels`, `tagKindOrder` in `practice-session-starter.tsx`
5. Update `TagFrontmatterSchema` kind enum in `lib/content/schemas.ts`

---

## 10. Relationship to Other Documentation

| Document | Relationship |
|----------|-------------|
| [Content Pipeline](../practice-engine/content-pipeline.md) | Full question flow (authoring → seeding → shuffle → render). Currently includes a "safe to delete/regenerate imported/" statement that conflicts with current domain behavior. |
| [Master Spec](../specs/master_spec.md) | Defines the MDX schema as the SSOT for content format. |
| [Draft Question CLAUDE.md](../../content/drafts/questions/CLAUDE.md) | Question generation instructions including vocabulary lists for substances and topics (mirrors `draftTaxonomy.ts`). |
| [Draft Question SCHEMA.md](../../content/drafts/questions/SCHEMA.md) | Declares domain intent, but currently diverges from importer implementation (`topics`-inferred in docs vs directory-derived in code). |

---

## 11. Recommended Next Steps

These are observations, not commitments. Decisions should be made via brainstorming docs.

1. **Centralize domain taxonomy** — Add `DRAFT_DOMAIN_SLUGS` (or equivalent) to `draftTaxonomy.ts` with the 8 exam-board section names. Update the import script to map directories → domain slugs via a configuration table instead of `titleCaseFromSlug(directoryName)`.

2. **Fix rogue placeholder tags** — Update `placeholder-07` and `placeholder-08` to use valid topic slugs.

3. **Add treatment taxonomy** — Add `DRAFT_TREATMENT_SLUGS` to `draftTaxonomy.ts` to validate treatment tags during import.

4. **Enforce domain presence** — Require exactly one `kind: domain` tag per MDX question (and backfill the 9 placeholders currently missing domain).

5. **Align docs with implementation** — Update `content/drafts/questions/SCHEMA.md` and `docs/practice-engine/content-pipeline.md` so they match the actual pipeline behavior (or update code to match documented behavior).

6. **Evaluate Exam Section vs Topic overlap** — Consider whether "Exam Section" (domain) should remain as a separate filter dimension or be collapsed into "Topic". This is a product decision, not a code fix.

7. **Rename confusing topic slug `treatment`** — Consider renaming to `treatment-approaches` or similar to disambiguate from the Treatment filter kind.
