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

## 3. Pre-flight checks (REQUIRED — block the PR if any check fails)

Run all three checks in parallel against the diff (`git diff origin/dev...HEAD`). Report every finding grouped by check. **Do not create the PR until all issues are resolved or the user explicitly overrides.**

### 3a. Secret scan
Search the diff for patterns that look like real credentials:
```
git diff origin/dev...HEAD | grep -E \
  '(api[_-]?key|secret|password|token|private[_-]?key|sk-|pk-|rsa|BEGIN (PRIVATE|RSA|EC)|STRIPE_|RESEND_|JWT_SECRET|DATABASE_URL)\s*=\s*["\x27]?[A-Za-z0-9+/\-_]{16,}' \
  -i
```
Also check that any new environment variable names used in the code (e.g. `process.env.SOME_VAR`) exist in `.env.example`. If a var is used but missing from `.env.example`, flag it.

Flag: any real-looking value hardcoded (not a placeholder like `your-key-here`), and any env var without a corresponding entry in `.env.example`.

### 3b. Temporary / debug code scan
Search the diff for lines added (`+`) that contain:
- `console.log`, `console.warn`, `console.error`, `console.debug` (unless inside a logger class or service)
- `TODO`, `FIXME`, `HACK`, `XXX`, `TEMP`, `DELETEME`
- `debugger`
- Commented-out blocks of code (3+ consecutive commented lines)

```
git diff origin/dev...HEAD | grep '^+' | grep -E \
  '(console\.(log|warn|error|debug)|TODO|FIXME|HACK|XXX|TEMP|DELETEME|debugger)' \
  | grep -v '^+++' | grep -v 'logger\.' | grep -v '// intentional'
```

Flag every match with its file and line. Ask the user whether to remove them before creating the PR.

### 3c. Inline style scan
Search the diff for added lines containing `style={{` or `style="` in JSX/TSX/HTML files:
```
git diff origin/dev...HEAD -- '*.tsx' '*.ts' '*.jsx' '*.js' '*.html' \
  | grep '^+' | grep -E 'style=\{|style="' | grep -v '^+++'
```

For each match, suggest the equivalent Tailwind class(es) if the conversion is straightforward. Flag the file and line number. Ask the user to replace with Tailwind before the PR is created (or note it as a known gap in the PR description if the conversion is non-trivial).

### Check summary
After running all three, print a summary table:

| Check | Status | Issues found |
|-------|--------|--------------|
| Secrets | ✅ / ❌ | n |
| Temp code | ✅ / ❌ | n |
| Inline styles | ✅ / ⚠️ | n |

- ❌ = must fix before PR
- ⚠️ = should fix, user can override
- ✅ = clean

If any check is ❌, stop and ask the user to fix the issues. Resume from step 4 once they confirm everything is resolved.

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

Print the PR URL so the user can open it directly.

## Rules
- Always target `dev`, never `main`.
- Do not push the branch — assume it is already pushed. If it is not, warn the user and stop.
- Do not amend commits or change any files.
- Keep the summary factual — describe what the code does, not the process of writing it.
- Never skip the pre-flight checks — they protect the codebase and the team.
