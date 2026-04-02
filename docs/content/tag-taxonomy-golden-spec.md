# Tag Taxonomy — Golden Spec

> **Status:** Implemented (2026-02-18 via SPEC-033; re-verified 2026-03-17)
> **Companion docs:** [tag-taxonomy-pipeline.md](./tag-taxonomy-pipeline.md),
> [question-format-spec.md](./question-format-spec.md)
>
> This is the canonical taxonomy reference. Runtime implementation is aligned;
> use this doc for slugs, display names, ordering, and migration intent.

---

## Decision

Kill the legacy Exam Section (`domain`) filter entirely. Reduce visible filter
categories to 3:

1. **Topic** (13 values)
2. **Substance** (11 values)
3. **Treatment** (12 values)

Display order in the current Practice UI: Topic -> Substance -> Treatment.

The `diagnosis` tag kind remains valid in schema and storage, but it is
intentionally hidden from current Practice and History filter UIs.

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

> **Slug note:** Treatment "Other" uses `other-treatment` instead of `other`
> because `tags.slug` is globally unique across kinds. Substance already uses
> `other`.

---

## Migration Rules

### Exam Section → Topic

| Old Exam Section (domain tag) | New Topic |
|-------------------------------|-----------|
| Co-occurring & Medical Complications | Split: psychiatric comorbidity -> `co-occurring-disorders`, medical consequences -> `medical-complications` |
| Epidemiology & Prevention | `epidemiology-prevention` |
| Ethics, Legal & Policy | `ethics-legal` |
| General | `general` |
| Pharmacology & Neuroscience | `pharmacology-neuroscience` |
| Psychosocial Interventions | `psychosocial-interventions` |
| Screening & Diagnosis | `screening-diagnosis` |
| Treatment & Pharmacotherapy | `treatment-pharmacotherapy` |

### Old Topic → New Topic

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

All 10 carried-over values remain valid. `inhalants` stays in the canonical
set even though the current corpus is still empty for that slug.

Note: `caffeine` was removed from the canonical draft taxonomy and is no longer
valid runtime content.

### Old Treatment → New Treatment

| Old Treatment Slug | New Treatment Slug |
|--------------------|--------------------|
| `buprenorphine` | `buprenorphine` |
| `naloxone` | `naloxone` |
| `naltrexone` | `naltrexone` |

Added treatment slugs:
`acamprosate`, `bupropion`, `disulfiram`, `gabapentin`, `methadone`, `nrt`,
`topiramate`, `varenicline`, `other-treatment`.

---

## Implementation Status (SPEC-033)

The migration defined by this doc is complete.

### Phase 1: Content (MDX files)

- [x] Domain tags migrated to topic tags using the mapping tables
- [x] Legacy topic slugs migrated to canonical topic slugs
- [x] `domain` kind removed from MDX frontmatter
- [x] Rogue placeholder slugs remapped (`topic`, `psychosocial`)
- [x] Treatment tags expanded via migration scan
- [x] Invariants enforced (`>=1 topic`, `>=1 substance`)
- [x] Placeholder policy set to default-exclude in seed (opt-in include)

### Phase 2: Pipeline code

- [x] `lib/content/draftTaxonomy.ts` aligned to canonical topic / substance /
      treatment sets
- [x] `scripts/import-draft-questions.ts` no longer assigns taxonomy from
      directory names
- [x] `scripts/draft-question-import.ts` no longer emits `domain` tags
- [x] `lib/content/schemas.ts` enforces canonical slugs by kind and required
      topic / substance presence
- [x] `scripts/seed.ts` rejects `domain` tags and non-canonical slugs

### Phase 3: UI

- [x] Practice filter UI shows Topic -> Substance -> Treatment
- [x] History question filters are restricted to visible kinds
- [x] "Exam Section" is removed from runtime filters

### Phase 4: Cleanup

- [x] `caffeine` removed from canonical draft taxonomy
- [x] Legacy migration-only scripts retired
- [x] Pipeline docs updated
- [x] Coverage reports generated via `scripts/tag-census.ts` (script removed in DEBT-343; reports preserved in `docs/content/reports/`)

---

## Coverage Tracking

Use dated census reports for coverage analysis instead of relying on old
migration-era expectations.

Latest verified report:
[tag-census-2026-03-17.md](./reports/tag-census-2026-03-17.md)

As of 2026-03-17:

- Zero-count canonical slugs: substance `inhalants`
- Low-count canonical slugs at the default `<= 3` threshold: none

Historical snapshot:
[tag-census-2026-02-18.md](./reports/tag-census-2026-02-18.md)

---

## UI Behavior

- Zero-selected collapsed filter summaries show `All included by default`
- Expanded filter sections show `({N} selected)` below the chips
- Multi-select within each category
- Live question count updates as filters change
