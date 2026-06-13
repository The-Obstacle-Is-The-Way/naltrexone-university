# BUG-249: Dependency Security Automation Is Disabled

**Status:** Open
**Priority:** P1 (public repository; known vulnerable dependency signal exists but GitHub security delivery is disabled)
**Date:** 2026-06-13
**Family:** Security / dependency automation / repository governance
**Related:** [AUDIT-012](../_archive/audits/audit-012-repo-org-devx.md)

---

## Description

GitHub vulnerability alerts and Dependabot security updates are disabled for the repository. Local repository configuration can remove Dependabot security PR throttles, but GitHub settings still require human action.

This bug tracks the platform-settings side of AUDIT-012 SEC-1. Local package/audit remediation is handled in the AUDIT-012 resolution branch; this record remains open until the repository settings are changed and re-verified.

## Evidence

Measured on 2026-06-13:

```bash
$ gh api repos/:owner/:repo --jq '.security_and_analysis // {}'
{"dependabot_security_updates":{"status":"disabled"},"secret_scanning":{"status":"enabled"},"secret_scanning_non_provider_patterns":{"status":"disabled"},"secret_scanning_push_protection":{"status":"enabled"},"secret_scanning_validity_checks":{"status":"disabled"}}

$ gh api repos/:owner/:repo/vulnerability-alerts --include
HTTP/2.0 404 Not Found
{"message":"Vulnerability alerts are disabled.","documentation_url":"https://docs.github.com/rest/repos/repos#check-if-vulnerability-alerts-are-enabled-for-a-repository","status":"404"}

$ gh api repos/:owner/:repo/automated-security-fixes --include
HTTP/2.0 200 OK
{"enabled":false,"paused":false}
```

## Required Human Action

Enable vulnerability alerts and automated security fixes:

```bash
gh api --method PUT repos/:owner/:repo/vulnerability-alerts
gh api --method PUT repos/:owner/:repo/automated-security-fixes
```

Then verify:

```bash
gh api repos/:owner/:repo/vulnerability-alerts --include
gh api repos/:owner/:repo/automated-security-fixes --include
gh api repos/:owner/:repo --jq '.security_and_analysis // {}'
```

Expected result: vulnerability alerts return `204 No Content` or a non-error success response, automated security fixes return `{"enabled":true,...}`, and `dependabot_security_updates.status` reports `enabled`.

## Engineering Close Criteria

- [ ] Human enables vulnerability alerts.
- [ ] Human enables automated security fixes / Dependabot security updates.
- [ ] Verification commands above show the settings are enabled.
- [ ] AUDIT-012 SEC-1 GitHub-settings side is updated from `BLOCKED-NEEDS-HUMAN` to `FIXED + VERIFIED`.
