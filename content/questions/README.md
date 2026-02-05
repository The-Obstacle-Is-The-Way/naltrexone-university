# Question Content

This folder contains MDX question files that seed into the database.

## Structure

```
questions/
├── placeholder/     ← Example questions (committed, public)
├── imported/        ← Generated from drafts (gitignored)
└── your-topic/      ← Real questions (gitignored, private)
```

## File Format

Each `.mdx` file has YAML frontmatter + Markdown body:

```yaml
---
slug: "unique-kebab-case-slug"
difficulty: "easy"          # easy | medium | hard
status: "published"         # draft | published | archived
tags:
  - slug: "naltrexone"
    name: "Naltrexone"
    kind: "treatment"       # domain | topic | substance | treatment | diagnosis
choices:
  - label: "A"
    text: "First choice..."
    correct: false
  - label: "B"
    text: "Correct answer..."
    correct: true
  # ... 2-5 choices total, exactly 1 correct
---

## Stem

Your question text here. Supports **Markdown**.

## Explanation

Detailed explanation of the correct answer.
```

## Commands

```bash
# Sync questions to database
pnpm db:seed

# Seed without placeholder questions (archives placeholder-* rows in the DB)
SEED_INCLUDE_PLACEHOLDERS=false pnpm db:seed

# View in database
pnpm db:studio
```

## Privacy Note

Real questions are gitignored. Only `placeholder/` is committed as format examples.

To add real content:
1. Create a folder (e.g., `stahls/`, `papers/`)
2. Add `.mdx` files following the format above
3. Run `pnpm db:seed`

The folder will be ignored by git automatically.
