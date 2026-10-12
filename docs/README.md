# Documentation

Each folder holds one kind of document; [ADR-023](./adr/adr-023-documentation-organisation.md) gives the reasons. The rules an agent obeys on every edit are not here: they are in [`AGENTS.md`](../AGENTS.md) and [`.claude/rules/`](../.claude/rules/testing.md).

| Folder | Kind | What belongs |
|---|---|---|
| [`product/`](./product/README.md) | What the product must do | Business rules and their tests, practice behaviour, the content taxonomy, [ideas](./product/ideas.md) |
| [`architecture/`](./architecture/practice-engine.md) | How it is built, and why | The practice engine, question rendering, the content pipeline, environments, observability, [integrations](./architecture/integrations/README.md) |
| [`adr/`](./adr/README.md) | Decisions | Numbered, accepted decisions. They are frozen once accepted, amended only by appended sections, or superseded |
| [`guides/`](./guides/release/review-and-merge.md) | How to do a task | `testing/`, `release/`, `database/`, `operations/`, `dependencies/`, `content/`, `qa/` |
| [`design-system/`](./design-system/README.md) | The UI standard | Standards, the pattern registry, typography, contrast, layout, bookmark surfaces |
| [`policies/`](./policies/supply-chain.md) | Commitments the owner adopted | Supply chain, and in time legal and security |
| [`records/`](./records/README.md) | Open work | Bug and debt records, one index, and [the ledger](./records/closed.md) of closed ones |

## Where a New Document Goes

Apply the test to the document’s primary purpose. Colocated READMEs/contracts stay beside code; agent instructions route to UI standards in `design-system/`. Take the first match:

1. A rule an agent obeys on every edit of some files: `AGENTS.md`, or `.claude/rules/<topic>.md`.
2. A commitment the owner adopted: `policies/`.
3. Open work on a defect or debt: `records/`.
4. A decision between alternatives that must not change silently: `adr/`.
5. What the product must do or never do for a user, including a proposed feature before code: `product/` ([specification workflow](./product/README.md)).
6. The UI standard or the UI pattern catalog: `design-system/`.
7. How a part is built, its boundaries, invariants and environments: `architecture/`.
8. How to do a task: `guides/<subject>/`.
9. A list the code can answer, a snapshot or a receipt: the code, a pull-request description, or nowhere.

**Names** are lowercase kebab-case. Only ADRs and records carry IDs. A living document has no dates or versions in its name or headings.

## Still Moving

DEBT-518 is moving the rest:
- `legal/` and `security/` (to `policies/`, with the owner's consent);
- `_archive/` (to delete once the ledger covers it), and the asset folders under `audits/`, `bugs/` and `debt/` that only archived records link.
