# NTX University Question Bank Meta

**Updated:** February 18, 2026

This file is the high-level meta for the content repo. The bottom section is a historical prompt used to bootstrap the original audit and question-generation skill.

## Inventory (Current)

- Total questions: 948
  - `content/drafts/questions/article-based-pathway/`: 480 (40 papers x 12)
  - `content/drafts/questions/asam-guidelines/`: 108 (9 sources x 12)
  - `content/drafts/questions/personal-papers/`: 132 (11 sources x 12)
  - `content/drafts/questions/50-studies-every-psychiatrist-should-know/`: 48 (4 sources x 12)
  - `content/drafts/questions/cochrane/`: 24 (2 reviews x 12)
  - `content/drafts/questions/therapy/`: 12 (1 source x 12)
  - `content/drafts/questions/prescribers-guide/`: 144 (36 medications x 4 recall)

## Integrity Checks (Current)

- No missing question sets for any paper folder with `recall.md` and `vignettes.md` expectations
- All non-prescribers sources: `recall.md` has 6 questions and `vignettes.md` has 6 questions
- Prescribers guide medications: all 36 medication folders have `recall.md` with 4 questions (no `vignettes.md` by design)
- Global QID uniqueness: 948 unique qids, no duplicates found
- Known exception: `content/drafts/questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/` is a correction notice folder (no questions by design)
- Known exception: `content/drafts/questions/prescribers-guide/stahls-prescribers-guide.md` and `content/drafts/questions/prescribers-guide/stahls-chunked/` are full-book conversion sources (no questions by design)

## How to Re-Run the Fast Checks

- Structural validation (repo-wide, from app repo root): `pnpm content:import:drafts -- --dry-run`
- Optional focused validation: run the same command after limiting edits to a single source folder
- There is currently no dedicated `validate_questions.py` script in this repo

---

# Appendix: Historical Skill Bootstrap Prompt (Reference Only)

> **Important:** This appendix is archival context only. If any formatting/schema instruction here conflicts with `SCHEMA.md` or `QUESTION-FORMAT-SPEC.md`, follow those two files.

**Context (historical):** I'm building NTX University, a subscription question bank for addiction psychiatry and addiction medicine board preparation. I'm a double board-certified psychiatrist (General and Addiction Psychiatry, fellowship at Mount Sinai Beth Israel 2024). I've generated questions from source papers organized by chapter. I need you to do two things: (1) audit my existing questions for quality, and (2) create an agent skill file (historically a standalone skill doc, now superseded by `AGENTS.md` + `CLAUDE.md`) that enforces NBME-quality question writing standards for all future AI-generated questions.

---

## PART 1: AUDIT EXISTING QUESTIONS

Scan all questions in my `/questions` directory and create a `NOTES.md` file documenting:

### A. Pattern Analysis
- What percentage are **pure recall** vs **application of knowledge**?
- How many test trivial facts (raw statistics, sample sizes, publication dates) vs clinical decision-making?
- Are distractors homogeneous and clinically plausible, or are they lazy numerical variations / obviously wrong?
- Do stems follow clinical vignette structure, or are they naked factual questions?
- Can the question be answered by covering the options (the "cover-the-options" test)?

### B. Common Failure Modes
Flag every question that has ANY of these problems:
1. **Trivia testing**: Tests raw numbers from studies (sample sizes, participant counts, number of studies in a review) rather than clinical conclusions or implications
2. **Lazy distractors**: Options that are just numerical variations of the correct answer ("15 studies" vs "27 studies" vs "35 studies" vs "50 studies") — these test nothing
3. **Non-homogeneous options**: Distractors that aren't in the same category as the correct answer
4. **No clinical context**: Questions that lack any patient scenario or clinical decision-making task
5. **Unfocused lead-in**: Questions using "Which of the following is true?" or similar vague prompts instead of specific clinical tasks
6. **Correct answer stands out**: The right answer is longer, more detailed, or more qualified than distractors
7. **Grammatical cues**: Stem language that tips off the correct answer
8. **Negative phrasing**: Questions using "EXCEPT," "NOT," or "all of the following EXCEPT"
9. **Recall-only questions** that could be converted to application-of-knowledge with a clinical vignette
10. **Thin explanations**: Explanations that just say "the other answers are wrong" without teaching the underlying concept

### C. Quality Tiers
Categorize every question as:
- **GOLD**: Ready to ship. Tests application of knowledge, has clinical vignette, plausible distractors, teaches something in the explanation.
- **SILVER**: Decent concept but needs rework. Maybe missing a vignette, or distractors need improvement, or explanation is thin.
- **BRONZE**: Fundamentally flawed. Tests trivia, has lazy distractors, or is a pure recall question that can't easily be rescued.
- **CUT**: Delete entirely. No salvageable educational value.

### D. Chapter-by-Chapter Summary
For each chapter directory, provide:
- Total question count
- Breakdown by quality tier (Gold/Silver/Bronze/Cut)
- Most common failure mode in that chapter
- Specific examples of the worst questions (quote them)
- Specific examples of the best questions (quote them)

### E. Overall Statistics
- Total questions audited
- Distribution across quality tiers
- Top 5 most common failure modes with counts
- Estimated rework effort (how many need minor edits vs major rewrites vs deletion)

Output everything to `NOTES.md` in the `/questions` root directory.

---

## PART 2: CREATE A QUESTION GENERATION SKILL

After completing the audit, create a skill file (historically standalone, now superseded by `AGENTS.md` + `CLAUDE.md`) that will enforce NBME-quality question writing standards.

The skill MUST encode the following principles (derived from the NBME Item-Writing Guide, 6th Edition, and medical education best practices):

### Question Philosophy
- **NEVER test recall of isolated facts.** Every question must test APPLICATION of knowledge in a clinical context.
- **Focus on common and important clinical problems.** No zebras, no esoterica, no trivia.
- **Every question should teach something.** The explanation is as important as the question itself.
- **Target the level of a physician sitting for ABPN Addiction Psychiatry boards or ABAM Addiction Medicine boards.** These are practicing physicians, not medical students.

### Stem/Vignette Structure (NBME Template)
Every question MUST include a clinical vignette following this sequence:
1. **Patient demographics**: Age, gender/sex
2. **Setting**: Where they present (office, ED, inpatient unit, consultation)
3. **Chief complaint**: Why they're there
4. **History of present illness**: Duration, quality, relevant timeline
5. **Relevant history**: Past medical, psychiatric, substance use, social, family — ONLY what's needed
6. **Examination/findings**: Physical exam, mental status exam, labs — ONLY what's relevant
7. **Lead-in question**: A focused, specific clinical task

### Lead-in Question Rules
- Must end with a question mark
- Must be answerable WITHOUT seeing the options (the "cover-the-options" rule)
- Must ask a specific clinical task: diagnosis, mechanism, next step in management, most appropriate medication, expected finding, etc.
- **NEVER use**: "Which of the following is true?", "Which of the following statements is correct?", "All of the following EXCEPT..."
- **Preferred formats**:
  - "Which of the following is the most likely diagnosis?"
  - "Which of the following is the most appropriate next step in management?"
  - "Which of the following is the most appropriate pharmacotherapy?"
  - "Which of the following mechanisms best explains this patient's presentation?"
  - "Which of the following is the most likely explanation for this finding?"

### Distractor Rules
- **4 options total** (A through D) — one correct, three distractors
- **ALL options must be homogeneous**: same category (all diagnoses, all medications, all mechanisms, all lab findings)
- **ALL distractors must be clinically plausible**: a competent physician might reasonably consider each one
- **Options should be approximately the same length** — the correct answer should NOT be the longest
- **No absurd options**: Never include obviously wrong answers designed to pad the option list
- **No numerical variations**: Never make distractors that are just different numbers from the correct answer
- **No absolute language**: Avoid "always," "never," "all," "none" in options
- **Distractors should represent common misconceptions** or conditions in the differential diagnosis

### What to Test (Content Priorities for Addiction Boards)
- **Pharmacology**: Mechanisms of action, receptor profiles, drug interactions, dosing considerations, side effects, contraindications
- **Clinical decision-making**: When to use which medication, which patient gets what treatment, how to manage complications
- **Diagnosis**: Recognizing substance use disorders, intoxication syndromes, withdrawal syndromes from clinical presentations
- **Evidence-based practice**: Key findings from landmark studies — but test the CLINICAL IMPLICATIONS, not the statistics
- **Safety**: Dangerous drug interactions, overdose management, when to refer/escalate
- **Special populations**: Pregnancy, adolescents, elderly, co-occurring disorders — clinical management differences

### What NEVER to Test
- Raw statistics from studies (sample sizes, participant counts, p-values, confidence intervals)
- Publication dates or author names
- Which journal published a study
- Number of studies in a meta-analysis or systematic review
- Study design details (unless the question tests understanding of evidence quality)
- Exact diagnostic criteria lists (test application of criteria to patient scenarios instead)
- Historical facts about substances or treatments that have no clinical relevance

### Explanation Structure
Every explanation MUST include:
1. **Why the correct answer is correct**: Explain the clinical reasoning, cite the key evidence or pharmacological principle
2. **Why each distractor is wrong**: Provide a specific, educational reason for each — not just "this is incorrect" or "this overestimates the value"
3. **Clinical pearl**: One high-yield teaching point that goes beyond the question itself
4. **Key concept**: What underlying principle this question is testing (e.g., "This tests understanding of mu-opioid receptor partial agonism and ceiling effect")

### Explanation Anti-Patterns (NEVER DO THESE)
- "A is incorrect because it underestimates the number"
- "C is incorrect because it overestimates both metrics"
- "This answer is wrong"
- Generic dismissals without teaching content
- Explanations shorter than the question stem
- Restating the full answer text before the explanation (the UI already shows the choice text — start directly with the reasoning; a short 2-5 word descriptor label is acceptable, but never the full choice sentence)

### Difficulty Calibration
Use the operational distribution from `SCHEMA.md`:
- `recall.md`: 2 easy, 2 medium, 2 hard
- `vignettes.md`: 2 easy, 2 medium, 2 hard

Legacy 30/50/20 guidance is superseded in this repository by the fixed per-file distribution above.

### Question Type Distribution
Use the operational split from `SCHEMA.md`: 6 recall + 6 vignette per paper.

Quality intent still applies:
- Prefer clinical decision-making over trivia
- Avoid pure fact-regurgitation prompts
- Even recall items should test clinically actionable concepts

### Source Citation
- Every question must include the `source` YAML frontmatter field.
- If useful, include additional citation context inside `## Explanation` prose.
- Do not invent unsupported YAML keys like `citation` or `doi` (strict frontmatter rejects unknown keys).
- If testing a concept from a landmark study, test the clinical implication rather than raw study statistics.

### Quality Self-Check
Before finalizing any question, the agent must verify:
- [ ] Can I answer this by covering the options? (If no → rewrite lead-in)
- [ ] Does this test application of knowledge, not recall? (If recall → add vignette)
- [ ] Are all 4 options homogeneous and plausible? (If not → replace weak distractors)
- [ ] Is the correct answer the same length as distractors? (If longer → trim or expand distractors)
- [ ] Does the explanation teach something beyond "this is right/wrong"? (If not → add clinical pearl)
- [ ] Would a practicing addiction psychiatrist benefit from this question? (If not → cut it)
- [ ] Am I testing a clinically important concept? (If trivial → choose a different concept from the same source)

---

## FORMATTING

> **Archival note:** The template below reflects the historical bootstrap prompt and is **not** the current parser contract.
> For active authoring, follow `SCHEMA.md` and `QUESTION-FORMAT-SPEC.md` (YAML frontmatter with `answer` in frontmatter, and sections `## Question`, `## Choices`, `## Explanation`).

### Question Schema (Markdown)
```markdown
## Question
[Clinical vignette with patient demographics, presentation, relevant history, and findings]

[Focused lead-in question ending with a question mark]

## Choices
- A) [Option]
- B) [Option]
- C) [Option]
- D) [Option]

## Correct Answer
[Letter]

## Explanation
[Why correct answer is correct — clinical reasoning and evidence]

**Why other answers are wrong:**
- **A) [Option]:** [Specific educational reason — what concept does this distractor test?]
- **B) [Option]:** [Specific educational reason]
- **C) [Option]:** [Specific educational reason]

**Clinical Pearl:** [One high-yield teaching point]

**Key Concept:** [What principle this question tests]

## Metadata
- Difficulty: [Easy/Medium/Hard]
- Category: [Pharmacology/Diagnosis/Management/Mechanism/Evidence-Based Practice]
- Source: [Author et al., Year — Brief description]
- Chapter: [Chapter number and name]
```

### Example of a GOOD Question (Addiction Psychiatry)

```markdown
## Question
A 34-year-old woman with opioid use disorder presents to the clinic requesting treatment with buprenorphine. She reports using intravenous fentanyl daily for the past 8 months. Her last use was 6 hours ago. She appears uncomfortable, with dilated pupils, rhinorrhea, piloerection, and a COWS score of 14. You prescribe sublingual buprenorphine/naloxone 4mg/1mg.

Within 30 minutes of taking the medication, she develops severe abdominal cramping, profuse diarrhea, diffuse body aches, and her COWS score increases to 32.

Which of the following best explains this patient's worsening symptoms?

## Choices
- A) Naloxone-mediated antagonism at mu-opioid receptors from the sublingual formulation
- B) Buprenorphine displacement of a higher-affinity agonist from mu-opioid receptors
- C) Buprenorphine's partial agonist activity providing insufficient mu-opioid receptor activation relative to her tolerance
- D) An allergic reaction to the buprenorphine/naloxone sublingual formulation

## Correct Answer
C

## Explanation
This patient is experiencing precipitated withdrawal. Buprenorphine is a partial mu-opioid agonist with very high binding affinity. When administered to a patient with high opioid tolerance (especially to fentanyl, which has high intrinsic efficacy at the mu receptor), buprenorphine rapidly displaces the full agonist and replaces it with partial agonist activity. The net effect is a sudden, dramatic reduction in mu-opioid receptor activation — equivalent to abrupt dose reduction — triggering severe withdrawal.

This is particularly problematic with fentanyl because fentanyl's lipophilicity means it persists in tissues, and even at a COWS of 14, significant receptor occupancy by fentanyl may remain. Current guidelines increasingly recommend micro-dosing (low-dose buprenorphine initiation) strategies for patients transitioning from fentanyl.

**Why other answers are wrong:**
- **A) Naloxone-mediated antagonism:** The naloxone component in sublingual buprenorphine/naloxone has negligible bioavailability (~3-5%) when taken sublingually. It is included as an abuse deterrent for IV misuse, not as a clinically active component in sublingual administration. This is a common misconception.
- **B) Displacement of a higher-affinity agonist:** This reverses the mechanism. Buprenorphine has HIGHER binding affinity than fentanyl. It is buprenorphine that displaces fentanyl, not the other way around. The issue is that buprenorphine's intrinsic activity (partial agonism) is lower despite its higher affinity.
- **D) Allergic reaction:** The symptom constellation (cramping, diarrhea, body aches, elevated COWS) is classic opioid withdrawal, not an allergic reaction. Allergic reactions would present with urticaria, angioedema, bronchospasm, or anaphylaxis.

**Clinical Pearl:** The distinction between binding affinity and intrinsic activity is critical for understanding precipitated withdrawal. Buprenorphine wins the competition for the receptor (high affinity) but activates it less (partial agonism), creating a net reduction in opioid effect in tolerant patients.

**Key Concept:** Precipitated withdrawal from buprenorphine induction — partial agonist displacement of full agonist at the mu-opioid receptor, particularly relevant in the fentanyl era.

## Metadata
- Difficulty: Medium
- Category: Pharmacology/Management
- Source: Clinical pharmacology of buprenorphine; SAMHSA TIP 63 guidelines
- Chapter: 04-opioids
```

### Example of a BAD Question (What NOT to Generate)

```markdown
## Question
According to the 2020 Cochrane review by Kelly et al., how many studies and participants were included in the systematic review of AA and 12-Step Facilitation (TSF) for alcohol use disorder?

## Choices
- A) 15 studies with 5,000 participants
- B) 27 studies with 10,565 participants
- C) 35 studies with 15,000 participants
- D) 50 studies with 25,000 participants

## WHY THIS IS BAD:
- Tests pure recall of trivia (study statistics)
- No clinical vignette or context
- Distractors are lazy numerical variations
- No clinical decision-making involved
- No physician would ever need to recall this number
- Explanation just says "the other numbers are wrong"
- A better question from this source would test what the Cochrane review FOUND:
  that AA/TSF produced comparable or better abstinence outcomes, and that the
  mechanism appears to be through social network changes — which has clinical
  implications for how you counsel patients about AA.
```

---

## INSTRUCTIONS

1. First, scan all markdown files in the `/questions` directory tree
2. Create `NOTES.md` with the full audit (Part 1)
3. Create/update agent instruction files for question generation (historically a standalone skill file; current repo uses `AGENTS.md` + `CLAUDE.md`)
4. Provide a summary of findings and recommended next steps

Take your time. Quality matters more than speed here.
