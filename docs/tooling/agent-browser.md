# Agent-Browser Developer Reference

**Package:** `agent-browser` (Vercel Labs)
**Repo:** https://github.com/vercel-labs/agent-browser
**CLI version verified:** `0.21.1` (2026-03-18)
**Agent skill file:** `.agents/skills/agent-browser/SKILL.md`

---

## What It Is

Vercel's agent-browser is a CLI that lets AI agents control a Chromium instance. It uses accessibility tree snapshots with refs (`@e1`, `@e2`) instead of raw DOM selectors, which keeps interaction context concise.

```bash
npm install -g agent-browser && agent-browser install
```

---

## Authentication with Clerk

All `/app/*` routes require Clerk auth. The only reliable method is a **persistent profile with one-time human login**.

### Setup (one-time, human required)

```bash
# Dev server must be running first
pnpm dev

# Open headed Chromium — log in manually through Clerk
agent-browser --profile /tmp/clerk-profile --headed open http://localhost:3000/sign-in
```

### Subsequent sessions (no human needed)

```bash
agent-browser close                    # kill any existing daemon first
agent-browser --profile /tmp/clerk-profile open http://localhost:3000/app/dashboard
agent-browser get url                  # verify: /app/dashboard, not Clerk sign-in
```

If Clerk redirects to sign-in, the profile session has expired — redo the headed login step.

### Auth rules

- **Host must match exactly.** `localhost` and `127.0.0.1` are not interchangeable for Clerk cookies. Use whichever `NEXT_PUBLIC_APP_URL` resolves to (default: `localhost`).
- **Profile path:** `/tmp/clerk-profile`. Never commit to repo.
- **Daemon gotcha:** If an `agent-browser` daemon is already running, later `--profile` flags are ignored. Always `agent-browser close` before switching profiles.

### Rejected auth approaches

| Approach | Why It Failed |
|----------|--------------|
| CDP bridge (`agent-browser connect`) | CDP creates isolated contexts that don't inherit cookies ([Playwright #11442](https://github.com/microsoft/playwright/issues/11442)) |
| `--state` / storageState | `agent-browser --state` silently fails to restore cookies/localStorage, even for non-Clerk sites. Upstream bug. |
| Direct CLI fill | Clerk's anti-automation blocks it |

Full auth investigation: [BS-057](../brainstorming/bs-057-agent-browser-clerk-auth-reliability.md)

### Loading `.env.local` values

agent-browser does not load `.env.local`. If you need env vars:

```bash
set -a && source .env.local && set +a
```

Or via Node (shell-safe):

```bash
EMAIL=$(node -e "require('dotenv').config({path:'.env.local', quiet:true});require('dotenv').config({path:'.env', quiet:true});process.stdout.write(process.env.E2E_CLERK_USER_USERNAME||'')")
```

---

## Known Limitation: React Interaction Reliability Gaps (DEBT-323)

`agent-browser click @ref` is unreliable on parts of the React 19 + Radix UI practice flow. The dependable failure is primary action buttons like `Submit`, which report `✓ Done` but do nothing. Toggle buttons remain unreliable. Radios are not uniformly broken: latest verification on Quick Practice showed radio ref-click working, but semantic text-click still failed. Treat this as an agent-browser limitation unless the same behavior reproduces in a real browser.

### What works and what doesn't

| Element | `click @ref` | JS eval workaround |
|---------|-------------|-------------------|
| **Answer radios** (practice questions) | Inconsistent by surface; worked on `/app/practice/quick` in latest verification | Safest fallback: `eval "document.querySelectorAll('label')[0].click()"` |
| **Submit / action buttons** | Fails | `eval "Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Submit')?.click()"` |
| **Toggle buttons** (Tutor/Exam, filters) | Fails | **No workaround.** Use Playwright for these flows. |
| **Links** (`<a>` elements) | Works | N/A |
| **Dialog buttons** (Confirm/Cancel) | Works | N/A |

### Root cause

agent-browser's accessibility-tree-based click does not produce the event sequence React 19's root-level event delegation expects. Radix toggle groups listen for `pointerdown` specifically — neither agent-browser refs nor programmatic `dispatchEvent` produces a trusted pointer event that Radix accepts.

Full test matrix: [DEBT-323](../_archive/debt/debt-323-agent-browser-react-click-failures.md)

---

## Quick Command Reference

| Task | Command |
|------|---------|
| Navigate | `agent-browser open <url>` |
| Interactive snapshot | `agent-browser snapshot -i` |
| Scoped snapshot | `agent-browser snapshot -s "#main"` |
| Click (links/dialogs only) | `agent-browser click @e1` |
| Fill input | `agent-browser fill @e1 "text"` |
| Get text | `agent-browser get text @e1` |
| Get URL | `agent-browser get url` |
| Full screenshot | `agent-browser screenshot path.png --full` |
| Wait for URL | `agent-browser wait --url "**/dashboard"` |
| Wait for idle | `agent-browser wait --load networkidle` |
| Console logs | `agent-browser console` |
| Page errors | `agent-browser errors` |
| Close | `agent-browser close` |

Full command reference: `.agents/skills/agent-browser/SKILL.md`

---

## Parallel Sessions

```bash
agent-browser --session audit1 open http://localhost:3000/app/dashboard
agent-browser --session audit2 open http://localhost:3000/app/practice
agent-browser session list
```

Each session has independent cookies, storage, and auth state.

---

## Pitfalls

1. **Dev server must be running** — `pnpm dev` must be live before using agent-browser against `localhost:3000`.
2. **Always use `--profile /tmp/clerk-profile`** — Without it, Clerk redirects to sign-in.
3. **Refs expire after navigation** — Always re-snapshot after `open`, `click` that navigates, or DOM changes.
4. **Use JS eval for unreliable React components** — do not rely on `click @ref` for Submit/primary action buttons or toggle buttons. Radios may work on some surfaces, but `label.click()` remains the safest answer-selection fallback. See DEBT-323 section above.
5. **`agent-browser wait --url` uses glob patterns** — Use `**/dashboard` not `/app/dashboard`.
6. **Temp files** — Never commit state JSON, screenshots, or temp scripts to the repo.
