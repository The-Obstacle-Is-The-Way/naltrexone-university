# DEBT-515: CodeRabbit Learns Lasting Rules From Agents Speaking as the Owner

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — after promotion, the first weekly learnings issue opens and new learnings wait for approval; due 2026-10-23
**Priority:** P2
**Date:** 2026-10-09
**Resolved:** —
**Verification receipts:** —

---

## Summary

CodeRabbit turns a chat reply into a **learning**, a rule it applies to every later review. Learnings are stored in CodeRabbit, not in this repository, so nobody reviews them. Every agent comments as the owner's GitHub account, so CodeRabbit cannot tell an agent's argument from the owner's ruling. A pull request can teach its own reviewer to be more lenient. On 2026-10-09 the owner flagged that this erodes the outside reviewer's independence.

## Evidence

- **Volume.** In the 30 days to 21:00Z on 2026-10-09, CodeRabbit recorded 250 learnings in this repository, from 244 replies on 154 pull requests: about eight a day. 72 of them match the wording the weekly job flags as telling CodeRabbit to stop raising something. The first count, 22, covered only the pull requests updated in those two days.
- **Who taught them.** Every reply CodeRabbit learned from was posted by `The-Obstacle-Is-The-Way`, the owner's account, which the agent sessions use. Nothing distinguishes the owner's own replies from theirs.
- **Applied at once.** `.coderabbit.yaml` set no `knowledge_base.learnings.approval_delay`, and the default of 0 applies a learning immediately. `scope: auto` keeps this public repository's learnings to this repository.
- **One asked for by the PR under review.** On #1438, an agent asked CodeRabbit to "record a learning" that removing post-closure notes from archived records restores their frozen text ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1438#issuecomment-6086302277)). That widened what CodeRabbit lets through in frozen history, across every later review.
- **One stale and contradicting the code.** On #1430, an early learning ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1430#discussion_r4221572828)) says errors, DOM nodes and class instances "are intentionally left to Sentry's own serialisation". A later learning on the same PR, and `redactStrings` in `lib/sentry-data-collection.ts`, do the opposite: such values become type strings, because Sentry's serialisation can expose credentials. A reviewer holding the early rule could accept a regression to the leaky behaviour.
- **Owner decisions encoded as reviewer rules.** Two learnings tell CodeRabbit that the owner accepts a risk: the Vercel Hobby plan until the first sale ([DEBT-512](./debt-512-production-hosting-plan-forbids-commercial-use.md); [reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1437#discussion_r4228100527)), and the stored-address fallback for legal notices ([DEBT-511](./debt-511-legal-notices-use-a-stored-email-clerk-may-have-changed.md); [reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1426#discussion_r4215878560)). Both decisions are recorded in their records. As learnings, they stop CodeRabbit from ever raising those risks again.
- **The rest.** The other learnings state code facts or add caution, for example that E2E runs share one Clerk user and that a release-health test must set a release. They are accurate and keep.

## Impact

No defect is known to have shipped because of a learning. The cost is assurance. CodeRabbit is the only independent review this repository has, and rules nobody reviewed can silently narrow it. Any later finding it does not raise may have been learned away.

## Options

1. **Opt out of CodeRabbit's knowledge base** (`knowledge_base.opt_out: true`). Rejected: it deletes every stored learning, accurate ones included, and turns off the other knowledge-base features that need stored data.
2. **Rely on agents not to ask for learnings.** Rejected alone: CodeRabbit records learnings unasked (the #1436 one was), and agents work across sessions and compactions, so a rule nobody checks drifts.
3. **Hold each new learning for the owner, make every learning visible at merge, and move reviewer rules into the repository.** Chosen.
4. **Give agents their own GitHub account**, so that the owner's account means the owner. Chosen as the lasting fix, and deferred to the owner, because it needs an account, credentials and possibly a CodeRabbit seat.

## Resolution (decided)

- **Hold new learnings.** `.coderabbit.yaml` sets `knowledge_base.learnings.approval_delay: 30`, the maximum. Each new learning waits for the owner to approve or reject it in CodeRabbit's app. One left alone is approved when the 30 days end ([CodeRabbit's release note](https://releases.sh/release/rel_ccYP6IMTwPVr_lV4b-Mj8)), and CodeRabbit documents no notice, so the hold protects only if someone looks.
- **Review them weekly.** `.github/workflows/coderabbit-learnings-review.yml` runs `scripts/coderabbit-learnings-review.ts` every Monday. It keeps one GitHub issue, assigned to the repository owner because GitHub notifies an assignee whatever their watch setting, listing every learning recorded since its last report. A hidden marker in the issue records the newest learning listed, so a dropped scheduled run loses nothing. A week too large for one issue lists the oldest learnings first and leaves the newest for the next run, never splitting replies posted in the same second, so a backlog drains without loss. A first run starts eight days back, and no run starts before the 30-day hold. Those whose wording tells CodeRabbit to stop raising something come first, quoted with the date a pending one applies by itself; the rest follow as excerpts. The issue closes itself in a week with no new learning. The flag is a heuristic for ordering: every learning is listed. At eight a day, a learning-by-learning review of everything would not happen, so the owner reads the flagged ones and skims the rest.
- **Make them visible.** `scripts/merge-reviewed-pr.ts` refuses a feature merge while a CodeRabbit reply that records "Learnings added" is not linked from the PR description, and it lists those replies in its receipt. Replies that cite learnings CodeRabbit already holds ("Learnings used") are not new and do not count. Truncated comment data fails closed, as thread and check data do.
- **Rules live in the repository.** [AGENTS.md](../../AGENTS.md#coderabbit-learnings-debt-515-2026-10-09) forbids asking CodeRabbit for a learning and puts reviewer rules in AGENTS.md or `.coderabbit.yaml`, through reviewed PRs. The Verifying convention that #1438's learning taught is now written in AGENTS.md's record lifecycle: the fixing PR sets the status itself, effective when it merges.
- **Prune.** The owner deleted these four learnings at app.coderabbit.ai/learnings on 2026-10-10:
  1. #1438: "removing post-closure state-update notes from an archived record under docs/_archive/ restores its frozen text…" ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1438#issuecomment-6086302277)).
  2. #1438: "…The three removed 2026-10-06 notes in docs/_archive/debt/debt-476… do not request their restoration…" ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1438#issuecomment-6084464245)). It concerns one archived change.
  3. #1438: "a fixing PR can set its debt record and register entry to `Verifying …`" ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1438#discussion_r4232035464)). AGENTS.md now says this.
  4. #1430: "…Errors, DOM nodes, and class instances are intentionally left to Sentry's own serialisation…" ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1430#discussion_r4221572828)). It is stale and contradicts the code.
- **Prune, found 2026-10-10.** A learning from #285 (2026-04-25), on `docs/bugs/bug-236-…`, says a bug record keeps `Status: Open` with a `Resolution State` field until after merge, and that a fixing PR must never set its record's status or archive it. AGENTS.md's record lifecycle says the opposite. CodeRabbit still listed it under "Learnings used" on #1456 ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1456#discussion_r4238713688)), and it shaped one finding in a round that also caught a stale summary. It predates the 30-day hold, so nothing listed it.
  - **For the owner:** delete it at app.coderabbit.ai/learnings. Search for "Resolution State".
  - **In the repository:** `.coderabbit.yaml` now gives `docs/bugs/**` and `docs/debt/**` path instructions that cite AGENTS.md's record sections and override any stored learning. AGENTS.md's CodeRabbit Learnings section says what to do with the next learning that contradicts it.
  - **The pattern.** Stale backlog learnings are the risk the hold cannot reach. This is a second one, after #1430's, so it strengthens the case for triaging the backlog's 72 flagged learnings, or resetting the knowledge base.
- **Backlog, the owner's call.** The 250 learnings recorded before the hold applied at once. The owner either triages the 72 flagged ones in CodeRabbit's app, or resets the knowledge base: `knowledge_base.opt_out: true` deletes every stored learning, and turning it off again starts a clean, held one. A reset also loses the accurate learnings that keep CodeRabbit from repeating false positives, so triage comes first.
- **Deferred: an account for agents.** It needs the owner's account, credentials and possibly a CodeRabbit seat. The register's Now stanza lists it among the owner's decisions; it moves to the Deferred table when this record is archived.

## Verification

- [x] On live GitHub data, the new check refuses #1437, #1438 and #1436 as they stood on 2026-10-09, whose descriptions do not link their learning replies, and names every reply. It finds none on #1411 or on promotion #1442.
- [x] On live data on 2026-10-09, a dry run of the weekly job found 95 learnings recorded in the past eight days, 30 of them flagged, and its issue body was 43,913 characters, inside GitHub's limit.
- [x] The four learnings above are gone from CodeRabbit's app (2026-10-10). The owner deleted each one, and a search for each now returns nothing. The app then held 520 learnings, 83 of them created that week.
- [ ] The owner deletes #285's "Resolution State" learning, and the next review of a pull request that sets a record to Verifying raises no finding asking for `Status: Open`.
- [ ] After promotion, the first scheduled run opens the learnings issue.
- [ ] After promotion, the next learning CodeRabbit records waits for the owner's approval instead of applying at once.

## Related

- [CodeRabbit's configuration reference](https://docs.coderabbit.ai/reference/configuration): `knowledge_base.learnings`.
- [DEBT-508](./debt-508-concurrent-e2e-runs-share-clerk-budget-and-stripe-customer.md): the shared Clerk user, one of the learnings that stay.
- [AGENTS.md — How to Check](../../AGENTS.md#how-to-check): the merge command.
