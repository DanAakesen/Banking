---
name: swe-security-audit
description: >-
  Audit a requested repository or package for dependency vulnerabilities,
  materially risky outdated packages, and concrete license issues. Use when
  the user asks for a dependency or package security audit. Reuse available
  ecosystem tools and report evidence; do not turn this into an unrequested
  broad code review or threat model.
metadata:
  short-description: Audit dependency security with evidence
---

# Security audit

Use this for an explicit, scoped audit. Work directly in the repository; do
not delegate or create a recurring process.

## Workflow

1. Identify the requested apps/packages and their manifests and lockfiles.
2. Check which package managers and audit tools the project already uses.
3. Run relevant local vulnerability and license checks when available. Prefer
   native tools and existing scripts; do not install tools or update packages
   without the user's request.
4. Inspect findings against the package name, version, affected range, and
   advisory evidence. Treat scanner output as a lead to verify, not as a
   complete explanation.
5. State which packages were checked, which checks ran, and which could not
   run. Never infer a clean result for an unscanned package.

Report only actionable findings. Separate confirmed vulnerabilities from
outdated-package hygiene and license uncertainty. Avoid trivial patch lag and
unsupported severity claims.

## Report

Use a compact table with severity, package, installed version, evidence,
recommended next action, and confidence. Add a short coverage note listing
checks run and blocked checks. If no material finding is confirmed, say so.
