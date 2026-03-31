# NTX University Question Bank Plan

**Goal:** Generate board-style questions from 40 addiction psychiatry papers (480 questions).

**Note:** One additional folder contains a correction notice (no questions): `09-therapy/2024-cooperman-more-trial-correction/`.

**Last Updated:** March 28, 2026

**Status:**
- Generation: 480/480 questions COMPLETE (all 40 papers)
- Audit: Chapters 01-03 audited, Chapters 04-10 not yet audited
- Stabilization: Chapters 01-03 COMPLETE (all flagged questions fixed)
- Quality: ~85% GOLD, ~15% SILVER, ~0% BRONZE/CUT

---

## Current Inventory & Integrity Snapshot

### Inventory

| Scope | Count |
|-------|-------|
| Total questions in draft files | 948 |
| `article-based-pathway/` | 480 |
| `asam-guidelines/` | 108 |
| `personal-papers/` | 132 |
| `50-studies-every-psychiatrist-should-know/` | 48 |
| `cochrane/` | 24 |
| `therapy/` | 12 |
| `prescribers-guide/` | 144 |

### Integrity Checks

- No missing question sets for folders expected to have `recall.md` and `vignettes.md`
- All non-Prescriber's sources follow the 6 recall + 6 vignette structure
- Prescriber's Guide medications are recall-only by design: 36 medication folders x 4 recall questions
- Global QID uniqueness snapshot: 948 unique QIDs, no duplicates found
- Known exception: `questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/` is a correction-note folder with no questions by design
- Known exception: `questions/prescribers-guide/stahls-prescribers-guide.md` and `questions/prescribers-guide/stahls-chunked/` are source-only full-book conversion references

### Fast Checks

```bash
# Structural validation from the app repo root
pnpm content:import:drafts -- --dry-run

# Focused validation after editing a single source family
pnpm content:import:drafts -- --dry-run
```

This repo does include local helper scripts such as [validate_questions.py](/Users/ray/Desktop/github/addiction-final-2026/scripts/validate_questions.py), but `pnpm content:import:drafts -- --dry-run` in the app repo remains the canonical structural validation path.

---

## Targets

| Metric | Target |
|--------|--------|
| Total questions | 480 |
| Questions per paper | 12 |
| Recall : Vignette | 6 : 6 (50% : 50%) |
| Easy : Medium : Hard | 4 : 4 : 4 (per paper) |

### Per File Breakdown

| File | Questions | Easy | Medium | Hard |
|------|-----------|------|--------|------|
| recall.md | 6 | 2 | 2 | 2 |
| vignettes.md | 6 | 2 | 2 | 2 |

---

## Protocol

### For Each Paper:

1. **Read** the source markdown (`[paper].md`)
2. **Identify** 12+ testable facts/concepts
3. **Write recall questions** (6 per paper)
   - Single-step fact retrieval
   - High-yield clinical facts/cutoffs/mechanisms (avoid raw study statistics)
   - 2 easy, 2 medium, 2 hard
4. **Write vignette questions** (6 per paper)
   - Clinical scenarios
   - Multi-step reasoning
   - 2 easy, 2 medium, 2 hard
5. **Tag and verify** against SCHEMA.md
6. **Check off** in the tracker below

---

## Progress Tracker

### Chapter 01: Screening, Evaluation, Prevention (4 papers)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| white-2020 (gender differences) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| nelson-2022 (prevention) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| jones-2023 (hallucinogens) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| levy-2023 (adolescent screening) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Chapter 01 Total:** 48/48 **COMPLETE**

---

### Chapter 02: Alcohol (4 papers)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| anton-2020 (gabapentin AUD) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| kelly-2020 (AA 12-step) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| kranzler-2023 (AUD overview) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| pourmand-2023 (phenobarbital AWS) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Chapter 02 Total:** 48/48 **COMPLETE**

---

### Chapter 03: Cannabis (4 papers)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| gilman-2022 (medical marijuana trial) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| meier-2022 (long-term users) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| gorelick-2023 (cannabis disorders) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| myran-2023 (substance transition) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Chapter 03 Total:** 48/48 **COMPLETE**

---

### Chapter 04: Opioids (4 papers)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| connery-2019 (suicidal motivations) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| ahmed-2020 (microinduction) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| frankeberger-2023 (postpartum OUD) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| marsden-2023 (XR buprenorphine) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Chapter 04 Total:** 48/48 **COMPLETE**

---

### Chapter 05: Stimulants (4 papers)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| moszczynska-2021 (meth treatments) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| ciccarone-2022 (stimulant use) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| palis-2022 (opioid-stimulant OD) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| mccabe-2023 (ADHD to illicit) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Chapter 05 Total:** 48/48 **COMPLETE**

---

### Chapter 06: Tobacco (4 papers)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| vlad-2020 (cessation in OUD) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| nollen-2021 (racial differences) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| caponnetto-2023 (varenicline dual) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| kaplan-2023 (ENDS effectiveness) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Chapter 06 Total:** 48/48 **COMPLETE**

---

### Chapter 07: Other Substances (4 papers)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| bonnecaze-2021 (anabolic steroids) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| kleinman-2022 (benzo OD deaths) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| dorazio-2023 (xylazine) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| palamar-2023 (ketamine trends) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Chapter 07 Total:** 48/48 **COMPLETE**

---

### Chapter 08: Dual Diagnoses (4 papers)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| clark-2021 (panic + opioids) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| kast-2021 (ADHD + SUD retention) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| hien-2023 (PTSD + SUD harmony) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| martin-2023 (ACEs by substance) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Chapter 08 Total:** 48/48 **COMPLETE**

---

### Chapter 09: Therapy (4 papers + 1 correction note)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| stack-2022 (peer recovery) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| sugarman-2022 (gender SUD groups) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| sherman-2023 (seeking safety) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| cooperman-2024 (telehealth MORE) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Correction note:** cooperman-2024 correction notice is tracked in `09-therapy/2024-cooperman-more-trial-correction/` (no questions).

**Chapter 09 Total:** 48/48 **COMPLETE**

---

### Chapter 10: Special Populations (4 papers)

| Paper | Recall (6) | Vignette (6) | Total | Status |
|-------|------------|--------------|-------|--------|
| baranyi-2022 (prison dual dx) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| randall-kosich-2022 (drug court) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| lo-2023 (cannabinoids pregnancy) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |
| oladunjoye-2023 (adolescent CUD) | ☑☑☑☑☑☑ | ☑☑☑☑☑☑ | 12/12 | **COMPLETE** |

**Chapter 10 Total:** 48/48 **COMPLETE**

---

## Grand Total

| Chapter | Papers | Target Questions | Completed |
|---------|--------|------------------|-----------|
| 01 Screening | 4 | 48 | 48 |
| 02 Alcohol | 4 | 48 | 48 |
| 03 Cannabis | 4 | 48 | 48 |
| 04 Opioids | 4 | 48 | 48 |
| 05 Stimulants | 4 | 48 | 48 |
| 06 Tobacco | 4 | 48 | 48 |
| 07 Other | 4 | 48 | 48 |
| 08 Dual Dx | 4 | 48 | 48 |
| 09 Therapy | 4 | 48 | 48 |
| 10 Special Pop | 4 | 48 | 48 |
| **TOTAL** | **40** | **480** | **480** |

---

## Priority Order

All 40 paper question sets are generated. Future priorities:

1. ~~**DSM-5 Conversion:** Audit all questions for DSM-IV terminology and update to DSM-5~~ ✅ COMPLETE (Feb 2, 2026)
2. Ongoing QA: adversarial accuracy checks against each source markdown
3. Tighten items: remove remaining trivia, shorten recall stems, strengthen distractors
4. Expand: add additional papers from the book as new question folders

---

## Next Action

All chapters are COMPLETE: 480/480 questions across 40 papers.

**Current Priority:** Ongoing QA (DSM-5 conversion COMPLETE)
- DSM-5 audit completed Feb 2, 2026 (see NOTES.md for details)
- Key papers updated: jones-2023, meier-2022, clark-2021, dorazio-2023
- All 480 questions now use DSM-5 terminology
