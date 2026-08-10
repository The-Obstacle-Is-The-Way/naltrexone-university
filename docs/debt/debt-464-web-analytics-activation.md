# DEBT-464: Vercel Web Analytics activation with privacy-policy coherence

**Status:** Open
**Priority:** P3
**Filed:** 2026-08-10
**Baseline:** `origin/dev` at `d7af4f009ec9f3be49a350c730f5df3cc5a90a69`
**Owner decision (2026-08-10):** enable Vercel Web Analytics properly, with the Privacy Policy amended in the same change.

## Problem

The Vercel dashboard's Web Analytics toggle and the application code disagree, and the Privacy Policy documents the disagreement as an unresolved verification item. Until this debt executes, the project has an enabled analytics product collecting nothing, and a policy paragraph that hedges instead of stating facts.

## Measured evidence (2026-08-10)

All three layers were measured in one session; none of this is inferred.

| Layer | Method | Result |
|---|---|---|
| Dashboard toggle | Vercel REST API `GET /v9/projects/prj_vTWS0YcTJPcAAjgpPjovC0PydAP7?teamId=team_G6SwBNivWshoygtOPgu67vhE`, `webAnalytics` field | **ON since `2026-02-24T21:38:11.159Z`** (`webAnalytics.enabledAt` present, id `pitlCehO5Ma10jaGYpIDLku0Z`) |
| Application code | `package.json` and full-source grep at `origin/main` | **No `@vercel/analytics` dependency, no `<Analytics />` component anywhere** |
| Live transmission | grep of signed-out production HTML for `/terms`, `/privacy`, `/pricing` for `_vercel/insights` and `va.vercel-scripts`; Web Analytics query API | **Zero script references; query API returns 404 `Web Analytics not found` (no dataset has ever existed)** |

**Conclusion:** the toggle is on but the pipe was never connected. Zero events have ever been collected or transmitted. Every current Privacy Policy claim remains true today. On Next.js, the dashboard toggle alone transmits nothing; collection starts only when the `@vercel/analytics` component ships in the app.

## Scope and invariants

Add the analytics component and amend the Privacy Policy **in the same PR**, because the policy at `app/(marketing)/privacy/privacy-content.ts:73` currently promises: *"If an analytics script is activated, this policy and the notice at the collection point must be updated before relying on the feature."* Policy and collection must never be split across deploys in the wrong order; shipping them atomically satisfies the promise.

Invariants that MUST hold after execution:

1. **Terms of Service untouched.** The Terms never mention analytics (verify with `grep -i analytic` on `terms-content.ts` before starting). `TERMS_VERSION` and `TERMS_CONTENT_SHA256` in `lib/pricing-data.ts` MUST NOT change. If any Terms text is touched, this plan is being executed wrong; stop.
2. **Pricing `disclosureVersion` (`2026-08-05`) untouched.**
3. **These policy claims stay true and present:** no sale of personal information, no cross-context behavioural advertising, no advertising trackers or pixels, no session replay, no first-party cookie writes, no tag manager.
4. **Byte-identity mirrors hold:** the public section of `docs/legal/privacy-policy.md` stays byte-identical to `privacyContent.bodyMarkdown` (the mirror test enforces this).
5. **Zero em-dashes** in all new public policy text.
6. **No assertion deletion:** the mandatory-clause tests in `app/(marketing)/privacy/page.test.tsx` may be updated to pin new sentences but never removed or weakened. (Measured: no current assertion pins the analytics paragraph, so expected test churn is date pins plus new positive pins.)

## Execution plan

### Step 1: dependency and component

- `pnpm add @vercel/analytics` (match the version-pinning style already used in `package.json`).
- In the **root** layout `app/layout.tsx` (root, not a route-group layout, so marketing, legal, auth, and app routes are all covered): `import { Analytics } from '@vercel/analytics/next';` and render `<Analytics />` once immediately before `</body>`. Server-component compatible; no `'use client'` needed in the layout itself.
- No design-system impact: the component renders no visible UI.

### Step 2: verify Vercel's current privacy description (evidence gate for Step 3 wording)

Read Vercel's current Web Analytics privacy documentation (`https://vercel.com/docs/analytics/privacy-policy`) at execution time and confirm, with quotes recorded in the PR body: (a) no cookies; (b) no cross-site tracking; (c) how visitors are distinguished (currently a short-lived hash computed server-side, discarded within roughly a day). If Vercel's current documentation contradicts any wording in Step 3, adjust the Step 3 text to match the documentation and record the delta. Also record the current **Hobby-plan event cap and data-retention period** from Vercel's limits documentation in this doc's Results section when closing.

### Step 3: Privacy Policy amendments (exact old → new)

Apply to `app/(marketing)/privacy/privacy-content.ts` AND mirror byte-identically into the public section of `docs/legal/privacy-policy.md`.

**(a) Providers table, Vercel row (currently line 65).**
Old:
`| **Vercel** | Application hosting, delivery, and platform request logs | Request, IP, route, user-agent, device, deployment, and diagnostic information |`
New:
`| **Vercel** | Application hosting, delivery, platform request logs, and cookieless Web Analytics | Request, IP, route, user-agent, device, deployment, and diagnostic information; aggregated page-view and visit statistics as described below |`

**(b) Replace the audit-hedge paragraph (currently line 73) in full.**
Old (one paragraph): `The audited application build contains no Vercel Web Analytics component or analytics script. The repository does not establish the deployed project's current Web Analytics dashboard setting or that Web Analytics events are being transmitted; that setting remains an owner verification item. If an analytics script is activated, this policy and the notice at the collection point must be updated before relying on the feature.`
New (one paragraph): `The application uses Vercel Web Analytics, a first-party, cookieless page-analytics feature. It reports page views, routes, referrers, and coarse device, browser, operating-system, and country information, and it distinguishes visits with a short-lived hashed identifier computed by Vercel rather than a cookie or other identifier stored on your device. We use it to understand aggregate traffic to the Service. It does not track you across other sites and is not used for advertising.`

**(c) Sale, advertising, analytics, and tracking section, third bullet (currently line 81).**
Old: `- The audited application build has no product-analytics or tag-manager integration. Hosting, security, payment, and error-monitoring providers still process the technical and diagnostic information described above.`
New: `- We use Vercel Web Analytics for aggregate, cookieless usage statistics as described under Providers and disclosures. There is no other product-analytics integration and no tag manager. Hosting, security, payment, and error-monitoring providers still process the technical and diagnostic information described above.`

**(d) Cookies and similar storage section (currently line 87).** After the first sentence (`The audited application code contains no first-party cookie-write call.`), insert: `Vercel Web Analytics also operates without cookies.` The no-cookie-write claim remains true; the Analytics component writes no cookies (verify against Step 2 evidence).

**(e) Why we use information list.** Insert after the `**Improve the question bank:**` bullet: `- **Understand aggregate usage:** measure page views and traffic patterns with cookieless analytics to improve the Service.`

**(f) Dates.** Set `effectiveDate` in `privacy-content.ts` (currently `'August 8, 2026'`, line 5) and the mirror's `**Last updated: ...**` header to the actual execution date. Update both pinned test spots coherently: the strip-regex in `page.test.tsx:32` and the `toBe` at `page.test.tsx:57`.

### Step 4: tests (TDD, red first)

- Write failing assertions first: the new analytics paragraph sentence (`The application uses Vercel Web Analytics, a first-party, cookieless page-analytics feature.`), the new Sale-section bullet text, and the updated date pins.
- Add a root-layout test (or extend the existing one) asserting the `Analytics` component is rendered by `app/layout.tsx`, using the repo's `renderToStaticMarkup`/module-mock conventions (`vi.mock('@vercel/analytics/next', ...)` is acceptable: external SDK).
- Keep every existing mandatory-clause assertion; the mirror byte-identity test must pass unmodified in mechanism.

### Step 5: batched DEBT-414 record updates (same PR, docs-only)

**(a) Analytics verification item.** In `docs/debt/debt-414-public-legal-pages-privacy-terms.md` (currently line 49), replace: `...but the current dashboard setting is not exposed by the audited CLI path and remains an owner verification item. Actual event transmission was not tested.` with a resolution note: measured 2026-08-10 via the Vercel REST API, dashboard toggle enabled since 2026-02-24, zero events ever collected, resolved by DEBT-464 which ships the component and the policy update atomically.

**(b) CAN-SPAM owner decision record.** Adjacent to the existing dated owner rulings in the same doc, append: `**2026-08-10 owner ruling (CAN-SPAM):** Addiction Boards is transactional-email-only until the owner deliberately decides otherwise. The committed acknowledgment template and the gated NY/CA renewal notices are classified transactional (recorded classification and standing rules in GitHub issue #772: postal address and opt-out infrastructure are prerequisites for any future marketing email; every new template is classified before shipping; mandated notices never carry marketing content). The provider-owned Clerk and Stripe template inventory remains OPEN per this debt's requirement; the transactional-only policy narrows but does not close it.` Do not mark the DEBT-414 CAN-SPAM closure item complete; only the classification-policy decision is recorded.

### Step 6: register updates

On execution completion: this doc gains a Results section (with the Hobby caps/retention actually recorded and post-deploy evidence), Status flows Open → Resolved with closure evidence in the DEBT-463 style, and `docs/debt/index.md` moves the row accordingly.

## Verification plan

1. Full local gate per AGENTS.md before push: `pnpm typecheck`, `pnpm test --run`, `pnpm lint`, `pnpm build`.
2. PR to `dev`; CodeRabbit laws apply (exact-final-head APPROVED; literal rate-limit message is a hard stop). Squash-merge, then promotion PR `dev` → `main` (merge commit), re-fetching `origin/dev` first (second-clone rule).
3. Post-deploy, signed out: production HTML of `/`, `/pricing`, `/terms`, `/privacy` contains the insights script reference; all pages 200; new privacy date renders.
4. End-to-end data proof: after generating a handful of real page views, the Web Analytics query API (previously 404 `Web Analytics not found`) returns a dataset with nonzero page views. Record the measurement in the closure evidence.
5. Confirm `TERMS_VERSION`, `TERMS_CONTENT_SHA256`, and pricing `disclosureVersion` are byte-identical to baseline.

## Rollback

Remove the `<Analytics />` component and the dependency; collection stops on the next deploy. Revert the policy paragraph to disclose that analytics is disabled (a fresh dated policy update, not a byte revert). The dashboard toggle may stay on; it transmits nothing without the component.

## Risks and accepted limits

- Ad-blockers and script blockers drop the analytics script; counts will undercount. Accepted.
- Hobby-plan event caps and short retention bound the data. Accepted; record actual limits at execution.
- The component adds a small client script to every page. Accepted.
- No consent banner is added: the feature is first-party and cookieless, and the policy discloses it. If a future legal review concludes a notice-at-collection change is needed, that supersedes this record.

## Out of scope

- Custom events (`track()`), Speed Insights, or any additional analytics provider.
- Any Terms of Service change, any email/template change, any marketing instrumentation.
- The remaining DEBT-414 owner tail (SHIELD program, strict-DMARC test, provider-template CAN-SPAM inventory, cancellation-procedure evidence, focused legal review, Resend activation).
