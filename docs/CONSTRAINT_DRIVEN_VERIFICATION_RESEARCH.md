# Constraint-Driven Verification for AI-Generated Code

> **Status:** Research note / design input only. This is **not** a statement of current Skia behavior and does not change any existing product contract.
>
> Skia currently helps a developer understand an AI-generated change before trusting it. This document explores a possible future layer: deciding **how much verification a change needs**, then surrounding that change with the right tests, checks, human review, rollout controls, and recovery plan.

## Executive summary

AI coding agents can generate code faster than humans can review every line. That creates a real bottleneck, but the answer should not be "stop reviewing code."

A better interpretation is:

> **Move more review effort from reading every generated line to building a verification system around the change, while increasing human review when the consequences are serious.**

The discussion that motivated this research made four useful points:

1. **AI changes the review bottleneck.** Agents can produce large diffs faster than a person can read them carefully.
2. **Judgment does not disappear.** It moves into deciding what behavior must hold, what must never happen, which tests matter, which failures are dangerous, and where a human must still inspect the implementation.
3. **The hardest problem is the missing constraint.** A test suite can look excellent while completely missing a failure mode nobody thought about.
4. **Disposable code does not mean disposable consequences.** Rewriting a function may take five minutes. Undoing corrupted data, duplicate payments, leaked secrets, or a destructive migration may take days.

The result is a risk-based model:

```text
low risk change
    -> mostly automated checks

medium risk change
    -> strong automated verification + focused human review

high risk change
    -> automated verification + adversarial testing + required human review

critical / hard-to-reverse change
    -> all of the above + staged rollout + explicit recovery plan + senior approval
```

The key distinction is:

> **"We do not read every generated line" is not the same as "we do not review the change."**

The review target shifts toward behavior, constraints, architecture, side effects, evidence, risk, and recovery. High-risk code can still require line-by-line human inspection.

---

## Why this matters to Skia

Skia's current product direction is deliberately narrower than "AI code review." The repository describes Skia as a local, pre-PR comprehension checkpoint that helps a developer answer:

1. What does this change appear to do?
2. What could Skia not safely analyze?
3. What should I inspect or verify next?

See [README.md](../README.md) and [docs/VALIDATION.md](VALIDATION.md).

The current workflow is roughly:

```text
AI coding tool
    -> generated diff
    -> Skia: understand + predict
    -> tests
    -> commit / PR
```

This research suggests a possible future extension:

```text
AI-generated change
    -> understand the change
    -> identify affected surfaces
    -> classify risk
    -> discover constraints
    -> run verification gauntlet
    -> focus human review where risk is high
    -> deploy carefully
    -> watch production
    -> turn failures into new constraints
```

This should **not** weaken Skia's existing truth boundary. A future constraint system should still distinguish:

- `deterministic` evidence: directly produced by a compiler, parser, test, static analyzer, or other repeatable check;
- `model_derived` evidence: suggested by an LLM or agent and therefore potentially wrong;
- `developer_supplied` evidence: rules or assumptions entered by a human;
- `not_available`: evidence Skia could not obtain.

A green constraint report must never be presented as proof that the code is correct.

---

# 1. Start with consequences, not code size

A ten-line authorization change can be far riskier than a thousand-line generated UI refactor.

That means review depth should depend on **blast radius**.

## Blast radius

**Blast radius** means: *how much damage could happen if this change is wrong?*

Examples:

- Wrong spacing on an internal page -> small blast radius.
- Wrong discount calculation -> medium blast radius.
- Wrong permission check -> high blast radius.
- Wrong ledger or destructive database migration -> potentially critical blast radius.

Before choosing tests, ask these questions:

| Question | Simple meaning |
|---|---|
| What could this break? | Which users, services, data, or systems are affected? |
| Is the damage reversible? | Can we safely undo it? |
| Can it corrupt data? | Could stored data become wrong or inconsistent? |
| Can it move money? | Could a user be charged or paid incorrectly? |
| Can it change permissions? | Could someone gain access they should not have? |
| Can it expose secrets? | Could tokens, credentials, or private data leak? |
| How easy is failure to notice? | Will we know immediately, or only days later? |
| How easy is recovery? | Can we rollback, or do we need data repair? |
| How uncertain is the change? | Is this familiar code, or a new/poorly understood area? |

A useful mental model is:

```text
risk grows when:
impact grows
+ reversibility gets worse
+ detection gets slower
+ uncertainty grows
```

Do not use lines changed as the main risk score.

---

# 2. Risk tiers

## Tier 1: Low risk

Examples:

- formatting;
- comments and documentation;
- safe generated boilerplate;
- small presentational UI changes;
- simple mechanical refactors with no intended behavior change.

### Default verification

- formatter;
- linter;
- compiler/type checker;
- relevant unit tests;
- existing regression tests;
- build;
- quick human sanity check.

### Human review

Usually light. The main human question is:

> "Is this really low risk?"

If the change unexpectedly touches configuration, permissions, persistence, or public APIs, upgrade the tier.

---

## Tier 2: Medium risk

Examples:

- ordinary business logic;
- customer-visible behavior;
- API behavior;
- data transformation;
- caching changes;
- additive, non-destructive schema changes.

### Default verification

- everything from Tier 1;
- strong unit tests;
- integration tests;
- acceptance scenarios;
- explicit invariants;
- targeted property-based tests where useful;
- targeted mutation testing on important decision logic;
- independent challenge by another reviewer or agent;
- monitoring for the changed behavior;
- known rollback path.

### Human review

The reviewer does not need to read every line equally.

They should focus on:

- whether the requirements are right;
- whether important failure cases are missing;
- whether the architecture makes sense;
- side effects;
- error handling;
- hidden coupling;
- whether the chosen tests actually prove useful behavior.

---

## Tier 3: High risk

Examples:

- authentication;
- authorization;
- permissions;
- payments;
- money movement;
- important data writes;
- secret handling;
- production infrastructure;
- complex concurrency;
- database migrations that can affect existing data.

### Default verification

- everything from Tiers 1 and 2;
- mandatory negative tests;
- mandatory adversarial tests;
- explicit security checks;
- retry and partial-failure tests;
- concurrency tests where relevant;
- idempotency tests where state can change;
- dependency and supply-chain checks;
- required human review;
- staged or canary rollout where possible;
- runtime monitoring;
- explicit rollback or roll-forward plan.

### Human review

Mandatory.

The human should inspect the parts that control:

- authority;
- state transitions;
- money;
- irreversible side effects;
- concurrency;
- recovery;
- security boundaries.

This is where line-by-line review may still be justified.

---

## Tier 4: Critical / hard to reverse

Examples:

- destructive production migrations;
- financial ledger semantics;
- identity ownership rules;
- encryption-key handling;
- infrastructure changes that affect the whole platform;
- large data rewrites;
- operations with no safe rollback.

### Default verification

Everything from Tier 3, plus stronger containment:

```text
preconditions
+ dry run
+ staging
+ shadow execution where possible
+ limited exposure
+ explicit human approval
+ real-time monitoring
+ kill switch / feature flag where possible
+ tested recovery procedure
```

The key question becomes:

> "If our tests are wrong, how do we stop one bad implementation from causing catastrophic damage?"

---

# 3. The constraint catalog

No single technique gives enough confidence. Each catches a different class of failure.

## Unit tests

### What it is

A small test for a small piece of behavior.

### What it catches

- wrong calculations;
- wrong conditions;
- bad boundary handling;
- incorrect transformations.

### What it misses

- interactions between services;
- deployment issues;
- missing requirements;
- many concurrency and security problems.

### Example

```ts
it("rejects transfers larger than the balance", () => {
  expect(canTransfer(100, 101)).toBe(false);
});
```

Use unit tests everywhere because they are fast and cheap.

---

## Integration tests

### What it is

A test that checks multiple real components working together.

For example:

```text
HTTP request
  -> auth
  -> service
  -> database
  -> response
```

### What it catches

- wiring problems;
- serialization errors;
- database behavior;
- incorrect component interactions;
- configuration mismatches.

### What it misses

- unimagined requirements;
- rare production conditions;
- some concurrency or infrastructure failures.

Use integration tests whenever correctness depends on boundaries between components.

---

## Acceptance / Gherkin tests

### What it is

A business-readable scenario.

```gherkin
Scenario: Retrying a completed payment
  Given payment "PAY-123" succeeded
  When payment "PAY-123" is submitted again
  Then no second charge should be created
```

### What it catches

It checks whether the implementation matches important user/business behavior.

### What it misses

It only checks scenarios somebody wrote down. A large Gherkin suite can still miss a dangerous unknown edge case.

Use it where product, QA, and engineering need a shared behavioral contract.

---

## Invariants

### What it is

An **invariant** is a rule that must always remain true.

Examples:

```text
a user must never read another tenant's private records

available inventory must never be below zero

one idempotency key must never produce two charges

a shipped order must have a confirmed payment
```

### What it catches

Illegal states and broken business rules across many different inputs.

### What it misses

The main weakness is discovering the right invariant in the first place.

Use invariants heavily for money, permissions, state machines, data integrity, and distributed workflows.

---

## Property-based testing

### What it is

Instead of writing a few example inputs, a tool generates many inputs and checks that a property always holds.

Example property:

```text
After a successful withdrawal, the balance can never be higher than before.
```

### What it catches

Unexpected input combinations and edge cases that humans did not manually enumerate.

### What it misses

It still depends on somebody writing the correct property.

Use it for parsers, calculations, transformations, state machines, and input-heavy logic.

---

## Fuzzing

### What it is

**Fuzzing** repeatedly feeds unusual, malformed, or random input into code to see whether it crashes or behaves dangerously.

### What it catches

- crashes;
- parser bugs;
- bad validation;
- memory/resource issues in some systems;
- unexpected input handling.

### What it misses

It does not know your business rules unless you pair it with assertions/invariants.

Use fuzzing on parsers, protocol handlers, file readers, public APIs, and security-sensitive input boundaries.

---

## Mutation testing

### What it is

Mutation testing intentionally makes tiny mistakes in the implementation and checks whether the test suite notices.

Example mutation:

```diff
-if (balance >= amount)
+if (balance > amount)
```

If all tests still pass, the tests may be too weak.

### What it catches

Weak assertions and tests that execute code without really checking behavior.

### What it misses

It cannot prove the requirement itself is complete or correct.

Use mutation testing on important decision logic rather than blindly running it over every file.

---

## Code coverage

### What it is

Coverage measures which lines or branches were executed by tests.

### What it catches

Areas that have little or no test execution.

### What it misses

Almost everything about test quality.

```text
95% coverage
!=
95% correctness
```

A test can execute a line and assert nothing useful.

Treat coverage as a gap detector, not a confidence score.

---

## Static analysis and type checking

### What it is

Tools inspect code without running the full application.

Examples include:

- compiler;
- TypeScript type checker;
- linter;
- security scanner;
- query-based analysis such as CodeQL.

### What it catches

Syntax, type, structural, and known code-pattern problems.

### What it misses

Business intent and many runtime interactions.

These checks should be cheap, deterministic, and run early.

---

## SAST and DAST

### SAST

**SAST** means Static Application Security Testing.

It analyzes source/code structure without exercising the deployed application.

Useful for spotting known insecure patterns.

### DAST

**DAST** means Dynamic Application Security Testing.

It probes a running application from the outside.

Useful for finding behavior that only appears at runtime.

Neither technique proves security. Use them as separate layers.

---

## Contract tests

### What it is

A **contract test** checks that two systems agree on the shape and meaning of their interface.

Example:

```text
service A sends { customerId, amount }
service B promises to accept those fields and return a defined response
```

### What it catches

API or message compatibility breaks between services.

### What it misses

Whether either service is logically correct internally.

Use contract tests when teams or services deploy independently.

---

## Dependency scanning and SBOMs

### What is an SBOM?

An **SBOM** (Software Bill of Materials) is a list of software dependencies included in a build.

### What it catches

Together with dependency scanners it can help identify:

- known vulnerable packages;
- unexpected dependencies;
- supply-chain exposure;
- version drift.

### What it misses

Unknown vulnerabilities and application-specific misuse of a safe dependency.

Use these checks for anything shipped to users or production.

---

## Independent agent challenge

An AI agent should not be the only judge of its own work.

A better structure is:

```text
Agent A: implement

Agent B: receive the requirement and diff
         try to break assumptions
         generate adversarial cases

Agent C or human: inspect high-risk gaps
```

A challenge agent can be asked:

```text
Find:
- missing negative cases
- retry bugs
- partial-failure bugs
- concurrency problems
- authorization gaps
- untested assumptions
- irreversible side effects
```

This helps, but it is still `model_derived` evidence. It must not be presented as deterministic proof.

---

## Canary deployment

### What it is

A **canary deployment** sends a new version to a small percentage of users or traffic first.

```text
1% -> healthy -> 10% -> healthy -> 50% -> healthy -> 100%
        |
        -> unhealthy -> stop / rollback
```

### What it catches

Production-only failures that tests missed.

### What it misses

Rare failures that do not appear in the canary group.

A canary does not make bad code correct. It limits how much damage bad code can cause.

---

## Feature flags

### What it is

A **feature flag** lets a team enable or disable behavior without redeploying all the code.

### Why it matters

It gives an emergency off-switch and supports gradual rollout.

### What it misses

If the flag itself is broken or the code damages data before the flag can be turned off, it may not help.

---

## SLOs

### What it is

An **SLO** (Service Level Objective) is a target for service reliability, such as:

```text
99.9% of requests succeed
95% of requests finish within 300 ms
```

### Why it matters

A release can pass tests and still make production slower or less reliable. SLOs make those operational expectations measurable.

---

## Rollback and roll-forward

### Rollback

Return to the previous software version.

### Roll-forward

Deploy a new fix that makes the system safe again.

For data/schema changes, rollback may be unsafe or impossible. In those cases, a planned roll-forward path can be safer.

A recovery plan should answer:

```text
Can we disable the feature?
Can we revert the binary?
Can we repair the data?
Can we identify affected users?
Can we replay operations safely?
Have we actually tested the recovery path?
```

---

# 4. Important failure modes a constraint system must look for

## Missing constraints

This is the biggest weakness of the entire approach.

A constraint framework can only check rules it knows about.

A green dashboard can still be dangerous if nobody thought to ask:

- What if two requests happen at once?
- What if the external API succeeds but our process crashes before saving the result?
- What if the client retries?
- What if an old client talks to the new schema?
- What if a cache is stale?
- What if the operation partially succeeds?
- What if a dependency returns success twice?
- What if a permission is revoked during the operation?

The framework therefore needs a **constraint discovery step**, not only a constraint execution step.

---

## Race conditions

A **race condition** happens when the result depends on timing between concurrent operations.

Example:

```text
stock = 1

request A reads 1
request B reads 1
request A buys item
request B buys item
```

Each request looked valid when it checked the stock. Together they oversold it.

For state-changing high-risk logic, explicitly ask:

```text
What happens if this runs twice at the same time?
```

---

## Idempotency

An operation is **idempotent** when safely repeating the same request does not repeat the side effect.

For example, retrying a payment request with the same idempotency key should not charge the customer twice.

Whenever networks, queues, retries, or background jobs are involved, ask:

```text
What happens if this message/request runs twice?
```

---

## Partial failure

Distributed systems often fail in the middle.

Example:

```text
1. charge card succeeds
2. process crashes
3. local database never records success
4. client retries
5. second charge happens
```

A normal happy-path unit test will not catch this unless the failure is modeled deliberately.

---

## Hidden coupling

A tiny helper can have a huge blast radius if many parts of the system depend on it.

For risk classification, inspect:

- callers;
- downstream writes;
- public interfaces;
- shared libraries;
- configuration;
- deployment scope;
- data ownership.

---

# 5. A general constraint workflow

A future agent harness can follow this sequence for every proposed change.

```text
1. Understand the task
2. Identify changed/affected surfaces
3. Discover candidate constraints
4. Normalize them into a manifest
5. Resolve conflicts and precedence
6. Assign a risk tier
7. Generate/modify code
8. Generate independent adversarial checks
9. Run deterministic gates
10. Decide what the human must review
11. Deploy with risk-appropriate controls
12. Observe runtime behavior
13. Convert failures into permanent constraints
```

## Step 1: Understand the task

Capture:

- intended behavior;
- non-goals;
- inputs/outputs;
- affected users;
- data touched;
- external services;
- security boundaries.

Do not start from the implementation alone.

---

## Step 2: Identify affected surfaces

Map the change to:

```text
files
symbols/functions
API endpoints
schemas
persistent data
permissions
external integrations
queues/events
infrastructure
runtime configuration
```

For Skia, some of this may be deterministic from syntax/source evidence; deeper runtime or architecture claims may remain `model_derived` or `not_available`.

---

## Step 3: Discover candidate constraints

Use several sources:

- requirements;
- existing tests;
- type/schema rules;
- repository policies;
- security rules;
- production incidents/postmortems;
- domain checklists;
- nearby code patterns;
- dependency contracts;
- a separate challenge agent;
- human reviewer knowledge.

Prompt the discovery stage with failure questions, not only happy paths.

### Generic state-change checklist

```text
Can it run twice?
What if the client retries?
What if the process dies halfway?
What if two requests race?
What if a dependency times out?
What if the dependency succeeds but reports failure?
What if an old version and new version run at the same time?
What state remains after partial failure?
```

### Authorization checklist

```text
wrong user
wrong role
wrong tenant
missing credential
expired credential
revoked permission
direct-object access
background-job access
```

### Migration checklist

```text
old app + old schema
old app + new schema
new app + old schema
new app + new schema
partial migration
interrupted migration
retry
recovery
```

---

## Step 4: Normalize constraints

A machine-readable representation makes constraints traceable and enforceable.

Example proposal:

```yaml
version: 1
change_id: CHG-123
risk:
  tier: high
  reasons:
    - touches payment state
    - external side effect
    - duplicate execution would charge twice

constraints:
  - id: payment-idempotent
    source: developer_supplied
    scope:
      paths:
        - src/payments/**
    severity: hard
    statement: One idempotency key may create at most one charge.
    applies_when: payment request mutates charge state
    evidence:
      - type: integration_test
        command: npm test -- payments-idempotency
      - type: runtime_metric
        name: duplicate_charge_by_idempotency_key
    human_review: required

  - id: no-secret-logging
    source: org_policy
    severity: hard
    statement: Secrets must not appear in logs.
    evidence:
      - type: static_analysis
      - type: integration_test

  - id: mutation-score-target
    source: team_policy
    severity: soft
    statement: Critical payment decision logic should maintain a strong mutation score.
    evidence:
      - type: mutation_test
```

The exact schema is only a proposal. It should not be treated as implemented Skia behavior.

---

## Step 5: Resolve conflicts and precedence

Constraints will eventually disagree.

A simple precedence model:

```text
law / regulatory requirement
    > security / safety hard rule
    > organization policy
    > repository policy
    > module/domain policy
    > task-specific rule
    > style/preference
```

Within the same authority level:

1. explicit beats inferred;
2. more specific scope beats general scope;
3. newer valid version beats obsolete version;
4. hard constraints cannot be silently overridden;
5. unresolved hard conflicts block the change.

Never let an agent quietly choose which security rule to ignore.

---

## Step 6: Assign risk

Suggested inputs:

```text
blast radius
reversibility
data sensitivity
money impact
security impact
shared dependency/coupling
novelty
unknowns
runtime side effects
```

A deterministic rule should raise risk for obvious signals such as:

- migration files;
- auth/permission modules;
- secret/key infrastructure;
- payment/ledger code;
- production infrastructure;
- destructive data operations.

A model may suggest additional risk, but model output should not automatically downgrade a deterministic high-risk signal.

---

## Step 7: Implement

The coding agent receives the selected constraints before implementation.

Hard constraints should be visible in the task context.

The agent should not be allowed to "solve" a failing gate by deleting the test, weakening the rule, or silently adding an exception.

---

## Step 8: Independent challenge

A different agent/reviewer receives:

- requirement;
- changed surfaces;
- constraint manifest;
- diff;
- test evidence.

Its job is to identify:

```text
missing constraints
untested branches
unsafe retries
partial failure
race conditions
permission gaps
irreversible effects
weak rollback assumptions
```

The output becomes proposed evidence or proposed tests, not truth.

---

## Step 9: Run layered gates

Run cheap checks first:

```text
format
-> lint
-> typecheck/compile
-> unit tests
-> integration tests
-> contract/security checks
-> property/fuzz tests
-> mutation tests
-> build/package checks
```

Only run expensive checks where the risk justifies them.

---

## Step 10: Decide human review depth

The system should not only say "human review required."

It should say **what the human should inspect**.

Example:

```text
HIGH-RISK REVIEW TARGETS
- authorization branch in src/projects/archiveProject.ts
- database write occurs before audit enqueue
- retry behavior for notification failure is not proven
- rollback behavior is not available
```

This is more useful than asking a reviewer to read 2,000 generated lines with equal attention.

---

## Step 11: Deploy safely

Choose by tier:

| Tier | Deployment default |
|---|---|
| Low | normal deployment |
| Medium | normal or staged, with monitoring |
| High | staged/canary where possible |
| Critical | explicit approval + limited exposure + recovery drill |

---

## Step 12: Runtime verification

Tests are predictions about production. Monitoring checks what actually happened.

Where possible, connect important invariants to runtime signals.

Example:

```text
Invariant:
One idempotency key creates at most one charge.

Runtime signal:
charges_per_idempotency_key > 1
```

---

## Step 13: Feed failures back

Every meaningful defect should ask:

```text
What assumption was wrong?
    -> What constraint was missing?
    -> Can we encode it as a test/rule/monitor?
    -> Does the same class of failure exist elsewhere?
```

A strong constraint system should get better after incidents.

---

# 6. Constraint-engine pseudocode

```text
function verifyChange(change):
    surfaces = discoverAffectedSurfaces(change)

    candidates = collectConstraintsFrom(
        repositoryPolicies,
        organizationPolicies,
        existingTests,
        schemasAndTypes,
        domainChecklists,
        incidentKnowledge,
        developerRequirements,
        independentChallengeAgent
    )

    applicable = selectConstraints(candidates, surfaces, change.context)
    resolved = resolvePrecedenceAndConflicts(applicable)

    if resolved.hasUnresolvedHardConflict:
        return BLOCK("Constraint conflict requires human decision")

    risk = classifyRisk(change, surfaces, resolved)

    evidence = runDeterministicChecks(resolved, risk)
    challenge = runIndependentAdversarialReview(change, resolved, risk)

    if evidence.hasHardFailure:
        return BLOCK("Hard constraint failed")

    reviewPlan = buildHumanReviewPlan(
        risk,
        unresolvedUncertainty = evidence.unknowns + challenge.unknowns
    )

    if reviewPlan.requiresHumanApproval:
        return REQUIRE_HUMAN(reviewPlan)

    return ALLOW_WITH_RELEASE_CONTROLS(
        releasePolicyFor(risk),
        runtimeChecksFor(resolved),
        recoveryPlanFor(risk)
    )
```

Important: `runIndependentAdversarialReview` is probabilistic if it uses an LLM. It can suggest missing checks, but it cannot convert unknowns into deterministic truth.

---

# 7. Exception and waiver process

Real teams sometimes need to ship with a known constraint failure.

A waiver should never be a hidden boolean such as:

```yaml
skip_checks: true
```

Instead require:

```yaml
waiver:
  constraint_id: mutation-score-target
  owner: alice
  reason: emergency production fix
  risk_acknowledged: true
  approved_by: bob
  expires_at: 2026-09-01
  follow_up_issue: ENG-481
```

Rules:

1. hard security/safety rules may be non-waivable;
2. every waiver has an owner;
3. every waiver has a reason;
4. every waiver expires;
5. high-risk waivers require stronger approval;
6. waivers are visible in the PR/evidence bundle;
7. expired waivers fail the gate.

---

# 8. What "someone owns the merge" means

Ownership should be operational, not symbolic.

The person approving a high-risk merge should be able to answer:

```text
What behavior are we changing?
What are the dangerous failure modes?
Which evidence says those failures are controlled?
What evidence is missing?
How will we notice a bad release?
How do we stop it?
How do we recover data/state?
Who is responsible if the release goes wrong?
```

An approval is not meaningful if the approver only sees a green CI badge with no idea what the checks prove.

---

# 9. Junior-friendly AI-generated PR checklist

Use this before submitting an AI-generated change.

## What should happen?

- [ ] I can explain the intended behavior in plain English.
- [ ] I tested the normal case.
- [ ] I tested invalid input.
- [ ] I tested important boundaries.

## What must never happen?

- [ ] Could this corrupt data?
- [ ] Could someone access data they should not see?
- [ ] Could money move incorrectly?
- [ ] Could the same operation happen twice?
- [ ] Could a secret appear in logs or output?

## What if something fails?

- [ ] What happens if a dependency times out?
- [ ] What happens if the process crashes halfway through?
- [ ] What happens if the request is retried?
- [ ] What happens if two requests run at the same time?

## How would we know?

- [ ] Is there a test for the important behavior?
- [ ] Is there monitoring for important production failures?
- [ ] Would anyone be alerted?

## How would we recover?

- [ ] Can the feature be disabled?
- [ ] Can the software be rolled back?
- [ ] Can changed data be repaired or restored?

## Who should review it?

- [ ] I classified the blast radius.
- [ ] Another person or independent agent challenged my assumptions.
- [ ] A senior/domain reviewer is involved if this touches auth, money, important data, migrations, secrets, or infrastructure.

---

# 10. Minimal starter setup for a small team

Do not start by building a giant policy engine.

A useful first version can be:

```text
1. Required formatter/linter/typecheck/build
2. Unit + integration tests in CI
3. PR template with risk classification
4. Explicit "what must never happen?" section
5. Required human review for auth/payments/migrations/secrets/infra
6. Targeted mutation tests on critical business logic
7. Feature flags or quick rollback for risky releases
8. Basic production monitoring
9. Incident -> permanent regression test/checklist rule
```

A small team could represent the first constraint manifest as YAML checked into the repository or generated as a PR artifact.

The important part is not sophisticated tooling. It is making risk, unknowns, and evidence visible.

---

# 11. Mature / high-assurance setup

A larger or high-risk organization can add:

- central policy-as-code;
- repository/module-specific constraint inheritance;
- ownership rules;
- static security analysis;
- dependency scanning and SBOM generation;
- contract tests;
- property testing/fuzzing;
- mutation testing on critical modules;
- independent agent challenge;
- explicit threat modeling;
- change-risk scoring;
- mandatory human gates for defined surfaces;
- canaries and progressive rollout;
- SLO checks;
- runtime invariant monitoring;
- automatic rollback/traffic stop where safe;
- waiver expiry and audit trail;
- postmortem-to-constraint automation;
- metrics for escaped defects and missing constraints.

Useful metrics include:

```text
escaped defects
constraint failures caught before merge
production defects caused by missing requirements
mean detection time
mean recovery time
bad releases stopped during canary
waiver count and age
mutation score on critical modules
critical invariants with both test and runtime evidence
```

Do not collapse all of this into one "confidence percentage." Different evidence proves different things.

---

# 12. Possible Skia-specific direction

This section is intentionally exploratory.

A future Skia verification layer could preserve the product's current comprehension-first approach:

```text
Phase A: Understand
- deterministic source scan
- simplified evidence
- unsupported/unmapped visibility
- developer prediction

Phase B: Classify
- affected surfaces
- side effects
- risk tier
- explicit unknowns

Phase C: Constrain
- repository rules
- developer requirements
- domain checklists
- inferred/model-suggested candidate constraints

Phase D: Verify
- deterministic local commands
- test evidence
- static checks
- optional independent model challenge

Phase E: Review plan
- what passed
- what failed
- what is unknown
- what a human must inspect
```

A useful Skia artifact might eventually look like:

```text
CHANGE RISK: HIGH

Deterministic evidence
  typecheck                         PASS
  unit tests                        PASS
  integration test: tenant access  PASS
  retry/idempotency test            NOT AVAILABLE

Model-derived concerns
  possible partial failure between status update and audit write
  possible duplicate notification on retry

Human review required
  src/projects/archiveProject.ts: authorization branch
  src/projects/archiveProject.ts: ordered side effects

Unknown
  rollback behavior
  production retry policy
```

That would align with Skia's existing principle that unsupported or uncertain areas remain visible rather than being silently smoothed over.

A future implementation should **not** claim:

```text
"all constraints passed, therefore this code is correct"
```

A safer claim is:

```text
"all configured deterministic checks passed;
these model-derived risks remain;
these surfaces were not verified;
this risk tier requires these human checks."
```

---

# 13. Main limitation: unknown unknowns

No constraint system can prove that the constraint set itself is complete.

This remains true even if:

- coverage is 100%;
- every unit test passes;
- mutation score is high;
- two AI reviewers agree;
- static analysis is clean.

The system can still be wrong because the team forgot an important rule.

That means the most valuable long-term asset is not a bigger list of generic tests. It is an evolving library of **failure patterns and domain invariants** learned from:

- experienced engineers;
- security reviews;
- incidents;
- postmortems;
- customer failures;
- threat models;
- adversarial testing;
- production observations.

The framework should therefore optimize for two things at once:

1. **execute known constraints extremely well;**
2. **make missing/unknown constraints easier to discover.**

---

# 14. Bottom line

The strongest version of constraint-driven AI development is not:

```text
AI writes code
+ lots of tests
= humans no longer review
```

It is:

```text
human/domain judgment
    -> risk classification
    -> explicit constraints
    -> layered automated evidence
    -> independent challenge
    -> risk-based human review
    -> controlled deployment
    -> runtime observation
    -> recovery
    -> failures become new constraints
```

For low-risk code, this may allow humans to stop reading every generated line.

For high-risk code, automation should make human review **more focused**, not remove it.

The senior skill shifts from merely reading code quickly toward designing a verification environment where incorrect implementations have fewer places to hide — while never pretending that passing every known check proves there are no unknown failures.

---

# Further reading

These are useful authoritative or primary references for techniques discussed above:

- [NIST SP 800-218: Secure Software Development Framework (SSDF)](https://csrc.nist.gov/pubs/sp/800/218/final)
- [OWASP Application Security Verification Standard (ASVS)](https://owasp.org/www-project-application-security-verification-standard/)
- [Google SRE Book: Release Engineering](https://sre.google/sre-book/release-engineering/)
- [SLSA supply-chain security framework](https://slsa.dev/)
- [CodeQL documentation](https://codeql.github.com/docs/)
- [Hypothesis property-based testing](https://hypothesis.readthedocs.io/)
- [Stryker mutation testing](https://stryker-mutator.io/)
- [PIT mutation testing](https://pitest.org/)

Repository-local evidence about AI-assisted review/comprehension and Skia's current truth boundaries is tracked separately in [docs/VALIDATION.md](VALIDATION.md).
