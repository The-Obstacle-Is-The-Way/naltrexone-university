# Agent-Browser Quick Reference

**Package:** `agent-browser` (Vercel Labs)
**Repo:** https://github.com/vercel-labs/agent-browser
**Full command reference:** `../../.agents/skills/agent-browser/SKILL.md`
**Project integration:** `./testing-infrastructure.md` §Agent-Browser
**CLI verified locally:** `agent-browser 0.21.1`

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

### Option A: Persistent Profile with Human Login (Recommended)

Verified working on 2026-03-18 with `agent-browser 0.21.1` and Clerk.

**First time — human logs in once via headed Chromium:**

```bash
agent-browser --profile /tmp/clerk-profile --headed open http://localhost:3000/sign-in
# A Chromium window opens on screen. Log in manually through Clerk.
# Once you reach /app/dashboard, the profile is saved automatically.
```

**All subsequent sessions — agents reuse the profile (no human needed):**

```bash
agent-browser close # if a daemon is already running with different options
agent-browser --profile /tmp/clerk-profile open http://localhost:3000/app/dashboard
agent-browser get url          # verify: must show /app/dashboard, not Clerk sign-in
agent-browser screenshot /tmp/screenshot.png --full
agent-browser open http://localhost:3000/app/practice
```

If Clerk redirects to sign-in, the profile session has expired — redo the headed login step.

Important:
- Use the exact host from `NEXT_PUBLIC_APP_URL`. Do not switch between `localhost` and `127.0.0.1`; Clerk cookies are host-specific.
- The profile is stored at `/tmp/clerk-profile`. Do not commit it to the repo.
- If an `agent-browser` daemon is already running, later `--profile` flags are ignored until `agent-browser close`.

### Rejected Approaches (Do Not Use)

| Approach | Why It Failed |
|----------|--------------|
| **CDP bridge** (`agent-browser connect <port>` to Playwright browser) | CDP creates a new browser context that does not inherit Playwright's authenticated cookies. The connected session lands on Clerk sign-in regardless of Playwright's auth state. Fundamental CDP limitation ([Playwright #11442](https://github.com/microsoft/playwright/issues/11442)). |
| **`--state` / storageState** | `agent-browser --state` silently fails to restore cookies/localStorage, even for non-Clerk sites. Upstream bug in agent-browser. |
| **Direct CLI fill** | Clerk's anti-automation blocks automated sign-in attempts through agent-browser. |

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

1. **Dev server must be running** — `pnpm dev` must be live before using agent-browser against `localhost:3000`.
2. **Always use `--profile /tmp/clerk-profile`** — Without it, agent-browser starts an unauthenticated session that Clerk will redirect to sign-in.
3. **Refs expire after navigation** — Always re-snapshot after `open`, `click` that navigates, or DOM changes.
4. **Radio refs are not the main failure mode we observed** — On Quick Practice, both direct radio-ref click and text-based choice click worked. Prefer `agent-browser find text "<choice text>" click` when you want the most readable command, but do not assume every radio ref will fail.
5. **Some action-button ref clicks may silently fail** — We reproduced this on `Start session` and `Submit`: `agent-browser click @ref` returned success without changing app state, while a targeted JS click did work. Treat this as an unresolved interaction issue, not a proven auth bug. Fallback example: `agent-browser eval "Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Submit'))?.click()"`.
6. **Clerk auth + hostnames** — `localhost` and `127.0.0.1` are not interchangeable for Clerk cookies; use the exact host from `NEXT_PUBLIC_APP_URL`.
7. **`agent-browser wait --url` uses glob patterns** — Use `**/dashboard` not `/app/dashboard`.
8. **Temp files** — Never commit state JSON, screenshots, or temp scripts to the repo.
