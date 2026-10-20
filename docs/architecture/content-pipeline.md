# Practice Engine: Content Pipeline (Authored Content → Rendered UI)

> **Parent:** [Documentation map](../README.md)
> **Scope:** Full end-to-end trace from authored MDX files through seeding, database, shuffling, and UI rendering

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
│    content/questions/**/*.mdx (canonical question format)  │
├───────────────────────────────────────────────────────────────────────┤
│ 2. SEEDING                                                            │
│    pnpm db:seed                                                       │
│    front matter → Zod validation → section extraction → canonicalize  │
│    → compare with current revision → append a revision if changed      │
├───────────────────────────────────────────────────────────────────────┤
│ 3. DATABASE STORAGE                                                   │
│    questions (slug, status, currentRevisionId)                        │
│    question_revisions (stemMd, explanationMd, referenceMd, difficulty)│
│    choices (revision, label, textMd, isCorrect, explanationMd, order) │
│    tags, question_tags                                                │
│    Normalized markdown — no HTML compilation at rest            │
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
│    React renders markdown → HTML                           │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Content Directory Quick Reference

### Which directory feeds production?

**The bare seed (`pnpm db:seed`) reads non-hidden `content/questions/**/*.mdx`.** It does not import drafts. The managed production seed first imports `content/drafts/questions` as published content, then invokes the bare seed. Once a release is active, both seeds refuse that database; staging reads an archived commit of the content repository's `main` instead.

### How the three directories relate

```text
content/drafts/questions/**/*.md       YOUR WORKSPACE (raw authoring, gitignored)
        │                              Managed seeding imports this directory.
        │                              The bare seed does not read it directly.
        │
        │  pnpm content:import:drafts  (explicit command or environment-seed preparation)
        │  Validates tags against canonical taxonomy, expands slugs to
        │  {slug, name, kind} objects, splits multi-Q files into 1 MDX each.
        ▼
content/questions/imported/**/*.mdx    GENERATED OUTPUT (gitignored)
        │                              One MDX file per question.
        │                              Derived from drafts — do not hand-edit.
        │
        │  pnpm db:seed                (explicit command or environment-seed preparation)
        │  Reads non-hidden MDX, validates, and syncs to the DB.
        ▼
PostgreSQL (questions, choices, tags, question_tags)
```

### What about `content/questions/placeholder/`?

10 hand-written example MDXs committed to the repo so the app works out of the box. By default, `pnpm db:seed` **excludes them** and, while no content release is active, archives the ten fixtures' rows by exact QID. They're templates, not production content.

To include them in a test database: `pnpm db:seed --include-placeholders`. The environment seeds (`db:seed:prod`, `db:seed:all`) never include them (BUG-353).

### Can I modify drafts freely?

Editing drafts does not write the database. A manual import followed by the bare seed can publish those edits; the managed production seed performs the import automatically. After bootstrap, neither path can seed that database. Commit-bound release staging ignores the app's draft and imported folders.

### Where do tag display names come from?

You author slugs in draft YAML (`topics: [pharmacology-neuroscience]`). The import script looks up display names from `lib/content/draft-taxonomy.ts` (`"Pharmacology & Neuroscience"`). You never need to write display names in drafts.

---

## 3. Content Authoring

### Sources of Truth

- **Draft question format:** `content/drafts/questions/SCHEMA.md`, mirrored from the content repository, where it is edited (this copy carries corrections from 2026-10-18 still to be applied there); the importer's schema (`scripts/draft-question-import.ts`) and `lib/content/schemas.ts` decide what is accepted
- **Canonical tag taxonomy:** `lib/content/draft-taxonomy.ts` (code), `docs/product/content-taxonomy.md` (reference)
- **Schema enforcement (code):** `lib/content/schemas.ts`, `lib/content/parse-mdx-question.ts`
- **Database tables:** `db/schema.ts` (`questions`, `choices`, `tags`, `question_tags`)

### Importer Checks

These boundaries are enforced by the importer and its output parser:

- `source` must be a kebab-case identifier, not just non-empty (`scripts/draft-question-import.ts`).
- A QID may appear only once across the imported files; a duplicate stops the import (`scripts/import-draft-questions.ts`).
- Every question except the synthetic seed fixtures needs a nonempty terminal Reference (`scripts/seed/question-parser.ts`).
- Choice labels must be unique within a question, but their order is not enforced (`lib/content/schemas.ts`).
- A diagnosis tag's display name is its slug in title case, for example `opioid-use-disorder` becomes "Opioid Use Disorder" (`diagnosisDisplayNameFromSlug`).

### Pipeline Scripts

| Script | Command | What It Does |
|--------|---------|-------------|
| `scripts/import-draft-questions.ts` | `pnpm content:import:drafts` | Discovers `**/recall.md` + `**/vignettes.md` under `content/drafts/questions/`, splits multi-question blocks, converts each to one MDX file |
| `scripts/draft-question-import.ts` | (library, called by above) | Parses draft YAML (`DraftFrontmatterSchema`), expands tag slugs to `{slug, name, kind}` objects via `convertDraftQuestionToMdx()` |
| `scripts/seed.ts` | `pnpm db:seed` | Reads non-hidden `content/questions/**/*.mdx`, validates, and syncs each question in its own transaction: a new question is inserted with its first revision; changed content appends a revision with its own choices; status and tags update in place (ADR-021) |
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

Each `.mdx` file = YAML frontmatter + Markdown body. This schematic uses `|` to show alternatives; a real file chooses one value and includes both topic and substance tags:

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
- Authoring convention: 4 choices; the schema accepts 2–5. No current private-corpus count is asserted here
- The `## Stem` and `## Explanation` sections are mandatory
- Each wrong choice carries its own `explanation` in the frontmatter, and the correct choice carries none (enforced by `QuestionFrontmatterSchema`)
- A nonempty terminal `### Reference` section in the explanation is required and becomes the question's reference. Only the synthetic placeholder fixtures (a `placeholder-` QID in `content/questions/placeholder/`) may omit it
- The legacy "Why other answers are wrong" section in the explanation is refused by the seed

**Validation schema:** `lib/content/schemas.ts` — `QuestionFrontmatterSchema` (Zod)

### Draft Format (Authoring)

Draft question sets live under `content/drafts/questions/**` and are imported from files named `recall.md` and `vignettes.md` (the importer scans only these filenames). Each file contains multiple question blocks. Each block:

- Starts with YAML frontmatter containing `qid`, `type`, `difficulty`, `substances`, `topics`, `source`, and `choices[]`
  - `choices[]`: two to five, each with a unique `label` A–E, `text` and `correct`; exactly one is correct, and each wrong choice, and only a wrong one, carries an `explanation`
  - Optional: `treatments[]`, `diagnoses[]` for more specific tagging (mapped to MDX `kind: treatment|diagnosis`)
- Uses headings in this order: `## Question` (or `## Stem`), then `## Explanation`; a `## Choices` heading is rejected, since the choices live in the frontmatter
- Must begin with `---` then `qid:` on the next line (the line-based `splitDraftQuestionsFile()` checks that next line explicitly)

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
See DEBT-483.

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
| Discover | `glob('content/questions/**/*.mdx')` (`tinyglobby`) | Finds non-hidden MDX files; placeholder filtering follows the explicit flag |
| Split | `matter(raw)` (`@11ty/gray-matter`) → `{ data, content }` | Separates YAML frontmatter from body |
| Validate | `QuestionFrontmatterSchema.parse(data)` | Zod validates frontmatter structure |
| Extract | `parseMdxQuestionBody(content)` | `lib/content/parse-mdx-question.ts` — extracts text between `## Stem` and `## Explanation` headings |
| Parse explanations | `parseExplanationAndReference(explanationMd)` | `scripts/seed-helpers.ts` — splits the general explanation from a terminal `### Reference` section; per-choice explanations come from each frontmatter choice's `explanation` |
| Canonicalize | `canonicalizeMarkdown(text)` | `lib/content/parse-mdx-question.ts` — normalizes newlines, trims trailing whitespace |
| Compare | `canonicalQuestionRevisionJson(fields)` against the current revision's | Change detection: unchanged content is skipped; changed content appends a revision |
| Write | One transaction per question. A new question is inserted; there is no row to lock yet, so of two concurrent inserts the unique slug key refuses the second. The transaction takes the release pointer, then locks the existing question's row `FOR NO KEY UPDATE`, before changed content appends a revision and moves `current_revision_id`; status and tags update in place | Into PostgreSQL via Drizzle |

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

`sortOrder` is the one-based position among the labels present, sorted alphabetically, independent of YAML array order. Contiguous A–D becomes 1–4; sparse B/E becomes 1/2, not 2/5.

### Publishing Rule

The app selects and shows new questions only when they are **published**: `DrizzleQuestionRepository`'s selection, count and public lookups include `questions.status = 'published'`. A learner's own session item or attempt resolves its bound revision whatever the status. A question no longer published is labeled by its state, derived from its status, its withdrawals and its unlifted holds: withdrawn, under review or retired ([ADR-022](../adr/adr-022-learner-scores-and-labels-when-content-changes.md), implemented by DEBT-493). If you import drafts with the default `status=draft`, those questions will seed successfully but will not appear in `/app/practice` until an approved published-status bundle is imported and seeded, or activated after release bootstrap. Regenerate into a fresh destination; do not hand-edit generated MDX.

### Placeholder Questions

`content/questions/placeholder/` contains 10 committed templates for pipeline smoke-testing.

To exclude placeholders from your runtime database, seed without `--include-placeholders`:

```bash
pnpm db:seed
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

A withdrawal is permanent. The seed refuses to restore a withdrawn question, and a corrected replacement takes a new QID. Archiving a question in MDX is a withdrawal too. Before a release is active, the seed records it with authority `content seed`. Once one is active, the seed refuses the database, and a question staged with `--archive` becomes a withdrawal only when the release that stages it is activated, with that activation's authority and a reason naming the release (see [Releases](#releases-bootstrap-stage-activate-roll-back-and-hold)). Only the synthetic placeholders are archived and restored without a record. A learner who answered a withdrawn question can still review it, with a notice (ADR-021 §3, as ADR-022 Decision 2 sharpens it: an exam item left unanswered and finalized as omitted is not an answer, so it reveals nothing).

### Releases: Bootstrap, Stage, Activate, Roll Back and Hold

ADR-021 phase 4's operator commands live in `scripts/content-release/`. Like the withdrawal command, each needs an explicit `DATABASE_URL`, and a remote target also needs `DB_TARGET_ACK`. Each is a dry run unless `--apply`; the dry run is the real transaction, rolled back.

```bash
# Adopt what is live as the first release (once). Preview it, then apply the plan it printed.
# Every bootstrap and activation names why, and on whose authority (DEBT-490).
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/bootstrap-release.ts \
  --reason "Why" --authority "Who"
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/bootstrap-release.ts \
  --reason "Why" --authority "Who" --plan "<plan-id>" --apply
# Stage the selected commit of the content repository main as a release. Every question the
# active release names must appear in the bundle unless it is withdrawn; name
# one whose file is absent on purpose with --remove, and one whose file moves
# it back to an earlier revision on purpose with --revert. The first release
# after the bootstrap also names, with --baseline, the full commit ID the
# owner's live-key check compared, as recorded in BUG-351. The command trusts
# that ID, so copy it from the record, never from memory.
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/stage-release.ts \
  --repo "$CONTENT_REPOSITORY" --commit "<full-commit-id>" --apply
# Preview its activation: it prints the plan id, every question it archives,
# publishes, updates, reverts or withdraws, any that replace a held revision,
# and the items a hold or withdrawal leaves out.
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/activate-release.ts \
  --repo "$CONTENT_REPOSITORY" --release "<release-id>" --expect-active "<active-release-id>" --reason "Why" --authority "Who"
# A plan that returns a question to an earlier answer key needs --revert <qid>
# for each such question, at staging and at activation (BUG-351).
# Apply exactly the plan you reviewed. If the plan has changed since, nothing is applied.
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/activate-release.ts \
  --repo "$CONTENT_REPOSITORY" --release "<release-id>" --expect-active "<active-release-id>" --reason "Why" --authority "Who" \
  --plan "<plan-id>" --apply
# Roll back: preview and apply a previously activated release the same way; --repo is optional.
# Hold a question's live revision, or lift that hold with --lift. A lift that
# returns a question to an earlier answer key needs --revert too.
DATABASE_URL="$TARGET_DATABASE_URL" pnpm exec tsx scripts/content-release/hold-questions.ts \
  --qid "example-qid" --reason "Why" --authority "Who"
```

Once a release is active, the direct seed (`pnpm db:seed` and the managed seed) refuses that database, and authored content changes only through releases: stage, preview the activation, then apply its plan. Withdrawals and holds still act directly, with their own commands. **Bootstrapping production is the owner's decision**, because it changes how content is published (DEBT-483).

**Read-only live-key comparison (BUG-351).** Before the bootstrap, the owner compares production's published current answer keys with one commit of the content repository's `main`: with an explicit authorized `DATABASE_URL`, `pnpm exec tsx scripts/content-release/compare-live-keys.ts --repo "$CONTENT_REPOSITORY" --commit "<full-commit-id>"`. It reads the commit through the same archive reader and parser as staging, compares each correct choice's label and normalized text as the release planner does, and prints only counts and the commit. Record that full commit ID in BUG-351: the first release after the bootstrap names it as `--baseline`.

**Source admission (BUG-351).** Supply the intended content repository with its current local `main` reference and a full commit ID. Staging archives that commit and converts its tracked `recall.md` and `vignettes.md` files under `questions/`, the content repository's authoring root, with the app's parser; a copy elsewhere, such as a backup or an artifact, is ignored, and a question ID that appears in two files is refused. It does not read mutable checkout files, app drafts or imported MDX, and it does not execute content-repository code. Unlisted source questions default to published; use `--draft <qid>` or `--archive <qid>` for explicit dispositions. Each name must occur in the commit and may have only one disposition. A `--draft` holds only for the release that names it: the next stage publishes the question again unless it repeats `--draft`.

The v5 manifest binds the commit to the release and its activation plan. Git's first-parent history is read before the transaction; under the release-pointer lock, staging and first activation require the commit to equal or follow the watermark on `main`'s first-parent chain. An older commit or a merged side-branch commit is refused. Bootstrap does not establish the watermark or prove the adopted bank's source, so the first sourced stage after it names `--baseline <commit>`, the commit the owner verified against live content. Its source must be that commit or a later one, and it initializes the watermark. Once a watermark exists, `--baseline` is refused. Git runs without the repository-local variables a hook exports, such as `GIT_DIR`. Previews and failed operations leave it unchanged. A later stage can make an earlier staged release inadmissible. Rollback and hold reapplication never lower it. A release with no source commit may be used by the ordinary activation command only if it was activated before; bootstrap retains its separate, unchanged path. A rewritten main that drops the watermark requires an owner decision.

**What a release removes (DEBT-489).** A new release, one never active before, accounts for every live question, meaning every member of the active release, held ones included:
- **A member stays in the release** if its source question has no draft or archive disposition.
- **A member leaves** only by a named removal: `--draft <qid>` (until a release names it again), `--archive <qid>` (a permanent withdrawal), or its QID given to `--remove` (like `draft`, reversible: a later release that includes its file publishes it again). Use `--archive`, or the withdrawal command, for content that must never return.
- **A withdrawn member** may be absent.
- **Staging refuses a bundle that leaves out any other member**, and names them, so a stale or partial content folder cannot remove questions silently. Activation repeats the check for any release never active before.
- **A revert is named (DEBT-492).** A file whose content matches only an earlier revision, not the current one, moves its question *back* to that revision, which can undo an answer-key correction. Staging refuses that unless the question is named with `--revert <qid>`. The plan lists it under "Revert to an earlier revision", apart from "Publish" (not live now) and "Update to a newer revision". A rollback restores earlier revisions by definition, so a content revert alone does not refuse it; its plan names each revert, and it also archives questions added since.
- **A return to an earlier answer key is named (BUG-351).** The stage and activation previews list answer-key changes apart from other changes. A change whose key equals one this database once had live needs `--revert <qid>` at staging and at activation, with the activation's reason and authority. "Once live" means a revision in an activated release, or one of the pre-bootstrap revisions the bootstrap froze in its manifest. A rollback and a hold lift publish through activation, so they need the name too.

**Staging writes nothing a learner sees.** It writes drafts, revisions that do not become current, and the release. It locks only the release pointer, not question rows, so learners can start sessions while a stage runs (DEBT-492). An archive disposition becomes a withdrawal only when its release is activated, so an abandoned release leaves no withdrawal behind. Tags are the exception: they are not versioned (ADR-021 decision 1), so a tag change takes effect when staged. Staging also refuses to revive a withdrawn question (its source question may only keep an archive disposition) and refuses a bundle with no published file, and is one transaction.

**Applying is bound to the reviewed plan.** The plan id covers:
- the release, including its source commit, and the release it replaces;
- every (question, revision) it publishes, unchanged ones included;
- every question it archives;
- every question it withdraws;
- its answer-key changes, and its returns to an earlier key (BUG-351).

Activation recomputes the plan under its own locks and refuses a different one. So a hold, a withdrawal, a lift, or anything else between preview and apply that changes one of those sets means a fresh preview. Tags are outside the plan: they are not versioned, so a tag change does not change it. A rollback is previewed and applied the same way, and still honors current holds and withdrawals: a withdrawal is permanent.

**Every activation is attributed (DEBT-490).**
- **The receipt.** An activation, a rollback and the bootstrap each record their `--reason` and `--authority` on an immutable receipt, as the withdrawal and hold commands record theirs.
- **Withdrawals.** A withdrawal made by an `archived` removal records the activation's authority, and its reason names the release.
- **Holds.** A hold's or a lift's re-application of the active release records the hold's own decision.
- **The plan.** The plan id does not include the decision, so the same transition keeps the same plan whatever its reason.

A hold takes effect at once: it re-applies the active release, which archives the held question. A lift restores eligibility only if no question-wide withdrawal excludes the question; it records its own reason and authority. With `--qid`, both target the revision the active release names. To lift an old hold directly, use `--lift --hold '<hold-id>'` instead of `--qid`, with the reason and authority; repeat `--hold` for each specific hold. Find the IDs of unlifted holds read-only: `select h.id, q.slug, h.reason, h.placed_at from question_holds h join questions q on q.id = h.question_id where h.lifted_at is null order by h.placed_at`. A dry run is the default. A named lift affects only that hold, even if a later hold names the same revision. **A hold binds the revision, not the question:** a release that names a *different* revision of a held question publishes it, and its plan names it under "Replaces a held revision" (DEBT-492). To keep a question out whatever its content, withdraw it. Holds and lifts re-apply the active release without a plan check; their preview prints counts. While no release is active, a hold would change nothing, so the command refuses. To take a question out temporarily before the bootstrap, set its file to `draft` and seed; withdraw only if it must never return.

An unpublished question with any unlifted hold remains **Under review** and out of scores, even after retirement. A published replacement is available without lifting the old hold. Lifting the last hold on an omitted question changes its label to **Retired** without publishing it; withdrawals still win. Past scores then follow the fair-chance and key-correction rules (ADR-022). A named lift passes through the same answer-key-return guard as a live-revision lift.

**Read-only normalization census.** With an explicit authorized `DATABASE_URL`, run `pnpm exec tsx scripts/content-release/census-normalization.ts`. It accepts no flags and opens a read-only transaction. Its JSON contains only counts: revisions, choices, revisions with noncanonical fields, each of the five Markdown field types, and the correct-choice text subset. Optional empty strings are compared with the seed's `null`; whitespace-only strings follow its normalizer. No question identifiers, text or hashes are emitted. No stored field, hash or historical row is changed. Counts measure normalization differences, not clinical errors.

**Read-only key-return census (BUG-351).** With an explicit authorized `DATABASE_URL`, run `pnpm exec tsx scripts/content-release/census-key-returns.ts`. It accepts no flags and opens one read-only, repeatable-read transaction. It counts revisions whose answer key changed from the one before and matches an earlier revision's, comparing ADR-022's key: each correct choice's exact label and normalized text, through the same SQL normalization the score reads use. Its JSON contains only counts: candidate revisions, their questions, those that are published and current, attempts bound to them and answered, and revisions without exactly one correct choice. No question identifiers, text or hashes are emitted, and nothing is changed.

---

## 5. Database Storage

**Schema:** `db/schema.ts`

**Questions table:** Stores a question's identity (`slug`) and `status`, and `currentRevisionId`, the revision new practice shows (ADR-021).

**Question revisions table:** Stores the content a learner reads, as raw markdown: `stemMd`, `explanationMd`, `referenceMd`, plus `difficulty` and the `stored-fields-json-v1` content hash. A revision is never updated; changed content is a new revision (migration `0042`). Attempts and session items bind the revision they were shown and graded against (`NOT NULL` since migration `0043`).

**Question withdrawals table:** One row per withdrawn revision: `(questionId, questionRevisionId)`, with the `reason`, the `authority` that ordered it and `effectiveAt` (migration `0045`). Every revision of a withdrawn question has a row, except a revision staged after the withdrawal, which gets its row when its release is activated; selection is unaffected, because the check is question-wide. Activation excludes a question with any recorded withdrawal, regardless of which revision its release names.

**Releases (ADR-021 phase 4b, migration `0047`):** `content_releases` holds an immutable (UPDATE is rejected; DELETE is not, so this is not an authorization boundary), hash-addressed manifest, which names the release's items and every question it removes (DEBT-489): each live question left out, and every question staged with `--archive`, which activation withdraws, and `content_release_items` holds its selectable set, one revision per question. `content_release_pointer` names the active release; until a release is activated it names none. Since migration `0053` it also holds the source watermark, `source_commit` (BUG-351). `content_release_activations` keeps one immutable receipt per activation, with its reason and authority (migration `0049`). `question_holds` holds temporary holds, at most one unlifted per revision. Activation publishes each item unless its question is withdrawn or its revision is held, and archives every other published question. Once a release is active, the direct seed refuses to run. Operators bootstrap, stage, activate, roll back and hold with the commands under [Releases](#releases-bootstrap-stage-activate-roll-back-and-hold).

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
| `sortOrder` | integer | One-based position among sorted authored labels; sparse labels are allowed |

**Unique constraints:** `(questionRevisionId, label)` and `(questionRevisionId, sortOrder)`: no duplicate labels or ordering within a revision. A newer revision may reuse its question's labels. A choice is never updated.

**Attempts table:** Stores `selectedChoiceId` (FK to choices), but does **not** store which shuffle order the user saw. The shuffle is deterministic and recomputed from `userId + questionId` at render time.

---

## 6. Query Layer

**Repository:** `src/adapters/repositories/drizzle-question-repository.ts`

The `toDomain()` method converts DB rows to domain entities:
- Validates each choice label with `isValidChoiceLabel()`
- **Sorts choices by `sortOrder` ascending** before returning them to the domain layer
- Returns choices in stored canonical order; the seed assigns one-based positions among the labels present

The domain `Question` entity has `choices: Choice[]` always in this canonical order.

---

## 7. Choice Shuffling (Where It Happens)

**Shuffle service:** `src/domain/services/shuffle.ts`

- `createQuestionSeed(userId, questionId)` → deterministic numeric seed via `hashString("userId:questionId")`
- `shuffleWithSeed(items, seed)` → Fisher-Yates shuffle with Mulberry32 PRNG
- Same user + same question = same shuffle every time. Different users can see different orders; seeds and permutations can collide.

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
| `GetCompletedSessionQuestionsWithFeedbackUseCase` | `src/application/use-cases/get-completed-session-questions-with-feedback.ts` | **Yes** — returns shuffled choice explanations |

All listed callers produce **shuffled** labels for their outputs. This was unified by SPEC-025 (previously, `getQuestionBySlug` returned canonical labels).

---

## 8. Frontend Rendering

**Markdown rendering:** `components/markdown/markdown.tsx`
- Uses `react-markdown` with `remark-gfm` (GitHub Flavored Markdown) and `rehype-sanitize` (XSS protection)
- React renders the stored markdown to HTML; the import/seed pipeline does not precompile it
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

All listed callers of `buildShuffledChoiceViews` produce consistent shuffled labels. The shuffle remains deterministic per `(userId, questionId)` pair.

---

## 10. Summary Table

| Step | Location | Input | Output | Labels |
|------|----------|-------|--------|--------|
| **Author** | `content/questions/**/*.mdx` | Human writes | YAML + Markdown | A–E (canonical) |
| **Validate** | `lib/content/schemas.ts` | Frontmatter | Parsed + validated | Preserved |
| **Extract** | `lib/content/parse-mdx-question.ts` | MDX body | `stemMd`, `explanationMd` | N/A (body text) |
| **Split reference** | `scripts/seed-helpers.ts` | Explanation markdown | General explanation + reference | N/A (per-choice explanations come from frontmatter) |
| **Canonicalize** | `lib/content/parse-mdx-question.ts` | Raw markdown | Normalized markdown | Preserved |
| **Seed to DB** | `scripts/seed.ts` | Canonical repr | DB rows | One-based position among sorted labels |
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
DEBT-484, resolved 2026-09-30.
Current withdrawal and release gaps remain tracked in
DEBT-483.

---

## 12. Dependencies (Content Processing)

| Package | Version | Purpose |
|---------|---------|---------|
| `@11ty/gray-matter` | ^3.0.0 | YAML frontmatter parsing at seed time (js-yaml 5's safe `load`; JavaScript front matter is refused) |
| `tinyglobby` | ^0.2.17 | File discovery at seed time. It silently skips a directory it cannot read, where `fast-glob` threw `EACCES`; release staging still refuses a bundle that leaves out live questions |
| `react-markdown` | ^10.1.0 | React renders markdown → HTML |
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown tables, strikethrough, etc. |
| `rehype-sanitize` | ^6.0.0 | HTML sanitization (XSS prevention) |

**There is no contentlayer, next-mdx-remote, velite, or similar framework.** The pipeline is fully custom: YAML+Markdown files → seed script → database → React rendering.

---

## 13. Operations: Seeding (Local, Test DB)

Recommended end-to-end sanity check:

```bash
pnpm db:test:reset
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate
# Prerequisite: approved MDX is already placed under content/questions/.
# Generate/review replacements separately using the clean-staging procedure above.
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed
DATABASE_URL="$TEST_DATABASE_URL" pnpm dev
```

The test DB host port is per-clone (resolved by `scripts/resolve-local-test-target.ts`); never hardcode `localhost:5434`. See `docs/guides/testing/integration-tests.md`.

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

The seed refuses a database with an active content release (ADR-021 phase 4b). Once a release is active, content changes only through releases: see [Releases](#releases-bootstrap-stage-activate-roll-back-and-hold). This document does not record whether a release is active in any remote database. The migration 0049 notice is historical evidence, not a current census; bootstrapping production remains the owner's decision (DEBT-483).

---

## 15. When to Reseed

Re-run `pnpm db:seed` whenever the database's question/tag data may be out of sync with the MDX source files, as long as no content release is active there. Once one is, the seed refuses that database: stage a release, preview its activation and apply its plan instead (see [Releases](#releases-bootstrap-stage-activate-roll-back-and-hold)). Common triggers:

| Trigger | Why Reseed Is Needed |
|---------|---------------------|
| **After `pnpm db:migrate`** (schema changes) | Migrations may alter enums or constraints that require fresh data insertion. |
| **After MDX content changes** (new questions, updated tags, edited frontmatter) | While no release is active, the seed is the path from MDX files to database rows; once one is, `stage-release.ts` reads the chosen content-repository commit. |
| **After tag taxonomy changes** (SPEC-033, renamed slugs, new kinds) | Taxonomy migrations include tag data cleanup (see SPEC-033 §14). Run `pnpm db:migrate` first, then `pnpm db:seed`. |
| **After switching Neon branches** | Different branches may have different data states. |
| **After `pnpm db:test:reset`** | Test DB is wiped; seed restores content. |

**Important:** The seed is **not** automatically run against a deployed database by Vercel, CI or `pnpm db:migrate`. CI seeds only its own throwaway database. It is always a manual operator step. See `docs/guides/release/promote-to-production.md` for the full deployment flow.

---

## 16. Seed Idempotency and Multi-Clone Safety

Matching question content, status and tags do not create a new revision. A repeated seed can still write: default placeholder archival updates matching rows, and replaying an archived file fills missing withdrawal rows.

**Important:** By default, every successful `pnpm db:seed` run with authored input and no active content release also archives the ten committed placeholder fixtures, by exact QID, unless it is given `--include-placeholders`. An authored question whose QID merely starts with `placeholder-` is left alone (BUG-315). That placeholder archival is a deliberate side effect of every such run. Once a release is active, the seed refuses the database before it archives anything.

### How it works

1. **Slug is the identity key.** Each question is looked up by `slug`. If the slug exists, the question is compared; if not, it's inserted with revision 1.
2. **Canonical comparison with the current revision.** The seed locks the question and compares the file's canonical content with the question's current revision, canonicalized the same way. If the content, status and tags all match, the question is **skipped**: no revision and no `updatedAt` bump. One exception: replaying an `archived` file records any revision's missing withdrawal row.
3. **Changed content is appended, never updated** (ADR-021 phase 2b). A changed stem, explanation, reference, difficulty, choice or answer key becomes a new revision with its own choice rows, and the question's current revision moves to it. Earlier attempts and sessions keep the revision they answered. Status and tags change in place.
4. **Tags are upserted** via `upsertTags()`: existing tags are reused by slug, and a tag whose name or kind differs is refused.

### What this means for multiple clones

You may have multiple local clones of the repo (e.g., `naltrexone-university`, `naltrexone-university-2`, `naltrexone-university-3`), each with their own copy of the draft questions. For sequential runs against a database without an active release, with no withdrawals preventing the intended changes:

| Scenario | Result |
|----------|--------|
| Seed same questions from two different clones against the same DB | Matching questions are skipped; placeholder archival and missing withdrawal receipts can still write. |
| Seed from clone A, edit a question's content in clone B, seed from clone B | That changed question gains a **new revision**; matching questions are skipped, apart from archival/withdrawal side effects. |
| Seed from clone B after changing only a question's status or tags | That question's status or tags change **in place**, with no new revision. |
| Seed from different clones against different DBs (dev vs prod) | Each DB gets its own independent copy. No cross-contamination. |

**A content rollback risk:** If clone A has an *older* set of imported MDX files and you seed from it *after* seeding from clone B with newer content, the older files win:
- **Content** (stem, explanation, reference, difficulty, choices or answer key) is appended as a **new current revision**. Learners who saw the newer version get an update notice. The seed counts it under both `updated` and `new revisions`.
- **Status and tags** change **in place**, with no revision. A stale status can change what learners see: a question that is `published` in B but `draft` in A disappears from new practice. (The seed refuses to reactivate an archived question.) **A stale `archived` status is a permanent withdrawal and cannot be undone by reseeding.** The seed counts these under `updated` only.

Concurrent inserts of a new slug can also make one run fail on the unique constraint. Coordinate writers; per-question transactions do not make a multi-file seed atomic.

`updated` greater than `new revisions` indicates updates without new content revisions. Check `status` before seeding from any clone but the newest.

**Import procedure:** generate a fresh staged bundle from the intended draft version using [Import Drafts → MDX](#import-drafts--mdx-generated), review it, and separately place the approved artifact before seeding. A fresh directory prevents stale generated files from joining the new bundle; it does not prove release freshness or authorize a rollback.

### What about placeholders?

By default, `pnpm db:seed` **excludes** placeholder questions and, while no content release is active, archives the ten committed fixtures' rows in the DB, by exact QID (BUG-315). This is intentional — placeholders are templates, not production content. To include them in a local test database: `pnpm db:seed --include-placeholders`. CI runs the managed seed, `run-managed-db-seed.ts --include-placeholders`.

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
- **Does not touch the database.** Import itself is a local file operation. A plain import needs a separate seed; the environment-seed wrappers run both steps.
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
