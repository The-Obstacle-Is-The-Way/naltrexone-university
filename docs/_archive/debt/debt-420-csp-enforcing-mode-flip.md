# DEBT-420: CSP Enforcement Decision — Strict Nonce CSP Is Incompatible with Next 16 PPR / Cache Components

**Priority:** P2
**Created:** 2026-06-14
**Status:** **Decided — documentation only.** The originally-planned "flip Clerk strict CSP from report-only → enforcing" is **NOT viable on this stack** (proven three independent ways below). No production code change is recommended now.
**Source:** Owner request to close DEBT-332's last item; GitHub issue [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245).
**Parent audit:** [DEBT-332 Security Posture Audit](../../debt/debt-332-security-posture-audit.md).
**Related:** [`proxy.ts`](../../../proxy.ts), [`next.config.ts`](../../../next.config.ts), [`proxy.test.ts`](../../../proxy.test.ts), billing server-action forms, issues [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245) and [#251](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/251).
**Verified:** 2026-06-14 against `dev` @ `8f5c1c24`, `@clerk/nextjs@7.4.3`, a live production-build experiment, official Next.js/Clerk docs, live Sentry data, and the open GitHub issue register.

---

## TL;DR / Decision

Flipping the existing Clerk **strict (nonce + `'strict-dynamic'`)** CSP from report-only to enforcing **cannot work on this stack** and would **break the app** for real users (it blocks first-party Next.js scripts on prerendered pages).

**Decision:**

1. **Keep the CSP in report-only.** This is the accepted near-term residual posture and satisfies DEBT-332's final DoD via its *"explicitly document the accepted residual risk"* branch. The app is pre-revenue and other controls are strong.
2. **Do not enforce the nonce policy.** Close [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245) with this rationale.
3. **Documented upgrade path (future, optional):** if real CSP *enforcement* is ever wanted, switch to a **non-nonce, host-allowlist** policy (`script-src 'self' …`, no `'strict-dynamic'`), which **is** compatible with PPR / Cache Components. Scope as a new debt item when prioritized.
4. **Known noise:** the current strict report-only generates ~22 real CSP **report-only violations** for scripts that still load (our own PPR chunks and inline shell scripts). Accept, mute, or adopt the non-nonce policy (which removes the source).

This is decisive: **no nonce-CSP enforcement on this architecture; report-only now; non-nonce host policy is the only PPR-compatible real-enforcement path.**

---

## The Finding — confirmed three independent ways

### 1. Live Sentry (real users)

- **22** unresolved `Blocked 'script'` CSP issues; only **1** non-CSP issue in the whole project. These are real `disposition=report` CSP violations, but report-only means they do not block the app.
- **Production** `addictionboards.com/app/billing`: blocked `/_next/static/chunks/…cx.js` — **378 events, 16 users**, 2026-04-06 → 2026-06-13.
- `/sign-up`: blocked `inline` script — **222 events, 39 users**.
- Preview `/`: blocked `/_next/static/chunks/…b0bd.js`.

These `blocked_uri` values are first-party Next.js chunks and inline shell scripts — **not** browser-extension noise.

### 2. Empirical test on our own production build (2026-06-14)

`pnpm build` then `next start`, `curl` of two public routes, inspecting whether the served `<script>` tags carry the same nonce the CSP header advertises:

| Route | CSP header nonce present? | first-party `_next/static` `<script>` tags | tags carrying the nonce |
|---|---|---|---|
| `/pricing` | yes | 18 | **1** |
| `/sign-up` | yes | 17 | **1** |

The header mints a fresh per-request nonce, but Next does **not** apply it to the prerendered shell's script tags (~17 unnonced first-party chunks per page). Under enforcing `'strict-dynamic'`, every one of those would be **blocked**.

### 3. Official documentation (current, verified 2026-06-14)

- **Next.js CSP guide** (current docs page, last updated 2026-03-31 at time of verification): *"you must use dynamic rendering to add nonces … Static pages are generated at build time, when no request or response headers exist—so no nonce can be injected … **Partial Prerendering (PPR) is incompatible with nonce-based CSP since static shell scripts won't have access to the nonce.**"* — <https://nextjs.org/docs/app/guides/content-security-policy>
- **Open Next.js bug [#89754](https://github.com/vercel/next.js/issues/89754)** (opened 2026-02-10, still open 2026-04-20): "Nonce-based CSP with inline scripts is incompatible with `cacheComponents`" — exactly this repo's configuration. No maintainer fix or supported workaround.
- **Clerk** strict CSP requires `<ClerkProvider dynamic>` + dynamic rendering — <https://clerk.com/docs/guides/secure/best-practices/csp-headers> — the direct opposite of a cached static shell.

---

## Root Cause

This repo runs **`cacheComponents: true`** (`next.config.ts:4`) → Partial Prerendering. A nonce must be **unique per request**, but a PPR/Cache-Components static shell is **built once and shared** across all requests, so its `<script>` tags physically cannot carry a per-request nonce. Clerk's `strict: true` emits `script-src … 'strict-dynamic' 'nonce-…'`, and **`'strict-dynamic'` makes CSP3 browsers ignore `'self'`, `'unsafe-inline'`, and host allowlists** — so any unnonced script, *including our own `_next/static/chunks`*, is blocked. This is fundamental, not a missed setting.

In report-only (current state) the browser still *loads* the scripts and merely *reports* the violation — which is why the app works today and why Sentry quietly accumulated these reports. Setting `reportOnly: false` turns those reports into hard blocks.

## Why the Original "Just Flip It" Premise Was Wrong

DEBT-332 recorded a single point-in-time deployed check on 2026-03-21 (report-only, billing **not** exercised) and concluded "report-only is clean → flip it." But report-only does not block, so violations accrued silently in Sentry from real traffic afterward. The pre-merge Sentry recheck (added during audit) surfaced them. The "clean since March" claim was false.

---

## Options

### Chosen — keep report-only (accepted residual risk)

- **Zero code change.** App unaffected.
- CSP remains **visibility-only** (no active XSS hardening from CSP). Acceptable pre-revenue given the strong existing controls DEBT-332 graded "Pass" (auth enforced at every layer, server-only DB access, sanitized markdown, no `dangerouslySetInnerHTML`, signed webhooks, fail-closed rate limiting).
- Satisfies DEBT-332's final DoD via *"explicitly document the accepted residual risk."*

### Future option — non-nonce host-allowlist CSP (the only PPR-compatible real-enforcement path)

- Drop Clerk `strict: true`; own a **non-nonce** policy (via `next.config.ts` `headers()` or Clerk non-strict) where `script-src 'self' <required hosts>`. Same-origin `_next/static/chunks` is permitted by `'self'`; no nonce, no `'strict-dynamic'`; PPR/static shells stay valid (Next docs "Without Nonces" path).
- Delivers genuine enforcement **and** eliminates the strict-report-only script-violation noise.
- **Tradeoff:** a host-allowlist is weaker than nonce + `'strict-dynamic'` (it trusts origins, not individual scripts), and Clerk's non-strict default is broad — to be tight we must **own** the policy. **Medium effort**; scope as its own debt item when prioritized.

### Rejected

- **Flip the nonce policy as-is** — breaks the app (this finding). Rejected.
- **Drop PPR / force every route dynamic** so the nonce applies everywhere — recovers nonce CSP but discards Cache-Components caching + performance app-wide. Disproportionate. Rejected.
- **Hash-based SRI / hash-only CSP** — not a complete fix for this app's current failure mode because it does not solve the reported inline shell-script issue (#89754) and does not address the Clerk strict policy's nonce + `'strict-dynamic'` incompatibility with PPR. Not viable as the DEBT-420 flip path. Rejected.

---

## Impact on In-Flight Work

- **Implementation branch `debt/420-csp-enforce-impl`** (a local-only commit flipping `reportOnly: false` + adding a `form-action` Stripe allowlist) is **abandoned** — never pushed, do **not** merge. (Its `form-action` allowlist is harmless and correct, but moot without enforcement.)
- **This doc (PR #438)** supersedes the "flip" plan with this decision.
- **GitHub [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245)** ("flip to enforcing") → close as *"won't enforce: nonce CSP is PPR-incompatible on this stack; report-only accepted; non-nonce enforce is the future path,"* linking this doc.
- **GitHub [#251](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/251)** (WEB-B preview-toolbar Sentry issue) → unaffected; separate cleanup.

## GitHub Issue and Doc Close-Out Map

Open issue audit on 2026-06-14 showed five open GitHub issues:

| Issue | Relationship to DEBT-420 | Action after this doc merges |
|---|---|---|
| [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245) — "DEBT-332: Flip CSP from report-only to enforcing mode" | **Directly resolved by this decision.** The issue's premise says to flip `reportOnly` after a clean observation window; live Sentry + build/browser reproduction proved the nonce policy cannot be safely enforced with Next 16 PPR/Cache Components. | Close with this doc as the rationale. Do **not** implement the one-line `reportOnly: false` change. |
| [#251](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/251) — WEB-B preview-toolbar CSP verification | Separate preview-toolbar verification from PR #250. DEBT-420's strict-script/PPR finding does not prove WEB-B is resolved or unresolved. | Leave open unless Sentry issue `7354421512` is independently checked and resolved/muted per #251's runbook. |
| [#423](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/423) — billing-maintenance cron fire verification | Unrelated billing-cron follow-up. | Leave open. |
| [#352](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/352) — pnpm maturity bootstrap exceptions | Unrelated dependency/process cleanup. | Leave open. |
| [#53](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/53) — tag selector enhancement | Unrelated feature request. | Leave open. |

Documentation updates tied to this decision:

- **DEBT-332** now records the accepted-residual branch as resolved; its former "flip or accept residual" final DoD item is no longer open.
- **Debt index** must describe DEBT-420's Sentry evidence as report-only violations/noise, not "false positives," and must stop presenting DEBT-332 as still waiting on enforcing-mode work.
- **Clerk vendor note** must point to DEBT-420 for the enforcement decision, while preserving the fact that current CSP is still generated by Clerk middleware in strict report-only mode.
- Archived brainstorming/debt docs remain historical snapshots unless a future PR promotes them back into active execution guidance.

## Sentry Noise Cleanup (optional, independent)

The 22 strict-report-only `Blocked 'script'` issues are real CSP reports for scripts that still load because the policy is report-only. They will **recur as long as strict report-only runs**. Options: leave them, mute them in Sentry, or adopt the non-nonce policy (removes the source). No urgency.

---

## Definition of Done

- [x] Determine whether the nonce CSP can be enforced on this stack → **NO**, proven via Sentry + a build experiment + official Next/Clerk docs.
- [x] Record the decision: keep report-only (accepted residual); non-nonce enforce = documented future path; nonce enforce rejected.
- [x] Update DEBT-332's final DoD item to *"accepted residual risk documented"* referencing this doc.
- [ ] Close [#245](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/245) with the rationale; abandon/delete the `debt/420-csp-enforce-impl` branch.
- [ ] (Optional) Decide on Sentry report-only noise (mute) and whether to schedule the non-nonce enforce follow-up.

---

## Verified Reference Facts (still accurate)

These were confirmed against `proxy.ts` and the installed `@clerk/nextjs@7.4.3` and remain true; they document *what the current policy is* and *why the merge mechanics work*, for whoever picks up the non-nonce path.

| Fact | Evidence |
|---|---|
| Current Clerk CSP config is `strict: true, reportOnly: true` (+ conditional `reportTo`). | `proxy.ts:205-214` |
| Custom directives + Sentry endpoint wiring from `NEXT_PUBLIC_SENTRY_DSN`. | `proxy.ts:77-110` |
| Preview-only Vercel Toolbar allowances (gated `VERCEL_ENV==='preview'`). | `proxy.ts:87-94`, `:111-117` |
| Clerk default `form-action: ["self"]`; strict mode edits only `script-src` (strips `http:`/`https:`, adds `'strict-dynamic'` + nonce); custom directives union with defaults; `reportOnly` only toggles header name; reporting independent. | `@clerk/nextjs@7.4.3 …/server/content-security-policy.js:56-102,139-146,168-176` |
| `cacheComponents: true` (PPR) is enabled. | `next.config.ts:4` |
| Stripe account has **no custom domain** (Checkout=`checkout.stripe.com`, Portal=`billing.stripe.com`) — so a `form-action` Stripe allowlist would be correct *if* enforcement ever happens via the non-nonce path. | Owner-verified `dashboard.stripe.com/settings/custom-domains`, 2026-06-14 |

## Citations

- Next.js CSP guide (verified 2026-06-14; page last updated 2026-03-31): <https://nextjs.org/docs/app/guides/content-security-policy>
- Next.js open issue #89754 (nonce CSP + `cacheComponents`): <https://github.com/vercel/next.js/issues/89754>
- Next.js `cacheComponents` config: <https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents>
- Clerk CSP best practices: <https://clerk.com/docs/guides/secure/best-practices/csp-headers>
- Clerk rendering modes: <https://clerk.com/docs/guides/development/rendering-modes>
- DEBT-332 (parent audit; point-in-time report-only verification): `docs/debt/debt-332-security-posture-audit.md:412`
