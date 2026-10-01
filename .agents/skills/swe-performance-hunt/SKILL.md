---
name: swe-performance-hunt
description: >-
  Find a concrete bottleneck in a requested flow using measurements or direct
  repository evidence. Use when the user asks why something is slow or asks
  for performance profiling. Avoid speculative micro-optimization, live
  incident response, and broad architecture rewrites.
metadata:
  short-description: Find measured performance bottlenecks
---

# Performance hunt

Use this for one requested flow, such as a page load, endpoint, query, or job.
Work directly; this workflow does not use delegated agents or recurring audits.

## Workflow

1. Establish the target flow and metric: latency, throughput, memory, startup,
   or bundle size. Ask only if the missing scope changes the investigation.
2. Inspect available measurements first: profiles, traces, benchmarks, query
   plans, load results, or bundle reports.
3. Trace the likely critical path and connect each finding to evidence.
4. Separate measured bottlenecks from code-based hypotheses. If evidence is
   insufficient, propose the smallest measurement that would resolve it.
5. Recommend or make only the smallest change that addresses the evidence and
   fits the user's request. Do not optimize unrelated code.

## Report

List each finding with the affected flow, target metric, evidence, likely
cause, confidence, and smallest next action. Name the measurement or command
needed to confirm an inferred bottleneck. If no useful evidence exists, say so
instead of inventing a performance problem.
