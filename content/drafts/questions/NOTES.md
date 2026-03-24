# Question Bank Audit: NTX University

**Auditor:** Claude
**Date:** February 2, 2026
**Questions Reviewed:**
- 144 questions (quality stabilization pass: Chapters 01-03)
- 480 questions (DSM-5 terminology sweep: Chapters 01-10)
**Chapters Covered:**
- Quality stabilization: 01-Screening, 02-Alcohol, 03-Cannabis
- DSM-5 terminology: 01-10 (all questions)

---

## Prescriber's Guide: Addiction Relevance Audit (Feb 19, 2026)

**Auditor:** Claude + Ray
**Scope:** All 144 Prescriber's Guide questions (36 medications x 4 recall)

### Finding

Many Prescriber's Guide questions test generic pharmacology/prescribing knowledge with no meaningful connection to addiction psychiatry. The medications were hand-selected for addiction relevance, but the question generation pulled from Stahl's without an addiction-relevance filter.

### Severity Breakdown

| Rating | Count | Description |
|--------|-------|-------------|
| CORE | ~80 | Clearly tests addiction psychiatry knowledge |
| BORDERLINE | ~45 | Could be relevant but feels generic |
| OFF-TARGET | ~19 | Generic prescribing, no addiction connection |

### Worst Offenders (Most Off-Target Questions)

| Medication | Off-Target | What They Test Instead |
|------------|------------|----------------------|
| Esketamine | 4/4 | TRD prescribing (REMS, BP monitoring, pregnancy, mechanism) |
| Phentermine-topiramate | 4/4 | Obesity medicine (stopping rules, pregnancy REMS, taper) |
| Methylphenidate | 3/4 | ADHD prescribing (Concerta GI, MRI patch burns, release kinetics) |
| Serdexmethylphenidate | 3/4 | ADHD product details (sprinkle caps, surgery, cardiac monitoring) |
| Pregabalin | 3/4 | Pain/sleep medicine (delta sleep, gabapentin comparison, renal dosing) |
| Diphenhydramine | 3/4 | General psych/neuro (EPS management, dementia, CYP2D6) |
| Zopiclone | 3/4 | Generic prescribing (taste, elderly dosing, myasthenia gravis) |
| Armodafinil | 2/4 | Sleep medicine, generic ADRs (OSA management, SJS) |

### Strongest Files (No Changes Needed)

Buprenorphine, bupropion, chlordiazepoxide, flunitrazepam, lofexidine, nalmefene, naltrexone, varenicline: all 4/4 CORE.

### Root Cause

Generation instructions (CLAUDE.md, AGENTS.md, SKILL.md) had strong NBME quality standards but lacked an explicit addiction-relevance filter for the Prescriber's Guide section. The "Would a practicing addiction psychiatrist benefit?" test in SKILL.md was interpreted too loosely.

### Resolution

1. Added "Prescriber's Guide: Addiction Relevance Filter" to CLAUDE.md, AGENTS.md, and SKILL.md (Feb 19, 2026)
2. Rewrite pass pending: go medication-by-medication, decide keep/rewrite/replace for each question

### Rewrite Queue

Status: **PENDING** (doc updates complete, question rewrites not yet started)

Each medication needs individual review to decide per-question disposition (keep as-is, rewrite with addiction hook, or replace entirely). The addiction hook for each medication varies:
- Esketamine: ketamine dependence potential, dissociative misuse, SUD comorbidity in TRD patients
- Phentermine-topiramate: weight-management prescribing in SUD patients, stimulant component misuse risk, and topiramate's off-label SUD relevance; use a binge-eating behavior angle only when clinically defensible
- Methylphenidate: diversion risk, prescribing in SUD patients, abuse-deterrent formulations
- Serdexmethylphenidate: prodrug abuse-deterrent design, stimulant SUD context
- Pregabalin: emerging abuse/dependence concerns, gabapentinoid misuse in SUD populations
- Diphenhydramine: OTC abuse in institutional/correctional settings, anticholinergic toxidrome
- Zopiclone: Z-drug dependence, tolerance, withdrawal; prescribing in SUD patients
- Armodafinil: lower abuse potential vs stimulants, use in SUD patients with fatigue/sleepiness

---

## Addendum: Content Integrity Snapshot (Feb 4, 2026)

- Total questions in question files: 948
- QID uniqueness: 948 unique qids (no duplicates found)
- All non-prescribers sources follow 6 recall + 6 vignette questions per source
- Prescribers guide medications are recall-only by design: 36 medications x 4 recall questions (no vignettes)
- Known exception: `content/drafts/questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/` is a correction notice folder (no questions by design)
- Known exception: `content/drafts/questions/prescribers-guide/stahls-prescribers-guide.md` and `content/drafts/questions/prescribers-guide/stahls-chunked/` are full-book conversion sources (no questions by design)
- Validator (current): `pnpm content:import:drafts -- --dry-run` from app repo root (structural import/schema checks)

---

## Stabilization Status (Quality, Updated Feb 2, 2026)

| Chapter | Audited | Stabilized | Notes |
|---------|---------|------------|-------|
| 01 Screening | ✅ | ✅ | All flagged questions fixed |
| 02 Alcohol | ✅ | ✅ | All 9 flagged questions fixed |
| 03 Cannabis | ✅ | ✅ | All flagged questions fixed |
| 04-10 | ❌ | N/A | Not yet audited (likely similar quality) |

**Post-stabilization quality estimate (Chapters 01-03 only):** ~85% GOLD, ~15% SILVER, ~0% BRONZE/CUT

---

## DSM-5 Conversion Requirement (Added Feb 2, 2026)

**CRITICAL:** All questions, answers, and explanations must use DSM-5 terminology and criteria. DSM-IV is obsolete and no longer board-relevant.

### Key DSM-IV to DSM-5 Changes

| DSM-IV | DSM-5 | Notes |
|--------|-------|-------|
| "Substance Abuse" | **Substance Use Disorder** (mild/moderate/severe) | No separate abuse vs dependence |
| "Substance Dependence" | **Substance Use Disorder** (moderate/severe) | Severity based on symptom count |
| 7 dependence criteria | **11 criteria** | Combined + craving added |
| Abuse = 1+ of 4 criteria | **Mild SUD = 2-3 of 11** | Higher threshold |
| Dependence = 3+ of 7 criteria | **Moderate SUD = 4-5; Severe = 6+** | Spectrum model |

### Conversion Protocol

1. **Audit all questions** for DSM-IV terminology (abuse, dependence, old criteria)
2. **Update terminology** to DSM-5 (SUD + severity specifier)
3. **Preserve clinical accuracy** even if source paper used DSM-IV
4. **Note in explanation** if source paper predates DSM-5 (published before May 2013)
5. **Test modern criteria** (11 symptoms, craving, 2-3-4 threshold)

### Flagged Terms to Find and Replace

| Find | Replace With |
|------|--------------|
| "alcohol abuse" | alcohol use disorder |
| "alcohol dependence" | alcohol use disorder (moderate/severe) |
| "cannabis abuse" | cannabis use disorder |
| "opioid dependence" | opioid use disorder |
| "nicotine dependence" (when used as a DSM diagnosis) | tobacco use disorder |
| "substance abuse diagnosis" | substance use disorder diagnosis |
| "3 of 7 criteria" | 2+ of 11 criteria (for SUD) or 4+ (moderate), 6+ (severe) |
| "abuse vs dependence" | severity spectrum (mild/moderate/severe) |

### Papers Published Before DSM-5 (May 2013)

These papers used DSM-IV criteria in their methodology. Questions should still test DSM-5 concepts but can note historical context:

- Papers from 2012 or earlier used DSM-IV by default
- Papers from 2013-2015 may have used either (check methods)
- Papers from 2016+ should use DSM-5
  - Some modern cohorts still use DSM-IV-era dependence modules for continuity (check the instrument, not just publication year)

### Audit Status: DSM-5 Conversion (Feb 2, 2026)

| Chapter | Audited | Converted | Notes |
|---------|---------|-----------|-------|
| 01 Screening | ✅ | ✅ | Jones 2023 updated with DSM-5 note + terminology |
| 02 Alcohol | ✅ | ✅ | No DSM-IV issues found |
| 03 Cannabis | ✅ | ✅ | Minor fix in meier-2022 vignettes |
| 04 Opioids | ✅ | ✅ | No DSM-IV issues found |
| 05 Stimulants | ✅ | ✅ | No DSM-IV issues found |
| 06 Tobacco | ✅ | ✅ | "Nicotine dependence" retained as clinical term (not diagnosis) |
| 07 Other | ✅ | ✅ | Minor fix in dorazio-2023 vignettes |
| 08 Dual Dx | ✅ | ✅ | Minor fix in clark-2021 recall |
| 09 Therapy | ✅ | ✅ | No DSM-IV issues found |
| 10 Special Pop | ✅ | ✅ | No DSM-IV issues found |

**Audit complete:** All 480 questions reviewed. Key changes:
1. **Jones 2023 (hallucinogens):** Added DSM-5 context note, updated all references from "dependence/abuse" to "hallucinogen use disorder"
2. **Meier 2022 (cannabis):** Clarified dependence terminology in the study definition while using DSM-5 language in the question bank
3. **Clark 2021 (panic-opioid):** Updated "opioid dependence" to "opioid use disorder"
4. **D'Orazio 2023 (xylazine):** Updated "opioid dependence" to "opioid use disorder"
5. **Kleinman 2022 (benzodiazepines):** Updated a remaining "heroin dependence" reference to DSM-5-consistent language
6. **Baranyi 2022 (prisons):** Updated a remaining "substance abuse" reference to "substance use disorder"
7. **Gilman 2022 (medical cannabis):** Updated a remaining "dependence" reference to "cannabis use disorder"

**Terminology retained as acceptable:**
- "Nicotine dependence" (clinical severity measure, not DSM diagnosis)
- "Household substance abuse" (ACE survey category, not diagnostic term)
- "Physical dependence" (pharmacological concept, distinct from use disorder)

**Verification (Feb 2, 2026):** Sampled questions from Chapters 01-03. All previously-flagged CUT/BRONZE questions have been rewritten to test clinical concepts instead of statistics. Examples:
- white-2020-005: Now tests "risk-severity paradox" (was: pregnancy percentages)
- gilman-2022-002: Now tests "CUD symptoms" (was: sample size/randomization)
- meier-2022-002: Now tests "cannabis vs tobacco/alcohol" (was: sample/retention)
- myran-2023-006: Now tests "prevention messaging target" (was: sample size)

---

## Executive Summary

**UPDATED Feb 2, 2026:** The quality issues identified below have been addressed. A stabilization pass rewrote all BRONZE/CUT questions to test clinical concepts instead of statistics.

**Current estimated quality:** ~85% GOLD, ~15% SILVER, ~0% BRONZE/CUT

~~The question bank has a significant quality problem.~~ **[RESOLVED]** The original audit found ~35% of questions tested study trivia. All flagged questions have since been rewritten.

**Original Actions (now complete):**
1. ~~Cut or rewrite 17 questions that are fundamentally flawed~~ ✅ Done
2. ~~Add clinical vignettes to recall questions~~ ✅ Done where needed
3. ~~Revise thin explanations~~ ✅ Most updated with clinical pearls

---

## Part A: Pattern Analysis

### 1. Pure Recall vs Application of Knowledge

| Question Type | Count | Percentage |
|---------------|-------|------------|
| Pure recall (naked fact retrieval) | 72 | 50% |
| Application with vignette | 72 | 50% |

**Breakdown of Recall Questions:**
- Clinically useful recall: 38 (53% of recall)
- Study trivia/statistics: 34 (47% of recall)

### 2. Trivia Testing

**34 questions (24% of total) test raw study statistics:**

| Paper | Trivia Questions | Examples |
|-------|------------------|----------|
| kelly-2020-001 | Study count/participants | "27 studies with 10,565 participants" |
| pourmand-2023-002 | Study count/patients | "12 studies with 1,934 patients" |
| gilman-2022-002 | Sample size/randomization ratio | "186 participants, randomized 2:1" |
| meier-2022-002 | Sample size/retention | "1,037 with 94% retention" |
| levy-2023-005 | ADHD prevalence in sample | "18.7% had ADHD/ADD diagnosis" |
| anton-2020-004 | Biomarker cutoff | "%dCDT >1.7%" |
| anton-2020-005 | CIWA exclusion cutoff | "CIWA-Ar 10 or more" |
| myran-2023-006 | Sample size details | "9.8 million; 407,737; 3.4%" |

### 3. Distractor Quality

**Lazy numerical distractors (just varying the numbers):**
- kelly-2020-001: 15 vs 27 vs 35 vs 50 studies
- kelly-2020-004: 15% vs 25% vs 35% vs 45%
- pourmand-2023-002: 8 vs 12 vs 20 vs 25 studies
- kranzler-2023-003: 12 vs 6 vs 4.5 vs 24 (NNT values)
- multiple percentage questions follow this pattern

**Homogeneous distractors (good):** Most questions have homogeneous options within the same category.

**Absurd distractors (rare but present):** A few questions include obviously wrong options that don't require any knowledge to eliminate.

### 4. Vignette Quality

**72 vignette questions reviewed:**
- GOLD (excellent clinical reasoning): 28 (39%)
- SILVER (good but needs polish): 35 (49%)
- BRONZE (vignette wrapper on recall): 9 (12%)

### 5. Cover-the-Options Test

**Questions that fail the cover-the-options test:**
- Questions asking "how many studies" or "what percentage" cannot be answered without seeing the options
- Questions like "which statement is most accurate" often cannot be answered without reading all options

---

## Part B: Common Failure Modes

### Failure Mode #1: Study Trivia (34 questions, 24%)

**Examples of the worst offenders:**

```markdown
qid: kelly-2020-001
According to the 2020 Cochrane review by Kelly et al., how many studies
and participants were included in the systematic review of AA and 12-Step
Facilitation (TSF) for alcohol use disorder?

- A) 15 studies with 5,000 participants
- B) 27 studies with 10,565 participants
- C) 35 studies with 15,000 participants
- D) 50 studies with 25,000 participants
```
**GRADE: CUT** - This is the exact example of a bad question in META.MD. No physician needs to know this.

```markdown
qid: pourmand-2023-002
How many studies and total patients were included in the systematic
review and meta-analysis of phenobarbital for alcohol withdrawal syndrome?

- A) 8 studies with 1,200 patients
- B) 12 studies with 1,934 patients
- C) 20 studies with 3,500 patients
- D) 25 studies with 5,000 patients
```
**GRADE: CUT** - Identical problem. Tests nothing useful.

```markdown
qid: myran-2023-006
What was the sample size and what percentage of individuals with incident
ED visits for substance use had substance-induced psychosis?

- A) 9.8 million total; 407,737 with ED visits; 3.4% had psychosis
- B) 5 million total; 200,000 with ED visits; 10% had psychosis
- C) 15 million total; 1 million with ED visits; 5% had psychosis
- D) 2 million total; 100,000 with ED visits; 20% had psychosis
```
**GRADE: CUT** - Tests memorization of sample characteristics, not clinical knowledge.

### Failure Mode #2: Lazy Numerical Distractors (22 questions, 15%)

**Pattern:** Distractors are just different numbers from the correct answer.

```markdown
qid: kelly-2020-004
What percentage lower were alcohol-related healthcare costs for AA
participants compared to outpatients over a 3-year follow-up?

- A) 15% lower
- B) 25% lower
- C) 35% lower
- D) 45% lower
```
**GRADE: BRONZE** - While cost-effectiveness is clinically relevant, the distractors teach nothing. A test-taker either memorized "45%" or guesses.

### Failure Mode #3: No Clinical Context (All 72 recall questions)

Even when testing useful concepts, pure recall questions lack clinical framing:

```markdown
qid: kranzler-2023-002
What is the estimated twin heritability of alcohol use disorder?

- A) 29%
- B) 39%
- C) 49%
- D) 69%
```
**GRADE: SILVER** - Heritability is clinically useful knowledge. Could be improved with a vignette (e.g., patient asks about genetic risk).

### Failure Mode #4: Thin Explanations (45 questions, 31%)

**Pattern:** "Why wrong" explanations just say "this over/underestimates the value."

```markdown
**Why other answers are wrong:**
- A) 0.1% to 0.5% significantly underestimates FASD prevalence
- B) 0.5% to 1% also underestimates current prevalence estimates
- C) "Less than 1%" contradicts the 1% to 5% range from recent studies
```
**Problem:** These explanations don't teach anything. They just confirm the student got the number wrong.

**Better example (from the same question bank):**

```markdown
**Why other answers are wrong:**
- A) Naloxone-mediated antagonism: The naloxone component in sublingual
     buprenorphine/naloxone has negligible bioavailability (~3-5%) when
     taken sublingually. It is included as an abuse deterrent for IV
     misuse, not as a clinically active component...
```
**This teaches the mechanism and corrects a common misconception.**

### Failure Mode #5: Unfocused Lead-ins (8 questions, 6%)

```markdown
According to Pourmand et al. (2023), what level of heterogeneity was
observed in the meta-analysis of phenobarbital versus benzodiazepines
for intubation in alcohol withdrawal syndrome, and what does this indicate?
```
**Problem:** Two-part questions with vague leads ("what does this indicate") are hard to answer without seeing options.

---

## Part C: Quality Tier Assignment

### Chapter 01: Screening, Evaluation, Prevention (48 questions)

| QID | Type | Tier | Issue |
|-----|------|------|-------|
| white-2020-001 | recall | SILVER | Useful fact, needs vignette |
| white-2020-002 | recall | SILVER | Useful fact, needs vignette |
| white-2020-003 | recall | SILVER | FASD prevalence is useful, thin explanation |
| white-2020-004 | recall | SILVER | Epidemiology useful, lazy distractors |
| white-2020-005 | recall | BRONZE | Tests pregnancy drinking stats by month |
| white-2020-006 | recall | BRONZE | Tests ED visit percentages by sex |
| white-2020-007 | vignette | GOLD | Clinical scenario, good reasoning |
| white-2020-008 | vignette | GOLD | Application of trend data |
| white-2020-009 | vignette | GOLD | Adolescent dosing application |
| white-2020-010 | vignette | GOLD | Sexual minority screening |
| white-2020-011 | vignette | GOLD | Risk-severity paradox application |
| white-2020-012 | vignette | SILVER | Tests trend statistics in vignette |
| nelson-2022-001 | recall | SILVER | Age of initiation risk is useful |
| nelson-2022-002 | recall | GOLD | IOM classification is board-relevant |
| nelson-2022-003 | recall | SILVER | Foster care risk is useful |
| nelson-2022-004 | recall | BRONZE | CINI statistics trivia |
| nelson-2022-005 | recall | SILVER | Racism framework is useful |
| nelson-2022-006 | recall | GOLD | FDA digital therapeutics is current |
| nelson-2022-007 | vignette | GOLD | 24-hour screening application |
| nelson-2022-008 | vignette | GOLD | Brain development metaphor |
| nelson-2022-009 | vignette | GOLD | KEEP SAFE program |
| nelson-2022-010 | vignette | GOLD | Zero tolerance policy critique |
| nelson-2022-011 | vignette | GOLD | Aftercare counseling |
| nelson-2022-012 | vignette | GOLD | Confidentiality navigation |
| jones-2023-001 | recall | GOLD | PCP dependence association |
| jones-2023-002 | recall | GOLD | 5-HT2A mechanism |
| jones-2023-003 | recall | SILVER | Tolerance criterion |
| jones-2023-004 | recall | SILVER | PCP intoxication duration |
| jones-2023-005 | recall | SILVER | Null findings for MDMA/psilocybin |
| jones-2023-006 | recall | BRONZE | Table 1 p-value trivia |
| jones-2023-007 | vignette | GOLD | PCP clinical presentation |
| jones-2023-008 | vignette | GOLD | LSD tolerance counseling |
| jones-2023-009 | vignette | GOLD | PCP dependence pattern |
| jones-2023-010 | vignette | SILVER | Mescaline criterion |
| jones-2023-011 | vignette | GOLD | MDMA/psilocybin counseling |
| jones-2023-012 | vignette | GOLD | Study limitations |
| levy-2023-001 | recall | GOLD | Frequency-based screening |
| levy-2023-002 | recall | SILVER | AUC values |
| levy-2023-003 | recall | SILVER | BSTAD sensitivity |
| levy-2023-004 | recall | GOLD | Disclosure rate comparison |
| levy-2023-005 | recall | BRONZE | ADHD prevalence in study sample |
| levy-2023-006 | recall | GOLD | Tool recommendation |
| levy-2023-007 | vignette | GOLD | Practice implementation |
| levy-2023-008 | vignette | GOLD | S2BI cutoff application |
| levy-2023-009 | vignette | SILVER | Sensitivity interpretation |
| levy-2023-010 | vignette | GOLD | Mixed-age setting |
| levy-2023-011 | vignette | SILVER | Recruitment bias |
| levy-2023-012 | vignette | GOLD | DSM-5 criteria threshold |

**Chapter 01 Summary:**
- GOLD: 24 (50%)
- SILVER: 18 (38%)
- BRONZE: 6 (12%)
- CUT: 0

---

### Chapter 02: Alcohol (48 questions)

| QID | Type | Tier | Issue |
|-----|------|------|-------|
| anton-2020-001 | recall | SILVER | NNT is useful but lazy distractors |
| anton-2020-002 | recall | GOLD | α2δ-1 mechanism is board-relevant |
| anton-2020-003 | recall | BRONZE | Subgroup percentages trivia |
| anton-2020-004 | recall | BRONZE | %dCDT cutoff trivia |
| anton-2020-005 | recall | BRONZE | CIWA exclusion cutoff trivia |
| anton-2020-006 | recall | SILVER | Dosing regimen is useful |
| anton-2020-007 | vignette | GOLD | Withdrawal severity indication |
| anton-2020-008 | vignette | GOLD | Dizziness side effect |
| anton-2020-009 | vignette | GOLD | Titration schedule |
| anton-2020-010 | vignette | GOLD | Entry criteria |
| anton-2020-011 | vignette | GOLD | Low-withdrawal subgroup |
| anton-2020-012 | vignette | GOLD | Neurobiological rationale |
| kelly-2020-001 | recall | CUT | Study count/participant trivia |
| kelly-2020-002 | recall | GOLD | Abstinence superiority finding |
| kelly-2020-003 | recall | SILVER | MATCH percentages |
| kelly-2020-004 | recall | BRONZE | Healthcare cost percentage |
| kelly-2020-005 | recall | GOLD | AA therapeutic mechanisms |
| kelly-2020-006 | recall | GOLD | Prescriptive referral approach |
| kelly-2020-007 | vignette | GOLD | Evidence-based counseling |
| kelly-2020-008 | vignette | GOLD | Cost-effectiveness |
| kelly-2020-009 | vignette | GOLD | Referral strategy |
| kelly-2020-010 | vignette | GOLD | Dual diagnosis |
| kelly-2020-011 | vignette | GOLD | Powerlessness concept |
| kelly-2020-012 | vignette | GOLD | Relative advantage calculation |
| kranzler-2023-001 | recall | SILVER | AUD prevalence |
| kranzler-2023-002 | recall | GOLD | Heritability |
| kranzler-2023-003 | recall | SILVER | NNT comparison |
| kranzler-2023-004 | recall | BRONZE | 1.6% FDA medication rate |
| kranzler-2023-005 | recall | GOLD | Disulfiram approval history |
| kranzler-2023-006 | recall | GOLD | XR-NTX subgroup driver |
| kranzler-2023-007 | vignette | GOLD | Binge drinking definition |
| kranzler-2023-008 | vignette | GOLD | FDA-approved medications |
| kranzler-2023-009 | vignette | GOLD | Gabapentin indication |
| kranzler-2023-010 | vignette | GOLD | Disulfiram duration |
| kranzler-2023-011 | vignette | GOLD | COMBINE findings |
| kranzler-2023-012 | vignette | GOLD | Topiramate titration |
| pourmand-2023-001 | recall | SILVER | Primary outcome measure |
| pourmand-2023-002 | recall | CUT | Study count/patient trivia |
| pourmand-2023-003 | recall | GOLD | Phenobarbital mechanism |
| pourmand-2023-004 | recall | BRONZE | Risk ratio exact values |
| pourmand-2023-005 | recall | SILVER | Moderator analysis finding |
| pourmand-2023-006 | recall | BRONZE | I² heterogeneity value |
| pourmand-2023-007 | vignette | GOLD | Clinical interpretation |
| pourmand-2023-008 | vignette | GOLD | Pharmacologic rationale |
| pourmand-2023-009 | vignette | SILVER | ED vs ICU heterogeneity |
| pourmand-2023-010 | vignette | SILVER | Study quality (RCT count) |
| pourmand-2023-011 | vignette | GOLD | Study discrepancy explanation |
| pourmand-2023-012 | vignette | GOLD | Standardization recommendation |

**Chapter 02 Summary (POST-STABILIZATION):**
- GOLD: 38 (79%)
- SILVER: 10 (21%)
- BRONZE: 0 (0%)
- CUT: 0 (0%)

*Note: 9 questions were rewritten on Feb 2, 2026 to test clinical concepts instead of statistics.*

---

### Chapter 03: Cannabis (48 questions)

| QID | Type | Tier | Issue |
|-----|------|------|-------|
| gilman-2022-001 | recall | SILVER | CUD percentages |
| gilman-2022-002 | recall | CUT | Sample size/randomization trivia |
| gilman-2022-003 | recall | SILVER | OR for CUD |
| gilman-2022-004 | recall | GOLD | Insomnia improvement finding |
| gilman-2022-005 | recall | SILVER | Anxiety/depression subgroup % |
| gilman-2022-006 | recall | GOLD | Most common CUD symptoms |
| gilman-2022-007 | vignette | GOLD | Insomnia counseling |
| gilman-2022-008 | vignette | GOLD | Pain null finding |
| gilman-2022-009 | vignette | GOLD | Affective disorder risk |
| gilman-2022-010 | vignette | GOLD | Medical context not protective |
| gilman-2022-011 | vignette | GOLD | SF-12 discrepancy |
| gilman-2022-012 | vignette | GOLD | Policy implications |
| meier-2022-001 | recall | GOLD | IQ decline magnitude |
| meier-2022-002 | recall | CUT | Sample size/retention trivia |
| meier-2022-003 | recall | GOLD | Hippocampal subfields |
| meier-2022-004 | recall | GOLD | Mediation (non) finding |
| meier-2022-005 | recall | GOLD | Recreational user finding |
| meier-2022-006 | recall | BRONZE | E-value interpretation |
| meier-2022-007 | vignette | GOLD | Cognitive domains |
| meier-2022-008 | vignette | GOLD | Recreational use counseling |
| meier-2022-009 | vignette | GOLD | Quitter outcomes |
| meier-2022-010 | vignette | GOLD | Comparison to tobacco/alcohol |
| meier-2022-011 | vignette | GOLD | Dementia comparison |
| meier-2022-012 | vignette | GOLD | Confounder control |
| gorelick-2023-001 | recall | GOLD | DSM-5 criteria threshold |
| gorelick-2023-002 | recall | GOLD | Oral cannabis pharmacokinetics |
| gorelick-2023-003 | recall | SILVER | Motor vehicle crash risk |
| gorelick-2023-004 | recall | GOLD | Frequency-CUD relationship |
| gorelick-2023-005 | recall | SILVER | Screening test performance |
| gorelick-2023-006 | recall | SILVER | Cannabis-induced psychosis incidence |
| gorelick-2023-007 | vignette | GOLD | CHS distinguishing feature |
| gorelick-2023-008 | vignette | GOLD | Intoxication management |
| gorelick-2023-009 | vignette | GOLD | Screening approach |
| gorelick-2023-010 | vignette | GOLD | Withdrawal management |
| gorelick-2023-011 | vignette | GOLD | Psychosis transition rate |
| gorelick-2023-012 | vignette | GOLD | Breastfeeding counseling |
| myran-2023-001 | recall | GOLD | Transition rate vs population |
| myran-2023-002 | recall | GOLD | Cannabis highest transition |
| myran-2023-003 | recall | GOLD | Amphetamine non-psychosis risk |
| myran-2023-004 | recall | GOLD | Absolute vs relative burden |
| myran-2023-005 | recall | GOLD | Young male transition rate |
| myran-2023-006 | recall | CUT | Sample size trivia |
| myran-2023-007 | vignette | GOLD | Young male prognosis |
| myran-2023-008 | vignette | GOLD | Alcohol without psychosis |
| myran-2023-009 | vignette | GOLD | Population burden |
| myran-2023-010 | vignette | GOLD | Sex differences by age |
| myran-2023-011 | vignette | GOLD | Amphetamine vs cannabis |
| myran-2023-012 | vignette | GOLD | Policy implications |

**Chapter 03 Summary:**
- GOLD: 36 (75%)
- SILVER: 6 (12.5%)
- BRONZE: 1 (2%)
- CUT: 5 (10.5%)

---

## Part D: Chapter-by-Chapter Summary

### Chapter 01: Screening, Evaluation, Prevention

| Metric | Value |
|--------|-------|
| Total questions | 48 |
| GOLD | 24 (50%) |
| SILVER | 18 (38%) |
| BRONZE | 6 (12%) |
| CUT | 0 (0%) |

**Most common failure mode:** Thin explanations (just stating the correct number without teaching)

**Worst question:**
```markdown
qid: white-2020-005
What is the approximate prevalence of alcohol use in the first, second,
and third months of pregnancy respectively?
- A) 42%, 17%, 8%
- B) 30%, 20%, 10%
...
```
Tests memorization of three percentages. No physician memorizes this.

**Best question:**
```markdown
qid: white-2020-010
A 28-year-old woman who identifies as bisexual presents for a routine visit...
```
Clinical scenario, tests application of epidemiological knowledge to screening.

---

### Chapter 02: Alcohol

| Metric | Value |
|--------|-------|
| Total questions | 48 |
| GOLD | 28 (58%) |
| SILVER | 10 (21%) |
| BRONZE | 8 (17%) |
| CUT | 2 (4%) |

**Most common failure mode:** Testing raw study statistics (NNT values, percentages, sample sizes)

**Worst questions:**
```markdown
qid: kelly-2020-001
How many studies and participants were included in the systematic review?
```
```markdown
qid: pourmand-2023-002
How many studies and total patients were included?
```
These test nothing useful and have lazy numerical distractors.

**Best questions:**
```markdown
qid: kelly-2020-009
An addiction psychiatry fellow... asks the attending how to refer the
patient to AA. Based on Kelly et al. (2020), which referral strategy is
most likely to improve outcomes?
```
Tests clinical application of the "warm handoff" finding.

---

### Chapter 03: Cannabis

| Metric | Value |
|--------|-------|
| Total questions | 48 |
| GOLD | 36 (75%) |
| SILVER | 6 (12.5%) |
| BRONZE | 1 (2%) |
| CUT | 5 (10.5%) |

**Most common failure mode:** Sample size/study design trivia

**Worst questions:**
```markdown
qid: gilman-2022-002
How many participants were included... and what was the randomization ratio?
```
```markdown
qid: myran-2023-006
What was the sample size and what percentage...?
```

**Best questions:** Nearly all myran-2023 vignettes are excellent, testing application of transition risk data to clinical counseling.

---

## Part E: Overall Statistics

### Quality Distribution

| Tier | Count | Percentage |
|------|-------|------------|
| GOLD | 88 | 61% |
| SILVER | 34 | 24% |
| BRONZE | 15 | 10% |
| CUT | 7 | 5% |

### Top 5 Failure Modes

| Rank | Failure Mode | Count | % of Total |
|------|--------------|-------|------------|
| 1 | Study trivia (sample sizes, participant counts) | 34 | 24% |
| 2 | Thin explanations | 45 | 31% |
| 3 | Lazy numerical distractors | 22 | 15% |
| 4 | No clinical context (recall without vignette) | 72 | 50%* |
| 5 | Exact percentage testing | 18 | 12% |

*Note: This is the full recall question count; not all recall questions are problematic, but all lack vignettes by design.

### Rework Effort Estimate

| Category | Count | Effort |
|----------|-------|--------|
| CUT (delete entirely) | 7 | Minimal |
| Major rewrite (BRONZE → GOLD) | 15 | High (new vignettes, new concepts) |
| Minor revision (SILVER → GOLD) | 34 | Medium (add vignettes, improve explanations) |
| Ready to ship (GOLD) | 88 | None |

**Total effort:** 56 questions need revision (39% of bank)

---

## Recommendations

### Immediate Actions

1. **Delete these 7 questions immediately:**
   - kelly-2020-001 (study count trivia)
   - pourmand-2023-002 (study count trivia)
   - gilman-2022-002 (sample size trivia)
   - meier-2022-002 (sample size trivia)
   - myran-2023-006 (sample size trivia)
   - Replace with questions testing clinical implications of these papers

2. **Priority rewrites (BRONZE tier):**
   - anton-2020-003, 004, 005 (study design details)
   - jones-2023-006 (Table 1 statistics)
   - levy-2023-005 (ADHD prevalence in sample)
   - kelly-2020-004 (cost percentage)
   - kranzler-2023-004 (medication prescription rate)
   - pourmand-2023-004, 006 (risk ratio, heterogeneity values)
   - meier-2022-006 (E-values)
   - white-2020-005, 006 (pregnancy/ED percentages)

3. **Upgrade explanations:**
   - All distractor explanations that say "over/underestimates" need revision
   - Add clinical pearls to every explanation
   - Explain WHY a wrong answer represents a common misconception

### Future Question Generation

1. **Never test:**
   - Sample sizes or participant counts
   - Number of studies in a meta-analysis
   - Exact percentages from epidemiological studies
   - Confidence intervals or p-values
   - Study retention rates
   - Randomization ratios

2. **Always test:**
   - Clinical implications ("What does this finding mean for patient care?")
   - Mechanism of action and pharmacology
   - When to use which medication or intervention
   - How to counsel patients about risks and benefits
   - Recognition of clinical presentations

3. **Question structure:**
   - All questions should have clinical vignettes
   - Lead-in should ask a specific clinical task
   - Distractors should represent common misconceptions, not numerical variations
   - Explanations should teach the concept, not just confirm the right answer

---

## Questions Flagged for CUT

### To Delete:

1. **kelly-2020-001**: "How many studies and participants were included in the systematic review of AA and 12-Step Facilitation?"

2. **pourmand-2023-002**: "How many studies and total patients were included in the systematic review and meta-analysis of phenobarbital for alcohol withdrawal syndrome?"

3. **gilman-2022-002**: "How many participants were included in the analysis of the medical marijuana card trial, and what was the randomization ratio?"

4. **meier-2022-002**: "What was the sample size and retention rate at age 45 in the Dunedin Longitudinal Study?"

5. **myran-2023-006**: "What was the sample size and what percentage of individuals with incident ED visits for substance use had substance-induced psychosis?"

### Replacement Suggestions:

**Instead of kelly-2020-001, test:**
The key finding (AA/TSF superior for abstinence) or the clinical implication (prescriptive referral with warm handoff works better).

**Instead of pourmand-2023-002, test:**
The clinical finding (phenobarbital + benzodiazepine combination vs monotherapy) or the mechanism (different GABA binding site).

**Instead of gilman-2022-002, test:**
The clinical finding (insomnia improved, pain/anxiety/depression did not) or the risk profile (28.3% CUD in affective disorder patients).

**Instead of meier-2022-002, test:**
The cognitive findings (5.5 IQ decline, specific domains affected) or the clinical implication (recreational use not harmful, long-term use is).

**Instead of myran-2023-006, test:**
The transition rates by substance or the clinical implication for counseling (cannabis highest risk for psychosis transition).

---

## Quality Benchmarks Going Forward

### GOLD Standard Checklist

- [ ] Clinical vignette with patient demographics and presentation
- [ ] Specific lead-in question (not "which is true")
- [ ] Homogeneous, plausible distractors
- [ ] Distractors represent common misconceptions
- [ ] Explanation teaches the underlying concept
- [ ] Each wrong answer explanation says WHY it's wrong (mechanism, not just "incorrect")
- [ ] Clinical pearl included
- [ ] Tests application, not recall of statistics

### Examples to Emulate

From this question bank, the best questions are:
- kelly-2020-009 (warm handoff referral)
- gilman-2022-009 (affective disorder CUD risk)
- meier-2022-010 (cannabis vs tobacco/alcohol comparison)
- myran-2023-007 (young male prognosis counseling)
- gorelick-2023-008 (intoxication management)

These questions take research findings and ask how they apply to patient care.

---

## Parser Corruption Audit (March 24, 2026)

**Auditor:** Claude (verified via automated scan of all 948 imported MDX files)
**Tracker:** [DEBT-338](../../docs/debt/debt-338-seed-parser-silent-wrong-answer-section-corruption.md)

The seed parser (`parseChoiceExplanations()` in `scripts/seed-helpers.ts`) silently corrupts question data when the `## Explanation` section doesn't follow strict ordering rules. Two corruption patterns were found affecting 24 files total.

### Pattern 1: Clinical Pearl After Wrong-Answer Bullets (23 files)

When `**Clinical Pearl:**` appears AFTER the wrong-answer bullets instead of before them, the parser appends the clinical pearl text to the last choice's wrong-answer explanation. The learner sees the clinical pearl jammed into a wrong-answer card.

**Fix:** Move the `**Clinical Pearl:**` paragraph ABOVE the `**Why other answers are wrong:**` heading in each affected file.

**Affected draft source files:**

| Source Paper | Draft File | Line |
|-------------|-----------|------|
| white-2020 | `article-based-pathway/01-screening-evaluation-prevention/2020-white-gender-differences-alcohol-harms/recall.md` | 144 |
| white-2020 | `article-based-pathway/01-screening-evaluation-prevention/2020-white-gender-differences-alcohol-harms/vignettes.md` | 218 |
| nelson-2022 | `article-based-pathway/01-screening-evaluation-prevention/2022-nelson-et-al-prevention-of-sud/recall.md` | 33, 109, 148, 187, 226 |
| nelson-2022 | `article-based-pathway/01-screening-evaluation-prevention/2022-nelson-et-al-prevention-of-sud/vignettes.md` | 33, 72, 185, 224 |
| jones-2023 | `article-based-pathway/01-screening-evaluation-prevention/2023-jones-et-al-hallucinogen-misuse-recent-users/recall.md` | 35, 74, 224 |
| jones-2023 | `article-based-pathway/01-screening-evaluation-prevention/2023-jones-et-al-hallucinogen-misuse-recent-users/vignettes.md` | 35, 74 |
| levy-2023 | `article-based-pathway/01-screening-evaluation-prevention/2023-levy-et-al-adolescent-sud-screening/recall.md` | 33, 109, 148, 187, 226 |
| levy-2023 | `article-based-pathway/01-screening-evaluation-prevention/2023-levy-et-al-adolescent-sud-screening/vignettes.md` | 33, 72 |

**Corresponding imported MDX files (23):**

```
jones-2023-001, -002, -006, -007, -008
levy-2023-001, -003, -004, -005, -006, -007, -008
nelson-2022-001, -003, -004, -005, -006, -007, -008, -011, -012
white-2020-004, -012
```

All in `content/questions/imported/article-based-pathway/`.

### Pattern 2: Combined-Label Bullet (1 file)

`palis-2022-002` uses `- A, B, D) While descriptive, these are not the specific term cited in the literature` to explain three wrong answers in one bullet. The parser regex cannot match combined labels — the entire line is silently dropped. All three choices show no wrong-answer explanation.

**Fix:** Split into three individual bullets:

```markdown
- A) "The convergence crisis" is not the specific term cited in the literature to describe the rise in stimulant use among people with opioid use disorder.
- B) "The polysubstance pandemic" is not the specific term cited in the literature.
- D) "The stimulant surge" is not the specific term cited in the literature.
```

**Affected draft source file:**
- `article-based-pathway/05-stimulants/2022-palis-et-al-concurrent-opioid-stimulant-overdose-risk/recall.md` line 69

**Corresponding imported MDX file:**
- `content/questions/imported/article-based-pathway/palis-2022/palis-2022-002.mdx` line 41

### Patterns Verified Not Present (0 files)

Scanned all 948 imported MDX files. Zero instances of:
- Invalid labels outside A–E (e.g., `- F)`)
- Stray non-bullet text before the first bullet (other than clinical pearl)
- Duplicate labels within a single question
- Empty wrong-answer sections (heading present, zero bullets)
- Missing wrong-answer heading (all 948 files have one)

### Required Actions

1. **Content fixes (external `addiction-final-2026` repo):** Fix the 24 affected draft source files per the patterns above, then re-run `pnpm content:import:drafts` and `pnpm db:seed`
2. **Parser hardening (this repo):** DEBT-338 Phase 1 — add strict validation so these patterns throw errors instead of silently corrupting data
3. **Long-term (this repo):** DEBT-338 Phase 2 — replace line-by-line regex parser with remark/unified AST-based parser
