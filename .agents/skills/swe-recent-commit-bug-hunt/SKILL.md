---
name: swe-recent-commit-bug-hunt
description: >-
  Inspect a requested range of local Git commits for concrete regressions.
  Use when the user asks what recent changes may have broken or requests a
  commit-scoped bug hunt. Do not require pull requests, CI, or another agent;
  use the local diffs and tests that are available.
metadata:
  short-description: Find likely bugs in recent local commits
---

# Recent commit bug hunt

Use this for an explicit commit or time range in the current repository. If
the range is unclear and materially affects the result, ask for it; otherwise
use a reasonable recent range and state it.

## Workflow

1. Inspect the selected commits and their diffs. Identify changed behavior,
   boundaries, validation, and affected callers.
2. Read only the surrounding code and tests needed to assess each suspicion.
3. Run a narrow existing check only when it helps confirm a finding and fits
   the user's request.
4. Report only concrete or well-supported regression risks. Do not make fixes
   unless the user asks for them.

## Report

Use a short ranked list or table: commit, file/behavior, evidence, impact,
confidence, and the smallest next check or fix. Label unconfirmed suspicions
clearly. If no credible regression is found, say so. Do not produce delegated
work plans, PR commentary, or a generic code-quality backlog.
