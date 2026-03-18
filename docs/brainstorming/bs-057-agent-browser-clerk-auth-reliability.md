# BS-057: Agent-Browser Clerk Authentication Reliability

**Date:** 2026-03-18
**Triggered by:** DEBT-322 audit agent failed to visually verify exam UX issues because it could not authenticate through Clerk in agent-browser. This is a recurring pattern — every agent tasked with browser-based verification hits the same Clerk auth wall.
**Scope:** Native `agent-browser` auth/state reuse cannot reliably access Clerk-protected `/app/*` routes. The verified working path is a persistent `--profile` with one-time human login.
**Related:** [DEBT-322](../debt/debt-322-exam-action-bar-ux-polish.md), [DEBT-323](../debt/debt-323-agent-browser-react-click-failures.md), [agent-browser docs](../dev/agent-browser.md), [testing infrastructure](../dev/testing-infrastructure.md)

---

## The Problem

We have three browser automation tools with three different auth stories:

| Tool | Clerk Auth | Why |
|------|-----------|-----|
| **Playwright E2E** | Works perfectly | `@clerk/testing/playwright` injects a testing token via `browserContext.route()` that bypasses Clerk's bot detection |
| **agent-browser (Vercel)** | Works with persistent profile; native auth/state reuse fails | No Clerk SDK integration. `--state` proved unreliable, CDP attach did not preserve auth, but `--profile` with one-time human login persisted a usable Clerk session |
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
**Workaround exists:** Playwright itself works today. Chrome MCP also works if the user is already logged in via their browser. For `agent-browser`, `--profile` with one-time human login now works and persists across runs until the Clerk session expires.

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

Our browser automation strategy should rely on **Playwright** and **agent-browser** — not Chrome MCP. Playwright already works perfectly with Clerk auth. For `agent-browser`, the pragmatic path is a persistent browser profile with one-time human login, not `--state` reuse or CDP attach.

Chrome MCP (`claude-in-chrome`) remains available as a supplementary tool but is not a primary — it depends on the user's browser state and is unreliable for autonomous agent work.

### Tool 1: Playwright (Already Working)

Playwright E2E tests authenticate through Clerk without any issues:
- `clerkSetup()` in `tests/e2e/global.setup.ts` fetches a testing token
- `clerk.signIn()` in `tests/e2e/helpers/clerk-auth.ts` authenticates via `@clerk/testing/playwright`
- All 26 E2E spec files reuse the authenticated session
- Credential health check validates Clerk + DB + Stripe before any test runs

**Status: Fully working.** Agents should prefer Playwright for visual verification tasks when possible.

### Tool 2: agent-browser (Needs A Profile-Based Auth Path)

agent-browser can be useful for interactive verification, but the reliable path is not `--state` or CDP. Three approaches matter:

#### A: Persistent profile with manual one-time login (working)

```bash
agent-browser --profile /tmp/clerk-profile --headed open http://localhost:3000/sign-in
# Log in manually once via --headed mode
# All subsequent agent-browser runs reuse the profile:
agent-browser --profile /tmp/clerk-profile open http://localhost:3000/app/dashboard
```

**Status:** verified locally on 2026-03-18 with `agent-browser 0.21.1`.

What was verified:
- human login in headed Chromium reached `/app/dashboard`
- subsequent profile reuse stayed authenticated on `/app/dashboard`
- authenticated navigation succeeded on `/app/practice`, `/app/history`, `/app/bookmarks`, and `/app/billing`
- auth persisted after `agent-browser close` and reopen with the same profile path

Operational gotchas discovered during verification:
- if an `agent-browser` daemon is already running, later `--profile` flags are ignored until `agent-browser close`
- the profile session still expires eventually; if Clerk redirects to sign-in again, redo the headed login step

#### B: Playwright storageState bridge (`--state`) is currently unreliable

Already documented in `docs/tooling/agent-browser.md` as a rejected path. A script authenticates via `@clerk/testing/playwright`, exports `storageState`, and passes it to agent-browser via `--state`.

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

#### C: Playwright + CDP bridge (`agent-browser connect`) is rejected

CDP attach was investigated because it looked like a clean way to reuse Playwright's already-authenticated browser. In practice, the connected `agent-browser` session did not stay authenticated, even when the Playwright-owned browser itself was on `/app/dashboard`.

**Status:** rejected for this repo. Do not treat it as a working auth bridge.

## Deprioritized / Rejected Approaches

| Approach | Status | Reason |
|----------|--------|--------|
| Chrome MCP as primary tool | Deprioritized | Depends on user's browser state; unreliable for autonomous agents |
| CDP bridge (`agent-browser connect` to Playwright browser) | **Rejected** | Local verification did not preserve authenticated access in the attached `agent-browser` session. Treat as non-working for this repo. |
| `--state` / storageState | **Rejected** | `agent-browser --state` silently fails to restore cookies/localStorage, even for non-Clerk sites. Upstream bug. |
| Direct CLI fill | **Rejected** | Clerk's anti-automation blocks automated sign-in through agent-browser. |
| Disable Clerk bot detection in dev | Rejected | Hacky; changes security posture for a tooling convenience |
| `eval`-based testing token injection | Rejected | Fragile monkey-patching; undocumented; breaks on Clerk SDK updates |

---

## Recommendation

**For Playwright-based verification:** Use Playwright directly via `@clerk/testing/playwright`. This is the fully automated, zero-human-intervention path. It works perfectly and always will.

**For agent-browser interactive verification:** Use `--profile` with a one-time human login via `--headed` mode. Verified working on 2026-03-18 with `agent-browser 0.21.1`. The profile persists the Clerk session across agent-browser runs until it expires.

```bash
# One-time setup (human logs in):
agent-browser --profile /tmp/clerk-profile --headed open http://localhost:3000/sign-in

# All subsequent agent runs (no human needed):
agent-browser --profile /tmp/clerk-profile open http://localhost:3000/app/dashboard
```

If a daemon is already running, close it first so the new `--profile` flag actually takes effect:

```bash
agent-browser close
agent-browser --profile /tmp/clerk-profile open http://localhost:3000/app/dashboard
```

### Separate Follow-Up: Ref-Click Interaction Weirdness

During profile verification, auth worked but some ref-based button clicks did not:
- `agent-browser click @ref` on `Start session` returned success without navigation
- `agent-browser click @ref` on `Submit` returned success without submitting
- a targeted `agent-browser eval "...click()"` fallback did work for those buttons
- radio choice refs on Quick Practice did work in the same session

This is **not** sufficient to classify as an agent-browser auth problem. Treat it as a separate interaction/tooling investigation, potentially involving app behavior, React event dispatch, or route-specific rendering timing.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-18 | Created as brainstorming doc | Recurring agent auth failure needs investigation before committing to a fix. |
| 2026-03-18 | Playwright + agent-browser as primary tools; Chrome MCP deprioritized | Playwright already works. agent-browser is Playwright-based, so it should be solvable. Chrome MCP depends on user state and is unreliable for autonomous agent work. |
| 2026-03-18 | Rejected: bot detection disable, eval token injection | Hacky approaches that change security posture or depend on undocumented internals. |
| 2026-03-18 | Investigated `--state` and CDP bridge; both unreliable | `--state` fails even for non-Clerk localStorage. Local CDP attach did not preserve authenticated access in the connected `agent-browser` session. |
| 2026-03-18 | `--profile` is the working path | `--profile` with one-time `--headed` human login verified working on dashboard, practice, history, bookmarks, and billing, and persisted after `agent-browser close` + reopen. |
| 2026-03-18 | Ref-click weirdness scoped out of auth resolution | `Start session` and `Submit` ref-clicks could no-op while auth was already working. This needs separate investigation and should not be blamed on auth alone. |
