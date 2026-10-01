---
name: swe-test-gap-hunt
description: >-
  Find and close high-value test gaps in a requested code area. Use when the
  user asks to find weak tests, add missing cases, or improve coverage. Reuse
  the project's existing test tools; do not chase coverage percentages or
  redesign the test stack.
metadata:
  short-description: Find and fix high-value test gaps
---

# Test gap hunt

Use this only for an explicit test-improvement request. Keep the work local to
the requested project and area; this is a solo workflow with no delegated
agents, recurring runs, or backlog ceremony.

## Workflow

1. Inspect the target behavior, nearby tests, test commands, and local test
   conventions.
2. Identify gaps that could miss a real regression: important branches,
   boundaries, errors, authorization, or recently changed behavior.
3. Rank gaps by user impact and likelihood. Ignore raw coverage targets.
4. When asked to implement, add the smallest useful tests using the existing
   framework. Avoid duplicate assertions, broad refactors, and new test tools.
5. Run the narrow relevant test command when verification is requested or is
   part of the task. Report unrelated baseline failures separately.

Do not change production code just to make a test easier unless a small seam is
clearly necessary. If the existing tests already cover the important behavior,
say that and stop.

## Report

- Highest-value gap and why it matters
- Tests added or changed, if any
- Exact validation command and result, or why it could not run
- Remaining material gap, if one exists
