# BS-060: Sentry Error Triage and Environment Hygiene

**Date:** 2026-03-23
**Triggered by:** Sentry email noise, residual CSP issue `WEB-B`, and conflicting post-triage summaries
**Status:** Implemented on 2026-03-24 in PR #250. Post-deploy verification remains tracked in GitHub issue #251.
**Historical note:** The Root Cause Analysis section below describes the pre-fix `proxy.ts` state that existed on `main` before PR #250, specifically commit [`e28a3665`](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/blob/e28a3665494ffcaa0711eeec2e37ad60959459e7/proxy.ts).
**Scope:** Final state after operational cleanup, plus the remaining preview-toolbar/CSP integration debt
**Related:** [DEBT-310](../debt/debt-310-stripe-stale-price-id-in-production-db.md), [DEBT-240](../debt/debt-240-local-dev-database-url-points-to-production.md), [DEBT-239](../debt/debt-239-env-local-stripe-account-mismatch.md), [DEBT-332](../../debt/debt-332-security-posture-audit.md)

---

## Background

This doc started as a full live audit of the Sentry project `novamindnyc/addiction-boards-web`.

The operational cleanup was completed:

- the issue alert rule is now scoped to `production`
- the built-in `localhost` inbound filter is now enabled
- the historical open issue backlog was resolved

However, a follow-up verification pass showed that the work was **not** fully complete. One residual issue remained:

- `ADDICTION-BOARDS-WEB-B`
- numeric ID `7354421512`
- title `Blocked 'frame-src' from 'vercel.live'`

This issue continues to receive new preview-deployment CSP report-only events.

So the real remaining problem is narrower than the original triage:

- alert noise from dev/localhost is handled
- historical production/data-pollution issues are handled
- the remaining unresolved work is the preview-only Vercel Toolbar + CSP integration contract

---

## Verified Current State

### Live state after cleanup

The following were re-verified directly from the live Sentry REST API on 2026-03-23.
These values are a point-in-time snapshot and will drift if more preview CSP events arrive.

| Check | Verified state |
|-------|----------------|
| Alert rule | `environment: "production"` |
| Localhost filter | `active: true` |
| `is:unresolved` issues | `1` |
| `is:resolved` issues | `8` |
| `is:ignored` issues | `0` |
| `is:muted` issues | `0` |

The one unresolved issue is:

| Field | Value |
|-------|-------|
| Short ID | `ADDICTION-BOARDS-WEB-B` |
| Numeric ID | `7354421512` |
| Status | `unresolved` |
| Priority | `high` |
| Count | `38` |
| User count | `2` |
| First seen | `2026-03-21T17:56:40.603258Z` |
| Last seen | `2026-03-24T00:34:07Z` |
| Title | `Blocked 'frame-src' from 'vercel.live'` |

### What WEB-B actually is

The latest observed `WEB-B` events carry these tags:

- `logger=csp`
- `blocked-host=vercel.live`
- `blocked-uri=https://vercel.live`
- `effective-directive=frame-src`
- `url` points at a preview `.vercel.app` deployment
- the Sentry issue tag endpoint reports `environment: null`

This is not a business-logic crash. It is a CSP report-only event emitted by the browser while loading a preview deployment, and it is consistent with the Vercel Toolbar/Comments behavior described in Vercel’s docs.

---

## Root Cause Analysis

There are two distinct root causes behind `WEB-B`.

### Root cause 1: Preview Toolbar traffic is not fully represented in CSP

Vercel’s official Toolbar docs say that if a site has a CSP, Toolbar or Comments may require adjustments to all of the following directives:

- `script-src https://vercel.live`
- `connect-src https://vercel.live wss://ws-us3.pusher.com`
- `img-src https://vercel.live https://vercel.com data: blob:`
- `frame-src https://vercel.live`
- `style-src https://vercel.live 'unsafe-inline'`
- `font-src https://vercel.live https://assets.vercel.com`

The pre-fix policy in [proxy.ts at `e28a3665`](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/blob/e28a3665494ffcaa0711eeec2e37ad60959459e7/proxy.ts#L63-L77) did **not** include any of those Vercel Toolbar allowances.

That means the earlier idea of “just add `frame-src https://vercel.live`” is incomplete. Vercel documents a broader allowlist, not a frame-only fix.

### Root cause 2: CSP reports are not tagged with Sentry environment

The pre-fix Sentry CSP report endpoint builder in [proxy.ts at `e28a3665`](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/blob/e28a3665494ffcaa0711eeec2e37ad60959459e7/proxy.ts#L25-L50) appended only:

- `sentry_key`

Sentry’s official CSP reporting docs say the report URI can also include:

- `sentry_environment`
- `sentry_release`

Because this repo currently omits `sentry_environment`, Sentry receives no explicit environment hint on the CSP report URI for these events. That is consistent with `WEB-B` landing in Sentry with `environment: null`.

This matters because it makes preview-only CSP noise harder to reason about, and it weakens environment-scoped triage in the dashboard.

---

## What Is Already Resolved

The following debt is operationally mitigated:

- Production email noise from dev/preview events: reduced by scoping the issue alert rule to `production`
- Localhost noise from local development: resolved by enabling the `localhost` inbound filter
- Historical Stripe stale-price incidents in Sentry: no new evidence suggests ongoing recurrence; current environment wiring does not match the stale historical price IDs

The remaining unresolved debt is:

- correct preview-only support for Vercel Toolbar under CSP
- correct `sentry_environment` tagging for CSP reports

So the honest status is:

- **operational cleanup: mostly done**
- **environment/CSP correctness: not fully done**

---

## Policy Decision

The cleanest long-term path is **not** to do nothing and call the debt resolved.

The correct path is:

1. Keep the Vercel Toolbar available for preview deployments.
2. Support it properly in CSP for preview only.
3. Tag CSP reports with `sentry_environment`.
4. Resolve `WEB-B` after the code/config change ships and re-verify that it stays closed.

This avoids both bad extremes:

- do **not** globally loosen production CSP for a preview-only tool
- do **not** leave a recurring high-priority unresolved issue in Sentry and pretend the debt is closed

---

## Recommended Fix

### R1. Keep production CSP unchanged for Toolbar-specific allowances

Do **not** add the Vercel Toolbar allowlist globally to all environments.

Instead:

- keep production behavior as-is for Toolbar-specific domains
- add the Vercel-documented Toolbar allowlist only when `VERCEL_ENV === 'preview'`

This is the least hacky approach because the Toolbar is a preview concern, not a production runtime dependency.

### R2. Add full preview-only Vercel Toolbar CSP support

When `VERCEL_ENV === 'preview'`, extend CSP with the documented Vercel Toolbar origins:

- `script-src https://vercel.live`
- `connect-src https://vercel.live wss://ws-us3.pusher.com`
- `img-src https://vercel.live https://vercel.com data: blob:`
- `frame-src https://vercel.live`
- `style-src https://vercel.live 'unsafe-inline'`
- `font-src https://vercel.live https://assets.vercel.com`

Do not implement a partial frame-only fix. That would be a brittle whack-a-mole patch against Vercel’s documented requirements.

### R3. Tag CSP reports with `sentry_environment`

Update the Sentry security-header endpoint builder so the report URI includes:

- `sentry_key`
- `sentry_environment`

Use the same environment source already used elsewhere in the repo:

- `VERCEL_ENV` first
- `NODE_ENV` fallback

This should be done for all environments, not only preview. It is a correctness improvement for CSP reporting in general.

### R4. Only add `sentry_release` if there is already a canonical release source

Sentry supports `sentry_release` on the report URI, but this doc does **not** recommend inventing a new release identifier just for CSP.

If the app already has a canonical release value wired for Sentry, include it.
If not, do not add release-tagging in this pass.

### R5. Resolve and verify

After the preview-only CSP fix and `sentry_environment` tagging ship:

1. Resolve `WEB-B`
2. Open a preview deployment
3. Confirm no new `WEB-B` events arrive
4. Confirm CSP report events, if any, now carry `environment=preview`

---

## Alternative Paths

### Alternative A: Disable Toolbar for Preview

This is a valid fallback, not the preferred path for this repo.

Vercel documents that Toolbar visibility can be managed:

- team-wide
- project-wide
- per environment (Preview/Production)
- per branch via `VERCEL_PREVIEW_FEEDBACK_ENABLED`

This path is simpler, but it trades away a useful official preview-review feature to avoid doing the CSP integration correctly.

### Alternative B: Mute WEB-B

This is only cosmetic triage.

It makes the dashboard cleaner but leaves the underlying mismatch unresolved.

### Alternative C: Do nothing

This is acceptable only as a temporary holding state.

It is not a real resolution because:

- the issue is still recurring
- the dashboard remains non-clean
- the CSP report environment tagging remains incorrect

---

## Implementation Sketch

This was the minimal implementation contract that followed the policy above. PR #250 implemented it in the live file referenced below:

1. In [proxy.ts](../../proxy.ts#L25), extend the Sentry CSP report URI helper to append `sentry_environment` when available.
2. In [proxy.ts](../../proxy.ts#L96), split CSP directives into:
   - base directives for all environments
   - preview-only Toolbar additions when `process.env.VERCEL_ENV === 'preview'`
3. Keep [proxy.ts](../../proxy.ts#L206) as `reportOnly: true` unless CSP enforcement work is intentionally in scope.
4. After deploy, resolve `WEB-B` and verify it stays closed.

---

## Recommended Commands

Read-only verification commands:

```bash
SENTRY_TOKEN=$(awk -F= '/^token=/{print $2}' ~/.sentryclirc)

curl -sS -H "Authorization: Bearer $SENTRY_TOKEN" \
  "https://sentry.io/api/0/projects/novamindnyc/addiction-boards-web/rules/" | jq '.'

curl -sS -H "Authorization: Bearer $SENTRY_TOKEN" \
  "https://sentry.io/api/0/projects/novamindnyc/addiction-boards-web/filters/" | jq '.'

curl -sS -H "Authorization: Bearer $SENTRY_TOKEN" \
  "https://sentry.io/api/0/projects/novamindnyc/addiction-boards-web/issues/?query=is%3Aunresolved&limit=100" | jq '.'
```

Post-fix verification target:

- `is:unresolved` returns `[]`
- no new `WEB-B` events arrive from preview page loads
- any future CSP reports include the correct environment tag

---

## Sources

Official documentation used for the policy in this doc:

- Vercel Toolbar management and CSP guidance:
  - <https://vercel.com/docs/vercel-toolbar/managing-toolbar>
  - includes per-environment enable/disable, branch-level `VERCEL_PREVIEW_FEEDBACK_ENABLED`, automation header `x-vercel-skip-toolbar`, and the documented CSP additions for Toolbar/Comments
- Sentry CSP reporting (JavaScript):
  - <https://docs.sentry.io/platforms/javascript/security-policy-reporting/>
  - documents `sentry_environment` and `sentry_release` as supported query parameters on the CSP report URI
- Sentry environments:
  - <https://docs.sentry.io/platforms/javascript/configuration/environments/>
  - documents that Sentry creates environments when it receives events with the `environment` parameter set
- Sentry issue alert rule API:
  - <https://docs.sentry.io/api/alerts/create-an-issue-alert-rule-for-a-project/>
  - documents `environment` as the rule’s environment filter

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-23 | Narrow BS-060 from broad Sentry cleanup to the residual preview-toolbar/CSP problem | Alert noise and localhost noise were already operationally mitigated; `WEB-B` remained the only active unresolved item |
| 2026-03-23 | Choose preview-only Toolbar CSP support over global CSP relaxation | The Toolbar is a preview concern; broadening production CSP for it is unnecessary |
| 2026-03-23 | Treat `sentry_environment` on CSP reports as part of the proper fix | Official Sentry docs support it, and the current `null` environment is partly due to local implementation, not an unavoidable Sentry limitation |
