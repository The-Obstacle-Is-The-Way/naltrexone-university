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

## Possible Approaches (Ranked by Feasibility)

### A: Chrome MCP as primary visual verification tool (pragmatic)

**How:** Use `claude-in-chrome` MCP tools instead of agent-browser for authenticated visual verification. The user's Chrome is already authenticated.
**Pros:** Works now, no infrastructure changes needed.
**Cons:** Requires the user's browser to be open and authenticated. Can't run unattended.
**Effort:** Zero — just update agent prompts to prefer Chrome MCP over agent-browser.

### B: Persistent profile with manual one-time login (simple)

```bash
agent-browser --profile /tmp/clerk-profile --headed open http://localhost:3000/sign-in
# User logs in manually once via --headed mode
# All subsequent agent-browser runs reuse the profile:
agent-browser --profile /tmp/clerk-profile open http://localhost:3000/app/dashboard
```

**Pros:** Simple. Works with Clerk's anti-automation because it's a real login.
**Cons:** Manual step required. Profile may expire. macOS arm64 crash risk (#297).
**Effort:** Low — document the pattern, add to skill.

### C: Disable Clerk bot detection in dev environment

Per [Stably AI docs](https://docs.stably.ai/trouble-shooting/clerk-bot-detection), Clerk Dashboard allows disabling bot detection per environment.
**Pros:** Enables direct-fill approach (Option D in agent-browser docs) to actually work.
**Cons:** Security trade-off for dev environment. Doesn't help with production visual verification.
**Effort:** Low — one toggle in Clerk Dashboard + update docs.

### D: `eval`-based testing token injection (advanced)

Use agent-browser's `eval` command to inject JavaScript that patches `fetch` to append `__clerk_testing_token` to Clerk API requests — replicating what `setupClerkTestingToken` does at the Playwright layer but at the page JS layer.

```bash
# Pseudocode — would need actual implementation
TOKEN=$(node -e "/* create testing token via Clerk Backend API */")
agent-browser eval "window.__clerkTestingToken = '$TOKEN'; /* patch fetch */"
```

**Pros:** Fully automated, replicates E2E test mechanism.
**Cons:** Fragile. Depends on Clerk's internal fetch patterns. Undocumented. May break on Clerk SDK updates.
**Effort:** High — needs research, implementation, and ongoing maintenance.

### E: Playwright-bridge script (documented but unverified)

Already documented in `docs/dev/agent-browser.md` as Option C. Create a script that authenticates via `@clerk/testing/playwright`, exports `storageState`, and passes it to agent-browser.
**Pros:** Leverages our existing E2E auth infrastructure.
**Cons:** DEBT-322 audit agent tried this and it failed (state file didn't carry the session). May be a format incompatibility or timing issue. Needs investigation.
**Effort:** Medium — debug why it fails, fix, and verify.

---

## Open Questions

1. **Why did the Playwright storageState → agent-browser bridge fail?** Is it a format incompatibility, timing issue (token expired), or the macOS arm64 bug (#297)?
2. **Can we disable Clerk bot detection just for our dev environment?** What's the security trade-off?
3. **Is Chrome MCP sufficient for our visual verification needs?** If so, do we even need agent-browser auth to work?
4. **Should we invest in fixing this at all?** Code analysis + test assertions may be "good enough" for agent-driven audits.

---

## Recommendation

**Short term (now):** Approach A — update agent prompts and skill docs to prefer Chrome MCP for authenticated visual verification. Document that agent-browser is for unauthenticated pages only.

**Medium term (if needed):** Investigate Approach C (disable bot detection in dev) + retry Approach E (Playwright bridge) to see if the combination works. Debug the state file failure from the DEBT-322 audit.

**Long term:** Watch for agent-browser to add Clerk-style auth provider support (issue #586 pattern). Or wait for `@clerk/testing` to support non-Playwright tools.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-18 | Created as brainstorming doc, not immediate fix | Not mission-critical — workarounds exist (Chrome MCP, code analysis). Needs more investigation before committing to an approach. |
