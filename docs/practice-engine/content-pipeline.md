# Practice Engine: Content Pipeline (Authored Content → Rendered UI)

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Full end-to-end trace from authored MDX files through seeding, database, shuffling, and UI rendering
> **Last Verified:** 2026-02-16

This document serves two purposes:
1. **Architectural trace** — understanding where data flows and where bugs happen (e.g., BS-011 choice label desync)
2. **Developer operations** — how to author, import, seed, and troubleshoot question content

---

## 1. High-Level Flow

```text
┌───────────────────────────────────────────────────────────────────────┐
│ 1. AUTHORING                                                          │
│    content/drafts/questions/**/*.md (draft format, optional)          │
│         ↓ pnpm content:import:drafts                                  │
│    content/questions/**/*.mdx (canonical format, 958 files)           │
├───────────────────────────────────────────────────────────────────────┤
│ 2. SEEDING                                                            │
│    pnpm db:seed                                                       │
│    gray-matter → Zod validation → section extraction → canonicalize   │
│    → SHA256 change detection → upsert to PostgreSQL                   │
├───────────────────────────────────────────────────────────────────────┤
│ 3. DATABASE STORAGE                                                   │
│    questions (stemMd, explanationMd)                                  │
│    choices (label, textMd, isCorrect, explanationMd, sortOrder)       │
│    tags, question_tags                                                │
│    Raw markdown stored as-is — no HTML compilation at rest            │
├───────────────────────────────────────────────────────────────────────┤
│ 4. QUERY LAYER                                                        │
│    DrizzleQuestionRepository → domain Question entity                 │
│    Choices sorted by sortOrder, labels preserved from DB              │
├───────────────────────────────────────────────────────────────────────┤
│ 5. USE CASE LAYER (shuffle happens here)                              │
│    GetNextQuestion / SubmitAnswer / GetPreviousAttempt                │
│    buildShuffledChoiceViews(question, userId) → shuffled displayLabel │
├───────────────────────────────────────────────────────────────────────┤
│ 6. CONTROLLER / SERVER ACTION LAYER                                   │
│    Unified shuffle path (all paths call buildShuffledChoiceViews)      │
├───────────────────────────────────────────────────────────────────────┤
│ 7. FRONTEND RENDERING                                                 │
│    react-markdown + remark-gfm + rehype-sanitize                      │
│    Client-side markdown → HTML at view time                           │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Step 1: Content Authoring

### Sources of Truth

- **MDX schema (SSOT):** `docs/specs/master_spec.md` → **Section 5: Content Pipeline**
- **Schema enforcement (code):** `lib/content/schemas.ts`, `lib/content/parseMdxQuestion.ts`
- **Database tables:** `db/schema.ts` (`questions`, `choices`, `tags`, `question_tags`)
- **Seeder:** `scripts/seed.ts` (`pnpm db:seed`)

### Directory Roles

- `content/drafts/` (gitignored) — Local-only working area for writing/editing questions in a human-friendly format.
- `content/questions/placeholder/` (committed) — Small set of 10 example MDX questions to validate the pipeline and provide templates.
- `content/questions/imported/` (gitignored) — imported MDX files generated from drafts. Import now emits canonical `topic`/`substance`/`treatment` tags and no legacy Exam Section tags.

Because real question content is proprietary, it is **gitignored** and must be present locally (or in a private deployment workflow) when running the seed.

### MDX File Format

Each `.mdx` file = YAML frontmatter + Markdown body:

```yaml
---
slug: "question-slug-here"
difficulty: easy|medium|hard
status: published|draft|archived
tags:
  - slug: "tag-slug"
    name: "Tag Display Name"
    kind: topic|substance|treatment|diagnosis
choices:
  - label: "A"
    text: "Choice text (supports YAML multiline >-)"
    correct: false
  - label: "B"
    text: "Correct choice text"
    correct: true
  - label: "C"
    text: "Another wrong choice"
    correct: false
  - label: "D"
    text: "Another wrong choice"
    correct: false
---

## Stem

Question text with **Markdown** formatting.

## Explanation

General explanation of the correct answer.

**Clinical pearl:** Practical takeaway.

**Why other answers are wrong:**
- A) Why A is wrong
- C) Why C is wrong
- D) Why D is wrong
```

**Key points:**
- Labels are authored as A/B/C/D in canonical order in the YAML frontmatter
- Exactly 1 `correct: true` choice per question (enforced by Zod validation)
- Standard: 4 choices (schema allows 2-5, but all 958 files use 4)
- The `## Stem` and `## Explanation` sections are mandatory
- The "Why other answers are wrong" subsection in the explanation is optional; if present, it's parsed into per-choice explanations

**Validation schema:** `lib/content/schemas.ts` — `QuestionFrontmatterSchema` (Zod)

### Draft Format (Authoring)

Draft question sets live under `content/drafts/questions/**` and are usually stored as `recall.md` or `vignettes.md`. Each file contains multiple question blocks. Each block:

- Starts with YAML frontmatter containing `qid`, `type`, `difficulty`, `substances`, `topics`, `source`, and `answer`
  - Optional: `treatments[]`, `diagnoses[]` for more specific tagging (mapped to MDX `kind: treatment|diagnosis`)
- Uses headings in this order: `## Question` (or `## Stem`), `## Choices`, `## Explanation`

Notes:
- Draft `substances[]` and `topics[]` are validated against the canonical taxonomy in `lib/content/draftTaxonomy.ts`.
- All draft tag slugs must be **kebab-case** (`lowercase-with-dashes`).

### Import Drafts → MDX (Generated)

```bash
pnpm content:import:drafts
```

Defaults: Input root `content/drafts/questions`, output root `content/questions/imported`, output status `draft`.

Useful modes:

```bash
# Validate parsing without writing files
pnpm content:import:drafts -- --dry-run

# Generate MDX as published (so the app can serve these questions)
pnpm content:import:drafts -- --status published
```

Notes:
- Imported MDX files are generated from drafts by a deterministic canonical taxonomy path (no domain repair pass).
- The importer validates output against `lib/content/schemas.ts` before writing.

---

## 3. Step 2: Seeding (Content → Database)

**Script:** `scripts/seed.ts` — run via `pnpm db:seed`

### Pipeline

| Step | Code | What Happens |
|------|------|-------------|
| Discover | `fast-glob('content/questions/**/*.mdx')` | Finds all MDX files |
| Split | `gray-matter(raw)` → `{ data, content }` | Separates YAML frontmatter from body |
| Validate | `QuestionFrontmatterSchema.parse(data)` | Zod validates frontmatter structure |
| Extract | `parseMdxQuestionBody(content)` | `lib/content/parseMdxQuestion.ts` — extracts text between `## Stem` and `## Explanation` headings |
| Parse explanations | `parseChoiceExplanations(explanationMd)` | `scripts/seed-helpers.ts` — splits general explanation from per-choice "Why other answers are wrong" breakdowns |
| Canonicalize | `canonicalizeMarkdown(text)` | `lib/content/parseMdxQuestion.ts` — normalizes newlines, trims trailing whitespace |
| Hash | `sha256Hex(canonicalJsonString(seedRep))` | Change detection — skip unchanged questions |
| Upsert | Transaction: insert/update question, choices, tags, question_tags | Into PostgreSQL via Drizzle |

**Critical transformation:** The seed script **sorts choices by `label`** before assigning `sortOrder`:

```typescript
const sortedChoices = [...frontmatter.choices].sort((a, b) =>
  a.label.localeCompare(b.label),
);

choices: sortedChoices.map((c, index) => ({
  label: c.label,        // "A".."E" — canonical authored label
  sort_order: index + 1, // 1..N — derived from sorted label order
  // ...
}));
```

Because labels are validated as `A`–`E` and then sorted, `sortOrder` is effectively canonical: `1=A`, `2=B`, `3=C`, `4=D`, `5=E` in the database (independent of the original YAML array order).

### Publishing Rule

The app only serves **published** questions. `DrizzleQuestionRepository` queries always include `questions.status = 'published'`. If you import drafts with the default `status=draft`, those questions will seed successfully but will not appear in `/app/practice` until you re-import as `published` (or edit the generated MDX status).

### Placeholder Questions

`content/questions/placeholder/` contains 10 committed templates for pipeline smoke-testing.

To exclude placeholders from your runtime database:

```bash
SEED_INCLUDE_PLACEHOLDERS=false pnpm db:seed
```

This excludes `content/questions/placeholder/**/*.mdx` from the seed input and archives any existing placeholder rows in the DB (`slug LIKE 'placeholder-%'`).

---

## 4. Step 3: Database Storage

**Schema:** `db/schema.ts`

**Questions table:** Stores `stemMd` and `explanationMd` as raw markdown text.

**Choices table:**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `questionId` | uuid FK | Parent question |
| `label` | varchar(4) | Canonical authored label: A–E |
| `textMd` | text | Choice text (raw markdown) |
| `isCorrect` | boolean | Correctness flag |
| `explanationMd` | text (nullable) | Per-choice explanation (parsed from "Why other answers are wrong") |
| `sortOrder` | integer | Canonical ordering: 1=A, 2=B, 3=C, 4=D, 5=E |

**Unique constraints:** `(questionId, label)` and `(questionId, sortOrder)` — ensures no duplicate labels or ordering within a question.

**Attempts table:** Stores `selectedChoiceId` (FK to choices), but does **not** store which shuffle order the user saw. The shuffle is deterministic and recomputed from `userId + questionId` at render time.

---

## 5. Step 4: Query Layer

**Repository:** `src/adapters/repositories/drizzle-question-repository.ts`

The `toDomain()` method (line 242) converts DB rows to domain entities:
- Validates each choice label with `isValidChoiceLabel()`
- **Sorts choices by `sortOrder` ascending** (line 274): `mappedChoices.sort((a, b) => a.sortOrder - b.sortOrder)`
- Returns choices in canonical/authored order: A(1), B(2), C(3), D(4), E(5) (when present)

The domain `Question` entity has `choices: Choice[]` always in this canonical order.

---

## 6. Step 5: Choice Shuffling (Where It Happens)

**Shuffle service:** `src/domain/services/shuffle.ts`

- `createQuestionSeed(userId, questionId)` → deterministic numeric seed via `hashString("userId:questionId")`
- `shuffleWithSeed(items, seed)` → Fisher-Yates shuffle with Mulberry32 PRNG
- Same user + same question = same shuffle every time. Different users see different orders.

**Shuffle application:** `src/application/shared/shuffled-choice-views.ts`

`buildShuffledChoiceViews(question, userId)` does the following:

1. Copies choices, sorts by `sortOrder` (then `id` tiebreak) to ensure stable input
2. Shuffles with `shuffleWithSeed(stableInput, seed)`
3. **Assigns new `displayLabel`** based on shuffled position: `AllChoiceLabels[index]` (A=first, B=second, etc.)
4. Returns `ShuffledChoiceView[]` with `displayLabel`, `textMd`, `isCorrect`, `explanationMd`

**Who calls `buildShuffledChoiceViews`:**

| Caller | File | Returns shuffled labels? |
|--------|------|------------------------|
| `getQuestionBySlug` controller | `question-view-controller.ts:77` | **Yes** — returns `choice.displayLabel` as `label` (added by SPEC-025) |
| `GetNextQuestionUseCase.mapChoicesForOutput()` | `get-next-question.ts:87-97` | **Yes** — returns `choice.displayLabel` as `label` |
| `SubmitAnswerUseCase.mapChoiceExplanations()` | `submit-answer.ts:49-60` | **Yes** — returns `choice.displayLabel` |
| `GetPreviousAttemptUseCase.execute()` | `get-previous-attempt.ts:79-88` | **Yes** — returns `choice.displayLabel` |

All four callers produce **shuffled** labels for their outputs. This was unified by SPEC-025 (previously, `getQuestionBySlug` returned canonical labels).

---

## 7. Step 6: Frontend Rendering

**Markdown rendering:** `components/markdown/Markdown.tsx`
- Uses `react-markdown` with `remark-gfm` (GitHub Flavored Markdown) and `rehype-sanitize` (XSS protection)
- Renders at view time on the client, not at build time
- `skipHtml` flag prevents raw HTML from rendering

**QuestionCard:** `components/question/question-card.tsx`
- Receives `choices` as a prop (from whichever data source loaded them)
- Renders each choice with `choice.label` and `choice.textMd`
- Choice labels are displayed as-received — no re-labeling

**Feedback:** `components/question/feedback.tsx`
- Receives `choiceExplanations` as a prop (from `SubmitAnswerOutput` or `GetPreviousAttemptOutput`)
- Renders each incorrect choice with `choice.displayLabel` and `choice.explanationMd`
- Letter labels are displayed as-received — no re-labeling

Both components are pure presentational — they render whatever labels they receive. Since SPEC-025 unified all shuffle paths, all data sources now produce consistent shuffled labels.

---

## 8. Controller Layer Shuffle (Formerly BS-011 Bug B — RESOLVED)

> **Status:** Fixed by SPEC-025 (Choice Label Desync Fix)

Previously, `getQuestionBySlug` returned choices with canonical DB labels (A–E in authored order) while use cases (`SubmitAnswer`, `GetPreviousAttempt`) returned shuffled `displayLabel` values. This caused letter label mismatches between the QuestionCard and Feedback components on the `/app/questions/[slug]` page.

### The fix (SPEC-025)

`getQuestionBySlug` now calls `buildShuffledChoiceViews(question, userId)` just like the use cases:

```typescript
// question-view-controller.ts:77-81
choices: buildShuffledChoiceViews(question, userId).map((choice) => ({
  id: choice.choiceId,
  label: choice.displayLabel,  // ← NOW SHUFFLED (was canonical)
  textMd: choice.textMd,
})),
```

### Current state (all paths consistent)

```text
ALL CONTEXTS (consistent — all shuffled):
  getQuestionBySlug ─[shuffled labels]──→ QuestionCard ✓
  GetNextQuestion ───[shuffled labels]──→ QuestionCard ✓
  SubmitAnswer ──────[shuffled labels]──→ Feedback      ✓
  GetPreviousAttempt [shuffled labels]──→ Feedback      ✓
  Labels always match.
```

All four callers of `buildShuffledChoiceViews` produce consistent shuffled labels. The shuffle remains deterministic per `(userId, questionId)` pair.

---

## 9. Summary Table

| Step | Location | Input | Output | Labels |
|------|----------|-------|--------|--------|
| **Author** | `content/questions/**/*.mdx` | Human writes | YAML + Markdown | A–E (canonical) |
| **Validate** | `lib/content/schemas.ts` | Frontmatter | Parsed + validated | Preserved |
| **Extract** | `lib/content/parseMdxQuestion.ts` | MDX body | `stemMd`, `explanationMd` | N/A (body text) |
| **Parse per-choice** | `scripts/seed-helpers.ts` | Explanation markdown | General + per-choice Map | Label keys (A-E) |
| **Canonicalize** | `lib/content/parseMdxQuestion.ts` | Raw markdown | Normalized markdown | Preserved |
| **Seed to DB** | `scripts/seed.ts` | Canonical repr | DB rows | A=sortOrder 1, B=2, etc. |
| **Query** | `drizzle-question-repository.ts` | DB rows | Domain entity | Sorted by sortOrder (A–E) |
| **Shuffle** | `shuffled-choice-views.ts` | Domain entity + userId | Shuffled views | **New displayLabels** by position |
| **Question Card** | `question-card.tsx` | Props from controller | Rendered choices | Whatever labels received |
| **Feedback Card** | `feedback.tsx` | Props from use case output | Rendered explanations | Whatever labels received |

---

## 10. Resolved Bugs in This Pipeline

Both bugs identified during the BS-011 audit have been fixed:

| Bug | Fix | Reference |
|-----|-----|-----------|
| **Bug B: Choice label desync** | `getQuestionBySlug` now calls `buildShuffledChoiceViews()` — all paths produce consistent shuffled labels | SPEC-025 |
| **Bug A: Result-dependent `mode=review` wiring** | History Questions tab now routes all rows through `mode=review` consistently, regardless of result | SPEC-026 |

No known content-pipeline bugs remain as of 2026-02-16.

---

## 11. Dependencies (Content Processing)

| Package | Version | Purpose |
|---------|---------|---------|
| `gray-matter` | ^4.0.3 | YAML frontmatter parsing at seed time |
| `fast-glob` | ^3.3.3 | File discovery at seed time |
| `react-markdown` | ^10.1.0 | Client-side markdown → HTML at view time |
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown tables, strikethrough, etc. |
| `rehype-sanitize` | ^6.0.0 | HTML sanitization (XSS prevention) |

**There is no contentlayer, next-mdx-remote, velite, or similar framework.** The pipeline is fully custom: YAML+Markdown files → seed script → database → client-side react-markdown.

---

## 12. Operations: Seeding (Local, Test DB)

Recommended end-to-end sanity check:

```bash
pnpm db:test:reset
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:migrate
pnpm content:import:drafts -- --status published
SEED_INCLUDE_PLACEHOLDERS=false DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:seed
pnpm dev
```

---

## 13. Operations: Seeding (Staging / Production)

Seeding requires two things:

1. Access to the target DB (`DATABASE_URL`)
2. Access to the question MDX files on disk (`content/questions/**/*.mdx`)

Because real content is gitignored, you must ensure the environment running `pnpm db:seed` has the MDX files available (for example, by syncing from a private content repo, or running the seed from your local machine against the remote database).

Before seeding, ensure the target database schema is up to date:

```bash
DATABASE_URL="<target-db-url>" pnpm db:migrate
```

---

## 14. When to Reseed

Re-run `pnpm db:seed` whenever the database's question/tag data may be out of sync with the MDX source files. Common triggers:

| Trigger | Why Reseed Is Needed |
|---------|---------------------|
| **After `pnpm db:migrate`** (schema changes) | Migrations may alter enums or constraints that require fresh data insertion. |
| **After MDX content changes** (new questions, updated tags, edited frontmatter) | The seed script is the only path from MDX files to database rows. |
| **After tag taxonomy changes** (SPEC-033, renamed slugs, new kinds) | Taxonomy migrations include tag data cleanup (see SPEC-033 §14). Run `pnpm db:migrate` first, then `pnpm db:seed`. |
| **After switching Neon branches** | Different branches may have different data states. |
| **After `pnpm db:test:reset`** | Test DB is wiped; seed restores content. |

**Important:** The seed is **not** automatically run by Vercel, CI, or `pnpm db:migrate`. It is always a manual operator step. See `docs/dev/deployment-procedure.md` for the full deployment flow.

---

## 15. Troubleshooting

### Practice shows "Internal error" on Start session / Submit

This usually means the database is missing newer tables required by server actions (for example `rate_limits` or `idempotency_keys`).

Fix:

```bash
pnpm db:migrate
```
