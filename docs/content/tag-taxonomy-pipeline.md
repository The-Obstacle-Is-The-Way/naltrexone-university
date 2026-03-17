# Content Tag Taxonomy — Pipeline Trace

> **Scope:** How `topic`, `substance`, `treatment`, and `diagnosis` tags flow
> from draft authoring through import, seed, PostgreSQL, and the Practice /
> History UI
> **Last Verified:** 2026-03-17
> **Runtime SSOT:** `lib/content/draftTaxonomy.ts`, `lib/content/schemas.ts`,
> `scripts/draft-question-import.ts`, `scripts/import-draft-questions.ts`,
> `scripts/seed/question-parser.ts`

---

## 1) Current State Summary

- Runtime taxonomy uses 4 tag kinds: `topic`, `substance`, `treatment`, and
  `diagnosis`.
- The legacy Exam Section / `domain` kind is removed from draft import, MDX
  validation, seed validation, DB enum usage, and UI filters.
- Practice exposes 3 visible filter categories in this order:
  Topic -> Substance -> Treatment.
- History question filters expose the same 3 visible kinds.
- Diagnosis remains valid in storage and controller payloads, but it is
  intentionally hidden from Practice and History filter surfaces.
- Filter options only include tags attached to published questions because
  `DrizzleTagRepository.listAll()` joins `question_tags` to `questions` and
  filters on `questions.status = 'published'`.

---

## 2) Directory Roles

```text
content/
├── drafts/
│   ├── questions/                    # live authoring inputs
│   │   ├── {source-group}/.../
│   │   │   ├── recall.md
│   │   │   └── vignettes.md
│   │   └── companion docs
│   └── questions-backup-YYYYMMDD/    # local snapshots
└── questions/
    ├── imported/                     # generated MDX output
    └── placeholder/                  # committed sample/debug corpus
```

Notes:

- `pnpm content:import:drafts` defaults to `--in content/drafts/questions`, so
  `content/drafts/questions-backup-*` folders are not scanned unless `--in` is
  overridden.
- The importer scans only `**/recall.md` and `**/vignettes.md`.
- `content/questions/imported/` is gitignored generated output.
- `content/questions/placeholder/` is committed content that seed excludes by
  default.

---

## 3) Canonical Taxonomy (SSOT)

Source: `lib/content/draftTaxonomy.ts`

### Topic (13)

`screening-diagnosis`, `epidemiology-prevention`,
`pharmacology-neuroscience`, `intoxication-toxicology`,
`withdrawal-management`, `treatment-pharmacotherapy`,
`psychosocial-interventions`, `co-occurring-disorders`,
`medical-complications`, `harm-reduction`, `ethics-legal`,
`special-populations`, `general`

### Substance (11)

`alcohol`, `cannabis`, `cocaine`, `hallucinogens`, `inhalants`, `opioids`,
`polysubstance`, `sedatives`, `stimulants`, `tobacco`, `other`

### Treatment (12)

`acamprosate`, `buprenorphine`, `bupropion`, `disulfiram`, `gabapentin`,
`methadone`, `naloxone`, `naltrexone`, `nrt`, `topiramate`, `varenicline`,
`other-treatment`

---

## 4) End-to-End Flow

### Step A — Draft authoring (`content/drafts/questions/**/*.md`)

- Question blocks are split on `^---\nqid:` by
  `splitDraftQuestionsFile()` in `scripts/draft-question-import.ts`.
- Draft frontmatter provides `substances[]`, `topics[]`, optional
  `treatments[]`, optional `diagnoses[]`, plus `qid`, `source`, `difficulty`,
  `type`, and `answer`.
- Validation at draft-parse time is strict:
  - canonical topic / substance / treatment slugs only
  - diagnosis slugs must be kebab-case
  - non-empty `qid` and `source`
  - `topics` and `substances` must be present and non-empty

### Step B — Draft import (`pnpm content:import:drafts`)

Files:

- `scripts/import-draft-questions.ts`
- `scripts/draft-question-import.ts`

Behavior:

- Defaults:
  - input root: `content/drafts/questions`
  - output root: `content/questions/imported`
  - status: `draft`
- The importer scans only `recall.md` and `vignettes.md`.
- The output group comes from the first path segment under the input root.
- The output source directory comes from draft frontmatter `source`.
- Each question is written to:
  `content/questions/imported/<source-group>/<source>/<qid>.mdx`
- Taxonomy is derived from frontmatter slugs and explicit display-name maps, not
  from directory names.
- No legacy `domain` tags are emitted.

### Step C — MDX validation

File: `lib/content/schemas.ts`

- `TagFrontmatterSchema.kind` allows only:
  - `topic`
  - `substance`
  - `treatment`
  - `diagnosis`
- Canonical slug enforcement is applied by kind for topic, substance, and
  treatment.
- `QuestionFrontmatterSchema` enforces:
  - 2-5 choices
  - exactly one `correct: true`
  - unique choice labels
  - unique tag slugs
  - at least one topic tag
  - at least one substance tag

### Step D — Seed to DB (`pnpm db:seed`)

Files:

- `scripts/seed.ts`
- `scripts/seed/file-reader.ts`
- `scripts/seed/question-parser.ts`

Behavior:

- `readSeedQuestionFiles()` reads `content/questions/**/*.mdx`.
- Placeholder files under `content/questions/placeholder/**/*.mdx` are excluded
  unless `SEED_INCLUDE_PLACEHOLDERS=true`.
- When placeholders are excluded, `archivePlaceholderQuestions()` archives
  existing DB rows whose slug matches `placeholder-%`.
- Seed validation rejects:
  - legacy `domain` tags
  - non-canonical topic / substance / treatment slugs
  - questions missing topic or substance tags

### Step E — Storage and read path

Files:

- `db/schema.ts`
- `src/adapters/repositories/drizzle-tag-repository.ts`
- `src/adapters/controllers/tag-controller.ts`

Flow:

- Tags persist in `tags` and `question_tags`.
- Questions persist `reference_md` separately from `explanation_md`.
- The tag controller returns all stored kinds:
  `topic | substance | treatment | diagnosis`.
- Consumers decide which kinds are visible in the UI.

### Step F — UI consumption

Practice filters:

- `app/(app)/app/practice/components/practice-session-starter.tsx`
- Visible kind order: `['topic', 'substance', 'treatment']`

History question filters:

- `app/(app)/app/history/page.tsx`
- `app/(app)/app/history/components/history-questions-tab.tsx`
- Visible kinds restricted to topic / substance / treatment

---

## 5) Operational Guardrails

- Use [tag-taxonomy-golden-spec.md](./tag-taxonomy-golden-spec.md) for the
  canonical slug and display-name tables.
- Use [question-format-spec.md](./question-format-spec.md) for authoring and
  parser rules.
- Use the latest dated census report for coverage analysis instead of relying on
  migration-era assumptions:
  [tag-census-2026-03-17.md](./reports/tag-census-2026-03-17.md)
- Do not derive taxonomy from directory structure or source-group names.
- Do not surface diagnosis filters without an explicit product decision.

---

## 6) Related Files

- [tag-taxonomy-golden-spec.md](./tag-taxonomy-golden-spec.md)
- [question-format-spec.md](./question-format-spec.md)
- [tag-census-2026-03-17.md](./reports/tag-census-2026-03-17.md)
- `docs/_archive/brainstorming/bs-024-tag-taxonomy-cleanup.md`
- `docs/_archive/specs/spec-033-tag-taxonomy-migration.md`
- `lib/content/draftTaxonomy.ts`
- `lib/content/schemas.ts`
- `scripts/draft-question-import.ts`
- `scripts/import-draft-questions.ts`
- `scripts/seed.ts`
- `scripts/seed/file-reader.ts`
- `scripts/seed/question-parser.ts`
