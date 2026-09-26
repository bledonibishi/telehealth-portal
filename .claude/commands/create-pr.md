---
description: Create a GitHub pull request from the current branch into dev — build, typecheck, and tests must pass first.
---

Use the Agent tool with `subagent_type: "create-pr"` to create a pull request from the current branch into `dev`.

That agent (`.claude/agents/create-pr.md`) enforces these prerequisites before it will open the PR — it will stop and report a failure rather than create the PR if any of them fail:
- **Build** passes for every touched workspace package
- **Typecheck** passes for touched frontend packages
- **Tests** pass for every touched package that has them

Report back the PR URL it returns, or the failure it reports.
