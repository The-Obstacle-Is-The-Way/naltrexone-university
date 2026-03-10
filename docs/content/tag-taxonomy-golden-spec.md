# Tag Taxonomy — Golden Spec

> **Status:** Implemented (2026-02-18 via SPEC-033)
> **Companion doc:** [`tag-taxonomy-pipeline.md`](./tag-taxonomy-pipeline.md) — traces how tags flow through the system today
>
> This is the canonical taxonomy reference. Runtime implementation is aligned; use this with `tag-taxonomy-pipeline.md` for day-to-day validation.

---

## Decision

Kill the "Exam Section" (domain kind) filter entirely. Reduce from 4 filter categories to 3:

1. **Topic** (13 values)
2. **Substance** (11 values)
3. **Treatment** (12 values)

Display order on the Practice page: Topic → Substance → Treatment.

The `diagnosis` tag kind remains in the schema but is intentionally not exposed in the Practice filter UI.

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

## Implementation Status (SPEC-033)

The migration defined by this doc is complete. Summary by phase:

### Phase 1: Content (MDX files)

- [x] Domain tags migrated to topic tags using the mapping tables
- [x] Legacy topic slugs migrated to canonical topic slugs
- [x] `domain` kind removed from MDX frontmatter
- [x] Rogue placeholder slugs remapped (`topic`, `psychosocial`)
- [x] Treatment tags expanded via migration scan
- [x] Invariants enforced (`>=1 topic`, `>=1 substance`)
- [x] Placeholder policy set to default-exclude in seed (opt-in include)

### Phase 2: Pipeline code

- [x] `lib/content/draftTaxonomy.ts` aligned to canonical topic/substance/treatment sets
- [x] `scripts/import-draft-questions.ts` no longer assigns taxonomy from directory names
- [x] `scripts/draft-question-import.ts` no longer emits domain tags; canonical name lookups are explicit
- [x] `lib/content/schemas.ts` enforces canonical slugs by kind and required topic/substance presence
- [x] `scripts/seed.ts` rejects domain tags and non-canonical slugs

### Phase 3: UI

- [x] Practice filter UI shows Topic → Substance → Treatment
- [x] "Exam Section" removed from runtime filters
- [x] History filter options restricted to visible kinds (topic/substance/treatment)

### Phase 4: Cleanup

- [x] `caffeine` removed from canonical draft taxonomy
- [x] `scripts/migrate-domain-tags.ts` retired
- [x] Pipeline docs updated
- [x] Census report generated (`docs/content/reports/tag-census-2026-02-18.md`)

---

## Content Gaps (Post-Migration Priorities)

Once migration is complete, run a count per tag. Expected near-zero question counts for:

**Substances:** Inhalants, Cocaine, Hallucinogens

**Treatments:** Acamprosate, Disulfiram, Varenicline, NRT, Topiramate, Gabapentin, Methadone, Bupropion

These are all board-tested topics that the question bank is currently thin on — they become content generation priorities.

---

## UI Behavior (Unchanged)

- Zero-selected collapsed filter summaries show `All included by default`
- Expanded filter sections show `({N} selected)` below the chips
- Multi-select within each category
- Live question count updates as filters change
