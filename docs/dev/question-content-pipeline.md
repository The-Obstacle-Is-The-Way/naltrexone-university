# Question Content Pipeline (Drafts → MDX → Database)

This repo seeds the question bank from **MDX files** in `content/questions/**/*.mdx`.

Because real question content is proprietary, it is **gitignored** and must be present locally (or in a private deployment workflow) when running the seed.

## Sources of Truth

- **MDX schema (SSOT):** `docs/specs/master_spec.md` → **Section 5: Content Pipeline**
- **Schema enforcement (code):** `lib/content/schemas.ts`, `lib/content/parseMdxQuestion.ts`
- **Database tables:** `db/schema.ts` (`questions`, `choices`, `tags`, `question_tags`)
- **Seeder:** `scripts/seed.ts` (`pnpm db:seed`)

## Directory Roles

- `content/drafts/` (gitignored)
  - Local-only working area for writing/editing questions in a human-friendly format.
- `content/questions/placeholder/` (committed)
  - Small set of example MDX questions to validate the pipeline and provide templates.
- `content/questions/imported/` (gitignored)
  - Generated MDX output from drafts (safe to delete and regenerate).

## Draft Format (Authoring)

Draft question sets live under `content/drafts/questions/**` and are usually stored as:

- `recall.md`
- `vignettes.md`

Each file contains multiple question blocks. Each block:

- Starts with YAML frontmatter containing `qid`, `difficulty`, `substances`, `topics`, `source`, and `answer`
  - Optional: `treatments[]`, `diagnoses[]` for more specific tagging (mapped to MDX `kind: treatment|diagnosis`)
- Uses headings in this order:
  - `## Question` (or `## Stem`)
  - `## Choices`
  - `## Explanation`

Notes:

- Draft `substances[]` and `topics[]` are validated against the canonical taxonomy in `lib/content/draftTaxonomy.ts`.
- All draft tag slugs must be **kebab-case** (`lowercase-with-dashes`).

## Import Drafts → MDX (Generated)

Command:

```bash
pnpm content:import:drafts
```

Defaults:

- Input root: `content/drafts/questions`
- Output root: `content/questions/imported`
- Output status: `draft`

Useful modes:

```bash
# Validate parsing without writing files
pnpm content:import:drafts -- --dry-run

# Generate MDX as published (so the app can serve these questions)
pnpm content:import:drafts -- --status published
```

Notes:

- Imported MDX files are **generated artifacts**. Delete `content/questions/imported/` any time and re-run the importer.
- The importer validates output against `lib/content/schemas.ts` before writing.

## MDX Format (Seed Input)

`pnpm db:seed` reads `content/questions/**/*.mdx`.

The MDX frontmatter schema is defined in `docs/specs/master_spec.md` (Section 5) and enforced by `lib/content/schemas.ts`:

- `slug` (unique, kebab-case)
- `difficulty` (`easy|medium|hard`)
- `status` (`draft|published|archived`)
- `tags[]` with `{ slug, name, kind }`
- `choices[]` with `{ label, text, correct }`

The body must contain:

- `## Stem`
- `## Explanation`

## Publishing Rule (Why Placeholders Still Show Up)

The app only serves **published** questions.

Example: `DrizzleQuestionRepository` queries always include `questions.status = 'published'`.

So if you import drafts with the default `status=draft`, those questions will seed successfully but will not appear in `/app/practice` until you re-import as `published` (or edit the generated MDX status).

## Seeding (Local, Test DB)

Recommended end-to-end sanity check:

```bash
pnpm db:test:reset
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:migrate
pnpm content:import:drafts -- --status published
SEED_INCLUDE_PLACEHOLDERS=false DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:seed
pnpm dev
```

## Seeding (Staging / Production)

Seeding requires two things:

1. Access to the target DB (`DATABASE_URL`)
2. Access to the question MDX files on disk (`content/questions/**/*.mdx`)

Because real content is gitignored, you must ensure the environment running `pnpm db:seed` has the MDX files available (for example, by syncing from a private content repo, or running the seed from your local machine against the remote database).

Before seeding, ensure the target database schema is up to date:

```bash
DATABASE_URL="<target-db-url>" pnpm db:migrate
```

## Placeholder Questions

Keep `content/questions/placeholder/` as committed templates and pipeline smoke-test content.

To keep CI/E2E stable, placeholders remain committed and `published` in the repo.

If you do not want placeholders to appear in your **runtime database** (local/staging/prod), seed with:

```bash
SEED_INCLUDE_PLACEHOLDERS=false pnpm db:seed
```

This does two things:

- Excludes `content/questions/placeholder/**/*.mdx` from the seed input.
- Archives any existing placeholder rows in the DB (`slug LIKE 'placeholder-%'`) so the app won’t serve them (the app only serves `status='published'`).

## Troubleshooting

### Practice shows “Internal error” on Start session / Submit

This usually means the database is missing newer tables required by server actions (for example `rate_limits` or `idempotency_keys`).

Fix:

```bash
pnpm db:migrate
```
