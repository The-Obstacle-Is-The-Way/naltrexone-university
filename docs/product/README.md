# Product Documents

Product documents specify observable behaviour, before implementation as well as after it. The number of implementation PRs does not turn a feature into technical debt. Unscheduled suggestions stay in [ideas](./ideas.md); a feature the owner chooses to design gets a document here, named for its subject, without a numbered SPEC record.

## Before Implementation

Write or amend `docs/product/<subject>.md` on the feature branch. Start with **Delivery:** Proposed, Planned, Partially shipped or Shipped, and distinguish current behaviour from proposed changes. Include:

- the user problem, scope and non-goals;
- observable acceptance criteria, failure cases and access rules;
- the contracts being changed, with links to their current owners;
- open decisions, their decision maker, and the outcome once decided;
- acceptance tests to write first, then the tests proving shipped behaviour;
- rollout steps and PR links for a multi-PR feature, with what is actually delivered and what remains.

Have the design challenged before code. Do not describe a proposal or a merged-but-unreleased change as shipped. A spec-only PR may establish the design; implementation PRs update delivery and the proving tests. Durable choices between architectural alternatives get an ADR. Defects and existing engineering liabilities get bug/debt records under the [records rules](../records/README.md#how-records-work). The feature document stays live after delivery; remove only temporary progress bookkeeping whose evidence is retained in reachable Git history and PRs.

## One Home for Each Contract

The master specification owns the overall product and the API contract sections it already contains. Topic pages own the detailed interactions they already govern. When a behaviour changes, identify that owner first, update it and its tests in the same PR, and update summaries elsewhere to link to it. Do not add a second normative copy. If the master repeats a detailed contract, correct both until the owner approves consolidating it; preservation takes precedence over deleting substantive text. A disagreement between documents is a defect to reconcile against code and the owner’s product decision, not permission to choose whichever copy is convenient.

The master is currently `docs/specs/master_spec.md`; the layout migration moves it whole to `docs/product/specification.md`, keeping its API contracts. It is not a complete inventory of schemas, routes or environment variables: link their executable sources when those facts matter.
