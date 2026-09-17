# DEBT-477 implementation verification — 2026-09-16

Scope and rulings: [documentation PR #899](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/899). This branch starts at dev `05fcc51e`; implementation is F1–F9, F11, and the newly confirmed F12. F3 is Phase A only. The pricing cards retain their layout and the consent-coupled labels. No pricing data, legal content, or DEBT-414 document changed.

Registry/standards edits preceded red tests. The targeted run failed in 20 expected assertions across five files (100 other assertions passed). After implementation, all 140 targeted assertions including the theme-token regression passed. The obsolete metallic subjects and their tests were deleted after the replacement CTA test failed red.

Full validation passed: typecheck, lint and test-double scan, 4,244 unit tests in 461 files, 398 browser tests in 64 files, 258 local integration tests in 40 files (six opt-in provider cases skipped by their normal configuration), production build, and 44 authenticated E2E tests. All database work used the per-clone Docker database at 127.0.0.1:58952. Resend was unconfigured; no email or live Stripe operation occurred.

After captures use the local production build, dark Chromium, DPR 1, widths 390/768/1024/1440 and viewport height 900. They cover the same eight routes and section crops as the production baseline. The plan-query route retained background network activity past the bounded idle wait; captures show its completed plan selection UI. There was no horizontal overflow. Baseline images are byte-identical copies from #899; `review-after-local-*` images are new.

| Check | Result |
|---|---|
| Hero / outline / final primary height | 48 / 46 / 48 px at every width |
| Landing monthly / annual CTA | 50 / 48 px, both 16 px text |
| Footer at 768 | Tagline 40 px tall, legal nav 20 px; both top 2733.5 px, same first baseline |
| Footer at 1024 / 1440 | Tagline and legal nav each one line; legal pair remains together |
| Mobile footer | Brand, tagline, product/auth navigation, legal navigation in DOM order |
| Hero eyebrow contrast | 14.5567:1, previously 4.49:1 |
| Axe | Zero violations on home and pricing |
| Keyboard | 17 home and 18 pricing stops; all have a computed 3 px ring and per-stop screenshot |
| Motion | No metallic elements or compiled metallic CSS; remaining entrance animation changes to none under reduced motion |

Receipts: [link/button measurements](./measurements-after-477.json), [layout and contrast](./layout-after.json), [home accessibility](./accessibility-after-477.json), [pricing measurements](../debt-478/measurements-after-477.json), [pricing accessibility](../debt-478/accessibility-after-477.json).

PREP-ONLY. No merge or deployment was performed. CodeRabbit approval is checked separately against the pushed PR head; the external review quota is not treated as approval.
