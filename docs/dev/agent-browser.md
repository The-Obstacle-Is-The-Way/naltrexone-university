# Agent-Browser Quick Reference

**Package:** `agent-browser` (Vercel Labs)
**Repo:** https://github.com/vercel-labs/agent-browser
**Full command reference:** `../../.agents/skills/agent-browser/SKILL.md`
**Project integration:** `./testing-infrastructure.md` §Agent-Browser

---

## What It Is

Vercel's agent-browser is a CLI that lets AI agents control a headless Chromium instance. It uses accessibility tree snapshots with refs (`@e1`, `@e2`) instead of raw DOM — 93% less context than Playwright MCP.

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

### Critical: `.env.local` Is NOT Shell-Compatible

**DO NOT** run `source .env.local`. It will silently fail or produce empty variables due to unquoted values, `#` in passwords, or other non-POSIX syntax. Playwright and Next.js use Node's `dotenv` library to parse it — not shell `source`.

To extract env vars for CLI use:

```bash
EMAIL=$(node -e "require('dotenv').config({path:'.env.local'});process.stdout.write(process.env.E2E_CLERK_USER_USERNAME||'')")
PASSWORD=$(node -e "require('dotenv').config({path:'.env.local'});process.stdout.write(process.env.E2E_CLERK_USER_PASSWORD||'')")
```

### Option A: Native State Save/Load (Simplest)

If the browser is already signed in (e.g., from a previous session or manual login):

```bash
agent-browser state save /tmp/auth-state.json    # Save after login
agent-browser state load /tmp/auth-state.json    # Restore in future sessions
```

### Option B: Persistent Profile (Manual Login Once)

```bash
agent-browser --profile /tmp/agent-browser-profile open http://localhost:3000/sign-in
# Log in manually via --headed mode, then reuse the profile:
agent-browser --profile /tmp/agent-browser-profile open http://localhost:3000/app/dashboard
```

### Option C: Playwright StorageState (Automated, Recommended for CI)

Create a temporary script that signs in via Clerk and exports cookies:

```ts
// scripts/tmp-create-agent-browser-state.ts (do NOT commit)
import { clerkSetup, clerk } from '@clerk/testing/playwright';
import { config } from 'dotenv';
import { chromium } from '@playwright/test';

async function main() {
  config({ path: '.env.local' });
  const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
  const username = process.env.E2E_CLERK_USER_USERNAME!;
  const password = process.env.E2E_CLERK_USER_PASSWORD!;

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

Delete `scripts/tmp-create-agent-browser-state.ts` when done — do not commit it.

### Option D: Direct Fill via CLI

If you must sign in directly through agent-browser (least reliable due to Clerk's anti-automation):

```bash
# Extract credentials via Node (NOT source .env.local)
EMAIL=$(node -e "require('dotenv').config({path:'.env.local'});process.stdout.write(process.env.E2E_CLERK_USER_USERNAME||'')")
PASSWORD=$(node -e "require('dotenv').config({path:'.env.local'});process.stdout.write(process.env.E2E_CLERK_USER_PASSWORD||'')")

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
| Load auth state | `agent-browser state load auth.json` |
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
2. **`source .env.local` fails silently** — Use Node dotenv extraction (see above)
3. **Clerk sign-in has anti-automation** — Prefer Playwright storageState (Option C) over direct fill (Option D)
4. **`agent-browser wait --url` uses glob patterns** — Use `**/dashboard` not `/app/dashboard`
5. **Temp files** — Never commit state JSON, screenshots, or temp scripts to the repo
