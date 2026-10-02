# Practice Engine: Content Pipeline (Authored Content → Rendered UI)

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Full end-to-end trace from authored MDX files through seeding, database, shuffling, and UI rendering
> **Last Verified:** 2026-03-17
> **Import workflow updated:** 2026-09-20 — clean staging; other architectural/format sections retain their earlier verification scope.

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
│    content/questions/**/*.mdx (canonical format, 958 files verified)  │
├───────────────────────────────────────────────────────────────────────┤
│ 2. SEEDING                                                            │
│    pnpm db:seed                                                       │
│    gray-matter → Zod validation → section extraction → canonicalize   │
│    → compare with current revision → append a revision if changed      │
├───────────────────────────────────────────────────────────────────────┤
│ 3. DATABASE STORAGE                                                   │
│    questions (slug, status, currentRevisionId)                        │
│    question_revisions (stemMd, explanationMd, referenceMd, difficulty)│
│    choices (revision, label, textMd, isCorrect, explanationMd, order) │
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

## 2. Content Directory Quick Reference

### Which directory feeds production?

**Only `content/questions/**/*.mdx`** — the seed script (`pnpm db:seed`) reads exclusively from this directory. It never touches `content/drafts/`.

### How the three directories relate

```text
content/drafts/questions/**/*.md       YOUR WORKSPACE (raw authoring, gitignored)
        │                              Safe to modify, delete, restructure anytime.
        │                              Nothing reads from here automatically.
        │
        │  pnpm content:import:drafts  (manual — you choose when to run)
        │  Validates tags against canonical taxonomy, expands slugs to
        │  {slug, name, kind} objects, splits multi-Q files into 1 MDX each.
        ▼
content/questions/imported/**/*.mdx    GENERATED OUTPUT (gitignored)
        │                              One MDX file per question.
        │                              Derived from drafts — do not hand-edit.
        │
        │  pnpm db:seed                (manual — you choose when to run)
        │  Reads ALL .mdx under content/questions/, validates, upserts to DB.
        ▼
PostgreSQL (questions, choices, tags, question_tags)
```

### What about `content/questions/placeholder/`?

10 hand-written example MDXs committed to the repo so the app works out of the box. By default, `pnpm db:seed` **excludes them** and archives any existing placeholder rows. They're templates, not production content.

To include them: `SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed`

### Can I modify drafts freely?

**Yes.** `content/drafts/` is completely decoupled from the seed. Changes there have zero effect on the database until you explicitly run `pnpm content:import:drafts` to regenerate the MDX output, then `pnpm db:seed` to push it to the database.

### Where do tag display names come from?

You author slugs in draft YAML (`topics: [pharmacology-neuroscience]`). The import script looks up display names from `lib/content/draft-taxonomy.ts` (`"Pharmacology & Neuroscience"`). You never need to write display names in drafts.

---

## 3. Content Authoring

### Sources of Truth

- **Draft question format:** `docs/content/question-format-spec.md` — single source of truth for authoring
- **Canonical tag taxonomy:** `lib/content/draft-taxonomy.ts` (code), `docs/content/tag-taxonomy-golden-spec.md` (reference)
- **Schema enforcement (code):** `lib/content/schemas.ts`, `lib/content/parse-mdx-question.ts`
- **Database tables:** `db/schema.ts` (`questions`, `choices`, `tags`, `question_tags`)

### Pipeline Scripts

| Script | Command | What It Does |
|--------|---------|-------------|
| `scripts/import-draft-questions.ts` | `pnpm content:import:drafts` | Discovers `**/recall.md` + `**/vignettes.md` under `content/drafts/questions/`, splits multi-question blocks, converts each to one MDX file |
| `scripts/draft-question-import.ts` | (library, called by above) | Parses draft YAML (`DraftFrontmatterSchema`), expands tag slugs to `{slug, name, kind}` objects via `convertDraftQuestionToMdx()` |
| `scripts/seed.ts` | `pnpm db:seed` | Reads all `content/questions/**/*.mdx`, validates, and syncs each question in its own transaction: a new question is inserted with its first revision; changed content appends a revision with its own choices; status and tags update in place (ADR-021) |
| `scripts/seed-helpers.ts` | (library, called by seed) | Splits a terminal `### Reference` section from the explanation, and detects the legacy "Why other answers are wrong" section, which the seed refuses (per-choice explanations come from each frontmatter choice's `explanation`) |
| `lib/content/draft-taxonomy.ts` | (library, called by import) | Canonical slug lists + display name maps for topics, substances, treatments |
| `lib/content/schemas.ts` | (library, called by import + seed) | Zod schemas for MDX frontmatter validation |
| `lib/content/parse-mdx-question.ts` | (library, called by seed) | Extracts `## Stem` / `## Explanation` sections, canonicalizes markdown |

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
    explanation: "Why A is wrong"
  - label: "B"
    text: "Correct choice text"
    correct: true
  - label: "C"
    text: "Another wrong choice"
    correct: false
    explanation: "Why C is wrong"
  - label: "D"
    text: "Another wrong choice"
    correct: false
    explanation: "Why D is wrong"
---

## Stem

Question text with **Markdown** formatting.

## Explanation

General explanation of the correct answer.

**Clinical pearl:** Practical takeaway.

### Reference

Required citation for the explanation.
```

**Key points:**
- Labels are authored as A/B/C/D in canonical order in the YAML frontmatter
- Exactly 1 `correct: true` choice per question (enforced by Zod validation)
- Standard: 4 choices (schema allows 2-5, but all 958 files use 4)
- The `## Stem` and `## Explanation` sections are mandatory
- Each wrong choice carries its own `explanation` in the frontmatter, and the correct choice carries none (enforced by `QuestionFrontmatterSchema`)
- A nonempty terminal `### Reference` section in the explanation is required and becomes the question's reference. Only the synthetic placeholder fixtures (a `placeholder-` QID in `content/questions/placeholder/`) may omit it
- The legacy "Why other answers are wrong" section in the explanation is refused by the seed

**Validation schema:** `lib/content/schemas.ts` — `QuestionFrontmatterSchema` (Zod)

### Draft Format (Authoring)

Draft question sets live under `content/drafts/questions/**` and are imported from files named `recall.md` and `vignettes.md` (the importer scans only these filenames). Each file contains multiple question blocks. Each block:

- Starts with YAML frontmatter containing `qid`, `type`, `difficulty`, `substances`, `topics`, `source`, and `answer`
  - Optional: `treatments[]`, `diagnoses[]` for more specific tagging (mapped to MDX `kind: treatment|diagnosis`)
- Uses headings in this order: `## Question` (or `## Stem`), `## Choices`, `## Explanation`
- Must begin with `---` then `qid:` on the next line (`splitDraftQuestionsFile()` looks for `^---\\nqid:`)

Notes:
- Draft `substances[]` and `topics[]` are validated against the canonical taxonomy in `lib/content/draft-taxonomy.ts`.
- All draft tag slugs must be **kebab-case** (`lowercase-with-dashes`).

### Import Drafts → MDX (Generated)

Use a fresh directory **outside `content/questions/`** so the seed glob cannot
read a staging bundle while it is being generated or reviewed:

```bash
CONTENT_STAGE_DIR="$(mktemp -d)"
# Validate input and path boundaries without writing:
pnpm content:import:drafts -- --out "$CONTENT_STAGE_DIR" --dry-run
# Generate the complete staged bundle (default status: draft):
pnpm content:import:drafts -- --out "$CONTENT_STAGE_DIR"
```

The importer accepts an absent or empty output directory. A populated output
root is refused before actual writes, preserving existing files. Dry-run remains
input/body/identity and path/symlink validation: it may inspect a populated output
root without changing it, but does **not** certify that the destination is ready
for a write. Each new import needs a fresh destination, including after a failed filesystem
write. The defaults remain input `content/drafts/questions`, output
`content/questions/imported`, and status `draft`; use `--out` as above for staging.

Review the complete staged artifact before a separate, deliberate placement of
approved MDX under `content/questions/`. The importer does not activate or swap
that tree, delete old output, withdraw database rows, or run seed. Preserve the
current imported tree while generating and checking its replacement. A failed
write can leave an incomplete **staging** directory; successful parsing alone is
not a completed artifact. No atomic release/rollback interface is provided here.
See [DEBT-483](../debt/debt-483-content-withdrawal-and-release-rollback.md).

The managed environment seed (`pnpm db:seed:all`) follows the same boundary through
`scripts/prepare-seed-corpus.ts`. It imports into a fresh `content/.import-staging-*`
directory, outside the seed glob, and replaces `content/questions/imported/` only
after the whole import succeeds, with two directory renames. A failed import leaves
the current imported tree unchanged. If the final rename fails, the previous tree is
restored. If restoring it also fails, it is not restored: it stays at the parked
`content/.import-previous-*/imported` path that the error names, and the operator
recovers it from there. This closes the delete-before-regenerate window. It is not a database
release: seed still commits per question.

The `--status published` flag changes generated frontmatter only; it does not
approve content or publish it to the database. Choose the intended status during
the approved generation step, using a new empty destination for each bundle.

Notes:
- Imported MDX files are generated from drafts by a deterministic canonical taxonomy path (no domain repair pass).
- Complete input, identity, body and output-boundary preflight runs before writes.

---

## 4. Seeding (Content → Database)

**Script:** `scripts/seed.ts` — run via `pnpm db:seed`

### Pipeline

| Step | Code | What Happens |
|------|------|-------------|
| Discover | `fast-glob('content/questions/**/*.mdx')` | Finds all MDX files |
| Split | `gray-matter(raw)` → `{ data, content }` | Separates YAML frontmatter from body |
| Validate | `QuestionFrontmatterSchema.parse(data)` | Zod validates frontmatter structure |
| Extract | `parseMdxQuestionBody(content)` | `lib/content/parse-mdx-question.ts` — extracts text between `## Stem` and `## Explanation` headings |
| Parse explanations | `parseExplanationAndReference(explanationMd)` | `scripts/seed-helpers.ts` — splits the general explanation from a terminal `### Reference` section; per-choice explanations come from each frontmatter choice's `explanation` |
| Canonicalize | `canonicalizeMarkdown(text)` | `lib/content/parse-mdx-question.ts` — normalizes newlines, trims trailing whitespace |
| Compare | `canonicalQuestionRevisionJson(fields)` against the current revision's | Change detection: unchanged content is skipped; changed content appends a revision |
| Write | One transaction per question. A new question is inserted; there is no row to lock yet, so of two concurrent inserts the unique slug key refuses the second. An existing question's row is locked `FOR UPDATE` before changed content appends a revision and moves `current_revision_id`; status and tags update in place | Into PostgreSQL via Drizzle |

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

The app selects and shows new questions only when they are **published**: `DrizzleQuestionRepository`'s selection, count and public lookups include `questions.status = 'published'`. A learner's own session item or attempt resolves its bound revision whatever the status, and a withdrawn one is marked (ADR-021 §3). If you import drafts with the default `status=draft`, those questions will seed successfully but will not appear in `/app/practice` until you re-import as `published` (or edit the generated MDX status).

### Placeholder Questions

`content/questions/placeholder/` contains 10 committed templates for pipeline smoke-testing.

To exclude placeholders from your runtime database:

```bash
SEED_INCLUDE_PLACEHOLDERS=false pnpm db:seed
```

This excludes `content/questions/placeholder/**/*.mdx` from the seed input and archives only the ten committed fixture slugs listed in `scripts/seed/placeholder-archiver.ts`. An authored question is not synthetic merely because its slug starts with `placeholder-` (BUG-315).

### Withdrawing a Question

`scripts/seed/withdraw-questions.ts` withdraws questions by QID, the content slug. It needs an explicit `DATABASE_URL`, and a remote target also needs the exact `DB_TARGET_ACK`. Without `--apply` it is a dry run that reports the target, the QIDs and the counts.

```bash
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/seed/withdraw-questions.ts \
  --qid "example-qid" --reason "Why it is withdrawn" --authority "Who ordered it"
# Check the dry run's target, QIDs and counts, then repeat the command with --apply.
```

In one transaction, after locking the release pointer and then the question rows in ID order, it archives each question and records a withdrawal for every revision in `question_withdrawals` (migration `0045`), with the reason and authority. A revision already recorded keeps its first record.

A withdrawal is permanent. The seed refuses to restore a withdrawn question, and a corrected replacement takes a new QID. Archiving a question in MDX is a withdrawal too. Before a release is active, the seed records it with authority `content seed`. Once one is active, the seed refuses the database, and an `archived` file becomes a withdrawal only when the release that stages it is activated, with authority `content release` (see [Releases](#releases-bootstrap-stage-activate-roll-back-and-hold)). Only the synthetic placeholders are archived and restored without a record. A learner who attempted a withdrawn question can still review it, with a notice (ADR-021 §3).

### Releases: Bootstrap, Stage, Activate, Roll Back and Hold

ADR-021 phase 4's operator commands live in `scripts/content-release/`. Like the withdrawal command, each needs an explicit `DATABASE_URL`, and a remote target also needs `DB_TARGET_ACK`. Each is a dry run unless `--apply`; the dry run is the real transaction, rolled back.

```bash
# Adopt what is live as the first release (once). Preview it, then apply the plan it printed.
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/bootstrap-release.ts
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/bootstrap-release.ts \
  --plan "<plan-id>" --apply
# Stage the MDX bundle as a release on the active release. Every live question
# must appear in the bundle; name one whose file is absent on purpose with --remove.
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/stage-release.ts --apply
# Preview its activation: it prints the plan id, every question it archives,
# publishes or moves and withdraws, and the items a hold or withdrawal leaves out.
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/activate-release.ts \
  --release "<release-id>" --expect-active "<active-release-id>"
# Apply exactly the plan you reviewed. If anything changed since, nothing is applied.
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/activate-release.ts \
  --release "<release-id>" --expect-active "<active-release-id>" --plan "<plan-id>" --apply
# Roll back: preview and apply the earlier release the same way.
# Hold a question's live revision, or lift that hold with --lift.
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/hold-questions.ts \
  --qid "example-qid" --reason "Why" --authority "Who"
```

Once a release is active, the direct seed (`pnpm db:seed` and the managed seed) refuses that database, and content changes only through releases: stage, preview the activation, then apply its plan. **Bootstrapping production is the owner's decision**, because it changes how content is published ([DEBT-483](../debt/debt-483-content-withdrawal-and-release-rollback.md#the-release-builder-phase-4c-ii--2026-10-01)).

**What a release removes ([DEBT-489](../debt/debt-489-release-removes-omitted-questions.md)).** A release accounts for every live question, meaning every member of the active release, held ones included:
- **A member stays** if its file is `published`.
- **A member leaves** only by a named removal: its file set to `draft` (until a release names it again), its file set to `archived` (a permanent withdrawal), or its QID given to `--remove`.
- **A withdrawn member** may be absent.
- **Staging refuses a bundle that leaves out any other member**, and names them, so a stale or partial content folder cannot remove questions silently. Activation repeats the check for any release never active before.

**Staging writes nothing a learner sees.** It writes drafts, revisions that do not become current, and the release. An `archived` file becomes a withdrawal only when its release is activated, so an abandoned release leaves no withdrawal behind. Tags are the exception: they are not versioned (ADR-021 decision 1), so a tag change takes effect when staged. Staging also refuses a withdrawn question and a bundle with no published file, and is one transaction.

**Applying is bound to the reviewed plan.** The plan id covers:
- the release and the release it replaces;
- every (question, revision) it publishes, unchanged ones included;
- every question it archives;
- every question it withdraws.

Activation recomputes the plan under its own locks and refuses a different one. A hold, a withdrawal or any other change between preview and apply therefore means a fresh preview. A rollback is previewed and applied the same way, and still honors current holds and withdrawals: a withdrawal is permanent.

A hold takes effect at once: it re-applies the active release, which archives the held question. A lift restores eligibility only if no question-wide withdrawal excludes the question; it records its own reason and authority. Both act only on the revision the active release publishes; a hold on any other revision stays until a release that names that revision is active. While no release is active, a hold would change nothing, so the command refuses; withdraw instead.

---

## 5. Database Storage

**Schema:** `db/schema.ts`

**Questions table:** Stores a question's identity (`slug`) and `status`, and `currentRevisionId`, the revision new practice shows (ADR-021).

**Question revisions table:** Stores the content a learner reads, as raw markdown: `stemMd`, `explanationMd`, `referenceMd`, plus `difficulty` and the `stored-fields-json-v1` content hash. A revision is never updated; changed content is a new revision (migration `0042`). Attempts and session items bind the revision they were shown and graded against (`NOT NULL` since migration `0043`).

**Question withdrawals table:** One row per withdrawn revision: `(questionId, questionRevisionId)`, with the `reason`, the `authority` that ordered it and `effectiveAt` (migration `0045`). Every revision of a withdrawn question has a row. Activation excludes a question with any recorded withdrawal, regardless of which revision its release names.

**Releases (ADR-021 phase 4b, migration `0047`):** `content_releases` holds an immutable, hash-addressed manifest, which names the release's items and every live question it removes (DEBT-489), and `content_release_items` holds its selectable set, one revision per question. `content_release_pointer` names the active release; until a release is activated it names none. `content_release_activations` keeps one receipt per activation. `question_holds` holds temporary holds, at most one unlifted per revision. Activation publishes each item unless its question is withdrawn or its revision is held, and archives every other published question. Once a release is active, the direct seed refuses to run. Operators bootstrap, stage, activate, roll back and hold with the commands under [Releases](#releases-bootstrap-stage-activate-roll-back-and-hold).

**Choices table:**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `questionId` | uuid FK | Parent question |
| `questionRevisionId` | uuid FK | The revision the choice belongs to (`NOT NULL` since `0043`) |
| `label` | varchar(4) | Canonical authored label: A–E |
| `textMd` | text | Choice text (raw markdown) |
| `isCorrect` | boolean | Correctness flag |
| `explanationMd` | text (nullable) | Per-choice explanation, from the choice's frontmatter `explanation`; null for the correct choice |
| `sortOrder` | integer | Canonical ordering: 1=A, 2=B, 3=C, 4=D, 5=E |

**Unique constraints:** `(questionRevisionId, label)` and `(questionRevisionId, sortOrder)`: no duplicate labels or ordering within a revision. A newer revision may reuse its question's labels. A choice is never updated.

**Attempts table:** Stores `selectedChoiceId` (FK to choices), but does **not** store which shuffle order the user saw. The shuffle is deterministic and recomputed from `userId + questionId` at render time.

---

## 6. Query Layer

**Repository:** `src/adapters/repositories/drizzle-question-repository.ts`

The `toDomain()` method converts DB rows to domain entities:
- Validates each choice label with `isValidChoiceLabel()`
- **Sorts choices by `sortOrder` ascending** before returning them to the domain layer
- Returns choices in canonical/authored order: A(1), B(2), C(3), D(4), E(5) (when present)

The domain `Question` entity has `choices: Choice[]` always in this canonical order.

---

## 7. Choice Shuffling (Where It Happens)

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
| `getQuestionBySlug` controller | `src/adapters/controllers/question-view-controller.ts` | **Yes** — returns `choice.displayLabel` as `label` (added by SPEC-025) |
| `GetNextQuestionUseCase.mapChoicesForOutput()` | `src/application/use-cases/get-next-question.ts` | **Yes** — returns `choice.displayLabel` as `label` |
| `SubmitAnswerUseCase.mapChoiceExplanations()` | `src/application/use-cases/submit-answer.ts` | **Yes** — returns `choice.displayLabel` |
| `GetPreviousAttemptUseCase.execute()` | `src/application/use-cases/get-previous-attempt.ts` | **Yes** — returns `choice.displayLabel` |

All four callers produce **shuffled** labels for their outputs. This was unified by SPEC-025 (previously, `getQuestionBySlug` returned canonical labels).

---

## 8. Frontend Rendering

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

## 9. Controller Layer Shuffle (Formerly BS-011 Bug B — RESOLVED)

> **Status:** Fixed by SPEC-025 (Choice Label Desync Fix)

Previously, `getQuestionBySlug` returned choices with canonical DB labels (A–E in authored order) while use cases (`SubmitAnswer`, `GetPreviousAttempt`) returned shuffled `displayLabel` values. This caused letter label mismatches between the QuestionCard and Feedback components on the `/app/questions/[slug]` page.

### The fix (SPEC-025)

`getQuestionBySlug` now calls `buildShuffledChoiceViews(question, userId)` just like the use cases:

```typescript
// src/adapters/controllers/question-view-controller.ts
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

## 10. Summary Table

| Step | Location | Input | Output | Labels |
|------|----------|-------|--------|--------|
| **Author** | `content/questions/**/*.mdx` | Human writes | YAML + Markdown | A–E (canonical) |
| **Validate** | `lib/content/schemas.ts` | Frontmatter | Parsed + validated | Preserved |
| **Extract** | `lib/content/parse-mdx-question.ts` | MDX body | `stemMd`, `explanationMd` | N/A (body text) |
| **Split reference** | `scripts/seed-helpers.ts` | Explanation markdown | General explanation + reference | N/A (per-choice explanations come from frontmatter) |
| **Canonicalize** | `lib/content/parse-mdx-question.ts` | Raw markdown | Normalized markdown | Preserved |
| **Seed to DB** | `scripts/seed.ts` | Canonical repr | DB rows | A=sortOrder 1, B=2, etc. |
| **Query** | `drizzle-question-repository.ts` | DB rows | Domain entity | Sorted by sortOrder (A–E) |
| **Shuffle** | `shuffled-choice-views.ts` | Domain entity + userId | Shuffled views | **New displayLabels** by position |
| **Question Card** | `question-card.tsx` | Props from controller | Rendered choices | Whatever labels received |
| **Feedback Card** | `feedback.tsx` | Props from use case output | Rendered explanations | Whatever labels received |

---

## 11. Resolved Bugs in This Pipeline

Both bugs identified during the BS-011 audit have been fixed:

| Bug | Fix | Reference |
|-----|-----|-----------|
| **Bug B: Choice label desync** | `getQuestionBySlug` now calls `buildShuffledChoiceViews()` — all paths produce consistent shuffled labels | SPEC-025 |
| **Bug A: Result-dependent `mode=review` wiring** | History Questions tab now routes all rows through `mode=review` consistently, regardless of result | SPEC-026 |

That conclusion applied to the 2026-03-17 audit. The historical-identity gap is
closed: question revisions and history binding shipped under
[DEBT-484](../_archive/debt/debt-484-question-rewrite-history-identity.md), resolved 2026-09-30.
Current withdrawal and release gaps remain tracked in
[DEBT-483](../debt/debt-483-content-withdrawal-and-release-rollback.md).

---

## 12. Dependencies (Content Processing)

| Package | Version | Purpose |
|---------|---------|---------|
| `gray-matter` | ^4.0.3 | YAML frontmatter parsing at seed time |
| `fast-glob` | ^3.3.3 | File discovery at seed time |
| `react-markdown` | ^10.1.0 | Client-side markdown → HTML at view time |
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown tables, strikethrough, etc. |
| `rehype-sanitize` | ^6.0.0 | HTML sanitization (XSS prevention) |

**There is no contentlayer, next-mdx-remote, velite, or similar framework.** The pipeline is fully custom: YAML+Markdown files → seed script → database → client-side react-markdown.

---

## 13. Operations: Seeding (Local, Test DB)

Recommended end-to-end sanity check:

```bash
pnpm db:test:reset
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate
# Prerequisite: approved MDX is already placed under content/questions/.
# Generate/review replacements separately using the clean-staging procedure above.
SEED_INCLUDE_PLACEHOLDERS=false DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed
pnpm dev
```

The test DB host port is per-clone (resolved by `scripts/resolve-local-test-target.ts`); never hardcode `localhost:5434`. See `docs/dev/integration-tests.md`.

---

## 14. Operations: Seeding (Staging / Production)

Seeding requires two things:

1. Access to the target DB (`DATABASE_URL`)
2. Access to the question MDX files on disk (`content/questions/**/*.mdx`)

Because real content is gitignored, you must ensure the environment running `pnpm db:seed` has the MDX files available (for example, by syncing from a private content repo, or running the seed from your local machine against the remote database).

Before seeding, ensure the target database schema is up to date:

```bash
DATABASE_URL="<target-db-url>" pnpm db:migrate
```

The seed refuses a database with an active content release (ADR-021 phase 4b). Once a release is active, content changes only through releases: see [Releases](#releases-bootstrap-stage-activate-roll-back-and-hold). No database has one yet, and bootstrapping production is the owner's decision ([DEBT-483](../debt/debt-483-content-withdrawal-and-release-rollback.md#releases-and-activation-phase-4b--2026-10-01)).

---

## 15. When to Reseed

Re-run `pnpm db:seed` whenever the database's question/tag data may be out of sync with the MDX source files, as long as no content release is active there. Once one is, the seed refuses that database: stage a release, preview its activation and apply its plan instead (see [Releases](#releases-bootstrap-stage-activate-roll-back-and-hold)). Common triggers:

| Trigger | Why Reseed Is Needed |
|---------|---------------------|
| **After `pnpm db:migrate`** (schema changes) | Migrations may alter enums or constraints that require fresh data insertion. |
| **After MDX content changes** (new questions, updated tags, edited frontmatter) | The seed script is the only path from MDX files to database rows. |
| **After tag taxonomy changes** (SPEC-033, renamed slugs, new kinds) | Taxonomy migrations include tag data cleanup (see SPEC-033 §14). Run `pnpm db:migrate` first, then `pnpm db:seed`. |
| **After switching Neon branches** | Different branches may have different data states. |
| **After `pnpm db:test:reset`** | Test DB is wiped; seed restores content. |

**Important:** The seed is **not** automatically run by Vercel, CI, or `pnpm db:migrate`. It is always a manual operator step. See `docs/dev/deployment-procedure.md` for the full deployment flow.

---

## 16. Seed Idempotency and Multi-Clone Safety

The seed script is idempotent: running it again with the same MDX content skips every unchanged question and writes nothing.

**Important:** By default, every `pnpm db:seed` run against a database with no active content release also archives the ten committed placeholder fixtures, by exact QID, unless `SEED_INCLUDE_PLACEHOLDERS=true`. An authored question whose QID merely starts with `placeholder-` is left alone (BUG-315). That placeholder archival is a deliberate side effect of every such run. Once a release is active, the seed refuses the database before it archives anything.

### How it works

1. **Slug is the identity key.** Each question is looked up by `slug`. If the slug exists, the question is compared; if not, it's inserted with revision 1.
2. **Canonical comparison with the current revision.** The seed locks the question and compares the file's canonical content with the question's current revision, canonicalized the same way. If the content, status and tags all match, the question is **skipped entirely**: no writes, no `updatedAt` bump.
3. **Changed content is appended, never updated** (ADR-021 phase 2b). A changed stem, explanation, reference, difficulty, choice or answer key becomes a new revision with its own choice rows, and the question's current revision moves to it. Earlier attempts and sessions keep the revision they answered. Status and tags change in place.
4. **Tags are upserted** via `upsertTags()`: existing tags are reused by slug, and a tag whose name or kind differs is refused.

### What this means for multiple clones

You may have multiple local clones of the repo (e.g., `naltrexone-university`, `naltrexone-university-2`, `naltrexone-university-3`), each with their own copy of the draft questions. This is safe:

| Scenario | Result |
|----------|--------|
| Seed same questions from two different clones against the same DB | All questions **skipped** on the second run (content matches). Zero DB writes. |
| Seed from clone A, edit a question's content in clone B, seed from clone B | Only that question gains a **new revision**. Everything else skipped. |
| Seed from clone B after changing only a question's status or tags | That question's status or tags change **in place**, with no new revision. |
| Seed from different clones against different DBs (dev vs prod) | Each DB gets its own independent copy. No cross-contamination. |

**The only risk:** If clone A has an *older* set of imported MDX files and you seed from it *after* seeding from clone B with newer content, the older files win:
- **Content** (stem, explanation, reference, difficulty, choices or answer key) is appended as a **new current revision**. Learners who saw the newer version get an update notice. The seed counts it under both `updated` and `new revisions`.
- **Status and tags** change **in place**, with no revision. A stale status can change what learners see: a question that is `published` in B but `draft` in A disappears from new practice. (The seed refuses to reactivate an archived question.) The seed counts these under `updated` only.

So `updated` greater than `new revisions` means metadata changed. Check `status` before seeding from any clone but the newest.

**Import procedure:** generate a fresh staged bundle from the intended draft version using [Import Drafts → MDX](#import-drafts--mdx-generated), review it, and separately place the approved artifact before seeding. A fresh directory prevents stale generated files from joining the new bundle; it does not prove release freshness or authorize a rollback.

### What about placeholders?

By default, `pnpm db:seed` **excludes** placeholder questions and, while no content release is active, archives the ten committed fixtures' rows in the DB, by exact QID (BUG-315). This is intentional — placeholders are templates, not production content. To include them (e.g., for CI): `SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed`.

---

## 17. Import Script Behavior

### What `pnpm content:import:drafts` does

- Scans `content/drafts/questions/` for files named `recall.md` and `vignettes.md`
- Splits multi-question blocks within each file into individual questions
- Validates tag slugs against the canonical taxonomy in `lib/content/draft-taxonomy.ts`
- Requires an absent or empty output root (`--out`) before actual writes
- Writes one `.mdx` file per question into that fresh output tree

### What it does NOT do

- **Does not prune or merge existing output.** A populated destination is refused for actual writes. Generate into a fresh temporary directory outside `content/questions/` and preserve the current imported tree during review. Removing a draft does not withdraw its database row; withdraw it explicitly, as [Withdrawing a Question](#withdrawing-a-question) describes.
- **Does not touch the database.** Import is a local file operation only. You must run `pnpm db:seed` separately.
- **Does not read from `content/questions/`.** It reads drafts and writes MDX. The seed reads MDX.

### Dry-run mode

Validate input/body/identity and path/symlink boundaries without writing files.
A populated destination is allowed for this read-only check; success does not
certify the empty-destination prerequisite for a later write:

```bash
CONTENT_STAGE_DIR="$(mktemp -d)"
pnpm content:import:drafts -- --out "$CONTENT_STAGE_DIR" --dry-run
```

### Status flag

Controls the `status` field in generated MDX frontmatter:

```bash
# Choose one status per newly created staging directory:
CONTENT_STAGE_DIR="$(mktemp -d)"
pnpm content:import:drafts -- --out "$CONTENT_STAGE_DIR" --status draft
# An approved published-status artifact also needs its own fresh destination:
# pnpm content:import:drafts -- --out "$ANOTHER_EMPTY_STAGE_DIR" --status published
```

---

## 18. Troubleshooting

### Practice shows "Internal error" on Start session / Submit

This usually means the database is missing newer tables required by server actions (for example `rate_limits` or `idempotency_keys`).

Fix:

```bash
pnpm db:migrate
```
