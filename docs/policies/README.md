# Policies

Commitments the owner adopted. A policy that records adoption or effective dates keeps them, and text the owner adopted keeps its links until the owner revises it ([ADR-023](../adr/adr-023-documentation-organisation.md) §3).

- [Privacy Policy](./legal/privacy-policy.md) and [Terms of Service](./legal/terms-of-service.md), published at `/privacy` and `/terms`. In `legal/consent-rulings/`, `f03-consent-ruling-data.json` holds the current checkout and add-card consent texts, which `lib/pricing-data.test.ts` checks the live copy against; `f15-consent-ruling-data.json` holds the superseded proposal they replaced.
- [Information security program](./security/information-security-program.md), [incident response and breach notification](./security/incident-response-and-breach-notification.md), and the [support cancellation procedure](./security/support-cancellation-procedure.md).
- [Supply chain](./supply-chain.md): dependency, advisory and licence policy.
