# BUG-378: The CSP Reports the Site's Own Scripts and Uses Up Sentry's Error Quota

**Status:** In Progress — the host-allowlist script rule, red first
**Priority:** P2
**Date:** 2026-11-14

---

## Summary

The Content Security Policy is report-only, and no page can satisfy its script rule. The rule accepts only scripts that carry the request's nonce, and the prerendered pages' scripts cannot carry one (DEBT-420). So every page view reports the site's own scripts, about 17 reports a view, and Sentry counts each report as an error. In the 30 days to 2026-11-14 these reports were 4,363 of the organization's 4,371 accepted errors. The plan allows 5,000 a month; once they run out, Sentry drops the server's errors too, operational alerts included.

## Evidence

- **Usage.** Sentry's usage stats (`stats_v2`, category `error`, 30 days to 2026-11-14) show 4,371 accepted errors: 4,363 in the web project and 8 in the server project. Spike protection dropped 167 more of the web project's events. The localhost filter dropped 2,669 from local runs, which cost nothing.
- **All of it is CSP.** Discover finds no event in the web project over those 30 days other than `event.type:csp`: 3,791 from Preview and 575 from production. All but one are `script-src-elem` reports whose blocked URI is the page's own `/_next/static` chunk or `inline`; the other is one `eval`.
- **Why.** The policy is Clerk's strict mode, `script-src … 'strict-dynamic' 'nonce-…'`. Under `'strict-dynamic'`, browsers ignore `'self'`, `'unsafe-inline'` and host sources, so only a script with the nonce passes. The prerendered shell's scripts have none: production's `/pricing` serves 19 of its own script tags and `/sign-up` 17, each reported on every view.
- **Hidden, not stopped.** The three production issues (ADDICTION-BOARDS-WEB-F, -G and -H) are archived forever, so Sentry no longer shows or emails them, but their events still count. Seven Preview issues are unresolved, all high priority; four emails about new ones reached the owner in 90 days, unread.
- **The watcher saw it.** #1610 has reported the quota past 80% since 2026-11-13.

## Impact

No visitor is affected: a report-only policy blocks nothing. The harm is to alerting. The reports grow with traffic: at about 17 a view, some 300 page views use a month's quota, after which Sentry drops server errors and operational alerts until the quota resets. They also drown the one signal the script rule could give, a script from a host the site never uses.

## Options

1. **A script rule the site satisfies.** Stop using Clerk's strict mode and build the policy in the app. Every directive stays as it is, except `script-src`: `'self'`, `'unsafe-inline'` and the hosts the site loads scripts from, with no nonce and no `'strict-dynamic'`. DEBT-420 named this path, and Clerk documents it for sites without nonces. A normal page view then sends no report, and a report means a script came from somewhere the site does not use. Inline scripts pass unreported, as they must on prerendered pages; today every inline script is reported, so an injected one cannot be told apart either.
2. **Clerk's non-strict mode.** One line, but Clerk's default `script-src` allows `https:` and `http:`, so the policy would never report a script.
3. **Fewer reports.** Sending none leaves the policy with no use. Sending them only from production cuts today's volume by 87%, but production's still grows with traffic.
4. **Filter or archive in Sentry.** Sentry's ignored-sources filter drops reports before they count, but the site's own hosts and `inline` are the whole stream, so it amounts to sending none, configured outside the repository. Archiving hides issues and still counts their events, as production's do today.
5. **Render every page per request,** so the nonce reaches every script. DEBT-420 rejected it: every page would give up its static shell.
6. **Cap the web project's key.** A per-key rate limit would keep any browser flood, forged reports to the public endpoint included, from using the server's share. Not now: the watcher already flags dropped server events within two days, and a cap would drop real browser errors too. Revisit if a flood happens.

## Resolution (decided)

Option 1.
- **The policy.** `lib/content-security-policy.ts` builds it. The proxy sets it, report-only, on Clerk's responses and no longer asks Clerk for one.
- **`script-src`.** `'self'`, `'unsafe-inline'`, the Frontend API origin decoded from the publishable key, `https://challenges.cloudflare.com`, and the hosts Clerk's defaults list today: `https://*.protect.clerk.com`, `https://js.stripe.com`, `https://*.js.stripe.com` and `https://maps.googleapis.com`. Outside production builds it adds `'unsafe-eval'`, which Next.js needs in development; on Preview, `https://vercel.live`, as before. Production loads Clerk JS and its UI bundle from the Frontend API origin (2026-11-14, `/sign-up` and `/pricing`).
- **The proof.** An E2E test fails on any CSP violation on the public pages and on a signed-in page.
- **The nonce.** Nothing issues one now. The root layout still reads `x-nonce` through `headers()`, so its `nonce` is always undefined. Removing the read changes how every page renders, which DEBT-522's trigger and DEBT-525's baseline govern.
- **Sentry.** After the release check passes, resolve the web project's CSP issues, the three archived ones included, so a recurrence reopens as a regression and emails the owner instead of staying hidden.

## Verification

- [ ] Red first: the new E2E test fails on the strict policy and passes on the new one.
- [ ] After promotion, a production page view and a Preview page view add no CSP event to the web project; due 2026-11-21.
- [ ] The web project's CSP issues, the archived ones included, are resolved, with the owner's approval.
- [ ] The watcher's quota finding leaves #1610 as the old reports age out of its 30-day window; due 2026-11-24.

## Related

- DEBT-420 (closed): why the policy is report-only, and the path taken here.
- BUG-377 and DEBT-505: the alerts the quota protects. #1610 is the watcher's issue.
- DEBT-521: Clerk JS loads from the Frontend API origin this policy lists.
- DEBT-522 and DEBT-525: the root layout's nonce read.
