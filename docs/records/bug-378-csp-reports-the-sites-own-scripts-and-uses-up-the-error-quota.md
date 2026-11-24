# BUG-378: The CSP Reports the Site's Own Scripts and Uses Up Sentry's Error Quota

**Status:** Verifying — after promotion, a signed-out Preview `/sign-up` adds no CSP event; a signed-in production `/app` view rides DEBT-501 item 7's purchase; due 2026-11-27
**Priority:** P2
**Date:** 2026-11-14

---

## Summary

Until the 2026-11-15 release (promotion #1694), the report-only Content Security Policy had a script rule no page could satisfy. The rule accepted only scripts that carry the request's nonce, and the prerendered pages' scripts cannot carry one (DEBT-420). So every page view reported the site's own scripts, about 17 reports a view, and Sentry counted each report as an error. In the 30 days to 2026-11-14 these reports were 4,363 of the organization's 4,371 accepted errors. The plan allows 5,000 a month; once they run out, Sentry drops the server's errors too, operational alerts included. The release's policy accepts the site's own scripts, and the page views checked after it sent no report (Verification). A router request for a protected page, answered signed out, still reports: it is redirected to Clerk's sign-in on another origin (Finding). Two more page views also remain.

## Evidence

- **Usage.** Sentry's usage stats (`stats_v2`, category `error`, 30 days to 2026-11-14) show 4,371 accepted errors: 4,363 in the web project and 8 in the server project.
  - Spike protection dropped 167 more of the web project's events.
  - Filters dropped others free of charge: 2,669 from local runs, 66 CSP reports matching Sentry's default ignored sources (the outcome Sentry names `invalid-csp`; they were not malformed) and 37 from crawlers. The hydration-error and chunk-load-error filters, on in both projects, dropped 0 and 2 web events in 90 days.
  - The billing period runs from 2026-10-18 to 2026-11-17. By 2026-11-15 at 01:00Z it had used 4,407 of its 5,000 errors.
- **All of it is CSP.** Discover finds no event in the web project over those 30 days other than `event.type:csp`: 3,791 from Preview and 575 from production. All but five are `script-src-elem` reports whose blocked URI is the page's own `/_next/static` chunk or `inline`. The five are one production `eval` report, and two `connect-src` and two `frame-ancestors` reports from Preview.
- **Why.** The policy is Clerk's strict mode, `script-src … 'strict-dynamic' 'nonce-…'`. Under `'strict-dynamic'`, browsers ignore `'self'`, `'unsafe-inline'` and host sources, so only a script with the nonce passes. The prerendered shell's scripts have none, so each view reports every script file the page fetches and its inline scripts: 16 reports on production's `/` and `/sign-up`, 18 on `/pricing`.
- **Hidden, not stopped.**
  - The three production script issues (ADDICTION-BOARDS-WEB-F, -G and -H) were archived forever, so Sentry no longer showed them, but their events still counted.
  - The unresolved issues were three Preview script issues, three Preview `connect-src` and `frame-ancestors` issues (WEB-26, -2E and -2F), and production's `eval` report (WEB-2C). Read after they were resolved: WEB-2C came from HeadlessChrome 120, a bot; WEB-26, -2E and -2F are connect and framing reports against the Preview's own origin. None was an application script.
  - In 90 days the owner received four emails from the web project, all unread. Two were CSP reports, one of them WEB-2C, which the web project's high-priority workflow sent for a new production issue.
- **The watcher saw it.** #1610 has reported the quota past 80% since 2026-11-13.

## Impact

No visitor is affected: a report-only policy blocks nothing. The harm is to alerting. The reports grow with traffic: at about 17 a view, some 300 page views use a month's quota, after which Sentry drops server errors and operational alerts until the quota resets. They also drown the one signal the script rule could give, a script from a host the site never uses.

On 2026-11-15 the period had 593 errors left until 2026-11-17, about 37 Preview page views. That day the other sessions were asked to stay off the dev Preview and production in a browser until this fix ships; the request ended with the release that day. Production's own traffic averaged about 19 reports a day over the 30 days.

## Options

1. **A script rule the site satisfies.** Stop using Clerk's strict mode and build the policy in the app. Every directive stays as it is, except `script-src`: `'self'`, `'unsafe-inline'` and the hosts the site loads scripts from, with no nonce and no `'strict-dynamic'`. DEBT-420 named this path, and Clerk documents it for sites without nonces. A normal page view then sends no report, and a script report means a script came from somewhere the site does not use. Other directives still report, such as `eval`, framing and connections. Inline scripts pass unreported, as they must on prerendered pages; today every inline script is reported, so an injected one cannot be told apart either.
2. **Clerk's non-strict mode.** One line, but Clerk's default `script-src` allows `https:` and `http:`, so the policy would never report a script.
3. **Fewer reports.** Sending none leaves the policy with no use. Sending them only from production cuts today's volume by 87%, but production's still grows with traffic.
4. **Filter in Sentry.** Sentry's ignored-sources filter could drop the site's own hosts and `inline` before they count. It cannot keep option 1's signal: it also matches the reporting page's own URL (`document_uri`), so listing the site's host drops every report from the site's pages, foreign scripts included. And every visitor's browser would still send about 17 reports a view. The filter would also live outside the repository and its tests, and the policy could never be enforced. Archiving hides issues and still counts their events, as production's do today.
5. **Render every page per request,** so the nonce reaches every script. DEBT-420 rejected it: every page would give up its static shell.
6. **Cap the web project's key.** A per-key rate limit would keep any browser flood from using the server's share, forged reports to the public endpoint included. The current Sentry plan does not offer one (BUG-325: Sentry ignored the cap the owner approved). Nor is it wanted now: the watcher already flags dropped server events within two days, and a cap would drop real browser errors too. Keeping agents off the Preview covers the current period. Revisit if a flood happens.

## Resolution (decided)

Option 1.
- **The policy.** `lib/content-security-policy.ts` builds it. The proxy sets it, report-only, on Clerk's responses and no longer asks Clerk for one.
- **`script-src`.** `'self'`, `'unsafe-inline'`, the Frontend API origin decoded from the publishable key, `https://challenges.cloudflare.com` and `https://*.protect.clerk.com`, the list Clerk documents for a policy without nonces. Outside production builds it adds `'unsafe-eval'`, which Next.js needs in development; on Preview, `https://vercel.live`, as before.
  - Production loads Clerk JS and its UI bundle from the Frontend API origin (2026-11-14, `/sign-up` and `/pricing`).
  - Clerk's defaults also admit Stripe.js and Google Maps, for Clerk's billing and address components, which the site does not use. They are left out: Google Maps serves JSONP, a known way around a host allowlist. Both stay in `connect-src`, unchanged, and Stripe stays in `frame-src`.
- **The proof.** An E2E test fails on any CSP violation on the public pages and on a signed-in page, and on a page without the policy.
- **The nonce.** Nothing issues one now. The root layout still reads `x-nonce` through `headers()`, which is undefined unless a client sends the header for its own render, harmless under a policy with no nonce. Removing the read changes how every page renders, which DEBT-522's trigger governs.
- **Sentry.** After the release check passes, resolve the web project's CSP issues, the three archived ones included, so a recurrence reopens as a regression instead of staying archived.

## Finding: A Protected Page's Router Request Leaves the Site (2026-11-24)

- **The path.** A router request (a prefetch or client navigation, sent with Next.js's `Next-Url` header) for a protected page, answered signed out, is a page request to `auth.protect()`, which redirects it to sign-in (`@clerk/nextjs` 7.10.0, `dist/cjs/server/protect.js:39-40,109-113`). No sign-in URL is configured (DEBT-502 item 6, first bullet), so the redirect goes to Clerk's Account Portal, `${accountsBaseUrl}/sign-in`, on another origin (`@clerk/backend` 3.29.0, `dist/internal.js:487-492`). `connect-src` does not list it, so the browser reports the fetch, naming the original URL (CSP Level 3, §2.4.2).
- **When.** A session token expires after a minute, and Clerk JS refreshes it in the page. A router request sent with an expired token and no refresh cookie, as a development instance's are (local and the Preview), is answered signed out. A production request with a refresh cookie is refreshed by Clerk's middleware.
- **Evidence.**
  - Sentry, read 2026-11-24: from 04:00Z on 2026-11-15 the web project's only CSP events are WEB-26's eight on the Preview, on 2026-11-19 at 20:30Z and 2026-11-20 at 17:07Z, and WEB-2C's two `eval` reports from HeadlessChrome 120 on production's `/` on 2026-11-23. Each of WEB-26's is `connect-src`, from Chrome 157, blocking a same-origin router request (`?_rsc=`) for `/app/dashboard`, `/app/billing`, `/app/history`, `/app/practice` or `/app/practice/quick`. The Preview's reports count against the same quota.
  - E2E: the signed-in spec failed locally on 2026-11-16 on a `connect-src` report for an RSC prefetch of `/app/dashboard`, which the server answered with Clerk's cross-origin sign-in after `session-token-expired-refresh-non-eligible-no-refresh-cookie`; on 2026-11-23, on #1726's head `596e5d8d`, it failed with the same reason. Its recorder starts before the stored session is restored (`tests/e2e/content-security-policy.spec.ts:204`). Re-runs and CI passed.
  - Production has sent none.
- **Options.**
  1. **Send sign-in to the app's own routes.** One module names `/sign-in` and `/sign-up`; the proxy hands them to `clerkMiddleware` and the root provider to `ClerkProvider`. The redirect stays on the site's origin, so it reports nothing in any environment. This is DEBT-502 item 6's first bullet, which also asks for sign-in, sign-up and the return to `/pricing?plan=…` to be tested.
  2. **Start the spec's recorder after sign-in** (the previous plan). The spec passes, but browsers keep sending these reports.
  3. **List the Account Portal in `connect-src`.** It hides the report and keeps the visitor's sign-in off the site.
- **Decided:** option 1, which takes over DEBT-502 item 6's first bullet. Red first: a signed-out router request for `/app/dashboard`, through the real Clerk middleware, is redirected to the Account Portal.

## Verification

- [x] Red first: the new E2E test fails on the strict policy and passes on the new one. *Done 2026-11-14:* on the strict policy all five pages reported their own chunks and inline scripts; on the new one, none did.
- [x] After promotion:
  - production's and the dev Preview's `/sign-up` still send the report-only policy with `report-uri`, `report-to` and `Reporting-Endpoints`;
  - a view of `/sign-up` on production, and of a signed-in page on the Preview, adds no CSP event to the web project;
  - a script from a host the site does not use, added by hand to a production page, reaches the web project as a CSP report, so reports still arrive. Its issue is then resolved.

  *Done 2026-11-15, after promotion #1694:* both `/sign-up`s sent the policy with all three reporting headers and no nonce. Views of production's `/`, `/pricing` and `/sign-up` and of the Preview's `/` and signed-in `/app/dashboard` added no CSP event; the old policy sent 16 to 18 a view. A hand-added `example.com` script on production's `/sign-up` arrived as ADDICTION-BOARDS-WEB-2H, and the web project's high-priority workflow emailed the owner.
- [x] The web project's CSP issues, the archived ones included, are resolved, with the owner's approval. *Done 2026-11-15:* all eleven, WEB-F, -G, -H and -2H included; none is unresolved or archived.
- [ ] A view of a signed-in page on production, and of `/sign-up` on the Preview, each served with `report-uri` in its `Content-Security-Policy-Report-Only` header, adds no CSP event to the web project. A document whose URL or referrer needs redaction gets no report endpoint (`lib/content-security-policy.ts:146-160`), so its view proves nothing. The 2026-11-15 checks viewed neither; the Preview's `/sign-up` was checked for headers only (#1694). *2026-11-24:* production's `/app` pages send the owner's account, which has no subscription, to `/pricing`, so this view needs DEBT-501 item 7's purchase; a signed-in browser's Preview `/sign-up` goes to `/app/dashboard`. Neither view, at 07:28Z, added an event.
- [x] A signed-out router request for a protected page is redirected to `/sign-in` on the site's own origin, through the real Clerk middleware, and sign-in, sign-up and the return to `/pricing?plan=…` still work (Finding, option 1). The signed-in spec keeps its recorder from the start (`tests/e2e/content-security-policy.spec.ts:204`): its local failures were this path, not the spec. *Done in #1736:* `proxy-clerk-sign-in-redirect.test.ts`, `components/providers.test.tsx`, the CSP spec's router-request test and `tests/e2e/sign-in-pages.spec.ts` failed on the old configuration and pass on the fix.
- [x] The watcher's quota finding leaves #1610 as the old reports age out of its 30-day window. *Done:* the watcher closed #1610 at 2026-11-19T19:36:56Z ("Every operational alert check passes again"), the run the 11-15 projection named.

## Related

- DEBT-420 (closed): why the policy is report-only, and the path taken here.
- BUG-377 and DEBT-505: the alerts the quota protects. #1610 is the watcher's issue.
- DEBT-521: Clerk JS loads from the Frontend API origin this policy lists.
- DEBT-522: the root layout's nonce read.
- DEBT-502 item 6, first bullet: the sign-in URL, now this record's fix.
- BUG-379: from this fix's adversarial review. Native CSP reports bypass the SDK's redaction, so credential-bearing documents send none; it also added the CSP spec's foreign-script positive control.

*Corrected 2026-11-15 (adversarial review of #1693): the 66 filtered reports were ignored-source matches, not invalid reports; option 4's filter cannot keep foreign-script reports; option 6's cap is not on the current plan; option 1's "a report" meant a script report. Records review: the resolved issues and the period's remaining quota are past tense, and the remaining check dates the finding's clearing from reconstructed hourly usage, with the run hours it assumes and the range new errors would move it to.*

*Corrected 2026-11-18: the summary puts the policy before the 2026-11-15 release in the past tense.*

*Corrected 2026-11-19: the post-release check viewed a signed-in page only on the Preview and `/sign-up` only on production, so the other two views are open.*
