# DEBT-338 Phase 2: Implementation Spec — App Repo Pipeline Changes

**Parent:** [DEBT-338](./debt-338-seed-parser-silent-wrong-answer-section-corruption.md)
**Repo:** `naltrexone-university-3`
**Created:** 2026-03-28
**Status:** Implemented — merged in PR #254 (2026-03-28). Post-migration cleanup tracked in [DEBT-341](./debt-341-post-migration-legacy-path-removal.md).

---

## What This Spec Covers

All code changes in the app repo needed to support the Phase 2 YAML frontmatter format. This includes:
- Schema changes (Zod validation)
- Seed parser changes (reading explanations from YAML instead of markdown)
- Draft import pipeline changes (parsing + converting new-format drafts)
- Test fixtures and test coverage

This spec does NOT cover the content migration itself (converting 948 questions). That is tracked in the external repo as DEBT-02.

---

## Design Decisions (Locked)

These are final. Do not revisit.

1. **Change the authoring source too.** Draft files in the external repo also use structured `choices[]` YAML with `explanation`.
2. **Post-migration markdown body keeps only prose.** General explanation + clinical pearl + `### Reference`. The `**Why other answers are wrong:**` heading and bullets go away.
3. **Only wrong choices get `explanation`.** Correct choice NEVER gets it. Validation: `correct: true` + `explanation` present = reject.
4. **No hybrid questions.** A question is either fully legacy format or fully new format. Mixing the two is rejected.
5. **`qid:` stays first.** The draft file splitter (`splitDraftQuestionsFile()`) depends on `---\nqid:` as the block delimiter unless that splitter is deliberately hardened.

---

## Current Format vs Phase 2 Format

### Imported MDX — Current

```yaml
---
slug: "palis-2022-001"
difficulty: "easy"
status: "published"
tags:
  - slug: "opioids"
    name: "Opioids"
    kind: "substance"
  - slug: "stimulants"
    name: "Stimulants"
    kind: "substance"
  - slug: "epidemiology-prevention"
    name: "Epidemiology & Prevention"
    kind: "topic"
choices:
  - label: "A"
    text: "Concurrent use decreases fatal overdose risk..."
    correct: false
  - label: "B"
    text: "Concurrent use approximately doubles the hazard..."
    correct: true
  - label: "C"
    text: "Concurrent use has no effect..."
    correct: false
  - label: "D"
    text: "Concurrent use only increases risk if injection..."
    correct: false
---

## Stem

According to Palis et al. (2022), how does concurrent use of opioids and stimulants affect the risk of fatal overdose?

## Explanation

Palis et al. (2022) found that concurrent users had more than twice the hazard of fatal overdose...

**Clinical pearl:** The belief that stimulants can prevent opioid overdose is false and dangerous.

**Why other answers are wrong:**
- A) This is a dangerous misconception; stimulants do NOT protect against opioid overdose
- C) The hazard was significantly elevated, not unchanged
- D) The study found elevated risk overall, not limited to injection-only use

### Reference

Palis H, Xavier C, Dobrer S, et al. Concurrent use of opioids and stimulants and risk of fatal overdose. BMC Public Health. 2022;22:2084.
```

### Imported MDX — Phase 2

```yaml
---
slug: "palis-2022-001"
difficulty: "easy"
status: "published"
tags:
  - slug: "opioids"
    name: "Opioids"
    kind: "substance"
  - slug: "stimulants"
    name: "Stimulants"
    kind: "substance"
  - slug: "epidemiology-prevention"
    name: "Epidemiology & Prevention"
    kind: "topic"
choices:
  - label: "A"
    text: "Concurrent use decreases fatal overdose risk..."
    correct: false
    explanation: "This is a dangerous misconception; stimulants do NOT protect against opioid overdose."
  - label: "B"
    text: "Concurrent use approximately doubles the hazard..."
    correct: true
  - label: "C"
    text: "Concurrent use has no effect..."
    correct: false
    explanation: "The hazard was significantly elevated, not unchanged."
  - label: "D"
    text: "Concurrent use only increases risk if injection..."
    correct: false
    explanation: "The study found elevated risk overall, not limited to injection-only use."
---

## Stem

According to Palis et al. (2022), how does concurrent use of opioids and stimulants affect the risk of fatal overdose?

## Explanation

Palis et al. (2022) found that concurrent users had more than twice the hazard of fatal overdose...

**Clinical pearl:** The belief that stimulants can prevent opioid overdose is false and dangerous.

### Reference

Palis H, Xavier C, Dobrer S, et al. Concurrent use of opioids and stimulants and risk of fatal overdose. BMC Public Health. 2022;22:2084.
```

**Differences:** `explanation` field on each wrong choice in YAML. No `**Why other answers are wrong:**` section in markdown body. Correct choice (B) has no `explanation`.

### Draft Question Block — Phase 2

This is the canonical external-repo authoring example and must stay in sync with DEBT-02 and the DEBT-338 parent doc:

```markdown
---
qid: palis-2022-001
type: recall
difficulty: easy
substances: [opioids, stimulants]
topics: [epidemiology-prevention]
source: palis-2022
choices:
  - label: A
    text: "Concurrent use decreases fatal overdose risk because stimulants counteract opioid respiratory depression"
    correct: false
    explanation: "This is a dangerous misconception; stimulants do NOT protect against opioid overdose."
  - label: B
    text: "Concurrent use approximately doubles the hazard of fatal overdose compared to opioid use alone"
    correct: true
  - label: C
    text: "Concurrent use has no effect on fatal overdose risk"
    correct: false
    explanation: "The hazard was significantly elevated, not unchanged."
  - label: D
    text: "Concurrent use only increases risk if injection is the route of administration"
    correct: false
    explanation: "The study found elevated risk for the concurrent-use group overall and does not report that the increased hazard is limited to injection-only use."
---

## Question

According to Palis et al. (2022), how does concurrent use of opioids and stimulants affect the risk of fatal overdose compared to using opioids only?

## Explanation

Palis et al. (2022) found that "people who used both opioids and stimulants had more than twice the hazard of fatal overdose (HR: 2.02, 95% CI: 1.47-2.78, p<0.001) compared to people who used opioids only." This finding directly contradicts the dangerous misperception that stimulants protect against opioid overdose.

**Clinical pearl:** The belief that stimulants can prevent opioid overdose by counteracting respiratory depression is false and dangerous. Clinicians should actively address this misconception with patients.

### Reference

Palis H, Xavier C, Dobrer S, et al. Concurrent use of opioids and stimulants and risk of fatal overdose: a cohort study. BMC Public Health. 2022;22:2084.
```

---

## Step-by-Step Code Changes

### Step 1: Extend `ChoiceFrontmatterSchema`

**File:** `lib/content/schemas.ts` (implemented at lines 18-25; `QuestionFrontmatterSchema` `superRefine` guard at lines 81-107)

**Pre-Phase-2 shape:**
```typescript
export const ChoiceFrontmatterSchema = z
  .object({
    label: z.string().regex(/^[A-E]$/, 'label must be A-E'),
    text: z.string().min(1),
    correct: z.boolean(),
  })
  .strict();
```

**Change:** Add `explanation: z.string().min(1).optional()` to the object. The schema stays `.strict()` — adding the field to the schema definition makes `.strict()` accept it.

**Add to `QuestionFrontmatterSchema` superRefine:** If any choice has `correct: true` AND `explanation` is defined, add a validation issue. This enforces Decision 3.

During migration, `correct: false` without `explanation` remains schema-valid because the imported MDX schema alone cannot distinguish legacy MDX from new-format MDX. The stronger rule — "all wrong choices in a new-format question must have `explanation`" — must be enforced at the whole-question parsing boundary in `buildSeedRepFromParsed()`. After full migration is complete and legacy MDX is gone, `ChoiceFrontmatterSchema` can be tightened to require `explanation` on all wrong choices.

**Tests to write** (extend the existing `lib/content/schemas.test.ts`):
- `correct: true` + `explanation` present → validation fails
- `correct: false` + `explanation` present → validation passes
- `correct: false` without `explanation` → validation passes (legacy compat)
- `correct: true` without `explanation` → validation passes (as today)

---

### Step 2: New `parseExplanationAndReference()` function

**File:** `scripts/seed-helpers.ts`

**Why this is needed (critical bug):** the legacy no-heading return path in `parseChoiceExplanations()` only extracts `### Reference` when the `**Why other answers are wrong:**` heading exists. In the current file, that historical bug path is still visible at lines 109-114:

```typescript
if (headingIndex === -1) {
  return {
    generalExplanation: canonicalizeMarkdown(explanationMd),
    perChoice: new Map(),
    referenceMd: null,   // ← ALWAYS null when no wrong-answer heading
  };
}
```

New-format questions will NOT have `**Why other answers are wrong:**` but WILL have `### Reference`. Without this fix, every new-format question loses its reference citation.

**New function:**
```typescript
export function parseExplanationAndReference(explanationMd: string): {
  generalExplanation: string;
  referenceMd: string | null;
}
```

Logic:
1. Normalize line endings
2. Find `### Reference` heading (use existing `REFERENCE_HEADING_PATTERN`)
3. If found: everything before it = `generalExplanation`, everything after it = `referenceMd`
4. If not found: entire body = `generalExplanation`, `referenceMd = null`
5. Run `canonicalizeMarkdown()` on both outputs

**Tests to write** (in `scripts/seed-helpers.test.ts`):
- Body with general explanation + clinical pearl + `### Reference` + citation → splits correctly
- Body without `### Reference` → `referenceMd` is `null`, full body is `generalExplanation`
- Body with only `### Reference` (no general explanation) → empty `generalExplanation`
- Body with clinical pearl before reference → clinical pearl stays in `generalExplanation`

---

### Step 3: Update `buildSeedRepFromParsed()`

**File:** `scripts/seed/question-parser.ts` (implemented at lines 48-136)

**Format detection:** Check whether any choice in `parsed.frontmatter.choices` has an `explanation` field:

```typescript
const hasYamlExplanations = parsed.frontmatter.choices.some(
  (c: { explanation?: string }) => c.explanation !== undefined
);
```

**New-format path** (when `hasYamlExplanations` is true):
1. Call `parseExplanationAndReference(parsed.explanationMd)` instead of `parseChoiceExplanations()`
2. Read `explanation` directly from `frontmatter.choices[i].explanation`
3. Validate: markdown body does NOT contain `**Why other answers are wrong:**`. Reuse the same regex semantics as `WRONG_ANSWERS_HEADING_PATTERN`, but do not duplicate the literal pattern in multiple files — extract a shared helper/constant from `seed-helpers.ts` (or equivalent) so hybrid detection cannot drift.
4. Validate: every `correct: false` choice in this new-format path has `explanation`, and every `correct: true` choice does not. This rule lives here because `QuestionFrontmatterSchema` alone cannot distinguish legacy MDX from new-format MDX during migration.

```typescript
choices: sortedChoices.map((choice, index) => ({
  label: choice.label,
  text_md: canonicalizeMarkdown(choice.text),
  is_correct: choice.correct,
  explanation_md: choice.explanation ?? null,  // from YAML, not parsed
  sort_order: index + 1,
})),
```

**Legacy path** (when `hasYamlExplanations` is false): Unchanged. Uses `parseChoiceExplanations()` exactly as today.

**Tests to write** (in `scripts/seed.test.ts`):
- New-format MDX fixture → `explanation_md` comes from YAML, `reference_md` extracted from body
- Legacy MDX fixture → still works identically via `parseChoiceExplanations()`
- Hybrid: YAML `explanation` present AND `**Why other answers are wrong:**` in body → throws
- New-format MDX with a wrong choice missing `explanation` → throws
- New-format question where correct choice has no explanation → `explanation_md` is `null` for correct choice

**New fixture file:** `tests/fixtures/seed/new-format-example.mdx` — a complete Phase 2 MDX file with `explanation` on wrong choices, no wrong-answer section in body.

---

### Step 4: Dual-format `DraftFrontmatterSchema`

**File:** `scripts/draft-question-import.ts` (implemented union/schema path at lines 29-98; `DraftChoice` at lines 102-107)

**Pre-Phase-2 legacy schema** required `answer: z.string().regex(/^[A-E]$/)` and had no `choices` field.

**Create two schema paths.** Detection logic:
- If `data.answer` exists and `data.choices` does not → legacy format
- If `data.choices` exists and `data.answer` does not → new format
- If both exist → throw (hybrid rejected)
- If neither exists → throw (invalid)

**Legacy schema** (unchanged):
```
{ qid, type, difficulty, substances, topics, treatments?, diagnoses?, source, answer }
```

**New-format schema:**
```
{ qid, type, difficulty, substances, topics, treatments?, diagnoses?, source, choices[] }
```

Where each choice is:
```typescript
z.object({
  label: z.string().regex(/^[A-E]$/),
  text: z.string().min(1),
  correct: z.boolean(),
  explanation: z.string().min(1).optional(),
})
```

With superRefine validation:
- Exactly one choice has `correct: true`
- `correct: true` choice must NOT have `explanation`
- `correct: false` choices MUST have `explanation` (in new-format, this is required — unlike the MDX schema which allows it to be absent for legacy compat)
- Unique labels

**Update `DraftChoice` type** to the normalized shape returned by `parseDraftQuestionBlock()`:
```typescript
export type DraftChoice = {
  label: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
  correct: boolean;
  explanation?: string;
};
```

**Tests to write** (in `scripts/draft-question-import.test.ts`):
- New-format frontmatter with `choices[]` → parses correctly, returns `DraftChoice[]` with `explanation`
- Legacy frontmatter with `answer` → still works identically
- Both `answer` and `choices` present → throws
- Neither `answer` nor `choices` → throws
- New-format with `explanation` on correct choice → throws
- New-format with missing `explanation` on wrong choice → throws

---

### Step 5: Update `parseDraftQuestionBlock()` for dual-format parsing

**File:** `scripts/draft-question-import.ts` (implemented at lines 224-280)

**Pre-Phase-2 legacy logic:**
1. Parse frontmatter
2. Extract stem between `## Question`/`## Stem` and `## Choices`
3. Extract choices block between `## Choices` and `## Explanation`
4. Extract explanation after `## Explanation`
5. Parse choices from markdown with `parseChoicesBlock()`

**New-format logic:**
1. Parse frontmatter (which now includes `choices[]`)
2. Extract stem between `## Question`/`## Stem` and `## Explanation` (no `## Choices`)
3. Extract explanation after `## Explanation`
4. Choices come from frontmatter, not markdown

**Branch on format:**
```typescript
const isNewFormat = 'choices' in frontmatter;

if (isNewFormat) {
  // Validate no ## Choices heading exists (hybrid rejection)
  const hasChoicesHeading = normalized.some(line => line.trim() === '## Choices');
  if (hasChoicesHeading) throw new Error('New-format question must not have ## Choices heading');

  stemMd = extractBetweenHeadings(normalized, ['## Question', '## Stem'], '## Explanation');
  choices = frontmatter.choices; // already parsed from YAML
} else {
  stemMd = extractBetweenHeadings(normalized, ['## Question', '## Stem'], '## Choices');
  rawChoicesBlock = extractBetweenHeadings(normalized, ['## Choices'], '## Explanation');
  choices = parseChoicesBlock(rawChoicesBlock).map((choice) => ({
    ...choice,
    correct: choice.label === frontmatter.answer,
  }));
}
```

**Tests:**
- New-format block without `## Choices` → stem extracted correctly
- New-format block WITH `## Choices` → rejected as hybrid
- Legacy block → unchanged behavior

---

### Step 6: Update `convertDraftQuestionToMdx()` to emit `explanation`

**File:** `scripts/draft-question-import.ts` (implemented at lines 294-393)

**Implemented choice mapping** (lines 348-353):
```typescript
choices: draft.choices.map((c) => ({
  label: c.label,
  text: c.text,
  correct: c.label === answerLabel,
})),
```

**New-format path:** `convertDraftQuestionToMdx()` should consume the normalized `DraftChoice` shape, so it does not need to branch on legacy vs new-format correctness:
```typescript
choices: draft.choices.map((c) => ({
  label: c.label,
  text: c.text,
  correct: c.correct,
  ...(c.explanation ? { explanation: c.explanation } : {}),
})),
```

**YAML emission** (lines 371-378) — add explanation line:
```typescript
for (const choice of mdxFrontmatter.choices) {
  lines.push(`  - label: ${yamlQuotedString(choice.label)}`);
  lines.push(`    text: ${yamlQuotedString(choice.text)}`);
  lines.push(`    correct: ${choice.correct ? 'true' : 'false'}`);
  if (choice.explanation) {
    lines.push(`    explanation: ${yamlQuotedString(choice.explanation)}`);
  }
}
```

**Tests:**
- Round-trip: new-format draft → `convertDraftQuestionToMdx()` → parse with `gray-matter` → verify `explanation` on wrong choices, absent on correct
- Round-trip: legacy draft → `convertDraftQuestionToMdx()` → no `explanation` fields (as before)
- Full pipeline: new-format draft → parse → convert → `QuestionFrontmatterSchema.parse()` → passes

---

## Sequencing and Dependencies

```
Step 1 (schema) ──────┬──→ Step 2 (reference parser) ──→ Step 3 (seed parser)
                      │
                      └──→ Step 4 (draft schema) ──→ Step 5 (draft parser) ──→ Step 6 (draft converter)
```

Steps 1 is the foundation — everything depends on the schema accepting `explanation`.
Steps 2-3 (seed side) and Steps 4-6 (import side) are independent tracks that both depend on Step 1.

---

## What Does NOT Change

| Component | Why |
|-----------|-----|
| `db/schema.ts` | `choices.explanation_md` column already exists |
| `scripts/seed/question-syncer.ts` | Already maps `explanation_md` to DB on insert and upsert |
| `SeedChoice` type | Already has `explanation_md: string \| null` |
| `parseChoiceExplanations()` | Stays for legacy questions; not deleted until migration is complete |

---

## Post-Migration Tightening (After All 948 Questions Are Migrated)

Once the full corpus is migrated and no legacy-format questions remain:

1. Make `explanation` required on `correct: false` choices in `ChoiceFrontmatterSchema` (remove `.optional()`)
2. Remove the legacy branch from `buildSeedRepFromParsed()`
3. Remove the legacy branch from `parseDraftQuestionBlock()` and `convertDraftQuestionToMdx()`
4. Simplify or remove `parseChoiceExplanations()` — only `parseExplanationAndReference()` is needed
5. Remove legacy `answer` support from `DraftFrontmatterSchema`
6. Remove `parseChoicesBlock()`

This is a separate cleanup task, not part of the Phase 2 implementation.

---

## Verification Checklist

Implementation landed under PR #254. The verification evidence for that rollout is:

- [x] `pnpm typecheck` — passed
- [x] `pnpm lint` — passed
- [x] `pnpm test --run` — passed with the new dual-format tests
- [x] `pnpm test:browser` — passed
- [x] `pnpm test:integration` — passed
- [x] `pnpm build` — passed
- [x] `pnpm content:import:drafts -- --status published --dry-run` — passed against the migrated corpus
- [x] `pnpm db:seed` — succeeded against the migrated corpus (exact inserted/updated/skipped counts vary by database state)
- [x] UI contract preserved: wrong-answer explanations still display correctly on feedback cards because `choices.explanation_md` continues to flow through the existing feedback surfaces
