# Agent-Browser Quick Reference

**Package:** `agent-browser` (Vercel Labs)
**Repo:** https://github.com/vercel-labs/agent-browser
**Full command reference:** `../../.agents/skills/agent-browser/SKILL.md`
**Project integration:** `./testing-infrastructure.md` §Agent-Browser
**CLI verified locally:** `agent-browser 0.20.13`

---

## What It Is

Vercel's agent-browser is a CLI that lets AI agents control a Chromium instance. It uses accessibility tree snapshots with refs (`@e1`, `@e2`) instead of raw DOM selectors, which keeps interaction context concise.

```bash
npm install -g agent-browser && agent-browser install
```

---

## Core Workflow

```bash
agent-browser open <url>       # 1. Navigate
agent-browser snapshot -i      # 2. Get interactive elements with @refs
agent-browser click @e1        # 3. Interact using refs
agent-browser screenshot p.png # 4. Capture evidence
agent-browser close            # 5. Cleanup
```

Re-snapshot after navigation or significant DOM changes — refs are invalidated.

---

## Authentication (This Project)

### Note: `agent-browser` Does Not Load `.env.local`

If you need values from `.env.local` (e.g., `E2E_CLERK_USER_USERNAME`), you must load them yourself. If your `.env.local` is shell-compatible, you can export it in your current shell session:

```bash
set -a && source .env.local && set +a
```

If your `.env.local` contains values that are not shell-safe, prefer Node-based extraction instead. That matches how Playwright and Next load dotenv files.

To extract env vars for CLI use:

```bash
EMAIL=$(node -e "require('dotenv').config({path:'.env.local'});require('dotenv').config({path:'.env'});process.stdout.write(process.env.E2E_CLERK_USER_USERNAME||'')")
PASSWORD=$(node -e "require('dotenv').config({path:'.env.local'});require('dotenv').config({path:'.env'});process.stdout.write(process.env.E2E_CLERK_USER_PASSWORD||'')")
```

### Option A: Playwright + CDP Bridge (Recommended for authenticated local verification)

As of 2026-03-18, the reliable Clerk auth path for `agent-browser` in this repo is:

1. Use Playwright + `@clerk/testing/playwright` to authenticate a real browser session
2. Launch that browser with a fixed remote debugging port
3. Attach `agent-browser` to the live authenticated browser via CDP

Example temporary script (do NOT commit):

```ts
import { config } from 'dotenv';
import { clerkSetup } from '@clerk/testing/playwright';
import { chromium } from '@playwright/test';

config({ path: '.env.local' });
config({ path: '.env' });

const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const helper = (await import('../tests/e2e/helpers/clerk-auth.ts')).default;
const { signInWithClerkPassword } = helper;

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

console.log('CDP ready on port 9224:', page.url());

// Keep the browser alive while agent-browser is attached.
setInterval(() => {}, 1000);
```

In another shell:

```bash
pnpm tsx scripts/tmp-start-agent-browser-cdp.ts
agent-browser connect 9224
agent-browser get url
agent-browser open http://localhost:3000/app/practice
```

Important:
- Use the exact host from `NEXT_PUBLIC_APP_URL`. Do not switch between `localhost` and `127.0.0.1`; Clerk cookies are host-specific.
- Keep the Playwright browser process alive while `agent-browser` is connected.

### Option B: Persistent Profile (Manual Login Once, fallback)

This remains the most plausible human-assisted fallback:

```bash
agent-browser --profile /tmp/agent-browser-profile --headed open http://localhost:3000/sign-in
# Log in manually via --headed mode, then reuse the profile:
agent-browser --profile /tmp/agent-browser-profile open http://localhost:3000/app/dashboard
```

We did not fully re-verify a real Clerk manual-login profile flow end-to-end in this audit, so treat this as a fallback rather than the primary recommendation.

### Option C: Native State Save/Load (Currently unreliable; do not rely on this)

As of 2026-03-18 on local `agent-browser 0.20.13`, `--state` did not reliably restore cookies/localStorage, even on a fresh daemon and even when the state file came from `agent-browser state save` itself.

Plain Playwright `storageState` works correctly in plain Playwright. The failure appears to be in `agent-browser --state`, not in Clerk's testing-token design.

Do not use this path as the recommended auth strategy until upstream behavior is fixed and re-verified.

If you experiment with it anyway:
- Use the exact host from `NEXT_PUBLIC_APP_URL`
- Do not mix `localhost` and `127.0.0.1`
- Treat success as provisional until manually verified

### Option D: Playwright StorageState -> `--state` (Also currently unreliable)

Create a temporary script that signs in via Clerk and exports cookies:

```ts
// scripts/tmp-create-agent-browser-state.ts (do NOT commit)
import { clerkSetup, clerk } from '@clerk/testing/playwright';
import { config } from 'dotenv';
import { chromium } from '@playwright/test';

async function main() {
  config({ path: '.env.local' });
  config({ path: '.env' });
  const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  if (!username || !password) throw new Error('Missing Clerk E2E credentials');

  await clerkSetup();
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', identifier: username, password },
  });
  await page.goto('/app/dashboard');
  await context.storageState({ path: '/tmp/agent-browser-state.json' });
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

```bash
pnpm tsx scripts/tmp-create-agent-browser-state.ts
agent-browser --state /tmp/agent-browser-state.json open http://localhost:3000/app/dashboard
```

This path is retained only for reference while the upstream `--state` restore problem is unresolved.

Requires a running dev server at `NEXT_PUBLIC_APP_URL` (e.g., `pnpm dev`), and the host must match exactly.

Delete `scripts/tmp-create-agent-browser-state.ts` when done — do not commit it.

### Option E: Direct Fill via CLI

If you must sign in directly through agent-browser (least reliable due to Clerk's anti-automation):

```bash
# Extract credentials via Node (most robust; avoids shell parsing differences)
EMAIL=$(node -e "require('dotenv').config({path:'.env.local'});require('dotenv').config({path:'.env'});process.stdout.write(process.env.E2E_CLERK_USER_USERNAME||'')")
PASSWORD=$(node -e "require('dotenv').config({path:'.env.local'});require('dotenv').config({path:'.env'});process.stdout.write(process.env.E2E_CLERK_USER_PASSWORD||'')")

agent-browser open http://localhost:3000/sign-in
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser fill @e3 "$EMAIL"          # Email field (verify ref from snapshot)
agent-browser click @e6                  # Continue button (verify ref)
agent-browser wait 2000                  # Wait for password field
agent-browser snapshot -i                # Re-snapshot for new refs
agent-browser fill @eN "$PASSWORD"       # Password field (use actual ref)
agent-browser click @eM                  # Continue button (use actual ref)
agent-browser wait --url "**/app/dashboard"
agent-browser state save /tmp/auth-state.json   # Save for reuse
```

---

## Key Commands Cheat Sheet

| Task | Command |
|------|---------|
| Navigate | `agent-browser open <url>` |
| Interactive snapshot | `agent-browser snapshot -i` |
| Scoped snapshot | `agent-browser snapshot -s "#main"` |
| Click | `agent-browser click @e1` |
| Fill input | `agent-browser fill @e1 "text"` |
| Get text | `agent-browser get text @e1` |
| Get URL | `agent-browser get url` |
| Full screenshot | `agent-browser screenshot path.png --full` |
| Wait for element | `agent-browser wait @e1` |
| Wait for URL | `agent-browser wait --url "**/dashboard"` |
| Wait for idle | `agent-browser wait --load networkidle` |
| Check visibility | `agent-browser is visible @e1` |
| Semantic find | `agent-browser find role button click --name "Submit"` |
| Save auth state | `agent-browser state save auth.json` |
| Load auth state | `agent-browser --state auth.json open <url>` |
| Console logs | `agent-browser console` |
| Page errors | `agent-browser errors` |
| Close | `agent-browser close` |

---

## Sessions (Parallel Browsers)

```bash
agent-browser --session audit1 open http://localhost:3000/app/dashboard
agent-browser --session audit2 open http://localhost:3000/app/practice
agent-browser session list
```

Each session has independent cookies, storage, and auth state.

---

## Common Pitfalls

1. **Refs expire after navigation** — Always re-snapshot after `open`, `click` that navigates, or DOM changes
2. **Hidden radios can hang clicks** — Our answer-choice inputs are `sr-only`; clicking the `radio` refs may hang. Prefer `agent-browser find text "<choice text>" click` (or click the wrapping `<label>`).
3. **`.env.local` isn’t auto-loaded** — Export env vars yourself or use Node dotenv extraction (see above)
4. **Clerk auth + hostnames** — `localhost` and `127.0.0.1` are not interchangeable for Clerk cookies in this repo; use the exact host from `NEXT_PUBLIC_APP_URL`
5. **`agent-browser --state` is currently unreliable** — Prefer the Playwright + CDP bridge (Option A) over native state restore
6. **Clerk sign-in has anti-automation** — Prefer Playwright + CDP (Option A) over direct fill (Option E)
7. **`agent-browser wait --url` uses glob patterns** — Use `**/dashboard` not `/app/dashboard`
8. **Temp files** — Never commit state JSON, screenshots, or temp scripts to the repo
