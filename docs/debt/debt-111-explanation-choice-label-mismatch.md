# DEBT-111: Explanation Text References Original Choice Labels After Shuffle

**Status:** Open
**Priority:** P0
**Date:** 2026-02-05

---

## Description

Question explanations embed hardcoded A/B/C/D labels that reference the **original authored order** of choices. When choices are shuffled for display (deterministic per-user shuffle in `GetNextQuestionUseCase`), the labels in the explanation no longer match what the user sees on screen. This makes every explanation in practice-session mode appear incorrect, confusing, and unprofessional.

### Concrete Example (stahls-zaleplon-003)

**Original authored order:**
| Label | Choice Text | Correct? |
|-------|------------|----------|
| A | Increase zaleplon dose to 20 mg | No |
| B | Reduce zaleplon to 5 mg | **Yes** |
| C | No adjustment needed | No |
| D | Cimetidine is contraindicated | No |

**Shuffled display order (user sees):**
| Display Label | Choice Text | Original Label |
|---------------|------------|----------------|
| A | Cimetidine is contraindicated | was D |
| B | Increase zaleplon dose to 20 mg | was A |
| C | No adjustment needed | was C |
| D | Reduce zaleplon to 5 mg | was B |

**Explanation says:** "A) Increase dose: The OPPOSITE is true."
**User sees A as:** "Cimetidine is contraindicated."

The explanation is teaching the wrong lesson for each labeled option.

---

## Impact

- **P0 — User-facing correctness bug.** Every practice-session question with shuffled choices displays misleading explanations.
- Users studying for board exams receive incorrect feedback about why each answer is right or wrong.
- Destroys credibility of the question bank as a learning tool.
- Direct question view (`/app/questions/[slug]`) is **not affected** — it does not shuffle choices.

---

## Root Cause Analysis

### The Data Flow

```
Content (MDX)         →  Database           →  GetNextQuestion      →  SubmitAnswer       →  UI

Choices: A,B,C,D         Choices stored        Choices SHUFFLED        Explanation          User sees
Explanation refs          with original         Labels REASSIGNED       returned AS-IS       mismatched
A,B,C,D labels            labels               to new positions        from Question        labels
```

### The Five Choke Points

**Choke Point 1: Content Authoring** (`content/questions/**/*.mdx`, `content/drafts/**/*.md`)

Explanations are authored as a single markdown blob in the `## Explanation` section. The "Why other answers are wrong" subsection uses hardcoded labels:

```markdown
**Why other answers are wrong:**
- A) Increase dose: The OPPOSITE is true...
- C) No significant interaction: There IS...
- D) Contraindicated: The combination is not...
```

Labels here are **positional references** to the authored order, not stable identifiers.

**Choke Point 2: Seed/Storage** (`scripts/seed.ts`, `db/schema.ts`)

- `Question.explanationMd` stores the entire explanation as a single text blob
- `Choice` has no `explanationMd` field — per-choice explanations don't exist
- Choices store their original `label` (A-E) and `sortOrder` (1-N)
- The explanation's label references are baked into `Question.explanationMd` at seed time

**Choke Point 3: Choice Shuffling** (`src/application/use-cases/get-next-question.ts:69-99`)

```typescript
const shuffledChoices = shuffleWithSeed(stableInput, seed);
return shuffledChoices.map((c, index) => ({
  id: c.id,
  label: AllChoiceLabels[index],  // A,B,C,D reassigned to new positions
  textMd: c.textMd,
  sortOrder: index + 1,
}));
```

Labels are **reassigned** based on shuffled position. Original label "D" becomes display label "A" if it lands in position 0.

**Choke Point 4: Explanation Delivery** (`src/application/use-cases/submit-answer.ts:71-74`)

```typescript
const explanationMd = session && !sessionShouldShowExplanation(session)
  ? null
  : question.explanationMd;  // Returned verbatim — no label remapping
```

The explanation is returned **as-is** from the database. No awareness of the user's shuffled choice order.

**Choke Point 5: Rendering** (`components/question/Feedback.tsx`)

```tsx
<Markdown content={explanationMd} />
```

Renders raw markdown. No transformation. The A/B/C/D references in the text don't match the A/B/C/D the user just saw.

---

## Architectural Analysis: Why This Is a Design Flaw

The fundamental issue is that **explanations reference choices by position (label), but positions are ephemeral**. This violates a core principle: a choice's identity is its content, not its position.

Professional question banks (UWorld, Amboss, BoardVitals) solve this by either:
1. **Per-choice explanations** — Each choice carries its own explanation text. When shuffled, explanations travel with their choice.
2. **Content-referenced explanations** — Explanations reference choice text ("Increasing the dose is wrong because..."), never labels.

Our system does neither. Explanations are a monolithic blob on the Question entity that embeds positional labels.

---

## Resolution: Per-Choice Explanations (Recommended)

The clean architecture solution: make explanation a property of the **Choice**, not the **Question**. When choices shuffle, their explanations shuffle with them.

### Target Architecture

```
Question
├── stemMd
├── explanationMd          ← General explanation (correct answer rationale, clinical pearl)
└── choices[]
    ├── Choice
    │   ├── textMd
    │   ├── isCorrect
    │   └── explanationMd  ← NEW: Per-choice explanation (null for correct choice, or "why correct")
    └── ...
```

The "Why other answers are wrong" section is decomposed: each bullet becomes `choice.explanationMd` on its respective Choice entity. The general explanation (everything before "Why other answers are wrong") stays on `Question.explanationMd`.

### Implementation Steps

#### Phase 1: Schema + Domain

1. **DB Migration**: Add `explanation_md` nullable text column to `choices` table
2. **Domain Entity**: Add `explanationMd: string | null` to `Choice` type
3. **Repository**: Map new column in `DrizzleQuestionRepository.toDomain()`

#### Phase 2: Content Pipeline

4. **Seed Script**: Parse "Why other answers are wrong" section at seed time:
   - Extract general explanation (everything before "**Why other answers are wrong:**")
   - Parse each bullet `- X) ...` into per-choice explanation keyed by original label
   - Update `Question.explanationMd` to general-only text
   - Insert per-choice `explanationMd` into corresponding Choice rows
5. **Content Validation**: Add Zod validation for the parsed structure
6. **Re-seed**: Run `pnpm db:seed` to populate per-choice explanations

#### Phase 3: Use Cases

7. **SubmitAnswerUseCase**: Return per-choice explanations in shuffled display order:
   ```typescript
   type SubmitAnswerOutput = {
     attemptId: string;
     isCorrect: boolean;
     correctChoiceId: string;
     explanationMd: string | null;          // General explanation
     choiceExplanations: ChoiceExplanation[]; // Per-choice, in display order
   };

   type ChoiceExplanation = {
     choiceId: string;
     displayLabel: string;  // A/B/C/D in shuffled order
     textMd: string;        // The choice text
     isCorrect: boolean;
     explanationMd: string | null;
   };
   ```

8. **GetNextQuestionUseCase**: No change needed (already shuffles correctly).

#### Phase 4: Components

9. **Feedback Component**: Render general explanation + per-choice explanations in display order:
   ```
   Correct / Incorrect

   [General Explanation]
   Clinical pearl: ...

   Why other answers are wrong:
   A) [choice text]: [choice explanation]    ← labels match display
   B) [choice text]: [choice explanation]
   C) [choice text]: [choice explanation]
   ```

10. **QuestionCard**: No change needed.

#### Phase 5: Content Format Update

11. **New authoring format** (optional, forward-looking): Consider moving per-choice explanations into frontmatter for new questions:
    ```yaml
    choices:
      - label: "A"
        text: "Increase dose to 20 mg"
        correct: false
        explanation: "The OPPOSITE is true. Cimetidine increases zaleplon levels."
      - label: "B"
        text: "Reduce to 5 mg"
        correct: true
        explanation: "Correct. Cimetidine inhibits metabolism, raising levels."
    ```

### Alternative Approaches (Rejected)

| Approach | Why Rejected |
|----------|-------------|
| **Label remapping at render time** (regex swap A↔D in explanation text) | Fragile. Requires parsing markdown with regex. Breaks on edge cases (explanations that reference labels in prose, not just bullets). Band-aid, not architecture. |
| **Remove labels from explanations** (strip "A)", "B)" prefixes) | Loses the connection between choice and explanation. User can't tell which explanation applies to which option. |
| **Disable shuffle** | Defeats anti-cheating purpose. Choice order should vary per user. |
| **Ship explanation as-is, add disclaimer** | Unacceptable for a paid product. |

---

## Verification

- [ ] DB migration adds `explanation_md` to `choices` table
- [ ] Seed script correctly parses and splits explanations (unit tests for parser)
- [ ] `Choice` domain entity includes `explanationMd`
- [ ] `SubmitAnswerUseCase` returns per-choice explanations in shuffled display order
- [ ] Feedback component renders choice explanations with correct display labels
- [ ] Re-seeded database has per-choice explanations for all existing questions
- [ ] Direct question view (`/app/questions/[slug]`) still works correctly
- [ ] Practice session explanations show correct label→explanation mapping
- [ ] All existing tests pass (795+)
- [ ] New tests cover: seed parsing, use case output shape, component rendering

---

## Scope

- **Content files affected:** All MDX files in `content/questions/imported/` (~100+ files) — affected at seed-parse time, no manual edits needed
- **Draft format affected:** `content/drafts/questions/` — future authoring format should include per-choice explanations
- **Code files:** ~10 files across domain, application, adapter, and component layers
- **DB migration:** 1 new column on `choices` table

---

## Related

- `src/application/use-cases/get-next-question.ts` — Choice shuffling + label reassignment
- `src/application/use-cases/submit-answer.ts` — Explanation delivery
- `src/domain/entities/choice.ts` — Choice entity (needs `explanationMd`)
- `db/schema.ts` — Choices table (needs migration)
- `scripts/seed.ts` — Content parsing and DB insertion
- `components/question/Feedback.tsx` — Explanation rendering
- `docs/_archive/debt/debt-024-shuffle-seed-spec-drift.md` — Related shuffle architecture decision
- `docs/specs/spec-013-practice-sessions.md` — Practice session spec
