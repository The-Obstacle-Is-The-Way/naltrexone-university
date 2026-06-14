# BUG-248: Public Main Branch Has No GitHub Merge Gate

**Status:** Open
**Priority:** P1 (public repository; direct pushes and merges can bypass CI)
**Date:** 2026-06-13
**Resolution State:** Blocked on human-owned GitHub repository settings. Keep open until `main` is protected by branch protection or an active ruleset and the verification commands below pass.
**Family:** CI/CD / repository governance
**Related:** [AUDIT-012](../_archive/audits/audit-012-repo-org-devx.md)

---

## Description

The public GitHub repository has no GitHub-enforced protection on `main`: no branch protection rule and no repository ruleset. The CI workflow exists, but GitHub does not require it before merge or direct push.

This is a platform-settings defect, not a code defect. Local repository edits cannot prove or enforce the fix.

## Evidence

Measured on 2026-06-13:

```bash
$ gh repo view --json nameWithOwner,visibility,isPrivate,defaultBranchRef
{"defaultBranchRef":{"name":"main"},"isPrivate":false,"nameWithOwner":"The-Obstacle-Is-The-Way/naltrexone-university","visibility":"PUBLIC"}

$ gh api repos/:owner/:repo/branches/main --jq '{name, protected}'
{"name":"main","protected":false}

$ gh api repos/:owner/:repo/branches/main/protection --include
HTTP/2.0 404 Not Found
{"message":"Branch not protected","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"404"}

$ gh api repos/:owner/:repo/rulesets --include
HTTP/2.0 200 OK
[]
```

## Required Human Action

Create a repository ruleset for `main` that:

- requires pull requests;
- requires the CI checks covering typecheck, lint, unit, integration, browser, build, and E2E policy;
- requires branches to be up to date unless merge queue is enabled;
- blocks force pushes and deletions;
- optionally requires CODEOWNERS review if owner review is desired.

After changing settings, verify:

```bash
gh api repos/:owner/:repo/branches/main --jq '{name, protected}'
gh api repos/:owner/:repo/rulesets --include
```

Expected result: `main` reports `protected: true` or the repository rulesets response contains an active ruleset that targets `main` and requires the needed checks.

## Engineering Close Criteria

- [ ] Human applies the GitHub settings.
- [ ] Verification commands above show `main` is protected by branch protection or an active repository ruleset.
- [ ] AUDIT-012 CI-1 is updated from `BLOCKED-NEEDS-HUMAN` to `FIXED + VERIFIED`.
