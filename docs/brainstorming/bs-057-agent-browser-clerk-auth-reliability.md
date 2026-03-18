# BS-057: Agent-Browser Clerk Authentication Reliability

**Date:** 2026-03-18
**Triggered by:** DEBT-322 audit agent failed to visually verify exam UX issues because it could not authenticate through Clerk in agent-browser. This is a recurring pattern — every agent tasked with browser-based verification hits the same Clerk auth wall.
**Scope:** AI agents using Vercel's agent-browser cannot reliably authenticate through Clerk to access `/app/*` routes, making browser-based visual verification unreliable.
**Related:** [DEBT-322](../debt/debt-322-exam-action-bar-ux-polish.md), [agent-browser docs](../dev/agent-browser.md), [testing infrastructure](../dev/testing-infrastructure.md)

---

## The Problem

We have three browser automation tools with three different auth stories:

| Tool | Clerk Auth | Why |
|------|-----------|-----|
| **Playwright E2E** | Works perfectly | `@clerk/testing/playwright` injects a testing token via `browserContext.route()` that bypasses Clerk's bot detection |
| **agent-browser (Vercel)** | Fails reliably | No Clerk SDK integration. Clerk's anti-automation blocks sign-in attempts |
| **Chrome MCP (claude-in-chrome)** | Works if user is already logged in | Piggybacks on the user's real Chrome session |

The DEBT-322 audit agent tried two approaches and both failed:
1. **Playwright storageState export → agent-browser `--state`:** State file was created but agent-browser still got redirected to Clerk's hosted sign-in page
2. **Direct fill in agent-browser:** Email/password were filled on the Clerk sign-in page, but the session did not advance (Clerk's anti-automation likely blocked it)

This is not a one-off. Any future task requiring an agent to visually verify authenticated pages via agent-browser will hit the same wall.

---

## Root Cause Analysis

### How Clerk's testing token works (from `@clerk/testing` source)

1. **`clerkSetup()`** calls `clerkClient.testingTokens.createTestingToken()` using `CLERK_SECRET_KEY` → gets a short-lived token
2. **`setupClerkTestingToken({ page })`** uses Playwright's `browserContext.route()` to intercept **all** requests to `https://<CLERK_FAPI>/v1/*`
3. For each intercepted request, it:
   - Appends `__clerk_testing_token=<token>` as a query parameter
   - Fetches the real response via `route.fetch()`
   - Overrides `captcha_bypass` to `true` in the JSON response
   - Fulfills with the modified response

**The critical gap:** This is a **request-interception pattern at the Playwright API level** (`browserContext.route`). agent-browser's `network route` command can only abort or mock responses — it **cannot modify outgoing request URLs** by appending query params. The Clerk testing token mechanism cannot be directly replicated using agent-browser's built-in commands.

### Why the Playwright storageState bridge failed (reproduced locally)

The bridge failure is not best explained by JSON shape mismatch or Clerk token expiry alone.

What we verified locally:
- Playwright `storageState()` and `agent-browser state save` are structurally close enough to be considered compatible at the file-shape level (`cookies` + `origins[]`).
- A real Clerk-authenticated Playwright `storageState` successfully authenticated a fresh plain Playwright browser without any testing-token route active.
- `agent-browser 0.20.13` failed to restore that same state on `http://localhost:3000`, redirecting to Clerk sign-in.
- `agent-browser 0.20.13` also failed to round-trip a trivial non-Clerk `example.com` localStorage value on a fresh daemon via `--state`.

Current best explanation: the failure is in `agent-browser --state` restore behavior, not in Clerk's testing-token mechanism.

**Important confounder:** hostnames must match exactly. This repo's app and Clerk cookies use `localhost` by default. A bridge flow that signs in on `localhost` and later opens `127.0.0.1` will fail because the cookies do not match that host. This is a real footgun, but it does not fully explain the `agent-browser` localhost failure reproduced above.

---

## Severity Assessment

**Impact:** Medium. Blocks automated visual verification of any authenticated page.
**Frequency:** Every audit or visual QA task that requires seeing `/app/*` routes.
**Workaround exists:** Chrome MCP works if the user is already logged in via their browser. Agents can also verify via code analysis + test assertions instead of visual screenshots.

---

## Web Search Findings (2026-03-18)

### agent-browser auth capabilities

agent-browser has generic auth support: state save/load, persistent profiles, session names, auth vault, and `--state` files. No Clerk-specific integration exists. Zero GitHub issues mention Clerk in `vercel-labs/agent-browser`.

### Relevant agent-browser GitHub issues

| Issue | Title | Relevance |
|-------|-------|-----------|
| [#586](https://github.com/vercel-labs/agent-browser/issues/586) | Azure AD / Entra ID auth | Still open. Relevant because it proposes broader auth/profile/channel improvements, but those capabilities are not present in the currently verified local CLI. |
| [#279](https://github.com/vercel-labs/agent-browser/issues/279) | frameLocator for cross-origin iframes | Still open, but not a strong explanation for this repo's Clerk failure. The hosted Clerk sign-in page used here was observed as a top-level page with no iframes in Playwright. |
| [#297](https://github.com/vercel-labs/agent-browser/issues/297) | `--state`/`--profile` daemon crash on macOS arm64 | Still open, but not our reproduced symptom. On local `agent-browser 0.20.13`, `--state` did not crash; it silently failed to restore state. |

### Clerk's own guidance

Clerk's testing docs only cover Playwright and Cypress via `@clerk/testing`. No guidance for generic browser automation tools. Their testing token is the sanctioned mechanism for bypassing bot detection.

---

## Primary Tools (Preferred)

Our browser automation strategy should rely on **Playwright** and **agent-browser** — not Chrome MCP. Playwright already works perfectly with Clerk auth. agent-browser is built on Playwright under the hood, so it should be solvable.

Chrome MCP (`claude-in-chrome`) remains available as a supplementary tool but is not a primary — it depends on the user's browser state and is unreliable for autonomous agent work.

### Tool 1: Playwright (Already Working)

Playwright E2E tests authenticate through Clerk without any issues:
- `clerkSetup()` in `tests/e2e/global.setup.ts` fetches a testing token
- `clerk.signIn()` in `tests/e2e/helpers/clerk-auth.ts` authenticates via `@clerk/testing/playwright`
- All 26 E2E spec files reuse the authenticated session
- Credential health check validates Clerk + DB + Stripe before any test runs

**Status: Fully working.** Agents should prefer Playwright for visual verification tasks when possible.

### Tool 2: agent-browser (Needs A Different Bridge)

agent-browser is built on Playwright's Chromium, but the reliable path is not `--state`. Two approaches matter:

#### A: Playwright + CDP bridge (working)

Authenticate a real Playwright browser with `@clerk/testing/playwright`, keep that browser alive with a fixed remote debugging port, then attach `agent-browser` via `agent-browser connect <port>`.

```ts
// scripts/tmp-start-agent-browser-cdp.ts
import { config } from 'dotenv';
import { clerkSetup } from '@clerk/testing/playwright';
import { chromium } from '@playwright/test';

config({ path: '.env.local' });
config({ path: '.env' });

const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const { signInWithClerkPassword } = await import('../tests/e2e/helpers/clerk-auth.ts');

await clerkSetup();
const browser = await chromium.launch({
  headless: true,
  args: ['--remote-debugging-port=9224'],
});

const context = await browser.newContext({ baseURL });
const page = await context.newPage();

await signInWithClerkPassword(page);
await page.goto('/app/dashboard');
await page.waitForLoadState('networkidle');

console.log('CDP ready on 9224:', page.url());
setInterval(() => {}, 1000);
```

```bash
pnpm tsx scripts/tmp-start-agent-browser-cdp.ts
agent-browser connect 9224
agent-browser open http://localhost:3000/app/practice
```

**Status:** verified locally. This is the cleanest working path today because it reuses the existing Clerk-tested Playwright infrastructure and avoids the broken `--state` restore path.

#### B: Playwright storageState bridge (`--state`) is currently unreliable

Already documented in `docs/dev/agent-browser.md` as the older Option C. A script authenticates via `@clerk/testing/playwright`, exports `storageState`, and passes it to agent-browser via `--state`.

```ts
// scripts/tmp-create-agent-browser-state.ts
import { clerkSetup, clerk } from '@clerk/testing/playwright';
import { chromium } from '@playwright/test';
// ... authenticate, export storageState to JSON
```

```bash
pnpm tsx scripts/tmp-create-agent-browser-state.ts
agent-browser --state /tmp/agent-browser-state.json open http://localhost:3000/app/dashboard
```

**Status:** reproduced as unreliable locally. The failure is not best explained by Clerk timing or JSON-shape mismatch:
- the same saved Clerk state works in fresh plain Playwright
- `agent-browser --state` fails even on `localhost`
- `agent-browser --state` also failed to restore a trivial non-Clerk localStorage round-trip

This remains worth tracking as an upstream `agent-browser` issue, but it should not be the recommended auth bridge for this repo.

#### C: Persistent profile with manual one-time login (fallback)

```bash
agent-browser --profile /tmp/clerk-profile --headed open http://localhost:3000/sign-in
# Log in manually once via --headed mode
# All subsequent agent-browser runs reuse the profile:
agent-browser --profile /tmp/clerk-profile open http://localhost:3000/app/dashboard
```

**Pros:** Human login avoids Clerk's anti-automation for the login itself.
**Cons:** Manual step. We did not fully re-verify a real Clerk profile workflow end-to-end in this audit, so this remains a plausible fallback rather than the primary recommendation.

## Deprioritized / Rejected Approaches

| Approach | Status | Reason |
|----------|--------|--------|
| Chrome MCP as primary tool | Deprioritized | Depends on user's browser state; unreliable for autonomous agents |
| Disable Clerk bot detection in dev | Rejected | Hacky; changes security posture for a tooling convenience |
| `eval`-based testing token injection | Rejected | Fragile monkey-patching; undocumented; breaks on Clerk SDK updates |

---

## Open Questions

1. **Is `agent-browser --state` fundamentally broken in the current local build, or only broken under specific daemon/session conditions?** The local evidence points to a broader restore problem.
2. **Should we upstream a minimal reproduction against `agent-browser` showing `--state` fails even for non-Clerk localStorage round-trips?** This is likely more useful than continuing to debug Clerk-specific behavior first.
3. **Do we want a reusable repo-local helper script for the Playwright + CDP bridge?** The pattern works today but is still documented as a temporary/manual flow.
4. **Do we want to keep the persistent-profile fallback documented, or remove it until a real Clerk profile flow is verified end-to-end?**

---

## Recommendation

**Primary working path:** Playwright-authenticated browser + `agent-browser connect <cdp-port>`.

This reuses our existing Clerk-tested Playwright infrastructure and avoids the currently unreliable `--state` restore path.

**Fallback:** manual one-time login with `--profile` remains plausible if a human can complete the login interactively.

**Do not recommend right now:** Playwright `storageState` -> `agent-browser --state` as the primary auth path. Treat it as an upstream bug investigation, not a solved workflow.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-18 | Created as brainstorming doc | Recurring agent auth failure needs investigation before committing to a fix. |
| 2026-03-18 | Playwright + agent-browser as primary tools; Chrome MCP deprioritized | Playwright already works. agent-browser is Playwright-based, so it should be solvable. Chrome MCP depends on user state and is unreliable for autonomous agent work. |
| 2026-03-18 | Rejected: bot detection disable, eval token injection | Hacky approaches that change security posture or depend on undocumented internals. |
| 2026-03-18 | Updated recommendation: Playwright + CDP is primary, `--state` is unreliable | Local verification showed Clerk-authenticated Playwright state works in fresh Playwright but not in `agent-browser --state`, even on `localhost`. |
