# BS-062: Sentry Seven-Issue Triage — Report-Only CSP Telemetry vs Real Clerk Render Bug

**Date:** 2026-04-09
**Triggered by:** Live Sentry queue review across production and preview
**Status:** Completed triage; actionable issue promoted to [BUG-234](../../bugs/bug-234-auth-nav-user-button-missing-clerk-provider.md)
**Scope:** Re-triage 7 unresolved Sentry issues from first principles using live API data, current code, and current vendor guidance
**Related:** [BUG-234](../../bugs/bug-234-auth-nav-user-button-missing-clerk-provider.md), [DEBT-332](../../debt/debt-332-security-posture-audit.md), [BS-060](./bs-060-sentry-error-triage-and-environment-hygiene.md), [proxy.ts](../../../proxy.ts), [components/auth-nav.tsx](../../../components/auth-nav.tsx), [components/providers.tsx](../../../components/providers.tsx)

---

## Method

- Verified local Sentry access with `sentry-cli info`
- Pulled live issue metadata, latest events, tag distributions, and project filter settings from the Sentry REST API
- Cross-checked current code in `proxy.ts`, `components/providers.tsx`, and `components/auth-nav.tsx`
- Re-read existing repo decisions in DEBT-332, BS-060, and `docs/vendor-docs/clerk.md`
- Checked current vendor guidance for Clerk CSP/provider placement, Next.js CSP posture, and report-only rollout guidance

## Verdict Matrix

| Issue | Verdict | Actual impact | Recommended Sentry action |
|------|---------|---------------|---------------------------|
| `WEB-M` | Third-party/in-app browser quirk | No evidence of app-code failure | Archive |
| `WEB-G` | Expected report-only CSP telemetry | Informational only; no blocking (`disposition=report`) | Resolve or mute as monitor-only |
| `WEB-F` | Expected report-only CSP telemetry | Informational only; no blocking (`disposition=report`) | Resolve or mute as monitor-only |
| `WEB-J` | Expected preview-only report-only CSP telemetry | Informational only on preview URLs; no blocking | Resolve or mute as preview-monitor noise |
| `WEB-K` | Real app bug | Preview SSR/render failure on authenticated app routes | Fix and keep tracked as bug |
| `WEB-H` | Expected report-only CSP telemetry | Informational only; no blocking (`disposition=report`) | Resolve or mute as monitor-only |
| `WEB-E` | Expected preview-only report-only CSP telemetry | Informational only on preview URLs; no blocking | Resolve or mute as preview-monitor noise |

## Issue Notes

### WEB-M

**Status:** Noise
**Severity:** Informational

All observed events come from Twitter iOS in-app browsing contexts and point at anonymous `app:///` frames named `updateGapFiller` and `updateFooterPositions`, which do not exist anywhere in this codebase.

Evidence:
- 8 events, 0 users
- Browser distribution: `Twitter 11.78` only
- URLs: production `/` and `/pricing`
- Referrer on latest event: `https://t.co/`
- Stack frames are anonymous `app:///` frames rather than app source files

Assessment:
- Best explained as third-party script execution inside an in-app browser rather than first-party application code
- This is an inference from the event data and the absence of matching functions in the repo, not a Twitter official statement

Recommended action:
- Archive the issue

### WEB-G

**Status:** Monitor
**Severity:** Informational

This issue records production CSP report-only telemetry for first-party `_next/static` scripts under Clerk strict CSP. The browser reports a policy violation, but the payload explicitly says `disposition=report`, not block.

Evidence:
- 102 events, 5 users
- Production only
- URLs: `/` and `/sign-up`
- Latest event `blocked_uri`: first-party `https://addictionboards.com/_next/static/...js`
- Latest event `csp.disposition`: `report`

Recommended action:
- Do not treat as a product bug
- Resolve or mute it as monitoring noise until an enforcement rollout is intentionally in scope

### WEB-F

**Status:** Monitor
**Severity:** Informational

This issue mixes the same report-only CSP posture across production and preview for inline script attempts. The latest event again reports `disposition=report`, not enforcement.

Evidence:
- 18 events, 8 users
- Mixed URLs: production `/`, production `/sign-up`, preview `/`, preview `/app/dashboard`, preview `/app/practice/...`
- Mixed browsers: Twitter iOS, Mobile Safari, Chrome Mobile iOS, Chrome desktop
- Latest event `blocked_uri`: `inline`
- Latest event `csp.disposition`: `report`

Recommended action:
- Keep as monitor-only telemetry
- If this becomes noisy enough to hide actionable issues, resolve or mute it or move CSP reports into a dedicated triage view

### WEB-J

**Status:** Monitor
**Severity:** Informational

This issue is preview-only CSP report-only telemetry on an actual preview deployment URL, not production traffic pointing at a stray preview host.

Evidence:
- 57 events, 1 user
- Environment tag: `preview`
- URL and `document_uri` are the same preview deployment host
- Latest event `blocked_uri`: that same preview host's `_next/static/...js`
- Latest event `csp.disposition`: `report`

Recommended action:
- Resolve or mute as preview-monitor noise
- Do not widen production CSP to accommodate preview deployment URLs

### WEB-K

**Status:** Actionable
**Severity:** Low

This is a real preview render-path bug. `AuthNav` imported Clerk's `UserButton` in a server component while the active `ClerkProvider` lived behind a client boundary.

Evidence:
- 2 events, 0 users
- Environment tag: `preview`
- Route: `/app/practice/[sessionId]`
- Latest event platform: `node`
- Stack includes `Object.throwMissingClerkProviderError`

Recommended action:
- Track as [BUG-234](../../bugs/bug-234-auth-nav-user-button-missing-clerk-provider.md)

### WEB-H

**Status:** Monitor
**Severity:** Informational

This is the same report-only CSP family as `WEB-G`, grouped separately because the blocked chunk URL differs.

Evidence:
- 17 events, 1 user
- Production only
- Latest event browser: `Chrome 146.0.0`
- Latest event URL: production `/`
- Latest event `blocked_uri`: first-party production `_next/static/...js`
- Latest event `csp.disposition`: `report`

Recommended action:
- Treat the same as `WEB-G`: resolve or mute as report-only telemetry

### WEB-E

**Status:** Monitor
**Severity:** Informational

This is the same preview-only report-only CSP family as `WEB-J`, on an earlier preview deployment.

Evidence:
- 77 events, 1 user
- Environment tag: `preview`
- Latest event `document_uri` and `blocked_uri` are the same preview deployment host
- Latest event `csp.disposition`: `report`

Recommended action:
- Resolve or mute as preview-monitor telemetry

## Assessment of the Prior Claims

- `WEB-M is Twitter in-app browser noise — archive it`: Agree, with tighter wording. The strongest claim supported by the evidence is "third-party or in-app-browser quirk, almost certainly Twitter-webview related," not a definitive attribution to Twitter-owned code.
- `WEB-G/F/H are expected CSP report-only violations from the DEBT-332 security audit visibility phase`: Mostly agree, but incomplete. Correct on report-only posture; incomplete because `WEB-F` spans both production and preview, and `WEB-H` is a separate grouping artifact of the same family rather than a distinct class of issue.
- `WEB-J/E are Vercel preview deploy URLs in CSP — expected noise`: Agree on action, disagree on framing. They are preview-only report-only telemetry, but they are not production pages accidentally loading preview assets.
- `WEB-K is a real bug caused by ClerkProvider ssr:false hydration gap with error boundaries`: Partly disagree. It is a real bug, but the evidence points more directly to a server/client provider-boundary mismatch than to an error-boundary hydration race.
- `5 of 7 are noise, 1 is a third-party quirk, 1 is a real low-severity bug`: Disagree on counting. The correct split is 1 real bug, 1 third-party/in-app-browser quirk, and 5 monitor-only CSP issues. Calling all 5 simply "noise" loses useful CSP rollout context.

## References

- https://clerk.com/docs/security/clerk-csp
- https://clerk.com/blog/nextjs-authentication
- https://nextjs.org/docs/app/guides/content-security-policy
- https://vercel.com/docs/headers/security-headers
