# AgentForge V2 Evidence Baseline

Updated: 2026-08-02 (Asia/Shanghai)

This is the authoritative local evidence snapshot for the current V2 worktree.
It does not replace historical records. When an older document reports a different
test count, that record describes its own execution date and environment.

## Verified Locally

| Scope | Status | Current evidence | Boundary |
| --- | --- | --- | --- |
| TypeScript | Verified | `npm run typecheck` completed successfully | Static type checking only. |
| ESLint | Verified | `npm run lint` completed successfully | Does not exercise runtime integrations. |
| Unit tests | Verified | `npm run test:unit`: 193 passed, 0 failed, 0 skipped, including observability and scenario-graph tests | Does not replace dedicated PostgreSQL or real-provider testing. |
| `src/lib` coverage gate | Implemented and verified locally | `npm run test:coverage` uses Node's native test coverage and enforces lines, branches, and functions at `>=80%`; latest local baseline: 92.30%, 87.62%, and 89.49% respectively | This deliberately excludes frontend, API routes, scripts, E2E, Provider, and production-runtime coverage. CI configuration is implemented but has no remote success evidence yet. |
| Optional OTLP export | Implemented and verified locally | Node.js-only OTLP/HTTP SDK registration is explicitly endpoint-gated; standard unit tests cover default-off, HTTP(S)-only endpoints, and safe service metadata; typecheck, lint, and production build passed | No Collector, Jaeger, Tempo, Provider telemetry, or cross-process propagation has been observed. |
| Incremental approval | Implemented and verified locally | Approval resumes accept a task-only patch; the server revalidates the amended plan, stores the normalized patch plus original/amended SHA-256 fingerprints, and reports use the deterministic effective plan. Focused workflow/report tests and the standard unit suite passed. | SQLite migration was applied locally. PostgreSQL schema is valid, but this new migration was not applied to a dedicated PostgreSQL database in this run. No real Provider workflow was invoked. |
| Confidence-driven intervention | Implemented and verified locally | Evaluator results now include a deterministic `policy_decision_support` signal derived from Tier 1 evidence support, candidate score margin, supported Finding severity, and workflow failures. High-impact cross-candidate conflicts remain mandatory human gates; evaluator failures are always low-confidence. Focused review tests passed. | This is an explainable policy signal, not calibrated model confidence or semantic accuracy. Threshold effectiveness, intervention reduction, and real-user approval quality require measured Provider and UX data. |
| Reviewer structural diversity disclosure | Implemented and verified locally | Candidate prompts now state the independent delivery and quality perspectives. `ReviewWorkflowResult.candidateDiversity` records orientation coverage plus normalized overlap of decisions, steps, risks, assumptions, and evidence references. Focused tests cover fewer than two candidates, a copied candidate with a renamed orientation, and the current two-role baseline. | This is a deterministic structural comparison, not semantic diversity, independent model-reasoning evidence, or a quality improvement claim. The current deterministic baseline is honestly labelled `limited` because both candidates derive from the same execution plan and share substantial structure. |
| Code Review scenario graph and UI | Implemented and verified locally | The standalone LangGraph Code Review graph is available through authenticated `POST /api/scenarios/code-review` and `/scenarios`. It accepts a bounded user-submitted code snapshot, records the declared review goal and direct-evidence boundary, emits text-pattern Findings with file/line provenance, then produces remediation candidates. Focused deterministic tests, typecheck, lint, production build, and an HTTP smoke request that returned three expected findings passed. | It analyzes only submitted snapshots. It is not a general parser, SAST engine, real repository integration, model-quality claim, persistence feature, or automatic repair. Real-code usefulness remains unmeasured. |
| Bug Diagnosis scenario graph and UI | Implemented and verified locally | The standalone LangGraph Bug Diagnosis graph is available through authenticated `POST /api/scenarios/bug-diagnosis` and `/scenarios`. It analyzes bounded user-submitted logs/context into symptom, root-cause candidates, verification steps, and a repair boundary. Three deterministic tests, typecheck, lint, production build, and an HTTP smoke request returning `missing_environment` with one verification step passed. | Direct log matches remain candidates, never verified causes. It does not read repository files, execute code, call a Provider, persist a diagnosis, or establish repair effectiveness. |
| RRF parameter-selection policy | Implemented and verified locally | Candidate grid decisions are deterministically ordered by Recall@K, NDCG@K, MRR, irrelevant-result rate, then smaller RRF k; unit tests cover the ordering and invalid candidate sets | A real selected parameter still requires a ready, human-labelled dataset, frozen corpus, and embedding run. |
| SQLite Prisma schema | Verified | `npm run db:validate` completed successfully | Schema validation only. |
| PostgreSQL Prisma schema | Verified | `npm run db:validate:postgres` completed successfully | Schema validation only; migrations were not applied locally in this run. |
| RAG Golden Set v0 | Verified | `npm run quality:rag:golden` passed | A 12-fixture regression gate, not a production corpus quality claim. |
| Tier 1 evidence-binding error corpus | Implemented and verified locally | `npx tsx --test src/lib/review/evidence-tier1.test.ts` passed 4/4 deterministic tests for 12 frozen structural cases covering candidate-owned, shared-source, missing, duplicate, unknown, cross-candidate, mixed-reference, failure-precedence, and human-gate boundaries | This validates reference provenance only. It does not establish semantic entailment, model error rates, or production intervention quality. |
| Tier 2 evidence assessment boundary | Implemented and verified locally | Optional injected verifier contract exposes `entailed`, `not_entailed`, and `unknown`; the main review workflow discloses the assessment without changing existing approval or human-gate decisions. Focused deterministic tests cover configured, unconfigured, rejected, unknown, invalid, and verifier-failure paths. | This is an auditable integration boundary, not completed semantic entailment. A local NLI model, thresholds, reviewed error corpus, precision/recall, latency, and resource measurements remain pending. Do not describe it as production-ready NLI. |
| Human RAG Golden Set private-output boundary | Verified | Template creation succeeds under `local-only/`; a similarly named non-private directory is rejected | This safeguards uncommitted annotation assets; no human-labelled corpus or retrieval metric has been produced. |
| Human RAG Golden Set annotation-package preparation | Implemented and verified locally | `quality:rag:human-golden:freeze-docs` freezes selected project Markdown docs into `corpus.json` and `sources.json`; the default run now freezes 8 current docs into 193 chunks under `local-only/`, including 1 `api-reference` source. `quality:rag:human-golden:prepare` then generated traceable `sources.tsv`, `chunks.tsv`, an empty `cases.tsv`, and annotation instructions. `quality:rag:human-golden:status` reads the TSV package without fabricating retrieval metrics; latest local status returned `not_ready` for 8 sources, 193 chunks, 0 case rows, 0 valid cases, and a 100-case minimum. Focused package/import/set/status tests passed | The tooling does not generate queries, relevance labels, annotator/reviewer identities, Recall@5, MRR, or NDCG. Since `cases.tsv` currently has 0 human rows, no retrieval-quality, cost, latency, or production RAG claim may be made; a real double-reviewed Golden Set remains pending. |
| P0-1 frozen plan private-output boundary | Verified | `quality:ablation:plan` writes under `local-only/` and rejects a public output path | This protects cost-authorization inputs and audit artifacts; it is not a real-provider experiment. |
| P0-1 ablation preflight and report authorization binding | Verified | Four-arm protocol, frozen 24-case x 5-trial plan (480 runs), no provider call; offline authorization preflight validates a completed approval record without credentials, and report CLI accepts a valid ledger while rejecting a tampered authorization file | Real-model results and causal conclusions remain unmeasured. |
| P0-1 authorization template | Implemented and verified | Template CLI writes only under `local-only/`, binds the frozen plan and protocol reserve, leaves `status: pending`, and the pending template is rejected by execution preflight | This is preparation, not external-cost approval or a model run. |
| P0-2 PostgreSQL workflow acceptance | Verified (WSL dedicated temporary database) | Most recent `npm run test:integration:postgres:wsl` rerun applied three migrations, passed cross-saver/graph recovery and cross-process lease/fencing tests, then removed random database `agentforge_p0_wsl_5ab6c36a9436f370` and its role | Docker Compose and GitHub Actions are separate, still-unverified environments; this is not a production load, queue, exactly-once, or multi-region claim. |

## P0 Decision Record

### P0-1: Four-arm ablation

**Latest local protocol verification (2026-08-01):** the documented frozen
execution-order seed is now the default in both the plan API and CLI
(`20260801`). Regenerating the 24-case, 5-trial plan without an explicit seed
produced 480 runs and the exact same plan as
`local-only/ablation/run-plan.json`. The immutable file-byte SHA-256 is
`a2194dd8e36f845f56c867d5e1733f579066dd366966e621639c2fc919c6a45e`;
the authorization and ledger use the parsed canonical-JSON plan fingerprint
`fb6660e8e7e9cca2e69c1fba43082b92e85d6416e1a396449f07a133c7503535`.
These values intentionally differ because line endings and formatting belong
to the former but not the latter.
The regression test also asserts that the documented seed remains the default.
The full local unit suite passed after this alignment: 144 passed, 0 failed,
0 skipped. This is protocol reproducibility evidence only, not a real-provider
quality measurement.

**Implemented:** frozen plan, paired execution order, cost ceilings, append-safe
ledger, raw-output SHA-256 audit, excluded-run accounting, paired bootstrap
reporting, and a machine-validated execution authorization file. The ledger
binds the private authorization-file path and SHA-256, and report generation
re-validates that exact approval record. Real execution
now requires `--execute`, `--confirm-external-costs`, and
`--authorization-file`. The authorization binds its approver/time, frozen plan
hash, manifest hash, provider/model/temperature, prompt and RAG versions, cost
ceilings, local estimated-input and output-token limits, LongCat pricing
snapshot, ledger path, and private raw-output path. The estimated-input limit
only caps local prompt-growth estimation; it is not Provider-exact token
enforcement or a Provider-billed hard cost limit.

**Verified:** protocol, ledger, authorization unit tests, and the offline report
CLI test in `src/lib/review/ablation-report.test.ts`; preflight does not read
model credentials or call a provider. The CLI tests prove a valid authorization
file can produce a report and that changing it is rejected by
`ABLATION_AUTHORIZATION_HASH_MISMATCH`. A budget-infeasible preflight now stops
with `ABLATION_RUN_TOTAL_BUDGET_TOO_LOW` before Provider configuration is read;
an `--execute` invocation without `--authorization-file` stops with
`ABLATION_RUN_FLAG_MISSING` at the same boundary. The default
`quality:ablation:run` command does not load `.env`; only the explicit
`quality:ablation:run:env` command may load the authorized execution
environment. Local unit suite result after this change: 143 passed, 0 failed.
This historical intermediate count verifies only the local preflight
budget gate; it is not a real-provider ablation measurement.

**Verified (authorization-only):**
`npm run quality:ablation:authorization-preflight` reads a frozen plan, its
case manifest, and an approved private authorization record without loading
`.env`, reading Provider credentials, writing a ledger, or calling a model. It
checks the manifest and plan bindings, private output paths, and whether the
declared total ceiling covers every frozen run at the declared per-run ceiling.
This is approval-record verification only; it does not authorize spending by
itself and does not measure Agent quality.

**Revised (2026-08-01, protocol reserve):** execution-path audit found that a
clarification case can use two structured-analysis attempts before and two more
after the single assumption pass. The former C/D maximum-call values missed the
second pair, so they were raised from `19/21` to `21/23` before any Provider
call. For the frozen 480-run plan, LongCat-2.0's published standard rate
snapshot ($0.75 / 1M uncached input and $2.95 / 1M output), a 16,000-token local
estimated-input ceiling, and a 12,000-token output ceiling now yield a maximum
per-run protocol reserve of `$1.0902` and a total protocol reserve of
`$329.904`. This is neither actual spend nor a Provider-billed hard ceiling; no
Provider was called. Any prior pending authorization must be regenerated with
the revised reserve before it can be approved.

**Verified (2026-08-01, regenerated pending template):** the local-only
authorization template was regenerated from the current frozen plan and now
contains the same `$1.0902` per-run and `$329.904` total protocol reserves. A
24-case, 5-trial template regression test passed alongside the authorization
and budget tests. The regenerated record remains `pending`; it is not an
external-cost approval and no Provider credential, model, or bill was used.

**Pending measurement:** real runs require the completed authorization record in
`docs/2026-08-01 - p0-1-ablation-execution-authorization - P0-1消融实验执行授权.md`, including provider, exact model,
temperature, prompt versions, RAG snapshot, private paths, and explicit budget
approval. No quality or root-cause claim may be made before then.

### P0-2: PostgreSQL checkpointer and distributed lease

**Implemented:** PostgreSQL saver selection, dedicated migrations, cross-saver
crash-recovery integration test, lease claim/renew/takeover behavior, fencing-token
writes, CI PostgreSQL service job, and isolated local Compose acceptance entry.

**Verified:** unit coverage for the lease protocol, static/CI configuration
review, a lease-renewal fencing regression test, and the complete WSL dedicated
temporary-database acceptance sequence. The latter applied PostgreSQL migrations,
passed the fresh Saver/Graph recovery test and the cross-process lease claim,
renewal, takeover, race, and fencing test, then cleaned up its random role,
database, and Linux staging directory. The regression test verifies that a
renewal rejection cannot be returned as a successful workflow result.

**Pending independent environments:** Docker and a successful remote
`postgres-workflow-integration` CI job remain useful additional evidence. Run:

```powershell
npm run test:integration:postgres:local
```

The Docker command must start the isolated `postgres-test` service, apply
PostgreSQL migrations, pass both integration suites, and clean up only its own
Compose project. Neither a skipped integration test nor a normal development
`DATABASE_URL` is acceptable evidence.

**Current host boundary (2026-08-01):** Docker Desktop installation package was
downloaded and its SHA-256 was verified, but it has not been installed or
started. Therefore `npm run test:integration:postgres:local` was intentionally
stopped by `POSTGRES_WORKFLOW_INTEGRATION_ENVIRONMENT_MISSING` before any
container, migration, test data, or cleanup action because Docker CLI is not
available. GitHub CLI is also unavailable, so this host cannot inspect a
remote workflow run through the CLI. A read-only GitHub Actions API query found
only the historical successful `quality` job for run `29699595263` at commit
`02017c04fc3e3b5a780d65b0df3e218e326c4980`; it did not contain a
`postgres-workflow-integration` job and predates the local V2 worktree. These
are environment facts, not passing Docker/CI evidence.

## Latest Local Regression Run

The current worktree was rechecked without invoking a Provider:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:unit`: 158 passed, 0 failed, 0 skipped.
- `npm run quality:rag:golden`: passed on the 12-fixture regression gate.
- `npm run db:validate` and `npm run db:validate:postgres`: passed.
- `npm run quality:ablation:plan -- --trials 5 --execution-order-seed 20260801 --output local-only/ablation/run-plan.json`: regenerated the same frozen 480-run plan with case manifest fingerprint `b90c3da00519ed3d90ac7845306cfc99be82eda6956a6f2d86834b0e7c1c161d` and canonical plan fingerprint `fb6660e8e7e9cca2e69c1fba43082b92e85d6416e1a396449f07a133c7503535`.

This is engineering and protocol evidence only. It neither executes P0-1 nor
changes the requirement for an approved external-cost authorization file.

## Incremental Approval Verification (2026-08-01)

**Implemented:** while a workflow is paused for human approval, the authenticated
user can amend controlled fields of existing execution-plan tasks only: title,
description, role, dependencies, tools, and planned token estimate. The UI sends
only changed tasks. It cannot add or remove tasks, or modify report sections.

**Implemented:** the original `PlanningArtifact.executionPlan` remains immutable.
`ReviewWorkflow` stores the normalized task patch and SHA-256 fingerprints for
the original and amended plan. The server applies the patch to the original plan
and reruns the existing Planner semantic validation before it records an approval.
Report generation repeats that derivation and rejects a fingerprint mismatch.
Reports cite approved task changes as `human_task_edit` provenance.

**Verified locally:** `npm run db:migrate:sqlite` applied migration
`20260801010000_add_incremental_approval_patch`; focused planner, workflow, and
report tests passed. The current standard suite passed `164/164`, followed by
successful `npm run typecheck`, `npm run lint`, `npm run build`, and
`git diff --check` (line-ending warnings only).

**Pending external verification:** this is local deterministic/baseline workflow
evidence. It does not establish real Provider behavior, PostgreSQL migration
application in a dedicated environment, Docker/CI acceptance, or production UX
metrics.

## Confidence-Driven Intervention Verification (2026-08-01)

**Implemented:** `EvaluationResult` can store a `policy_decision_support`
assessment. It combines only present structural facts: supported Finding ratio,
normalized candidate score margin, the highest supported Finding severity, and
recorded workflow failures. The assessment exposes its calculation inputs and
reasons to the paused approval UI without exposing the full review artifact.

**Implemented:** a supported `blocking` or `high` cross-candidate conflict
between delivery and quality candidates is still a hard human gate regardless
of the calculated score. A low policy score can recommend human intervention
only when the Evaluator would otherwise auto-approve. Any failed workflow stage
forces the score to zero and records the failed stage.

**Verified locally:** focused review/evaluation tests cover the mandatory hard
gate, unsupported Finding boundary, failure-state low confidence, and a low
signal that turns an otherwise automatic approval into `needs_human`. This is
deterministic contract evidence only.

**Pending measurement:** the score weights and `<0.4`/`>0.8` roadmap bands have
not been calibrated on real model outcomes or human decisions. The product must
not claim model confidence, intervention-rate reduction, or decision accuracy
until a reviewed dataset and real workflow telemetry exist.

## OTLP Export Verification (2026-08-01)

**Implemented:** `src/instrumentation.ts` registers the Node.js OpenTelemetry
SDK only when `AGENTFORGE_OTLP_TRACES_ENDPOINT` is explicitly configured. The
configuration accepts only HTTP(S) endpoints, uses `agentforge` as the default
service name, optionally records a release version, and uses a global singleton
to avoid duplicate provider registration during Next development reloads. No
requirement text, prompts, model output, raw errors, or secrets are added as
exporter resource attributes.

**Verified locally:** after adding `src/lib/observability/*.test.ts` to the
standard unit-test command, `npm run test:unit` passed **161/161**. `npm run
typecheck`, `npm run lint`, `git diff --check`, and `npm run build` also passed;
the build generated 27 static pages. These checks prove the optional
configuration boundary and build compatibility only.

**Pending measurement:** no OTLP Collector, Jaeger, Tempo, or other receiver
was configured for this run. No real Provider request was made and no external
trace was observed. Collector connectivity, authentication, sampling,
cross-process propagation, and real latency/cost telemetry remain pending.

## Latest P0 Reverification (2026-08-01)

This additional verification was executed against the current dirty worktree.
It did not modify Agent topology, Reviewer prompts, Evaluator rules, or RRF
parameters.

- **Verified (P0-1 no-cost boundary):** `npm run quality:ablation:run -- --plan local-only/ablation/run-plan.verify.json --manifest "docs/quality - 质量评测/lightweight-case-manifest.json" --ledger local-only/ablation/result-ledger.verify.json --raw-output-root local-only/ablation/raw-verify --max-cost-usd-per-run 0.01 --max-total-cost-usd 5` returned `preflight_only` for all 480 frozen runs. It declared a maximum external cost of `$4.80`, required `--execute`, `--confirm-external-costs`, and `--authorization-file`, and did not read model environment variables or call a Provider. This does not create a result ledger and does not measure Agent quality.
- **Verified (P0-2 WSL dedicated temporary database):** `npm run test:integration:postgres:wsl` created random role/database `agentforge_p0_wsl_5ab6c36a9436f370`, applied the three PostgreSQL migrations, passed fresh Saver/Graph checkpoint recovery and cross-process lease renewal/takeover/fencing integration tests, printed `POSTGRES_WSL_WORKFLOW_INTEGRATION_PASSED`, then executed `DROP DATABASE` and `DROP ROLE`. The observed WSL systemd user-session warning and third-party `npm audit` advisory output did not cause either integration test to fail; they are environment/dependency follow-up items rather than PostgreSQL acceptance evidence.

The local quality gates were also rerun successfully in this verification:
`npm run typecheck`, `npm run lint`, `npm run test:unit` (158 passed, 0 failed,
0 skipped), `npm run quality:rag:golden`, `npm run db:validate`, and
`npm run db:validate:postgres`. The RAG result remains a 12-fixture regression
gate only.

- **Verified (production build):** `npm run build` completed successfully with
  Next.js 16.2.10. The optimized build compiled, passed its TypeScript phase,
  collected page data, generated 27 static pages, and finalized the application
  routes. This is a packaging/compile check only; it is not a Provider run or a
PostgreSQL production-load test.

- **Verified (isolated E2E cleanup regression):** `scripts/run-isolated-e2e.mjs`
  now uses an explicit bounded retry loop when Windows delays release of a
  SQLite handle after Playwright/Next exits. `npm run test:e2e:core` passed all
  24 cases and removed its newly-created random SQLite files; `npm run
  test:e2e:session` passed its session-isolation case and also completed without
  a cleanup warning. This only verifies test-artifact cleanup. It does not add
  PostgreSQL, Provider, or production-runtime evidence. Earlier ignored E2E
  database files remain local historical artifacts and were deliberately not
  bulk-deleted.

- **Verified (E2E build-artifact isolation):** a full `npm run quality:all`
  initially exposed a reproducible ordering defect: the Playwright `next dev`
  process wrote truncated declarations under the shared `.next/dev/types`, then
  the later TypeScript gate attempted to parse them. E2E now uses the isolated
  `.next-e2e` directory only when `AGENTFORGE_E2E_ISOLATED=1`, and its wrapper
  clears that generated directory before and after each run. The complete gate
  was rerun successfully after the change: fixed RAG/repository fixtures,
  synthetic blind-evaluation toolchain, 158 unit tests, 24 core E2E tests, one
  session-isolation E2E test, TypeScript, ESLint, and the 27-page production
  build all passed in that exact order. This validates test/build artifact
  isolation, not real-model or production-runtime quality.

- **Verified (current full local gate):** after assigning the session-isolation
  E2E its explicit 120-second test budget, `npm run quality:all` passed again
  on the current dirty worktree. The gate completed the fixed RAG and blind
  protocol checks, 158 unit tests, 24 core E2E tests, one session-isolation E2E
  test, TypeScript, ESLint, and the 27-page production build. The session case
  itself completed in about 26 seconds; the former 30-second global Playwright
  timeout could expire during its three account switches and full artifact
  chain. This preserves all isolation assertions and changes no production
  behavior. It remains local regression evidence only, not a Provider, Docker,
  CI PostgreSQL, or production-quality result.

## Next Execution Order

1. Obtain and record P0-1 external-cost authorization, then run the frozen study.
2. Obtain a Docker or CI confirmation for P0-2 as environment diversity evidence.
3. Use the P0-1 evidence and completed P0-2 runtime evidence to decide whether Reviewer/Evaluator,
   candidate topology, or prompts should change.
4. Only then advance to real human RAG Golden Set measurement and cost/latency
optimization; do not tune RRF or confidence thresholds from fixture data alone.

## Latest Verification Update (2026-08-02)

The current dirty worktree passed the focused Tier 2 review tests and the broad
local gates without invoking a Provider:

- `npm run test:unit`: 181 passed, 0 failed, 0 skipped.
- `npx tsc --noEmit --incremental false`: passed.
- `npm run lint -- --no-cache`: passed.
- `npm run test:coverage`: passed; `src/lib/**` lines 92.39%, branches 87.48%, functions 89.58%.
- `npm run build`: passed; Next.js generated 30 static pages.
- `node scripts/verify-document-links.mjs`: passed for 46 Markdown documents.

These are local regression and packaging results. They do not add real-provider
quality, RAG Recall@5, semantic entailment accuracy, Docker/remote-CI PostgreSQL,
or production-load evidence.

## Human RAG Golden Set Status Update (2026-08-02)

**Implemented:** `quality:rag:human-golden:status` can inspect a private
annotation package and return readiness issues without treating an empty
`cases.tsv` as a usable evaluation corpus.

**Verified locally:** `npm run quality:rag:human-golden:status -- --input
local-only/rag-human-golden-docs-annotation` reported `status: not_ready`,
8 sources, 193 chunks, 0 case rows, 0 valid cases, a 100-case minimum, and
1 `api-reference` source. This is a status check only; it does not compute
Recall@5, MRR, NDCG, cost, latency, or production RAG quality.

## P0-1 No-Cost Execution Readiness Update (2026-08-02)

**Verified:** a newly frozen 24-case x 5-trial x 4-arm plan has 480 runs, case
manifest fingerprint `b90c3da00519ed3d90ac7845306cfc99be82eda6956a6f2d86834b0e7c1c161d`,
and canonical plan fingerprint `fb6660e8e7e9cca2e69c1fba43082b92e85d6416e1a396449f07a133c7503535`.
`quality:ablation:budget` calculated a maximum per-run protocol reserve of
`$1.0902` and a frozen-topology total reserve of `$329.904`. The default
`quality:ablation:run` preflight accepted those ceilings and returned
`preflight_only`; it did not load `.env`, read Provider credentials, call a
model, or create a result ledger. Actual external cost remains `$0`.

**Implemented and verified:** the preflight now reports
`requiredProtocolReserveUsd` from the actual frozen arm mix, rather than
misleadingly multiplying all runs by the highest-cost arm. Focused authorization,
budget, template, and run tests passed 12/12 after this correction.

**Pending measurement:** a private authorization template exists only as
`pending`. No one may convert it to `approved` without a responsible owner
confirming the exact Provider/model, temperature, prompt versions, RAG snapshot,
private raw-output and ledger locations, retention policy, and external-cost
budget. This still does not establish an Agent-quality result or causal claim.

## Latest V2 Engineering Reverification (2026-08-01)

**Implemented and verified locally in this worktree:**

- Bug Diagnosis is now an explicit four-node standalone LangGraph baseline:
  symptom analysis, root-cause candidates, verification plan, and repair report.
  Its three deterministic tests preserve the critical boundary that direct log
  matches are candidates rather than verified root causes.
- Code Review and Bug Diagnosis scenario tests are included in the standard
  unit-test entry point.
- GitHub Actions now runs a Node-native coverage gate over `src/lib/**` after
  unit tests. Lines, branches, and functions each have an `>=80%` blocking
  threshold. The scope deliberately excludes UI, routes, scripts, E2E, Provider,
  and production-runtime code rather than presenting a misleading whole-repo
  percentage.
- A dedicated Mermaid architecture document describes the product StateGraph,
  RAG fallback/RRF path, Prisma product relationships, extension-scenario
  baselines, and the CI boundary.

**Historical local snapshot (superseded by the 2026-08-02 gate below):**
`npm run quality:all` completed successfully:
the deterministic RAG baseline and Golden Set gate passed; the blind-evaluation
dry-run declared `synthetic: true` and `modelCalled: false`; `171/171` unit
tests, `24/24` core E2E tests, and `1/1` session-isolation E2E test passed;
TypeScript, ESLint, and the 27-page production build passed. Separately,
`npm run test:coverage` passed with `src/lib/**` coverage of lines `92.25%`,
branches `87.70%`, and functions `89.06%`; `npm run db:validate`,
`npm run db:validate:postgres`, and `git diff --check` passed.

**Still pending / external:** this local evidence does not add a real Provider
ablation result, real Provider latency/cost result, human-labelled production
RAG result, Docker acceptance, successful remote GitHub Actions job, configured
GitHub branch-protection rule, or production load result. Those require their
respective external environment and, for model calls, explicit cost approval.

## Reviewer Diversity Disclosure (2026-08-02)

**Implemented:** `src/lib/review/candidate-diversity.ts` computes the bounded
`structural_candidate_diversity` assessment from already-generated structured
candidates. It records the presence of the required orientations and overlap in
decision titles and choices, implementation steps, risks, assumptions, and cited
evidence. The result is returned with the review workflow and does not change
approval, human-gate, or model-call behavior. Candidate prompts now state the
delivery and quality perspectives explicitly; the review prompt permits an empty
Finding list when candidates are materially consistent, so it does not require
manufactured disagreement.

**Verified locally:** focused tests passed for a copied candidate labelled as a
different orientation, fewer than two candidates, and the existing deterministic
delivery/quality workflow. TypeScript compilation passed after the integration.

**Observed, not generalized:** the current deterministic delivery/quality
baseline is classified as `limited`, not `sufficient`. Its candidates share one
execution plan, so their implementation steps and evidence references overlap.
This is the correct disclosed signal for the fixture; it is not evidence that
real Provider candidates lack useful diversity.

**Pending measurement:** semantic diversity, independent reasoning, and any
effect of the prompt change on review quality must be evaluated with the
authorized P0-1 real-provider four-arm study. Do not use this structural score
as an Agent-quality metric or tune thresholds from fixture output.

## Internal Pilot Configuration Preflight (2026-08-02)

**Implemented:** `npm run pilot:readiness` and
`npm run pilot:readiness:production` provide a configuration-only readiness
check for the internal-pilot boundary. The check does not load `.env` itself,
connect to a database, run a migration, call a Provider, or print secret
values. The production target requires session authentication, non-placeholder
`SESSION_SECRET` and `ENCRYPTION_MASTER_KEY` values of at least 32 characters,
a PostgreSQL `DATABASE_URL`, the PostgreSQL workflow Checkpointer, and disabled
automatic Checkpointer setup. The development target permits the local
authentication/SQLite path but warns when the temporary development encryption
key is in use.

**Historical intermediate snapshot (before pilot-feedback coverage was added):**
four deterministic readiness tests passed. The checks were included in both
`test:unit` and `test:coverage`; that intermediate run reported `185/185` unit
tests and `src/lib/**` coverage of lines `92.43%`, branches `87.59%`, and
functions `89.67%`. `npm run pilot:readiness` passed against the
current local development configuration with the expected temporary-key warning.
`npm run pilot:readiness:production` failed as intended because this workstation
has not been configured with target-environment session secrets, PostgreSQL, or
the PostgreSQL Checkpointer.

**Pending external verification:** a passing production preflight is not a
deployment result. Target-environment migration application, Checkpointer setup,
database connectivity, backup/recovery exercise, Docker or remote-CI PostgreSQL
acceptance, Provider authorization, and pilot-user data still require their own
recorded evidence.

## PostgreSQL Deployment Initialization Reverification (2026-08-02)

**Implemented:** the PostgreSQL acceptance entry points and the CI PostgreSQL
job now run `npm run db:setup:workflow-checkpoints` after Prisma migrations and
before the integration suites. The recovery integration test no longer calls
`PostgresSaver.setup()` itself. This separates deployment-time Checkpointer DDL
from application-instance recovery behavior, matching the intended multi-instance
deployment sequence.

**Verified (WSL dedicated temporary database):**
`npm run test:integration:postgres:wsl` created random role and database
`agentforge_p0_wsl_f77047db05a15bd2`, applied four PostgreSQL migrations,
completed the explicit Checkpointer setup command, then passed both the fresh
Saver/Graph crash-recovery test and cross-process lease renewal/takeover/fencing
test. The script printed `POSTGRES_WSL_WORKFLOW_INTEGRATION_PASSED` and executed
`DROP DATABASE` and `DROP ROLE`. TypeScript, ESLint, and document-link checks
also passed after this change.

**Pending independent environments:** Docker Compose and a remote
`postgres-workflow-integration` CI success remain unverified. This WSL result
does not demonstrate target-environment connectivity, backup/recovery,
production load, queue semantics, exactly-once behavior, or multi-region
operation.

## Latest Full Quality Gate (2026-08-02)

**Implemented:** `quality:all` now includes secret-hygiene verification, the
fixed-fixture RAG baseline and Golden Set gates, repository RAG smoke test,
blind-study tooling dry run, unit tests, the `src/lib/**` coverage gate, both
Playwright suites, TypeScript, ESLint, documentation-name/link validation, and
the production build. `quality:pilot` first requires the production
configuration preflight and then runs this complete gate.

**Verified locally (latest 2026-08-02 run):** `npm run quality:all` exited
successfully on this dirty worktree without invoking a Provider. Results were:
`193/193` unit tests passed; the coverage gate passed with lines `92.30%`,
branches `87.62%`, and functions `89.49%`; 24/24 core E2E tests and 1/1
session-isolation E2E test passed; TypeScript, ESLint, documentation
validation for 50 Markdown files, and the Next.js 16.2.10 production build
all passed. Secret hygiene found no tracked
`.env` file and no common credential signature in tracked files. The RAG and
blind-study commands remained deterministic fixture/synthetic checks and
reported no Provider call.

**Pending external evidence:** `quality:pilot` is expected to fail on this
development workstation because target production secrets, PostgreSQL, and the
PostgreSQL Checkpointer are deliberately not configured here. A successful
local quality gate does not prove real-model quality, real RAG retrieval
quality, production latency/cost, target-environment backup recovery, Docker
or remote-CI PostgreSQL acceptance, or real-user outcomes.
