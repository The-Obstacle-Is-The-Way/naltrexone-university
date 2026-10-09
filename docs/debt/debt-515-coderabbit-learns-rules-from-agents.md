# DEBT-515: CodeRabbit Learns Lasting Rules From Agents Speaking as the Owner

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — the four learnings are gone from CodeRabbit's app, and the next new one waits for the owner's approval; due 2026-10-23
**Priority:** P2
**Date:** 2026-10-09
**Resolved:** —
**Verification receipts:** —

---

## Summary

CodeRabbit turns a chat reply into a **learning**, a rule it applies to every later review. Learnings are stored in CodeRabbit, not in this repository, so nobody reviews them. Every agent comments as the owner's GitHub account, so CodeRabbit cannot tell an agent's argument from the owner's ruling. A pull request can teach its own reviewer to be more lenient. On 2026-10-09 the owner flagged that this erodes the outside reviewer's independence.

## Evidence

- **Volume.** From 2026-10-08 to 21:00Z on 2026-10-09, CodeRabbit recorded 22 learnings from agents' chats on eight pull requests in this repository and `addiction-final-2026`. Ten were recorded on 2026-10-09.
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

- **Hold new learnings.** `.coderabbit.yaml` sets `knowledge_base.learnings.approval_delay: 30`, the maximum. Each new learning waits for the owner to approve or reject it in CodeRabbit's app. One left alone applies when the 30 days end.
- **Make them visible.** `scripts/merge-reviewed-pr.ts` refuses a feature merge while a CodeRabbit reply that records "Learnings added" is not linked from the PR description, and it lists those replies in its receipt. Replies that cite learnings CodeRabbit already holds ("Learnings used") are not new and do not count. Truncated comment data fails closed, as thread and check data do.
- **Rules live in the repository.** [AGENTS.md](../../AGENTS.md#coderabbit-learnings-debt-515-2026-10-09) forbids asking CodeRabbit for a learning and puts reviewer rules in AGENTS.md or `.coderabbit.yaml`, through reviewed PRs. The Verifying convention that #1438's learning taught is now written in AGENTS.md's record lifecycle: the fixing PR sets the status itself, effective when it merges.
- **Prune.** The owner deletes these four learnings at app.coderabbit.ai/learnings:
  1. #1438: "removing post-closure state-update notes from an archived record under docs/_archive/ restores its frozen text…" ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1438#issuecomment-6086302277)).
  2. #1438: "…The three removed 2026-10-06 notes in docs/_archive/debt/debt-476… do not request their restoration…" ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1438#issuecomment-6084464245)). It concerns one archived change.
  3. #1438: "a fixing PR can set its debt record and register entry to `Verifying …`" ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1438#discussion_r4232035464)). AGENTS.md now says this.
  4. #1430: "…Errors, DOM nodes, and class instances are intentionally left to Sentry's own serialisation…" ([reply](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1430#discussion_r4221572828)). It is stale and contradicts the code.
- **Deferred: an account for agents.** The register's Deferred table holds it, with its revive trigger.

## Verification

- [x] On live GitHub data, the new check refuses #1437, #1438 and #1436 as they stood on 2026-10-09, whose descriptions do not link their learning replies, and names every reply. It finds none on #1411 or on promotion #1442.
- [ ] The four learnings above are gone from CodeRabbit's app.
- [ ] After promotion, the next learning CodeRabbit records waits for the owner's approval instead of applying at once.

## Related

- [CodeRabbit's configuration reference](https://docs.coderabbit.ai/reference/configuration): `knowledge_base.learnings`.
- [DEBT-508](./debt-508-concurrent-e2e-runs-share-clerk-budget-and-stripe-customer.md): the shared Clerk user, one of the learnings that stay.
- [AGENTS.md — How to Check](../../AGENTS.md#how-to-check): the merge command.
