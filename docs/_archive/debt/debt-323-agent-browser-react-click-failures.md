# DEBT-323: Agent-Browser Ref-Click Failures with React Components

**Date:** 2026-03-18
**Triggered by:** BS-057 agent-browser auth investigation. After solving Clerk auth via `--profile`, live testing revealed that `agent-browser click @ref` is unreliable across parts of the React practice flow.
**Scope:** agent-browser interaction reliability with React 19 + Radix UI components in practice flows. This is not a confirmed user-facing application bug; it is a tooling limitation unless reproduced in a real browser.
**Related:** [BS-057](../brainstorming/bs-057-agent-browser-clerk-auth-reliability.md), [agent-browser docs](../tooling/agent-browser.md)

---

## The Problem

`agent-browser click @ref` is unreliable on practice-flow React components in this app. The consistent failure is primary action buttons like `Submit`, which report success (`✓ Done`) but do nothing. Toggle groups remain unreliable. Radios are not uniformly broken: latest live verification showed radio ref-click working on Quick Practice, while semantic `find text ... click` still failed on the same screen.

This was initially misattributed to "stale refs" and "Clerk auth failures" during earlier agent audits. Live testing on 2026-03-18 proved the root cause is agent-browser's click mechanism not triggering React's synthetic event system.

---

## Verified Test Matrix (2026-03-18, agent-browser 0.21.1)

| Element | `click @ref` | `find text` click | JS `.click()` | JS `label.click()` | Mouse coords |
|---------|-------------|-------------------|---------------|--------------------| -------------|
| **Radio inputs** (Quick Practice) | **Works** | Fails | N/A | **Works** | Not tested |
| **Submit button** (Quick Practice) | **Fails** | N/A | **Works** | N/A | Not tested |
| **Toggle buttons** (Tutor/Exam, filters) | Unreliable in prior live verification | N/A | Fails | N/A | Changes DOM, not React state |
| **Start session button** (Practice starter) | Unreliable in prior live verification | N/A | **Works** | N/A | Fails |
| **Links** (Resume session) | **Works** | N/A | N/A | N/A | N/A |
| **Dialog buttons** (Abandon anyway) | **Works** | N/A | N/A | N/A | N/A |

### Key Findings

1. **Submit button ref-click silently no-ops**: Fresh snapshot taken on Quick Practice, Submit confirmed enabled at `@e7`, `click @e7` returned `✓ Done`, page unchanged. JS `button.click()` on the same element immediately triggered feedback rendering.

2. **Radio selection is inconsistent, not completely blocked**: On Quick Practice, `click @ref` on the radio worked and enabled Submit. `find text "..." click` still failed on the same screen. `label.click()` via `eval` remains the safest cross-page fallback.

3. **Toggle buttons defeat ALL approaches**: The Tutor/Exam mode toggle buttons use `aria-pressed`. Mouse coordinate clicks changed the DOM `aria-pressed` attribute but React's internal state remained unchanged — the created session was always Tutor regardless of what the DOM showed. JS `.click()` and `dispatchEvent(new PointerEvent(...))` also failed.

4. **Start session button has split behavior**: JS `.click()` navigates successfully. Mouse coordinate `down`/`up` does nothing.

5. **The exact tutor-session repro route was partially blocked by a separate runtime timeout**: A later pass on `/app/practice/[sessionId]` stuck on `Loading question...` and surfaced `[ClientError] TimeoutError: Operation timed out after 10000ms` in the Next dev overlay. That timeout is separate from the agent-browser interaction issue, so the current radio/submit verification matrix uses `/app/practice/quick` as the stable question surface.

---

## Root Cause

agent-browser uses Playwright under the hood, but its `click @ref` command does not always produce the same event sequence as a real user click. React 19's event delegation (attaching handlers at the root) and Radix UI's pointer-event-based toggle patterns require specific event sequences (pointerdown → pointerup → click, with correct `isTrusted`, bubbling, and composed properties) that agent-browser's accessibility-tree-based click does not fully replicate.

The specific failure modes:
- **sr-only inputs**: Behavior can vary by surface; direct input clicks may work in some flows while semantic text clicks still fail
- **React onClick handlers**: `click @ref` fires something, but React's delegation doesn't catch it (the JS `.click()` workaround proves the handler exists and works)
- **Radix toggle groups**: These listen for `pointerdown` events specifically, not `click`. Neither agent-browser refs nor programmatic dispatch produces a trusted pointer event that Radix accepts

---

## Impact

**Severity:** Medium. Does not affect real users directly. It affects AI agents using agent-browser for visual verification and can create false conclusions if agents over-trust `click @ref`.

**Blast radius:** Practice-flow primary actions and toggle groups are the main risk. Radio behavior is inconsistent by surface. Navigation links and simple dialog buttons are unaffected.

**Workaround exists:** Yes — a mix of JS eval patterns:

```bash
# Radios — safest fallback is clicking the label
agent-browser eval "document.querySelectorAll('label')[0].click()"

# Submit/Start session — JS .click()
agent-browser eval "Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Submit')?.click()"

# Toggle buttons — NO WORKING WORKAROUND
# Mouse coords change DOM but not React state
# JS .click() and dispatchEvent both fail
# Only option: use Playwright directly for flows requiring toggle interaction
```

---

## Workaround Summary for Agents

| Element Type | Working Approach |
|-------------|-----------------|
| Answer choice radios | Safest fallback: `eval "document.querySelectorAll('label')[N].click()"` (`click @ref` may work on some surfaces, but do not rely on it as the default) |
| Submit / Next / action buttons | `eval "Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Submit'))?.click()"` |
| Mode toggles (Tutor/Exam) | **No agent-browser workaround.** Use Playwright E2E tests instead. |
| Filter toggles (Unanswered/All) | **No agent-browser workaround.** Use Playwright E2E tests instead. |
| Links (Resume, Back) | `click @ref` works normally |
| Dialog buttons (Confirm/Cancel) | `click @ref` works normally |

---

## Recommendation

1. **Do not write a debt item to "fix" this** — it's an upstream agent-browser limitation, not our bug.
2. **Update SKILL.md** with the eval-click patterns so agents use them by default instead of discovering failures at runtime.
3. **For flows requiring toggle interaction** (starting Exam mode sessions), agents should use Playwright E2E tests or ask the user to perform the toggle manually via the headed browser.
4. **Track upstream**: If agent-browser releases a version that fixes React event delegation compatibility, re-test this matrix.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-18 | Created debt doc after live agent-browser testing | Ref-click reliability gaps were confirmed after auth was solved — not stale refs and not an auth problem. |
| 2026-03-18 | Narrowed radio claim after re-verification | Quick Practice radio ref-click worked in a later pass. The dependable failures are Submit/primary action buttons and toggle groups; radio behavior is inconsistent, not uniformly broken. |
| 2026-03-18 | No code fix needed for DEBT-323 itself | The interaction gap remains specific to agent-browser behavior and is not, by itself, a confirmed product bug. |
| 2026-03-18 | Document eval workarounds in SKILL.md | Agents need deterministic patterns, not trial-and-error debugging at runtime. |
