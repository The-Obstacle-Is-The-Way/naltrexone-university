# Question Seed Content

This directory contains the MDX files that `pnpm db:seed` loads into the
database.

## Structure

```text
content/questions/
├── README.md
├── imported/      # generated from content/drafts/questions
└── placeholder/   # committed sample/debug corpus
```

`content/questions/imported/` is the maintained output of
`pnpm content:import:drafts`. It is gitignored and should be treated as
generated content, not the primary authoring surface.

## File Format

Each `.mdx` file has strict YAML frontmatter plus a markdown body:

```yaml
---
slug: "unique-kebab-case-slug"
difficulty: "easy"          # easy | medium | hard
status: "published"         # draft | published | archived
tags:
  - slug: "general"
    name: "General"
    kind: "topic"
  - slug: "alcohol"
    name: "Alcohol"
    kind: "substance"
  - slug: "naltrexone"
    name: "Naltrexone"
    kind: "treatment"       # topic | substance | treatment | diagnosis
choices:
  - label: "A"
    text: "First choice..."
    correct: false
    explanation: "Why the first choice is incorrect."
  - label: "B"
    text: "Correct answer..."
    correct: true
  # 2-5 choices total, exactly 1 correct
---

## Stem

Your question text here. Supports Markdown.

## Explanation

General explanation of the correct answer.

### Reference

Citation or source note.
```

Notes:

- `lib/content/schemas.ts` validates frontmatter strictly.
- `scripts/seed/question-parser.ts` splits a terminal `### Reference` from
  `## Explanation`; it requires a nonempty reference except for synthetic seed
  fixtures. Wrong-choice explanations come from YAML `choices[].explanation`;
  the legacy wrong-answer Markdown section is refused.
- Diagnosis tags are valid in stored content but are hidden from current
  Practice and History filter UIs.

## Commands

Import writes require an absent or empty destination. For a replacement bundle,
use the [staging procedure](../../docs/architecture/content-pipeline.md#import-drafts--mdx-generated),
review it, then place the approved artifact under `content/questions/`.
The seed commands below require an explicit `DATABASE_URL`; remote targets also
require the exact `DB_TARGET_ACK` under the repository's database-target rules.

```bash
# Validate draft inputs without writing MDX
pnpm content:import:drafts -- --dry-run

# Generate imported MDX as draft status, into an absent or empty destination
pnpm content:import:drafts

# Generate imported MDX as published status, into an absent or empty destination
pnpm content:import:drafts -- --status published

# Seed MDX into the database
pnpm db:seed

# Include the placeholder fixtures in this clone's local test database
DATABASE_URL="$(pnpm exec tsx scripts/test-lanes/resolve-local-test-target.ts database-url)" pnpm db:seed --include-placeholders
```

## Workflow

1. Author in `content/drafts/questions/**`.
2. Import drafts into `content/questions/imported/`.
3. Seed from `content/questions/**/*.mdx`.

`pnpm db:seed` reads non-hidden `.mdx` files under `content/questions/`. By default it
excludes `content/questions/placeholder/**/*.mdx`; when placeholders are
excluded, the ten exact fixture slugs in `scripts/seed/placeholder-archiver.ts`
are archived after a successful sync. Other `placeholder-*` slugs are left alone.
An active content release makes the seed refuse the database; subsequent changes
use the release commands.

Changed content, including a corrected answer key, becomes a new revision of the
question (ADR-021 phase 2b); nothing earlier is rewritten. Attempts and practice
sessions keep the revision they were shown and graded against, so a stored grade
never contradicts the key it was graded with, and reviews say the question has
been updated since.

Manual `.mdx` files outside `imported/` will still be read by the seed script,
but the maintained workflow is draft -> import -> seed.
