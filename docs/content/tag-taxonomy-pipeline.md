# Content Tag Taxonomy — Pipeline Trace

> **Scope:** How `topic`, `substance`, `treatment`, and `diagnosis` tags flow from draft authoring through import, seed, PostgreSQL, and the Practice/History UI
> **Last Verified:** 2026-02-18

---

## 1) Current State Summary

- Runtime taxonomy uses 4 kinds: `topic`, `substance`, `treatment`, `diagnosis`.
- The legacy Exam Section kind is removed from:
  - `src/domain/value-objects/tag-kind.ts`
  - `db/schema.ts` `tag_kind` enum
  - `lib/content/schemas.ts` frontmatter kind validation
- Practice filter UI exposes 3 visible categories in this order:
  - Topic → Substance → Treatment
- Diagnosis remains valid in schema/storage, but is intentionally hidden in Practice and History filter surfaces.

---

## 2) Directory Roles

```text
content/
├── drafts/                          # local authoring inputs
│   └── questions/
│       ├── SCHEMA.md
│       ├── CLAUDE.md
│       └── AGENTS.md
└── questions/                       # seed inputs (MDX)
    ├── placeholder/                 # committed sample corpus (10 files)
    └── imported/                    # gitignored imported corpus
```

Notes:
- Legacy post-import taxonomy repair script is deleted.
- Import no longer derives taxonomy from directory names.

---

## 3) Canonical Taxonomy (SSOT)

Source: `lib/content/draftTaxonomy.ts`

### Topic (13)
`screening-diagnosis`, `epidemiology-prevention`, `pharmacology-neuroscience`, `intoxication-toxicology`, `withdrawal-management`, `treatment-pharmacotherapy`, `psychosocial-interventions`, `co-occurring-disorders`, `medical-complications`, `harm-reduction`, `ethics-legal`, `special-populations`, `general`

### Substance (11)
`alcohol`, `cannabis`, `cocaine`, `hallucinogens`, `inhalants`, `opioids`, `polysubstance`, `sedatives`, `stimulants`, `tobacco`, `other`

### Treatment (12)
`acamprosate`, `buprenorphine`, `bupropion`, `disulfiram`, `gabapentin`, `methadone`, `naloxone`, `naltrexone`, `nrt`, `topiramate`, `varenicline`, `other-treatment`

---

## 4) End-to-End Flow

### Step A — Draft authoring (`content/drafts/questions/**/*.md`)

- Draft frontmatter provides `substances[]`, `topics[]`, optional `treatments[]`, optional `diagnoses[]`.
- Validation happens in `scripts/draft-question-import.ts`:
  - topics must be canonical topic slugs
  - substances must be canonical substance slugs
  - treatments must be canonical treatment slugs
  - topics/substances are required non-empty arrays

### Step B — Draft import (`pnpm content:import:drafts`)

Files:
- `scripts/import-draft-questions.ts`
- `scripts/draft-question-import.ts`

Behavior:
- `convertDraftQuestionToMdx({ draft, status })` generates MDX frontmatter tags.
- No directory-name taxonomy assignment.
- No legacy Exam Section tags emitted.
- Canonical display names come from explicit slug→name maps (not auto title-casing).

### Step C — MDX validation

File: `lib/content/schemas.ts`

- `TagFrontmatterSchema.kind` allows only:
  - `topic`, `substance`, `treatment`, `diagnosis`
- Canonical slug enforcement by kind for:
  - topic / substance / treatment
- `QuestionFrontmatterSchema` enforces:
  - at least one topic tag
  - at least one substance tag
  - no duplicate slugs

### Step D — Seed to DB (`pnpm db:seed`)

File: `scripts/seed.ts`

- `validateSeedQuestionTags()` rejects:
  - legacy Exam Section kind tags
  - non-canonical topic/substance/treatment slugs
  - questions missing topic or substance tags
- Placeholder behavior defaults to excluded:
  - include only if `SEED_INCLUDE_PLACEHOLDERS=true`

### Step E — Storage and read path

Files:
- `db/schema.ts`
- `src/adapters/repositories/drizzle-tag-repository.ts`
- `src/adapters/controllers/tag-controller.ts`

Flow:
- Tags persist in `tags` + `question_tags`.
- Controller returns tag rows typed as:
  - `topic | substance | treatment | diagnosis`

### Step F — UI consumption

Practice filters:
- `app/(app)/app/practice/components/practice-session-starter.tsx`
- Order: `['topic', 'substance', 'treatment']`
- No Exam Section rendering.

History question filters:
- `app/(app)/app/history/page.tsx`
- Filter options restricted to topic/substance/treatment.

---

## 5) Operational Guardrails

- Use `docs/content/tag-taxonomy-golden-spec.md` for canonical slug/display-name reference.
- Do not introduce legacy Exam Section tags in drafts, MDX, or DB migrations.
- Keep diagnosis tags internal unless product requirements explicitly surface them.

---

## 6) Related Files

- `docs/content/tag-taxonomy-golden-spec.md`
- `docs/_archive/brainstorming/bs-024-tag-taxonomy-cleanup.md`
- `docs/_archive/specs/spec-033-tag-taxonomy-migration.md`
- `lib/content/draftTaxonomy.ts`
- `lib/content/schemas.ts`
- `scripts/import-draft-questions.ts`
- `scripts/draft-question-import.ts`
- `scripts/seed.ts`
