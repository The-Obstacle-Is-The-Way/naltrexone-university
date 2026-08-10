# DEBT-464: Vercel Web Analytics activation with privacy-policy coherence

**Status:** Open
**Priority:** P3
**Filed:** 2026-08-10
**Filed baseline:** `origin/dev` at `d7af4f009ec9f3be49a350c730f5df3cc5a90a69`
**Adversarial-audit baseline:** `origin/dev` at `3587f0e4b646399b965e911a01940ed1ca09f6f1`
**Owner decision (2026-08-10):** enable Vercel Web Analytics properly, with the Privacy Policy and a visible collection-point notice amended in the same deployment.

## Problem

The Vercel project has Web Analytics enabled at the platform layer, but the application has not integrated the analytics package or component. The current Privacy Policy accurately describes that application-build state and says the repository alone does not establish the dashboard setting. This audit independently measured that setting. Activation must change the integration, public notice, policy copy, provenance record, and retention disclosure atomically.

## Re-measured evidence and limits (2026-08-10)

| Claim | Verdict | Evidence |
|---|---|---|
| The project-level Web Analytics toggle is enabled. | **ACCURATE, MEASURED.** | An authenticated Vercel REST request to `GET /v9/projects/prj_vTWS0YcTJPcAAjgpPjovC0PydAP7?teamId=team_G6SwBNivWshoygtOPgu67vhE` returned `webAnalytics.id = pitlCehO5Ma10jaGYpIDLku0Z` and `webAnalytics.enabledAt = 1771969091159`, which is `2026-02-24T21:38:11.159Z`. |
| The application does not integrate `@vercel/analytics`. | **ACCURATE, MEASURED, with corrected scope.** | At the audit baseline, `package.json` has no dependency, and two `git grep` searches for `@vercel/analytics` and `<Analytics` return no application hit at `origin/dev` when scoped to `package.json`, `app`, `components`, `lib`, and `src`. Vendored agent-skill examples do contain sample imports, so the former claim that a full-repository grep found none was too broad. |
| Production currently embeds no Web Analytics script. | **ACCURATE, MEASURED on 2026-08-10.** | Signed-out `GET /`, `/pricing`, `/terms`, and `/privacy` each returned 200 on 2026-08-10, and their HTML contained no `_vercel/insights` or `va.vercel-scripts` reference. A direct request to `/_vercel/insights/script.js` returned 200. That asset response does not establish why the route is available and does not prove that a page loads the asset or transmits an event. |
| No Web Analytics dataset has ever existed and zero events have ever been collected. | **UNVERIFIABLE, with the earlier API premise corrected.** | The earlier plan named no reproducible endpoint for its claimed 404. Vercel now documents both a public Web Analytics REST API and the `vercel metrics` CLI. On 2026-08-10, `vercel metrics vercel.analytics_pageview.count --project prj_vTWS0YcTJPcAAjgpPjovC0PydAP7 --prod --since 31d --group-by request_path --json` returned empty `summary` and `data` arrays for the observable 31-day Hobby window. The CLI rejected a query back to the 2026-02-24 toggle date because Hobby permits only the latest 31 days. Current source, current HTML, and that bounded empty result cannot prove every historical deployment. Do not carry the historical absolute into the register, DEBT-414, the Privacy Policy, or closure evidence. |
| The current Vercel account plan is eligible for this paid product. | **INACCURATE as an assumed activation premise; activation gate added.** | The authenticated team API reported `billing.plan = hobby` on 2026-08-10. Vercel's current Terms of Service say the Hobby plan is only for personal or non-commercial use. The repository and live pricing describe a paid auto-renewing subscription product, so activation must not proceed on Hobby without a separate written Vercel authorization. This plan requires a Pro upgrade before implementation. |
| The original bare root-layout integration would avoid sending application identifiers. | **INACCURATE; fixed in this plan.** | `app/(app)/app/practice/[sessionId]` places a session identifier in the path. `lib/routes.ts:86-110` can place `sessionId`, `attemptId`, and `historyHref` in question-page query strings, and `/checkout/success` carries a Stripe `session_id`. Vercel warns that URLs and query parameters can contain identifiers and provides `beforeSend` for redaction. The corrected design is fail-closed and collects only four exact public routes after removing query strings and fragments. |
| Updating only the Privacy Policy would satisfy the existing collection-point promise. | **INACCURATE; fixed in this plan.** | The current policy promises to update both the policy and the notice at the collection point before activation. The original plan changed only the policy. The corrected atomic change adds an explicit cookieless-analytics notice with a Privacy Policy link to the shared marketing footer rendered on every collected route. |

## Vendor facts that bind execution

Use these official Vercel sources again at execution time and record any change before proceeding:

- [Web Analytics quickstart](https://vercel.com/docs/analytics/quickstart): dashboard enablement, the `@vercel/analytics` package, `@vercel/analytics/next`, and placement in the App Router root layout are the documented Next.js setup.
- [Privacy and compliance](https://vercel.com/docs/analytics/privacy-policy): Vercel describes anonymous aggregated page views, no cookies, a visitor hash derived from the incoming request, a visitor-session lifespan discarded after 24 hours, and the data fields that a page view may contain.
- [Redacting sensitive data](https://vercel.com/docs/analytics/redacting-sensitive-data): `beforeSend` may modify an event or return `null`; Vercel specifically warns about user IDs, tokens, and order IDs in URLs.
- [Using Web Analytics](https://vercel.com/docs/analytics/using-web-analytics): the dashboard operator path is Vercel Dashboard -> project -> Analytics, with timeframe and environment selectors.
- [Web Analytics API](https://vercel.com/docs/analytics/web-analytics-api) and the [May 18, 2026 API announcement](https://vercel.com/changelog/web-analytics-api): Vercel documents authenticated count and aggregate query endpoints for visits and custom events.
- [Query Web Analytics from the Vercel CLI](https://vercel.com/changelog/query-web-analytics-from-the-vercel-cli): Vercel documents `vercel metrics` queries for `vercel.analytics_pageview.count`; the metric schema includes `request_path` as a grouping dimension.
- [Vercel plans](https://vercel.com/docs/plans/hobby) and [Vercel Terms of Service](https://vercel.com/legal/terms): Web Analytics is technically available on Hobby, but Hobby use is restricted to personal or non-commercial use. Capability does not remove the account-eligibility gate.

## Scope and invariants

The analytics component, public-route filter, collection-point notice, Privacy Policy amendments, pending internal provenance row, and tests ship in one implementation PR and one deployment. Collection must not precede the matching copy. Production browser-network and post-activation reporting evidence cannot exist before deployment: the implementation PR marks that evidence pending, and the docs-only closeout records it after deployment.

Invariants that MUST hold after execution:

1. **Vercel account gate satisfied first.** The project is on Pro before the implementation branch starts. Record the read-only API result in the PR body. Do not let an agent purchase or change a plan without the owner's explicit authorization.
2. **Terms of Service untouched.** `app/(marketing)/terms/terms-content.ts` has no analytics text at the audit baseline. `TERMS_VERSION = '2026-08-09'` and `TERMS_CONTENT_SHA256 = 'b3359b6ae63ba92bd24c7a099deaa366ba6f2a0fa5562611a30672cdb87e450f'` at `lib/pricing-data.ts:12-14` MUST NOT change.
3. **Pricing disclosure version untouched.** Both `disclosureVersion` values remain `2026-08-05` at `lib/pricing-data.ts:26,43`.
4. **Collection is public-route-only and fail-closed.** The only collected paths are exactly `/`, `/pricing`, `/terms`, and `/privacy`. Every query string and fragment is removed before transmission. Auth, checkout, `/app`, `/api`, dynamic, malformed, and future unknown routes return `null` from `beforeSend`.
5. **No custom events.** Do not import or call `track()`.
6. **These policy claims stay true and present:** no sale of personal information, no cross-context behavioural advertising, no advertising networks or pixels, no session replay, no application cookie-write call, and no tag manager.
7. **Byte-identity mirrors hold after removing document framing.** The mirror test removes the exact `Last updated` header and the structural newline before the provenance delimiter, then compares the remaining public body directly with `privacyContent.bodyMarkdown`. It must not call `.trim()` or otherwise normalize body whitespace.
8. **Zero em dashes** in all new public-policy and notice text.
9. **No assertion deletion.** Existing mandatory-clause assertions remain. Updated assertions pin complete replacement sentences, not weaker fragments.

## Execution plan

### Step 0: rebase the evidence and satisfy the account gate

1. Fetch `origin`, start from current `origin/dev`, and byte-compare every Step 3 old string before editing. If any old string differs, stop and update this debt record before changing copy.
2. Re-read the official Vercel sources above.
3. Have the owner upgrade the Vercel team from Hobby to Pro at Vercel Dashboard -> team Settings -> Billing -> Plan. This is required by the current Hobby restriction for a paid subscription product and is not delegated by this document.
4. After the owner action, repeat authenticated `GET /v2/teams/team_G6SwBNivWshoygtOPgu67vhE` and require `billing.plan = pro` before implementation. Record only the plan result, timestamp, and endpoint in the PR body. Never print or commit the CLI token or unrelated billing fields.
5. Record the then-current Pro Web Analytics included-event allowance and reporting window from official Vercel documentation. At the audit date the published values are 100,000 included events per month and a 12-month reporting window. If either changed, update the exact retention sentence in Step 3 before implementation.

### Step 1: dependency, fail-closed wrapper, root placement, and collection-point notice

1. Run `pnpm add @vercel/analytics`. Accept only a version that passes the repository's seven-day `minimumReleaseAge` policy; record the resolved version. Version 2 or later is required for Vercel's documented resilient intake.
2. Add `components/analytics/web-analytics.tsx` as a Client Component. Import `Analytics` and `BeforeSendEvent` from `@vercel/analytics/next`. Export a pure `filterWebAnalyticsEvent` used by `<Analytics beforeSend={filterWebAnalyticsEvent} />`.
3. In that filter, parse `event.url` with `URL`. Return `null` on parse failure or unless `url.pathname` exactly equals one of `ROUTES.HOME`, `ROUTES.PRICING`, `ROUTES.TERMS`, or `ROUTES.PRIVACY`. For an allowed route, clear `url.search` and `url.hash`, then return a copied event with the sanitized URL. This allowlist is intentionally exact; do not use prefix matching.
4. Import and render the wrapper once at the end of `<body>` in `app/layout.tsx`. The root layout remains a Server Component; it does not gain `'use client'`.
5. In `components/marketing/marketing-layout.tsx`, add this sentence in the existing footer, using its existing text/link classes: `We use cookieless analytics on four public pages. See our Privacy Policy.` Link the exact words `Privacy Policy` to `ROUTES.PRIVACY`. All four collected routes use this shared footer, so the notice is present in the rendered document before the root analytics wrapper.
6. The production CSP is report-only and permits same-origin script and connection routes. Do not widen CSP directives for this integration. Vercel version 2 may use a generated resilient-intake path, so do not hard-code only `/_vercel/insights` as the runtime success condition.

### Step 2: confirm the vendor description before publishing copy

Confirm and record from official Vercel documentation: no cookies; no cross-site identification; the request-derived visitor hash and 24-hour visitor-session lifespan; the page-view fields; version 2 resilient intake; the current Pro event allowance; and the current Pro reporting window. If a source contradicts Step 3, update this plan and obtain review before shipping. Do not improvise public copy during implementation.

### Step 3: Privacy Policy amendments, exact old -> new

Apply public-copy changes to `app/(marketing)/privacy/privacy-content.ts` and mirror them byte-identically into the public section of `docs/legal/privacy-policy.md`. The current content-module landing lines at the audit baseline are 28, 50, 65, 73, 81, 87, and 91-102. The matching legal-document lines are offset by eight lines.

**(a) Information-collected table, technical row (`privacy-content.ts:28`).**

Old:
`| **Technical, security, and diagnostic information** | IP address and rate-limit keys; request and provider-event identifiers; route or page context; browser, device, and request information available to hosting or error-monitoring providers; error messages and stack traces; duplicate-operation records |`

New:
`| **Technical, security, and diagnostic information** | IP address and rate-limit keys; request and provider-event identifiers; route or page context; public-page views, referrers, event times, and coarse location, browser, device, and operating-system information processed by Vercel Web Analytics; browser, device, and request information available to hosting or error-monitoring providers; error messages and stack traces; duplicate-operation records |`

**(b) Why-we-use list, after the Improve bullet (`privacy-content.ts:50`).**

Insert:
`- **Understand aggregate usage:** measure traffic patterns on the public home, pricing, Terms, and Privacy pages with cookieless analytics to improve the Service.`

**(c) Providers table, Vercel row (`privacy-content.ts:65`).**

Old:
`| **Vercel** | Application hosting, delivery, and platform request logs | Request, IP, route, user-agent, device, deployment, and diagnostic information |`

New:
`| **Vercel** | Application hosting, delivery, platform request logs, and cookieless Web Analytics on four public pages | Request, IP, route, user-agent, device, deployment, and diagnostic information; aggregated public-page-view and visit statistics as described below |`

**(d) Replace the audit-limit paragraph in full (`privacy-content.ts:73`).**

Old:
`The audited application build contains no Vercel Web Analytics component or analytics script. The repository does not establish the deployed project's current Web Analytics dashboard setting or that Web Analytics events are being transmitted; that setting remains an owner verification item. If an analytics script is activated, this policy and the notice at the collection point must be updated before relying on the feature.`

New:
`The application uses Vercel Web Analytics, a cookieless page-analytics feature provided by Vercel. On the public home, pricing, Terms, and Privacy pages, it reports page views, routes, referrers, event times, and coarse location, device, browser, and operating-system information. Vercel distinguishes visits with a hash derived from request data rather than a cookie or other identifier stored on your device; Vercel states that the visitor session is discarded after 24 hours. We use this information to understand aggregate traffic to the Service. We do not use it to track you across other sites or for advertising.`

**(e) Sale, advertising, analytics, and tracking, third bullet (`privacy-content.ts:81`).**

Old:
`- The audited application build has no product-analytics or tag-manager integration. Hosting, security, payment, and error-monitoring providers still process the technical and diagnostic information described above.`

New:
`- We use Vercel Web Analytics for aggregate, cookieless statistics on the four public pages described under Providers and disclosures. There is no other product-analytics integration and no tag manager. Hosting, security, payment, and error-monitoring providers still process the technical and diagnostic information described above.`

**(f) Cookies and similar storage (`privacy-content.ts:87`).**

After the first sentence, `The audited application code contains no first-party cookie-write call.`, insert: `Vercel Web Analytics also operates without cookies.` Keep the rest of the paragraph byte-identical.

**(g) Retention table, before Support email and provider-held information (`privacy-content.ts:102`).**

Insert:
`| Vercel Web Analytics | Vercel states that the visitor session is discarded after 24 hours. Aggregated reporting data is available in the Vercel dashboard for the current Pro-plan 12-month reporting window. Other provider-side system data is governed by Vercel's terms and privacy documentation. |`

If Step 0 finds a changed official Pro reporting window, update this exact sentence in this debt record before implementing it.

**(h) Publication date and internal status.**

- Set `privacyContent.effectiveDate` at `privacy-content.ts:5` and the mirror's `**Last updated: ...**` header to the actual implementation date.
- Update the strip regex at `app/(marketing)/privacy/page.test.tsx:32` and the `effectiveDate` assertion at line 57 to that same date.
- In `docs/legal/privacy-policy.md`, replace the line-3 status with `> **STATUS: PUBLICATION COPY; pending production verification for [ACTUAL DATE].** The prior August 8 publication was production verified in [promotion PR #760](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/760#issuecomment-5227563312).` Replace `[ACTUAL DATE]` before committing. After production verification, a docs-only closeout commit replaces the pending phrase with the new promotion evidence.

**(i) Internal provenance row, currently `docs/legal/privacy-policy.md:168`.**

Replace the entire `No analytics` row. The new verdict must say that the old no-integration claim was deliberately superseded by DEBT-464, that collection is restricted to four exact public paths with query strings and fragments removed, and that all historical pre-activation transmission remains UNVERIFIABLE. In the implementation PR, its evidence cell cites `components/analytics/web-analytics.tsx`, its tests, the root layout, and the project-toggle REST measurement, then marks production browser-network and path-grouped reporting evidence **PENDING**. The docs-only closeout replaces that pending marker with the exact promotion, browser-network, and official CLI reporting evidence required by Step 6. Do not claim that zero events were ever collected.

**Deliberately unchanged policy sections:**

- `Where information comes from` already says information comes automatically from use of and requests to the Service, so it covers page-view collection without a narrower provider list.
- The short version's no-sale, no cross-context behavioural advertising, no advertising trackers, and no session-replay statements remain true under the allowlisted, non-advertising integration.
- The account-deletion section need not promise deletion of aggregated analytics. The new retention row and the existing provider-held-copy qualification disclose that provider-side data is not part of the local account cascade.

### Step 4: tests, red first

1. Add `components/analytics/web-analytics.test.tsx` with `// @vitest-environment jsdom` as its first line and the repository's dynamic-import pattern. Before implementation, make tests fail for all four exact allowed paths, query/fragment removal, malformed URLs, `/checkout/success?session_id=...`, `/app/practice/<id>`, `/app/questions/<slug>?sessionId=...&attemptId=...`, `/sign-in`, `/sign-up`, `/api/health`, prefix lookalikes, and an unknown future route. The disallowed cases must assert `null`, not only definedness.
2. Mock only the external `@vercel/analytics/next` package to prove the wrapper supplies the tested filter. Extend `app/layout.test.tsx` to prove exactly one wrapper renders after the page shell.
3. Extend `components/marketing/marketing-layout.test.tsx` with a parsed-DOM assertion for the complete collection-point sentence and an exact `ROUTES.PRIVACY` link.
4. Add complete-sentence mandatory-copy assertions for the replacement analytics paragraph, sale-section bullet, retention row, and collection-point notice. Keep every existing assertion.
5. Strengthen `publicPrivacyMarkdown()` in `app/(marketing)/privacy/page.test.tsx`: remove the actual dated `Last updated` header, consume the exact two-newline boundary before the provenance delimiter so no structural newline remains, and return the extracted body without `.trim()`. Compare that string directly with `privacyContent.bodyMarkdown`, preserving every body byte.

### Step 5: batched DEBT-414 record updates

**(a) Analytics verification bullet, currently line 49.**

Old:
`- Absence of an analytics dependency is not proof of deployment behaviour. No Vercel Web Analytics component/script exists in the application build, but the current dashboard setting is not exposed by the audited CLI path and remains an owner verification item. Actual event transmission was not tested.`

New:
`- Vercel Web Analytics was re-measured on 2026-08-10. The project toggle was enabled on 2026-02-24, while the measured application baseline and signed-out production HTML had no analytics integration or embedded script. The earlier unnamed 404 probe did not prove that no query API or dataset existed. Vercel now documents Web Analytics API and CLI queries; the official CLI returned no page-view groups for the observable 31-day Hobby window, but could not query back to the toggle date. Historical transmission remains UNVERIFIABLE. DEBT-464 resolves the current integration and notice gap with four-route, query-stripped collection and atomic Privacy Policy updates.`

**(b) CAN-SPAM owner decision record.**

Adjacent to the existing dated owner rulings, append:

`**2026-08-10 owner ruling (CAN-SPAM):** Addiction Boards is transactional-email-only until the owner deliberately decides otherwise. The committed acknowledgment template and gated New York and California renewal notices are classified transactional. GitHub issue #772 records the standing rules: a valid postal address and opt-out infrastructure are prerequisites for any future marketing email; every new template is classified before shipping; and mandated notices never carry marketing content. The provider-owned Clerk and Stripe template inventory remains OPEN. This ruling narrows but does not close that inventory.`

**(c) CAN-SPAM matrix row, currently line 68.**

Replace only the sentence `The provider-owned Clerk and Stripe templates are not in the repository; the new Resend templates are committed but still require a recorded per-message primary-purpose classification before the owner activates sending.` with: `The committed Resend templates were classified transactional by the 2026-08-10 owner ruling and must remain free of marketing content. The provider-owned Clerk and Stripe templates are not in the repository and remain open for per-message classification.`

Keep line 303, the provider-template acceptance item, and the overall `CONDITIONAL AND OPEN` CAN-SPAM ruling unchanged. Issue #772 is open and records the owner policy; it does not prove the provider-owned inventory is complete.

### Step 6: verification, release, and closure

1. Before every push, run the full AGENTS.md gate: `pnpm typecheck`; `pnpm lint`; `pnpm test --run`; `pnpm test:browser`; the documented local-database setup followed by `pnpm test:integration`; `pnpm build`; and hermetic `pnpm test:e2e` when the listed local credentials are present. Tear down the test database only after every suite finishes.
2. Confirm the diff contains the dependency/lockfile, the two analytics component/test files, root-layout test and implementation, marketing-footer notice/test, mirrored Privacy Policy copy and tests, DEBT-414 updates, and this debt/register's in-progress Results only. Terms content and `lib/pricing-data.ts` must be byte-identical to the baseline.
3. Require a formal CodeRabbit APPROVED review object on the exact final feature head. A literal rate-limit or review-limit response is a hard stop until its stated cooldown passes and a fresh review is requested.
4. Squash the feature PR to `dev`. Re-fetch immediately before the merge. Adopt any existing `dev` to `main` promotion PR; otherwise open one. Promote with a merge commit and require the same exact-head CodeRabbit approval.
5. After deploy, verify signed-out 200 responses for `/`, `/pricing`, `/terms`, and `/privacy`; verify the actual date, full analytics paragraph, retention row, and collection-point notice; and verify the four Terms/pricing invariants.
6. In a real browser with blockers disabled, load two allowed production pages and capture the analytics script and intake requests. Account for version 2's generated resilient-intake paths rather than requiring only `/_vercel/insights`. A direct 200 from an asset URL is not evidence of page use.
7. After the captured requests have reached reporting, set the task-specific shell variable `DEBT_464_DEPLOYED_AT` to the promotion deployment's ISO timestamp. Run `vercel metrics vercel.analytics_pageview.count --project prj_vTWS0YcTJPcAAjgpPjovC0PydAP7 --prod --since "$DEBT_464_DEPLOYED_AT" --group-by request_path --json` with the authenticated CLI. Require nonzero `request_path` groups for both allowed pages loaded in item 6, and record the command with its secret-free JSON result. An ungrouped aggregate is insufficient. If the result has not populated, leave the evidence pending and retry later; do not infer a reporting failure or substitute the direct asset response. The Vercel Dashboard may supply a corroborating Production screenshot or export, but the path-grouped official CLI result is the required reproducible closure evidence.
8. Confirm the filter tests prove that authenticated, checkout, auth, API, identifier-bearing, malformed, and unknown routes return `null`. Do not generate production traffic containing test identifiers merely to re-prove the unit contract.
9. Update this document with Results, resolved status, exact package version, account plan, current event allowance/reporting window, gate counts, review IDs, merge SHAs, production request evidence, path-grouped CLI reporting evidence, and invariant hashes. Update the privacy document's pending status with the new production evidence. Move DEBT-464 to Resolved in the register in a docs-only closeout PR.

## Rollback

Remove the root wrapper and `@vercel/analytics` dependency, remove the footer analytics notice, and publish a fresh dated Privacy Policy that says analytics is disabled and removes the analytics-specific collection and retention text. Collection stops after that deployment. The dashboard toggle may remain enabled because it does not inject the component. Do not downgrade the Vercel account to Hobby as part of rollback; the commercial-use account gate is independent of Web Analytics.

## Risks and accepted limits

- Browser and script blockers cause undercounting. Accepted.
- The integration deliberately measures only four public pages. Authenticated product usage, checkout completion, auth routes, APIs, and any future route are excluded by default. Accepted.
- Vercel's plan limits and reporting windows can change. Recheck them before activation and record the values in closure evidence.
- The globally mounted wrapper loads a small client script, but the filter transmits page views only for the four allowed paths. Accepted.
- No consent banner is added. The public footer supplies the promised collection-point disclosure, the policy explains the cookieless aggregated use, and the existing DEBT-414 record says comprehensive state privacy regimes do not currently apply on the recorded facts. A later focused legal review can supersede this implementation decision.

## Out of scope

- Custom events, Speed Insights, session replay, advertising analytics, or any additional analytics provider.
- Terms of Service changes, pricing-disclosure version changes, email/template implementation, or marketing instrumentation.
- The remaining DEBT-414 owner tail: SHIELD adoption, strict-DMARC testing, provider-owned CAN-SPAM inventory, cancellation-procedure evidence, owner read-through, focused legal review, and Resend activation.
