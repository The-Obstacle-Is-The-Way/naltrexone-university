# Tag Taxonomy — Golden Spec

> **Status:** Approved (2026-02-17)
> **Companion doc:** [`tag-taxonomy-pipeline.md`](./tag-taxonomy-pipeline.md) — traces how tags flow through the system today
>
> This is the **target-state** canonical reference. Current implementation still differs in several places; use this with `tag-taxonomy-pipeline.md` when planning migration.

---

## Decision

Kill the "Exam Section" (domain kind) filter entirely. Reduce from 4 filter categories to 3:

1. **Topic** (13 values)
2. **Substance** (11 values)
3. **Treatment** (12 values)

Display order on the Practice page: Topic → Substance → Treatment.

The `diagnosis` tag kind remains in the schema but is intentionally not exposed in the Practice filter UI in the target state.

---

## Topic (13 values)

Display as pill buttons in this order:

| # | Slug | Display Name |
|---|------|-------------|
| 1 | `screening-diagnosis` | Screening & Diagnosis |
| 2 | `epidemiology-prevention` | Epidemiology & Prevention |
| 3 | `pharmacology-neuroscience` | Pharmacology & Neuroscience |
| 4 | `intoxication-toxicology` | Intoxication & Toxicology |
| 5 | `withdrawal-management` | Withdrawal Management |
| 6 | `treatment-pharmacotherapy` | Treatment & Pharmacotherapy |
| 7 | `psychosocial-interventions` | Psychosocial Interventions |
| 8 | `co-occurring-disorders` | Co-occurring Disorders |
| 9 | `medical-complications` | Medical Complications |
| 10 | `harm-reduction` | Harm Reduction |
| 11 | `ethics-legal` | Ethics & Legal |
| 12 | `special-populations` | Special Populations |
| 13 | `general` | General |

---

## Substance (11 values)

Alphabetical order:

| # | Slug | Display Name |
|---|------|-------------|
| 1 | `alcohol` | Alcohol |
| 2 | `cannabis` | Cannabis |
| 3 | `cocaine` | Cocaine |
| 4 | `hallucinogens` | Hallucinogens |
| 5 | `inhalants` | Inhalants |
| 6 | `opioids` | Opioids |
| 7 | `polysubstance` | Polysubstance |
| 8 | `sedatives` | Sedatives |
| 9 | `stimulants` | Stimulants |
| 10 | `tobacco` | Tobacco |
| 11 | `other` | Other |

---

## Treatment (12 values)

Medications only. Alphabetical order:

| # | Slug | Display Name |
|---|------|-------------|
| 1 | `acamprosate` | Acamprosate |
| 2 | `buprenorphine` | Buprenorphine |
| 3 | `bupropion` | Bupropion |
| 4 | `disulfiram` | Disulfiram |
| 5 | `gabapentin` | Gabapentin |
| 6 | `methadone` | Methadone |
| 7 | `naloxone` | Naloxone |
| 8 | `naltrexone` | Naltrexone |
| 9 | `nrt` | NRT |
| 10 | `topiramate` | Topiramate |
| 11 | `varenicline` | Varenicline |
| 12 | `other-treatment` | Other |

> **Slug note:** Treatment "Other" uses `other-treatment` (not `other`) because `tags.slug` is globally unique across all kinds. Substance already uses `other`, so the treatment fallback must use a distinct slug. Display name remains "Other".

---

## Migration Rules

### Exam Section → Topic (delete the entire Exam Section / domain kind)

| Old Exam Section (domain tag) | New Topic |
|-------------------------------|-----------|
| Co-occurring & Medical Complications | Split: psychiatric comorbidity → `co-occurring-disorders`, medical consequences → `medical-complications` |
| Epidemiology & Prevention | `epidemiology-prevention` |
| Ethics, Legal & Policy | `ethics-legal` |
| General | `general` |
| Pharmacology & Neuroscience | `pharmacology-neuroscience` |
| Psychosocial Interventions | `psychosocial-interventions` |
| Screening & Diagnosis | `screening-diagnosis` |
| Treatment & Pharmacotherapy | `treatment-pharmacotherapy` |

### Old Topic → New Topic (clean up the 17 messy values)

| Old Topic Slug | New Topic Slug |
|----------------|----------------|
| `comorbidity` | `co-occurring-disorders` |
| `diagnosis` | `screening-diagnosis` |
| `epidemiology` | `epidemiology-prevention` |
| `ethics-legal` | `ethics-legal` |
| `harm-reduction` | `harm-reduction` |
| `intoxication` | `intoxication-toxicology` |
| `medical-complications` | `medical-complications` |
| `neurobiology` | `pharmacology-neuroscience` |
| `pharmacology` | `pharmacology-neuroscience` |
| `psychosocial` | `psychosocial-interventions` |
| `psychotherapy` | `psychosocial-interventions` |
| `screening` | `screening-diagnosis` |
| `special-populations` | `special-populations` |
| `topic` | DELETE — retag manually based on content |
| `toxicology` | `intoxication-toxicology` |
| `treatment` | `treatment-pharmacotherapy` |
| `withdrawal` | `withdrawal-management` |

### Old Substance → New Substance

All 10 current values carry over unchanged. Add `inhalants` as a new empty tag (no questions yet).

Note: `caffeine` from the draft taxonomy (`DRAFT_SUBSTANCE_SLUGS`) is dropped — no published questions use it, and it's not board-relevant enough to surface as a filter.

### Old Treatment → New Treatment

| Old Treatment Slug | New Treatment Slug |
|--------------------|--------------------|
| `buprenorphine` | `buprenorphine` |
| `naloxone` | `naloxone` |
| `naltrexone` | `naltrexone` |

Add 9 new treatment tags: `acamprosate`, `bupropion`, `disulfiram`, `gabapentin`, `methadone`, `nrt`, `topiramate`, `varenicline`, `other-treatment`.

Existing questions should be re-scanned for treatment mentions and tagged accordingly.

---

## What Needs to Change (Implementation Checklist)

These are the systems that need updating to align with this spec. Implementation order matters — content first, then code.

### Phase 1: Content (MDX files)

- [ ] Map every existing domain tag to its new topic tag per the migration table
- [ ] Map every existing topic tag to its new topic slug per the migration table
- [ ] Remove all `domain` kind tags from MDX frontmatter
- [ ] Manually retag questions with the rogue `topic` slug based on their actual content
- [ ] Scan questions for treatment medication mentions and add treatment tags
- [ ] Validate: every question has at least one topic tag and one substance tag
- [ ] Decide placeholder policy (delete vs keep as compliant templates vs exclude from default seed)

### Phase 2: Pipeline code

- [ ] Remove `domain` from `AllTagKinds` in `src/domain/value-objects/tag-kind.ts`
- [ ] Remove `domain` from the PostgreSQL enum in `db/schema.ts` (migration)
- [ ] Update `lib/content/draftTaxonomy.ts` with the canonical topic, substance, and treatment slug lists
- [ ] Fix `domainFromPath()` in `scripts/import-draft-questions.ts` — either remove or replace with explicit topic assignment
- [ ] Update `titleCaseFromSlug()` or replace with an explicit slug→name lookup table
- [ ] Update `scripts/seed.ts` `upsertTags()` to validate against the new canonical lists

### Phase 3: UI

- [ ] Remove `domain` from `tagKindLabels` and `tagKindOrder` in `practice-session-starter.tsx`
- [ ] Update display order to: Topic → Substance → Treatment
- [ ] Remove any "Exam Section" references from the UI
- [ ] Verify filter counts update correctly with the new tag structure
- [ ] Verify History page tag dropdown no longer exposes legacy domain slugs after migration

### Phase 4: Cleanup

- [ ] Delete rogue placeholder tags (`topic`, `psychosocial`) from the database
- [ ] Remove `caffeine` from `DRAFT_SUBSTANCE_SLUGS` if it's no longer needed
- [ ] Update `tag-taxonomy-pipeline.md` to reflect the new state
- [ ] Run tag count report to identify content gaps for future question generation

---

## Content Gaps (Post-Migration Priorities)

Once migration is complete, run a count per tag. Expected near-zero question counts for:

**Substances:** Inhalants, Cocaine, Hallucinogens

**Treatments:** Acamprosate, Disulfiram, Varenicline, NRT, Topiramate, Gabapentin, Methadone, Bupropion

These are all board-tested topics that the question bank is currently thin on — they become content generation priorities.

---

## UI Behavior (Unchanged)

- "Leave empty to include all" logic stays the same
- Multi-select within each category
- Live question count updates as filters change
