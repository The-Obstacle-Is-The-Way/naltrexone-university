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

### Why storageState export also fails

Playwright's `storageState()` exports cookies and localStorage. Clerk sessions rely on:
- Short-lived session tokens (60s default) that rotate
- The `__session` cookie which may expire before agent-browser loads it
- Potentially different cookie domains between Playwright's context and agent-browser's Chromium

The state file format compatibility between Playwright and agent-browser is also undocumented and unverified.

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
| [#586](https://github.com/vercel-labs/agent-browser/issues/586) | Azure AD / Entra ID auth | Closest analog — shows pattern for complex SSO auth providers |
| [#279](https://github.com/vercel-labs/agent-browser/issues/279) | frameLocator for cross-origin iframes | Clerk's `<SignIn/>` uses iframes; may affect direct-fill approaches |
| [#297](https://github.com/vercel-labs/agent-browser/issues/297) | `--state`/`--profile` daemon crash on macOS arm64 | Could explain state file failures on our M-series Macs |

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

### Tool 2: agent-browser (Needs Investigation)

agent-browser is built on Playwright's Chromium, so there should be a viable path. Two approaches to investigate:

#### A: Playwright storageState bridge (documented, failed once, needs debugging)

Already documented in `docs/dev/agent-browser.md` as Option C. A script authenticates via `@clerk/testing/playwright`, exports `storageState`, and passes it to agent-browser via `--state`.

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

**Status:** DEBT-322 audit agent tried this and it failed — the state file didn't carry the session. This needs debugging:
- Is it a state file format incompatibility between Playwright and agent-browser?
- Is it a timing issue (Clerk session token expired between export and load)?
- Is it the macOS arm64 `--state`/`--profile` daemon crash (agent-browser issue #297)?
- Is the `storageState` missing critical Clerk cookies or localStorage keys?

**This is the highest-priority investigation item.**

#### B: Persistent profile with manual one-time login (fallback)

```bash
agent-browser --profile /tmp/clerk-profile --headed open http://localhost:3000/sign-in
# Log in manually once via --headed mode
# All subsequent agent-browser runs reuse the profile:
agent-browser --profile /tmp/clerk-profile open http://localhost:3000/app/dashboard
```

**Pros:** Simple. Works with Clerk's anti-automation because it's a real human login.
**Cons:** Manual step. Profile may expire. macOS arm64 crash risk (#297).

## Deprioritized / Rejected Approaches

| Approach | Status | Reason |
|----------|--------|--------|
| Chrome MCP as primary tool | Deprioritized | Depends on user's browser state; unreliable for autonomous agents |
| Disable Clerk bot detection in dev | Rejected | Hacky; changes security posture for a tooling convenience |
| `eval`-based testing token injection | Rejected | Fragile monkey-patching; undocumented; breaks on Clerk SDK updates |

---

## Open Questions

1. **Why did the Playwright storageState → agent-browser bridge fail?** Is it a format incompatibility, timing issue (token expired), or the macOS arm64 bug (#297)? This is the #1 question to answer.
2. **What does agent-browser's state file format actually look like vs. Playwright's?** Compare the two JSON structures to identify incompatibilities.
3. **Can agent-browser consume Playwright's storageState directly, or does it need transformation?** If transformation is needed, write a bridge script.
4. **Does our E2E infrastructure need any updates to support agent-browser auth export?** Or can we reuse `tests/e2e/helpers/clerk-auth.ts` directly?

---

## Recommendation

**Primary tools:** Playwright (already working) and agent-browser (needs the storageState bridge debugged).

**Next step:** Debug the Playwright storageState → agent-browser bridge failure. Compare state file formats, test with fresh credentials, check for macOS arm64 issues. If the bridge works, commit a reusable script and update the agent-browser skill/docs.

**Fallback:** If the bridge cannot be made reliable, use the persistent profile approach (manual one-time login) for agent-browser, and Playwright for everything else.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-18 | Created as brainstorming doc | Recurring agent auth failure needs investigation before committing to a fix. |
| 2026-03-18 | Playwright + agent-browser as primary tools; Chrome MCP deprioritized | Playwright already works. agent-browser is Playwright-based, so it should be solvable. Chrome MCP depends on user state and is unreliable for autonomous agent work. |
| 2026-03-18 | Rejected: bot detection disable, eval token injection | Hacky approaches that change security posture or depend on undocumented internals. |
