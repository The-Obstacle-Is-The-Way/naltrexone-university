# DEBT-336: Content Markdown Quality Pass — RESOLVED (Tabled)

**Priority:** P3
**Created:** 2026-03-24
**Updated:** 2026-03-29
**Resolved:** 2026-03-29
**Source:** [DEBT-275](./debt-275-bs033-residual-open-items.md) (Content-Layer Work C1–C4)
**Scope:** Markdown content fixes — all four items either resolved or investigated and tabled

---

## Context

The question content lives in a separate repo (`addiction-final-2026`) and is imported into this app via `pnpm content:import:drafts`. Four content quality issues were identified during the BS-033 UX audit. All four are about the **Markdown text itself**, not the app code.

### Final Status (2026-03-29)

Independent audit of 948–951 questions / 2,844–2,847 wrong choices across both repos (naltrexone-university-3 drafts and addiction-final-2026 questions):

| Item | Status | Detail |
|------|--------|--------|
| **C1** | **Resolved** | 0 violations. Phase 2 YAML migration fixed all blank-line issues. |
| **C2** | **Resolved** | 0 violations. All `**Clinical pearl:**` markers have proper blank lines. |
| **C3** | **Tabled — cosmetic only** | 122 violations (4.3%). 0 severe, 27 moderate, 95 mild. See investigation below. |
| **C4** | **Resolved** | 0 violations. Every `correct: false` choice has an `explanation:` field. |

---

## C1: Missing Blank Line Before Lead-In Question — RESOLVED

**What was wrong:** Some question stems had the clinical scenario and the "Which of the following..." lead-in jammed into one paragraph because there was no blank line separating them.

**Resolution:** Phase 2 YAML migration (DEBT-338 / PR #254) reformatted all 951 questions. Verified 2026-03-29: zero violations across all directories.

---

## C2: Missing Blank Line Before Clinical Pearl — RESOLVED

**What was wrong:** Some explanations had `**Clinical pearl:**` text jammed into the preceding paragraph without a blank line before it.

**Resolution:** Phase 2 YAML migration (DEBT-338 / PR #254) reformatted all explanations. Verified 2026-03-29: zero violations across all directories.

---

## C3: Wrong-Answer Explanation Redundant Prefix — TABLED

**What it is:** Some wrong-answer explanations restate the choice text before stating why the option is wrong. The UI already shows the full choice text above the explanation.

### Investigation (2026-03-29)

Audited across 948 questions / 2,844 wrong choices using strict matching (explanation starts with the choice text verbatim). 122 violations found (4.3%), categorized by severity:

| Severity | Count | Description |
|----------|-------|-------------|
| **SEVERE** | **0** | Full text + colon/dash separator (old format remnant). Completely eliminated. |
| **MODERATE** | **27** | 3+ word choice text restated. All are natural English sentence patterns (e.g., "Seizures and autonomic instability are characteristic of..."). |
| **MILD** | **95** | Single word or drug name restated (e.g., "Acamprosate" → "Acamprosate showed no evidence..."). Unavoidable — the drug name is the natural sentence subject. |

Distribution by directory:

| Directory | Violations |
|-----------|-----------|
| `article-based-pathway/` | ~100 |
| `50-studies-every-psychiatrist-should-know/` | ~10 |
| All others combined | ~12 |

### Decision: Tabled — not worth fixing

**Reason:** Independent investigation across both repos determined that batch-fixing these would risk making explanations worse, not better:

1. **Zero severe violations.** The truly egregious old pattern (full choice text + colon separator) is completely gone. The Phase 2 YAML migration eliminated it.
2. **Moderate violations are natural English.** Rewriting "Good Behavior Game is for ages 6-10" to avoid restating the choice text yields "This intervention targets ages 6-10" — less scannable, not more.
3. **Mild violations are unavoidable.** When the choice text is "Acamprosate," the most natural explanation starts with that drug name. Alternatives like "This medication showed..." are worse.
4. **Explanations serve as standalone educational content.** Stripping the subject makes them dependent on UI context. If the layout changes or the content is used elsewhere, headless explanations lose clarity.
5. **4.3% rate is low.** The content is already in good shape.

**If dogfooding reveals specific explanations that read badly, fix them individually.** Do not batch-fix.

---

## C4: Missing Wrong-Answer Explanations — RESOLVED

**What was wrong:** Many questions were missing `**Why other answers are wrong:**` sections entirely, or had the section but were missing explanations for some choices.

**Resolution:** Phase 2 YAML migration (DEBT-338 / PR #254) ensured every `correct: false` choice has an `explanation:` field. Verified 2026-03-29: zero violations across all 2,847 wrong choices.

---

## Acceptance Criteria

- [x] C1: No question stems have scenario + lead-in merged into one paragraph
- [x] C2: All `**Clinical pearl:**` markers have a blank line before them
- [x] C3: Investigated — 0 severe, 122 cosmetic. Tabled as acceptable (2026-03-29)
- [x] C4: All questions have per-choice wrong-answer explanations
- [x] Content imported and seeded (Phase 2 YAML migration, DEBT-338 / PR #254)
