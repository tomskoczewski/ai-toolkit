# AI Toolkit Package — Plan Brief

> Full plan: `context/changes/ai-toolkit-package/plan.md`
> Research: `context/changes/ai-toolkit-package/research.md`

## What & Why

Package the team's shared AI artifacts — a `code-review` Agent Skill and a short rules
file — into a private npm package on GitHub Packages, so any consumer repo picks them up
with one `npm i` instead of copy-pasting markdown between projects. The distribution
mechanism is the point: the skill content is the payload, the pipeline is the product.

## Starting Point

An empty repository. No commits locally, `isEmpty: true` on GitHub, no default branch —
only `context/` scaffolding and two git-excluded directories of course material. All eight
deliverables are net-new, and there is no existing convention or regression surface to work
around; the only external contract is GitHub Packages.

## Desired End State

`npm view @tomskoczewski/ai-toolkit versions --registry=https://npm.pkg.github.com` returns
both `0.1.0` and `0.1.1`. Installing into a fresh directory drops
`.claude/skills/code-review/SKILL.md` into place and splices a sentinel-delimited rules
block into `CLAUDE.md`; installing a second time changes nothing.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Lockfile | Commit `package-lock.json`, keep `npm ci` | `npm ci` errors `EUSAGE` without one; keeping it means the workflow stays correct once a dependency appears | Research |
| Self-install | Guard `findProjectRoot()` — return `null`, no-op | The template's `process.cwd()` fallback makes `postinstall` install into our own repo and into CI's workspace before `npm pack` runs | Research |
| Scope | `@tomskoczewski` in all five placeholder sites | GitHub Packages requires scope to equal repo owner; two of the five sites derive the rules sentinels | Research |
| Rules file | Short, defers to the skill | Keeps the six convention categories in exactly one place so they cannot drift across versions | Plan |
| CI validation | Checked-in `scripts/validate.js` | Same check runs locally and in CI, so a failure is reproducible without pushing — decisive when the first push is also the release | Plan |
| Install verification | CI packs, installs into a temp dir, installs again | Makes idempotency — the one behavioral requirement in the spec — machine-checked instead of eyeballed | Plan |
| Uninstall | `bin` dispatches `install` / `uninstall` | npm has no usable preuninstall hook here, so without a bin entry `uninstall.js` is dead code | Plan |
| Manifest | Prune files dropped between versions | Otherwise a consumer upgrading past a removed skill keeps a stale copy that still loads | Plan |
| Skill depth | Adapted into a review procedure with a severity rubric | A bare rule list makes the agent invent severities, so two runs on one diff disagree | Plan |
| Consumer `.npmrc` | Documented in README, not shipped | A packaged `.npmrc` is never read — it must exist in the consumer's repo before install | Plan |

## Scope

**In scope:** `package.json` + lockfile · `install.js` / `uninstall.js` with self-install
guard, manifest pruning and subcommand dispatch · `skills/code-review/SKILL.md` ·
`rules/CLAUDE.md` · `README.md` with the model-choice rationale · `scripts/validate.js` ·
`.github/workflows/publish-ai-toolkit.yml` · releases `0.1.0` and `0.1.1` · consumer smoke test

**Out of scope:** AWS CodeArtifact / Terraform / OIDC (Model 2) · publishing to npmjs.com ·
a shipped `.npmrc` or `.npmrc.example` · the spec's optional `preinstall` token helper ·
any test framework, linter, or build step · monorepo layout · committing anything

## Architecture / Approach

The package is a content carrier, not a library — nothing imports from it, so it has no
dependencies and no build. `postinstall` runs `install.js`, which resolves the consumer's
project root by walking up for a `node_modules` ancestor, replaces `.claude/skills/<name>/`
wholesale, splices `rules/CLAUDE.md` between `<!-- BEGIN @tomskoczewski/ai-toolkit -->` /
`<!-- END -->` sentinels in their `CLAUDE.md`, and records what it wrote to
`.claude/.ai-toolkit-manifest.json`. Those sentinel strings are the whole idempotency story
for rules and become a permanent contract the moment `0.1.0` ships.

Build order is inside-out: mechanism, content, pipeline, release.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Package skeleton | `package.json`, lockfile, guarded `install.js`, `uninstall.js` | `skills/` doesn't exist yet — verified against a scratchpad fixture instead of deferring |
| 2. Toolkit content | `SKILL.md`, `rules/CLAUDE.md`, `README.md` | Severity rubric is a judgment call that shapes every future review |
| 3. Validation + `0.1.0` | `scripts/validate.js`, workflow, first publish | First push creates `main` **and** releases — no earlier PR run catches a typo |
| 4. `0.1.1` + evidence | Second release, consumer smoke test, 3 screenshots | `409` on duplicate version if the bump is missed; lockfile version must match |

**Prerequisites:** `gh` authenticated with `read:packages` (already true) · Node ≥ 20
(v22.14.0 present) · write access to `tomskoczewski/ai-toolkit` (owner)
**Estimated effort:** ~4 sessions, roughly 30/25/25/20 minutes

## Open Risks & Assumptions

- **The first push is the release.** No prior PR run exists to catch a workflow error, so
  Phase 3 depends on `npm run validate` passing locally beforehand.
- **Read auth cannot be verified before publishing.** The registry returns `404` for a
  nonexistent package regardless of token validity, so a failed read pre-`0.1.0` proves
  nothing.
- **Manifest pruning deletes files inside someone else's repo, from `postinstall`.** Guarded
  to `.claude/`, rejecting `..` and absolute paths — but it is the riskiest code here.
- **`PACKAGE_NAME` is frozen after `0.1.0`.** Renaming would orphan every installed rules
  block, since both scripts derive their sentinels from it.
- **`/10x-implement` commits per phase by default**, which collides with this project's
  no-commit rule. Progress rows deliberately carry no SHA suffix; the user commits.

## Success Criteria (Summary)

- Both `0.1.0` and `0.1.1` are listed in the registry, published by CI with no secret beyond
  the automatic `GITHUB_TOKEN`
- A fresh `npm i` from the registry installs the skill and rules into a consumer, and a
  second install changes nothing
- Three screenshots captured: registry/workflow view, `package.json`, version list
