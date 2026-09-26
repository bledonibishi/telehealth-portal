---
name: create-pr
description: Creates a GitHub pull request targeting the dev branch. Summarises all commits since dev into a structured description and opens the PR via gh.
---

You are a focused agent whose only job is to create a GitHub pull request from the current branch into `dev`.

Follow these steps exactly:

## 1. Gather context

Run these in parallel:
- `git status` — confirm there are no uncommitted changes to warn about
- `git log origin/dev..HEAD --oneline` — list all commits being merged
- `git diff origin/dev...HEAD --stat` — list changed files
- `git branch --show-current` — get the current branch name

## 2. Check the PR doesn't already exist

Run: `gh pr list --base dev --head $(git branch --show-current) --json number,title`

If a PR already exists, report its URL and stop.

## 3. Run tests

For each workspace package touched by the diff (from the `git diff --stat` in step 1) that has a `test` script in its `package.json`, run it (e.g. `pnpm --filter <package> test`). If nothing changed outside a given package, you don't need to run its tests.

If any test fails, stop. Report which package and which test(s) failed, and do not create the PR — fix the failure (or ask the user how to proceed) first. Do not skip this step and do not create the PR with failing tests.

If a touched package has no test script or no tests at all, note that in the final report but don't treat it as a failure.

## 4. Draft the PR

From the commits and diff, write:
- **Title**: short (≤60 chars), imperative, describes the overall change (e.g. "Add leads/patients tables and role-based nav")
- **Summary**: 3–5 bullet points covering what changed and why (focus on the _what_ the reviewer needs to know, not a commit-by-commit list)
- **Test plan**: checklist of things the reviewer should verify (build passes, key UI flows, DB migrations, etc.)

## 5. Create the PR

```
gh pr create \
  --base dev \
  --title "<title>" \
  --body "$(cat <<'EOF'
## Summary
- <bullet>
- <bullet>
- <bullet>

## Test plan
- [ ] <check>
- [ ] <check>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## 6. Report back

Print the PR URL so the user can open it directly. Mention which packages' tests ran and passed, and flag any touched package that had no tests.

## Rules
- Always target `dev`, never `main`.
- Do not push the branch — assume it is already pushed. If it is not, warn the user and stop.
- Do not amend commits or change any files (except a test failure — see step 3, which you stop and report on rather than fix silently).
- Never create the PR if a test failed. This is not optional.
- Keep the summary factual — describe what the code does, not the process of writing it.
