# DEBT-382: Landing Page Content Refresh — Question Count And Author Credibility

**Priority:** P3
**Created:** 2026-05-12
**Source:** User-reported gap on the marketing landing page: the headline question count (`500+`) understates the actual content library (948 source `.mdx` question files imported into `content/questions/imported/` across 7 source pathways as of 2026-05-12), and there is no mention anywhere on the public marketing surface of the product being authored by a practicing, double board-certified psychiatrist.
**Related:** [Frontend Standards](../frontend/standards.md), [DEBT-378](../_archive/debt/debt-378-tutor-drop-submit-button-choice-click-commits.md), [DEBT-379](../_archive/debt/debt-379-exam-action-bar-primary-cta-right-slot-promotion.md), [DEBT-380](../_archive/debt/debt-380-exam-footer-cluster-previous-and-primary-cta-mirror-tutor.md), [DEBT-381](./debt-381-question-content-typography-audit-and-preference-path.md)

**Status:** Active — decisions locked, ready for implementation

---

## Decisions (locked by user on 2026-05-12)

| Question | Decision |
|----------|----------|
| Number to publish | `900+` |
| Placement of credibility line | **Option A** — directly under the hero badge, between `marketing-home.tsx:75-77` (badge) and `marketing-home.tsx:78-83` (h1) |
| Phrasing | **Option A1 (unnamed)** — `Authored by a practicing psychiatrist — double board-certified in Addiction Psychiatry and General Psychiatry.` |
| Board nomenclature | `General Psychiatry` (formal ABPN, not "General Adult Psychiatry") |
| Author name on hero | **Not included.** User is considering a legal first-name change; locking a specific name onto a public marketing surface now would create future work and a potential credibility hiccup if a buyer cross-references ABPN/NPI/LinkedIn later. The unnamed phrasing keeps roughly 80% of the credibility lift (working, double-board-certified, exact subspecialty) without committing to a name spelling. Upgrade path to a named variant later is a one-line edit. |
| Optional AJA 2023 publication line | **Not included** in this debt item. |

**Still open (does not block implementation):**

- `impactStats[1]` (`2 Study Modes`) — leave at `2`, bump to `3` to count Quick Practice, or replace the stat. Default if unspecified at implementation time: leave at `2`.

---

## Verdict

Two concrete edits to the public marketing landing page (`/`):

1. **Replace the stale "500+ Board-Style Questions" stat** with an honest, conservative number that reflects the current library size. Recommended copy: **`900+`**. Backed by 948 `.mdx` source question files in `content/questions/imported/` on the current `dev` branch. Rounding down to `900+` avoids drift between marketing copy and the live published count and gives headroom before the next required refresh.
2. **Add a single, restrained, _unnamed_ author-credibility line** that surfaces the differentiator without theatrics. Locked public copy:
   > _Authored by a practicing psychiatrist — double board-certified in Addiction Psychiatry and General Psychiatry._
   No headshot. No testimonial-style bordered card. No name. No MD/DO/credential alphabet soup. One line, one location.

This is intentionally a minimum-viable copy refresh, not a redesign. Visual layout, hero composition, pricing card structure, and section ordering are out of scope. Only `<span>` / `<p>` text and the `impactStats` array change.

> **Author identification (for this doc only, not for the landing page).** The product is authored and maintained by Dr. John H. Jung, MD, MS — currently practicing as an outpatient telehealth psychiatrist (TimelyCare, since 2/2023), double board-certified by the **American Board of Psychiatry and Neurology (ABPN)** in **General Psychiatry** (certified 9/2023) and **Addiction Psychiatry** (certified 10/2024), addiction psychiatry fellowship-trained at **Mount Sinai Beth Israel**. The public landing-page copy in this debt item deliberately uses unnamed phrasing — see the Decisions table for rationale. A future debt item can promote the unnamed line to a named variant as a one-line edit if/when the user decides to do so.

> **Nomenclature note.** The user described the credential verbally as "general psychiatrist adult." The ABPN's actual board name is **General Psychiatry** — adult is the default scope of that board (child & adolescent is a separate subspecialty). The locked copy uses the formal ABPN phrasing.

---

## Why This Is Debt

### Stale headline claim

`components/marketing/marketing-home.tsx:18-23` declares:

```typescript
const impactStats = [
  { value: '500+', label: 'Board-Style Questions' },
  { value: '2', label: 'Study Modes' },
  { value: 'Instant', label: 'Explanations' },
  { value: '100%', label: 'Mobile Responsive' },
];
```

The `500+` value is the only one of the four stats that is a hard, falsifiable, content-volume claim. The library has nearly doubled since that string was written; current source-of-truth count is **948 `.mdx` question files** in `content/questions/imported/` across:

- `50-studies-every-psychiatrist-should-know/` — 48
- `article-based-pathway/` — 480
- `asam-guidelines/` — 108
- `cochrane/` — 24
- `personal-papers/` — 132
- `prescribers-guide/` — 144
- `therapy/` — 12

This is concrete user harm: a prospective buyer landing on the public homepage today is being told the library is roughly half its actual size. That is both unfair to the product and a credibility risk if a buyer later notices the discrepancy in-app.

### No author credibility surface

`components/marketing/marketing-home.tsx:74-91` (hero), `components/marketing/marketing-home.tsx:135-180` (features), `components/marketing/marketing-home.tsx:253-280` (final CTA), and `components/marketing/marketing-layout.tsx:79-119` (footer) collectively contain **zero references** to the author/creator. The product reads as institutionally anonymous.

For a single-author specialty board prep product, anonymity is a real differentiation cost relative to:

- Larger generic question-bank vendors (UWorld, BoardVitals, Beat the Boards), where users assume content is authored by a stable of contractors of unknown clinical activity status.
- AI-generated "study tools" flooding the space in 2025–2026.

A single, low-key author-attribution line says, in effect: *this content was written by someone who currently practices in the field and holds both relevant board certifications.* That is not a marketing flourish — it is a verifiable, concrete claim that prospective buyers cannot derive elsewhere on the site.

This is consistent with the existing memory rule `feedback_no_speculative_debt`: the harm is observable (no credibility surface today, missed positioning) rather than speculative ("could be better someday").

---

## Current State (verified)

| File | Lines | Element | Current copy |
|------|-------|---------|--------------|
| `components/marketing/marketing-home.tsx` | 19 | `impactStats[0].value` | `500+` |
| `components/marketing/marketing-home.tsx` | 19 | `impactStats[0].label` | `Board-Style Questions` |
| `components/marketing/marketing-home.tsx` | 20 | `impactStats[1].value` | `2` |
| `components/marketing/marketing-home.tsx` | 20 | `impactStats[1].label` | `Study Modes` |
| `components/marketing/marketing-home.tsx` | 75-77 | Hero badge | `Board prep, built for outcomes` |
| `components/marketing/marketing-home.tsx` | 78-83 | Hero h1 | `Master Your Board Exams.` |
| `components/marketing/marketing-home.tsx` | 84-88 | Hero subtitle | `High-yield questions with detailed explanations for Addiction Psychiatry and Addiction Medicine. Practice with confidence and track your progress.` |
| `components/marketing/marketing-home.tsx` | 263-265 | Final-CTA subtitle | `Join physicians and psychiatrists preparing for addiction boards. Full access, cancel anytime.` |
| `components/marketing/marketing-layout.tsx` | 87-89 | Footer tagline | `Board exam preparation for addiction medicine professionals.` |

The hero subtitle (`marketing-home.tsx:84-88`) is the only place on the page that already mentions both Addiction Psychiatry and Addiction Medicine specifically — it is correct and stays.

---

## Proposed Changes

### Change 1 — Update `impactStats[0]` (question count)

**File:** `components/marketing/marketing-home.tsx:19`

**From:**

```typescript
{ value: '500+', label: 'Board-Style Questions' },
```

**To (recommended):**

```typescript
{ value: '900+', label: 'Board-Style Questions' },
```

Rationale for `900+` over `948` or `1000`:

- `948` exposes a precise integer that will be wrong the moment a single question is added or retired. `900+` is honest, conservative, and ages well.
- `1000` rounds up past the verified source-file count. Avoid.
- `900+` is the user's pre-audit instinct and is supported by the verified source count.

### Change 2 — Add author-credibility line

There are three viable placements. The doc's recommendation is **(A)**, with (B) and (C) listed for the user's explicit selection:

#### Option A (recommended) — quiet line directly under the hero badge

Insert a new short line between the hero badge (`marketing-home.tsx:75-77`) and the h1 (`marketing-home.tsx:78-83`). One sentence, muted color, no card or border.

Variants considered (the user has locked **A1** — the other variants are documented for transparency only):

**Unnamed:**

- **A1 (LOCKED):** `Authored by a practicing psychiatrist — double board-certified in Addiction Psychiatry and General Psychiatry.`
- **A2 (not selected):** `Built by a working, double board-certified addiction and general adult psychiatrist.`

**Named (not selected — deferred):**

- **A3 (not selected):** `Authored by Dr. John H. Jung, MD — a working psychiatrist, double board-certified in Addiction Psychiatry and General Psychiatry.`
- **A4 (not selected):** `Authored by Dr. John H. Jung, MD — a working psychiatrist, board-certified by the ABPN in Addiction Psychiatry and General Psychiatry, fellowship-trained at Mount Sinai Beth Israel.`

**Why A1 over A3/A4.** The user is considering a legal first-name change, so locking a specific name onto a public marketing surface now would (a) generate future copy/asset rework, and (b) create a minor cross-referencing inconsistency between the landing page and external registries (ABPN, NPI, LinkedIn) during the transition. A1 captures ~80% of the credibility lift available from naming (working, double board-certified, exact subspecialty) without committing to a name spelling. The upgrade path from A1 → A3 (or to a Raymond-prefixed variant) is a one-line text change when the user is ready.

#### Option B — small "About the author" section between features and pricing

A new short section card (one line, no avatar, no inset block-quote). Visual weight similar to a single feature card. Avoids touching the hero. More discoverable, slightly more visual real estate.

#### Option C — footer tagline replacement

Replace `marketing-layout.tsx:88` (`Board exam preparation for addiction medicine professionals.`) with: `Board exam preparation, authored by a working double board-certified addiction psychiatrist.`

Option C is the least intrusive but also the easiest to miss. Use only if the user wants the credibility claim present but explicitly not in the above-the-fold layer.

### Change 3 (optional, do not auto-include) — re-evaluate `impactStats[1]`

`impactStats[1]` claims `2 Study Modes`. The app today exposes Tutor mode, Exam mode, and a separate Quick Practice surface (`app/(app)/app/practice/quick/quick-practice-client.tsx`). Depending on how Quick Practice is framed (third mode vs. launcher for Tutor), this stat may also be stale.

This is flagged but **not** included in the recommended diff for this debt item. If the user wants Quick Practice counted as a mode, a follow-up change can update `2 → 3` in the same patch. If not, no change.

---

## What This Debt Item Does NOT Touch

- Hero h1 (`Master Your Board Exams.`) — generic but functional; redesign is out of scope.
- Pricing card structure, layout, or copy at `marketing-home.tsx:182-251`.
- `MetallicCtaButton` exception (`marketing-home.tsx:267-271`, `@debt-exception D-15`).
- Features array contents (`marketing-home.tsx:25-54`).
- Visual layout, spacing, typography tokens, dark/light theme.
- Headshot, bio page, separate `/about` route, testimonial section.
- A/B testing scaffolding.
- SEO meta description / OpenGraph copy.
- Marketing footer tagline (unless the user picks Option C above).
- `lib/pricing-data.ts` contents.

Anything beyond the two text edits above is a separate debt item.

---

## Open Questions For The User

All headline questions have been resolved. See the **Decisions** table at the top of this document for the locked answers.

The single remaining open item (does NOT block implementation):

- **`impactStats[1]` (`2 Study Modes`).** Leave at `2`, bump to `3` (counting Quick Practice as a third surface), or replace the stat with something else? Default at implementation time if no answer is given: leave at `2` — out of scope for this debt item.

---

## CV-Driven Credibility Inventory

The user supplied a full CV. The following is an explicit accounting of what was considered and what was chosen for inclusion, so the user can see the editorial logic and override any of it.

### Included in proposed copy

| CV element | Why included |
|------------|--------------|
| Name: Dr. John H. Jung, MD, MS | Required for any "named" credibility line; verifiable, ownable. |
| ABPN General Psychiatry (cert. 9/2023) | Core credential, directly relevant to the product audience (psychiatry boards). |
| ABPN Addiction Psychiatry (cert. 10/2024) | Core credential, exactly the subspecialty this product targets. |
| Current outpatient telehealth practice (TimelyCare, 2/2023 – Current) | Supports the verifiable "working psychiatrist" claim. Active, not retired/academic-only. |
| Mount Sinai Beth Israel addiction psychiatry fellowship (7/2023 – 6/2024) | Recognizable program. Strongest single non-verbal credibility lever on the page (Option A4 only). |

### Considered and excluded (clutter risk)

| CV element | Why excluded |
|------------|--------------|
| 4 active state medical licenses (NY, VA, FL, TX) | Sounds like overkill on a study-product landing page; reads as defensive credential-stacking rather than relevant signal. |
| Prior positions: Realization Center, Advanced Recovery Systems, Ohio Clinical Trials | "Currently practicing" is the load-bearing claim; listing prior employers adds line length, not signal. |
| Peer-reviewed publication (American Journal on Addictions, 2023, Silver Tsunami / motivational interviewing) | Genuinely strong academic signal, but listing publications on a marketing landing page risks looking like a textbook ad. Flagged as optional Option A4-extension if the user wants it. |
| Grand Rounds and AAAP poster presentations | Same reason as above. Belongs on a separate `/about` page if one is ever built. |
| Teaching experience (Mount Sinai, Larkin, OSU) | Strong CV signal, weak landing-page signal. Would clutter without earning trust users do not already have. |
| QI projects (Larkin practical-guide, OSU opioid pilot) | Internal-improvement work; not legible to a buyer in 1 second. |
| Education history (UCLA → U Cincinnati → OSU → Larkin → Mount Sinai) | Full pedigree belongs on a bio page, not a hero. |
| PRITE high score, Henry Nasrallah Award, Samuel J. Roessler Fund, Academic Scholarship | Insider awards; meaningless to a buyer skimming the page. |
| Clinical research as sub-investigator (Janssen esketamine, Purdue nalmefene) | Sub-investigator role; risks looking inflated relative to the actual contribution. |
| Volunteer free-clinic work | Sympathetic but not on-axis for product credibility. |
| Photography / weight lifting hobbies | Not relevant; risks "corny" framing the user explicitly wants to avoid. |
| Address, phone, DEA active | Not appropriate for a public marketing surface. |

### Optional add-ons (only if the user wants more credibility surface)

If the user wants a slightly larger credibility footprint without leaving the homepage, the next two highest-signal additions would be:

- **Mount Sinai Beth Israel fellowship** (Option A4 already includes this).
- **Peer-reviewed publication line** — e.g. as a tiny secondary line under Option A: `Published in The American Journal on Addictions (2023).` This is the single most decision-relevant CV item not already in Option A3/A4.

Neither of these are in the recommended diff. They are listed here so the user can opt in explicitly.

---

## Implementation Constraints (when this is later picked up)

Per repo memory rules:

- `feedback_docs_before_code`: this spec must be reviewed and the open questions answered before any code change.
- `feedback_full_gate_before_push`: implementation PR must run the full quality gate before push: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`.
- `feedback_verify_doc_citations_mechanically`: every file:line citation in this doc has been opened and verified against `dev` as of `2026-05-12`. If the implementation PR is opened more than a few commits later, citations must be re-verified.

The marketing landing page has cached fragments (`'use cache'` directives at `marketing-home.tsx:71`, `:94`, `:136`, `:183`, `:254`). Any text change must:

- still typecheck and pass `pnpm build` (build catches `'use cache'` violations that `pnpm test` does not).
- update or extend existing snapshot/text assertions in `components/marketing/marketing-home.test.tsx` (currently asserts the `500+` value via `impact-stat-*` testids — that test will fail on copy change, which is correct).

---

## Acceptance Criteria

When the follow-up implementation PR ships:

- [ ] `impactStats[0].value` displays the user-confirmed number (default `900+`) on `/`.
- [ ] Credibility line is rendered in the user-selected location (A, B, or C) with the user-selected phrasing.
- [ ] `pnpm test --run` passes (including any updated assertions in `components/marketing/marketing-home.test.tsx`).
- [ ] `pnpm build` passes — no prerender or `'use cache'` regressions.
- [ ] Visual verification on `localhost:3000/` confirms the new copy renders in both light and dark themes without layout shift.
- [ ] No new files are introduced; the change is text-only edits to existing files.

---

## Verification Checklist

Before merging the implementation PR:

- [ ] Mechanical recount of `find content/questions/imported -name "*.mdx" | wc -l` re-confirms the source library size still supports the published number.
- [ ] No regressions in `components/marketing/marketing-home.test.tsx` or `components/marketing/marketing-layout.test.tsx`.
- [ ] CodeRabbit review on the implementation PR passes per `feedback_grade_before_merge`.
- [ ] Index updated when this debt item is closed (move to Resolved table, set Resolved date).
