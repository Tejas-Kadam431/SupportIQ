# AI evaluation methodology

SupportIQ evaluates evidence sufficiency and observed human outcomes separately. It does not use the model's self-reported confidence as the permission to answer.

## Offline evidence fixtures

Stage E tests cover lexical/vector ranking, tenant and publication filtering, overlap/coverage, insufficient evidence, conflicting evidence, missing customer information and degraded retrieval. Reciprocal Rank Fusion combines ranks, not raw incomparable lexical and cosine scores. Fixed evidence-policy decisions are reproducible; thresholds and conservative conflict detection have limited fixture coverage.

## Human feedback

ACCEPTED means the agent sent the unchanged suggestion. EDITED means the final approved message differed. REJECTED records a reason without sending. Evaluation coverage uses persisted runs; acceptance rates use evaluated runs. Acceptance is a usefulness signal, not factual ground truth. Unevaluated runs and sparse-source samples must remain visible.

## Knowledge Issues and source health

Qualifying knowledge failures are grouped into persistent issues. Missing customer details and infrastructure/provider failures are excluded from knowledge-gap classification. Attribution requires verified immutable version links. Several cited sources do not establish which one caused an error. Source Health exposes denominators and low-sample warnings rather than presenting a causal quality score.

## Reliability Lab

Cases snapshot historical input and baseline output/decision. Experiments snapshot publication scope, candidate overrides, policy/retrieval versions and model configuration. Retrieval-only replay isolates evidence-policy behavior from generation variability. Generation-enabled replay has stricter caps and may differ across provider calls.

Comparisons distinguish IMPROVED, UNCHANGED, REGRESSED, INCONCLUSIVE and ERROR. A failure changing from unsupported to supported can count as improvement; successful historical cases are guardrails that must remain supported under the comparison rules. Full case-level evidence is more informative than one summary percentage.

VERIFIED requires qualifying post-publication evidence for the expected failure cohort and successful guardrails against the current published candidate, with authorized explicit verification. Publication alone is not verification. VERIFIED does not mean every future question is correct, that the model is deterministic, or that a synthetic result generalizes to real users.

## Demo and external validity

The demo labels illustrative history and uses six failure cases plus ten guardrails. Pre-publication 5/6 versus post-publication 6/6 and 10/10 guardrails are a deliberately seeded story, not a field experiment. Normal CI and browser tests use deterministic fixtures, mocked provider operations or the no-key fallback; they make no claim about live-provider accuracy or latency.

Implementation: evidence-policy.ts, kb.hybrid.ts, issue.classification.ts, replay.case.ts, replay.comparison.ts, replay.execution.ts. Evidence: retrieval/evidence unit tests and Stage D–H integration suites.
