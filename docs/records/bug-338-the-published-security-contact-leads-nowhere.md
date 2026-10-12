# BUG-338: The Published Security Contact Leads Nowhere

**Status:** Blocked — the owner must turn on private vulnerability reporting in the repository's settings; SECURITY.md ships with this record
**Priority:** P2
**Date:** 2026-10-12
**Resolved:** —
**Verification receipts:** —

---

## Summary

`https://addictionboards.com/.well-known/security.txt` tells a security researcher where to report a problem and where the disclosure policy is. Neither destination works:

- **Contact** is GitHub's private vulnerability reporting form for this repository, and that feature is turned off.
- **Policy** is the repository's GitHub security policy page, which says "No security policy detected" because the repository has no `SECURITY.md`.

Someone who follows the site's own instructions has no working private channel.

## Evidence

Checked 2026-10-12 at about 00:50 UTC:

- `gh api repos/The-Obstacle-Is-The-Way/naltrexone-university/private-vulnerability-reporting` answered `{"enabled":false}`.
- The Policy URL served GitHub's page with the text "No security policy detected".
- The Contact URL redirects an anonymous visitor to sign in. A signed-in visitor reaches a form that is turned off.
- `security.txt` has carried both URLs since commit `7e700dd0` (2026-02-04). `tests/security-txt.test.ts` and `tests/e2e/security-contact.spec.ts` check that the file is published and contains the URLs, not that the URLs work. DEBT-480 (closed 2026-09-21) made the file reachable anonymously, and checked no further.

## Impact

A good-faith report has nowhere private to go, so it may be dropped or posted publicly. The repository is public, so a public report would disclose the problem before a fix. No report is known to have been lost.

## Options

1. **Turn on private vulnerability reporting and add `SECURITY.md`.** Keeps the published URLs, with GitHub's private advisory workflow. The setting is the owner's to change.
2. **Point Contact at email.** Change `security.txt` to `mailto:support@addictionboards.com`. This works without the setting, but it mixes security reports into support mail and changes a published file and two tests.
3. **Both channels.** `security.txt` allows several Contact lines: the form first, then email.

## Resolution (decided)

Option 1, with email as a second channel inside the policy:
- `SECURITY.md` names both the reporting form and the support address, and says what to include and what not to do. `tests/security-txt.test.ts` now fails without it.
- The owner turns on private vulnerability reporting (Settings → Security → Private vulnerability reporting), or approves the equivalent API call.
- After that, the monthly `security-txt-renewal` job should also read the setting and open an issue if it is ever off. That needs a token allowed to read repository security settings; decide when the setting is on.

## Verification

- The Policy URL shows this repository's `SECURITY.md`.
- `gh api repos/The-Obstacle-Is-The-Way/naltrexone-university/private-vulnerability-reporting` answers `{"enabled":true}`.
- A signed-in account other than the owner's reaches a working report form.

## Related

DEBT-480 (anonymous reachability of `security.txt`). `docs/security/information-security-program.md`, whose settings checklist of 2026-08-13 did not include this setting.
