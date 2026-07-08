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
  - slug: "naltrexone"
    name: "Naltrexone"
    kind: "treatment"       # topic | substance | treatment | diagnosis
choices:
  - label: "A"
    text: "First choice..."
    correct: false
  - label: "B"
    text: "Correct answer..."
    correct: true
  # 2-5 choices total, exactly 1 correct
---

## Stem

Your question text here. Supports Markdown.

## Explanation

General explanation of the correct answer.

**Why other answers are wrong:**
- A) Explanation for choice A
- C) Explanation for choice C

### Reference

Citation or source note.
```

Notes:

- `lib/content/schemas.ts` validates frontmatter strictly.
- `scripts/seed/question-parser.ts` splits `## Explanation` into the general
  explanation, per-choice wrong-answer explanations, and optional
  `### Reference` content.
- Diagnosis tags are valid in stored content but are hidden from current
  Practice and History filter UIs.

## Commands

```bash
# Validate draft inputs without writing MDX
pnpm content:import:drafts -- --dry-run

# Generate imported MDX as draft status
pnpm content:import:drafts

# Generate imported MDX as published status
pnpm content:import:drafts -- --status published

# Seed MDX into the database
pnpm db:seed

# Include placeholder content during seed
SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed

# Explicitly allow answer-key flips over existing graded history
SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY=true pnpm db:seed
```

## Workflow

1. Author in `content/drafts/questions/**`.
2. Import drafts into `content/questions/imported/`.
3. Seed from `content/questions/**/*.mdx`.

`pnpm db:seed` reads every `.mdx` file under `content/questions/`. By default it
excludes `content/questions/placeholder/**/*.mdx`; when placeholders are
excluded, existing `placeholder-*` database rows are archived during seed.

Seed refuses to change `correct` on an existing choice when attempts or graded
practice-session state already exist for that question. This prevents silent
history drift where stored grades contradict the current answer key. If a human
operator deliberately accepts that historical-key change, rerun with
`SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY=true`; the seed logs the affected
question slug, changed labels, and graded row counts.

Manual `.mdx` files outside `imported/` will still be read by the seed script,
but the maintained workflow is draft -> import -> seed.
