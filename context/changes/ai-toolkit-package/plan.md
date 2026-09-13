# AI Toolkit Package Implementation Plan

## Overview

Build `@tomskoczewski/ai-toolkit` — a private npm package on GitHub Packages that
carries a shared `code-review` Agent Skill and a small rules file, installs them into
a consumer repo through a `postinstall` lifecycle script, and publishes itself from
GitHub Actions. Four phases take the repo from empty to two published versions with a
verified consumer install.

## Current State Analysis

The repository is empty: no commits locally, `isEmpty: true` on GitHub, no default
branch. The working tree holds only `context/` scaffolding from `/10x-init`, this
change folder, a three-line `.gitignore`, and two git-excluded directories of course
material and borrowed `/10x-*` skills.

None of the seven deliverables exist. There is no build system, no test framework, no
lint config, and no convention to conform to — the only external contract is GitHub
Packages.

Research (`research.md`) established four ways the supplied templates break here:

- `npm ci` errors `EUSAGE` with no lockfile, and both workflow jobs call it
- `postinstall` resolves the project root to *this* repo when run outside a
  `node_modules` tree, so it self-installs into our own `.claude/` and `CLAUDE.md`
- `@twoj-zespol` appears in five places, two of which derive the rules sentinels
- there is no `main` to merge into; the first push creates it and triggers the release

## Desired End State

`npm view @tomskoczewski/ai-toolkit versions --registry=https://npm.pkg.github.com`
returns `['0.1.0', '0.1.1']`, and installing the package into a fresh directory places
`.claude/skills/code-review/SKILL.md` and a sentinel-delimited rules block in
`CLAUDE.md`, with a second install producing no duplication and no diff.

Verify by running the Phase 4 consumer smoke test against the live registry.

### Key Discoveries:

- `install.js` template's `findProjectRoot()` falls back to `process.cwd()` when no
  `node_modules` ancestor exists — this fallback is the self-install bug, and guarding
  it is a four-line change (`research.md` → "Blocker 2")
- `install.js` and `uninstall.js` each derive `BEGIN`/`END` sentinels from their own
  local `PACKAGE_NAME` constant; if those two constants ever disagree, uninstall
  silently fails to find the block install wrote
- the skills installer already replaces (`rmSync` then copy) rather than merges, so it
  is idempotent by construction; only the rules path and the manifest need care
- `install.js` swallows its own errors by design so a broken toolkit never fails a
  consumer's `npm install`; `uninstall.js` does not. Preserve that asymmetry
- Node 22 / npm 10 locally, workflow pins Node 20 — `lockfileVersion: 3` is understood
  by both, so the committed lockfile is portable

## What We're NOT Doing

- AWS CodeArtifact, Terraform, OIDC, or anything from the `m5l4-codeartifact-*` specs
  and the `pack-init` / `tf-registry` / `setup-cicd` skills — that is Model 2
- shipping a `.npmrc` or `.npmrc.example` in the package; the consumer's `.npmrc` must
  exist in *their* repo before install, so a packaged copy would never be read. README
  documents it instead
- publishing to npmjs.com, or making the package public
- a `preinstall` token helper in the consumer's `package.json` (the spec offers it; it
  appends to `.npmrc` on every install and is easy to get wrong). README documents
  `npm login` and the CI secret instead
- any test framework, linter, or TypeScript build — the package has no runtime code to
  type-check and no dependencies to lock beyond the empty lockfile
- a monorepo layout; the package lives at the repository root
- committing anything. Every phase leaves its files in the working tree

## Implementation Approach

Build inside-out: the mechanism first (Phase 1), then the content it carries (Phase 2),
then the pipeline that ships it (Phase 3), then the release and its proof (Phase 4).

Phase 1's installer cannot be verified against real `skills/` content, which does not
exist until Phase 2. Rather than defer verification, Phase 1 tests `install.js` against
a throwaway fixture in the scratchpad — a temp directory with a stub skill and rules
file — which exercises every branch that matters (project-root resolution, sentinel
splicing, manifest pruning, idempotency) without waiting for Phase 2.

Phases 3 and 4 necessarily push to GitHub: publication is the deliverable. That is the
explicit Blok B exception. Everything Phases 1 and 2 produce stays uncommitted.

## Critical Implementation Details

**The first push is the release.** Because the remote has no commits, the push that
creates `main` also matches `on.push.branches: [main]` and runs `publish`. There is no
prior PR run to catch a workflow typo, which is why Phase 3 requires `scripts/validate.js`
to pass locally *before* the push, and why the smoke test lives in `validate` rather
than being left to manual checking.

**Sentinel strings are a permanent contract.** Once `0.1.0` installs a block marked
`<!-- BEGIN @tomskoczewski/ai-toolkit -->` into a consumer's `CLAUDE.md`, every future
version must use that exact string or it will append a second block instead of updating
the first. Derive the sentinels from `PACKAGE_NAME` in both scripts and never edit
`PACKAGE_NAME` without treating it as a breaking change.

**Manifest pruning deletes files.** It runs inside `postinstall`, in someone else's
repository. Constrain deletion to paths recorded in the previous manifest that are also
under `.claude/`, and never follow a path containing `..`.

---

## Phase 1: Package skeleton

### Overview

Everything the package needs to exist and install correctly, with no content yet.

### Changes Required:

#### 1. Package manifest

**File**: `package.json`

**Intent**: Declare the package so npm can pack and publish it to GitHub Packages, and
so `postinstall` runs the installer in consumers.

**Contract**: Adapted from `m5l4-github-packages-package.json.template`, with:
`name: "@tomskoczewski/ai-toolkit"` (scope equals repo owner — GitHub rejects any other),
`version: "0.1.0"`, `license: "UNLICENSED"`, `type: "commonjs"`,
`publishConfig.registry: "https://npm.pkg.github.com"`,
`engines.node: ">=20"`, `files: ["skills/", "rules/", "install.js", "uninstall.js", "README.md"]`,
`scripts.postinstall: "node install.js"`, `bin: { "ai-toolkit": "./install.js" }`.

Add beyond the template: a `repository` field (`type: git`, `url:
git+https://github.com/tomskoczewski/ai-toolkit.git`) so the Packages tab links to the
source, and `scripts.validate: "node scripts/validate.js"` — the same entry point CI
calls. Note that `scripts/` is deliberately absent from `files`: it is a development
tool, not part of the payload.

#### 2. Lockfile

**File**: `package-lock.json`

**Intent**: Make `npm ci` work in CI. Without it both workflow jobs fail `EUSAGE`.

**Contract**: Generated, not hand-written. Must be produced with `--ignore-scripts` so
the un-guarded installer cannot self-install while creating it:
`npm install --package-lock-only --ignore-scripts`. Expect `lockfileVersion: 3` and an
empty `packages` body apart from the root entry.

#### 3. Installer

**File**: `install.js`

**Intent**: Copy `skills/` into the consumer's `.claude/skills/`, splice `rules/CLAUDE.md`
into their root `CLAUDE.md` between sentinels, and record what was written — idempotently,
and without ever failing their `npm install`.

**Contract**: Starts from `m5l4-github-packages-install.js.template`, keeping
`copyDir`, `installSkills`, `applyRulesBlock`, and the top-level try/catch that downgrades
any error to a warning. Requires a `#!/usr/bin/env node` shebang because `bin` points here.
Four changes:

1. `PACKAGE_NAME` → `"@tomskoczewski/ai-toolkit"`, which transitively fixes both sentinels.
2. **Self-install guard.** `findProjectRoot()` returns `null` instead of falling back to
   `process.cwd()` when no `node_modules` ancestor is found. `main()` treats `null` as
   "running inside the package itself", logs one line, and returns without writing.
   `PROJECT_ROOT` env var still overrides, which is what the Phase 1 fixture test uses.
3. **Manifest pruning.** Before writing the new manifest, read the previous one if present
   and delete any recorded file that the current run did not reinstall. Guard each
   deletion: the path must be relative, must not contain `..`, and must resolve under
   `<projectRoot>/.claude/`. `CLAUDE.md` is exempt — the sentinel block owns it, not the
   manifest.
4. **Subcommand dispatch.** `process.argv[2] === "uninstall"` delegates to `uninstall.js`;
   anything else installs. Keeps `postinstall` (`node install.js`, no argv) on the install
   path unchanged.

#### 4. Uninstaller

**File**: `uninstall.js`

**Intent**: Remove every file the manifest records and strip the sentinel block, leaving
the consumer's own `CLAUDE.md` content intact.

**Contract**: From `m5l4-github-packages-uninstall.js.template` with `PACKAGE_NAME`
updated to match `install.js` exactly. Keeps its no-try/catch posture — an explicit
uninstall should fail loudly. Reuses the same path guards as the installer's pruning.

### Success Criteria:

#### Automated Verification:

- `node -e "JSON.parse(require('fs').readFileSync('package.json'))"` parses, and `name` is `@tomskoczewski/ai-toolkit`
- `grep -rn "twoj-zespol" package.json install.js uninstall.js` returns nothing
- `install.js` and `uninstall.js` agree on `PACKAGE_NAME`: `grep -h 'PACKAGE_NAME = ' install.js uninstall.js | sort -u | wc -l` is 1
- `package-lock.json` exists with `lockfileVersion` >= 3
- `npm ci` succeeds
- `node install.js` run from the repo root writes nothing — no `.claude/skills/` and no `CLAUDE.md` appear
- against a scratchpad fixture with `PROJECT_ROOT` set: install places the stub skill and a single sentinel block; a second install leaves the tree byte-identical (`diff -r` clean)
- manifest pruning: remove a file from the fixture's `skills/`, reinstall, and the previously installed copy is gone from the fixture consumer
- `node install.js uninstall` against the fixture removes managed files and the sentinel block, leaving surrounding `CLAUDE.md` text untouched
- `npm pack --dry-run` succeeds and lists no `scripts/`, `context/`, or `.claude/` entries

#### Manual Verification:

- `git status` shows only intended new files; the working tree has not been self-installed into

**Implementation Note**: After completing this phase and all automated verification passes, pause for confirmation before proceeding.

---

## Phase 2: Toolkit content

### Overview

The payload: the review skill, the rules file, and the README that justifies the whole
distribution model.

### Changes Required:

#### 1. Code review skill

**File**: `skills/code-review/SKILL.md`

**Intent**: A reviewer procedure derived from the team conventions handout — what to look
for in each category, how to assign severity, and how to report.

**Contract**: YAML frontmatter with exactly `name: code-review` (must equal the directory
name — CI asserts this) and a `description` covering the trigger phrases "review code",
"check this PR", "review my changes", "code review".

Body organized under the six mandated categories — Naming, Error handling, TypeScript,
Function design, Security, Testing — sourced from `m5l4-shared-conventions.md` but written
as review instructions rather than a restated rule list. Each category states what to flag
and at which severity, so the same diff yields the same verdict across runs. The severity
rubric is the part that must be explicit:

- **Critical** — security (secrets in code, unparameterized SQL, unvalidated boundary
  input, stack traces in responses) and correctness-threatening error handling (empty
  catch, unhandled async rejection, missing resource cleanup)
- **Warning** — convention violations with real maintenance cost: `any` without a
  justification comment, functions doing two things, >3 positional params, optional-field
  state modeling where a discriminated union belongs, assertions like `toBeTruthy()`
- **Suggestion** — naming and style: abbreviations, non-verb-first function names, missing
  boolean prefixes, filename/export mismatch, nesting that early returns would flatten

Output format section: findings grouped Critical → Warning → Suggestion, each carrying a
`file:line` reference where determinable, closing with exactly one of `APPROVE` /
`REQUEST CHANGES` / `NEEDS DISCUSSION`. State the mapping — any Critical means
`REQUEST CHANGES`; `NEEDS DISCUSSION` is for design disagreement, not for volume of findings.

#### 2. Team rules

**File**: `rules/CLAUDE.md`

**Intent**: The short always-on rules that belong in every consumer's `CLAUDE.md`, without
duplicating the skill.

**Contract**: Under ~25 lines. States the non-negotiables (no secrets in code,
parameterized SQL, no empty catch blocks, `any` needs a justification comment, boundary
input is validated) and points at the `code-review` skill for the full convention set.
This is the file that lands between sentinels in a consumer's `CLAUDE.md`, so it must read
correctly when embedded in a document it does not own — no top-level `# Heading`, no
assumptions about surrounding content.

#### 3. README

**File**: `README.md`

**Intent**: Consumer-facing install docs plus the model-choice rationale the lesson asks for.

**Contract**: Sections for (a) what the package installs and where, (b) consumer setup —
the `@tomskoczewski:registry=https://npm.pkg.github.com` line in their `.npmrc`, the
`read:packages` token requirement for this private package, `npm login` locally vs a CI
secret, and an explicit "never commit `_authToken`", (c) `npx ai-toolkit` / `npx ai-toolkit
uninstall`, (d) 2–3 sentences on why GitHub Packages over AWS CodeArtifact — the audience
is a team already on GitHub, publish auth is the built-in `GITHUB_TOKEN` with no cloud
account, IAM role, or Terraform state to own, and package visibility follows repo
visibility for free.

### Success Criteria:

#### Automated Verification:

- `skills/code-review/SKILL.md` frontmatter parses and `name` equals `code-review`
- all six category headings are present in `SKILL.md`
- all three verdict tokens `APPROVE`, `REQUEST CHANGES`, `NEEDS DISCUSSION` appear
- `rules/CLAUDE.md` contains no line starting with `# ` (it is embedded, not standalone)
- `grep -rn "twoj-zespol" .` over tracked files returns nothing
- `npm pack --dry-run` now lists `skills/code-review/SKILL.md`, `rules/CLAUDE.md`, `README.md`
- installing into the Phase 1 fixture places the real skill; a second install is a no-op

#### Manual Verification:

- `SKILL.md` reads as instructions to a reviewer, not as a restated rule list
- the README rationale is defensible in 2–3 sentences without further explanation
- `rules/CLAUDE.md` reads correctly when pasted into the middle of an unrelated `CLAUDE.md`

**Implementation Note**: Pause for confirmation before proceeding.

---

## Phase 3: Validation and first release

### Overview

The five spec-mandated checks as a runnable script, the workflow that calls it, and the
push that publishes `0.1.0`.

### Changes Required:

#### 1. Validation script

**File**: `scripts/validate.js`

**Intent**: One entry point, runnable identically locally and in CI, covering every check
the CI spec mandates.

**Contract**: Zero dependencies, exits non-zero with a per-check message on failure.
Checks, in order:

1. `package.json` exists and has `name`, `version`, `publishConfig.registry`
2. `skills/code-review/SKILL.md` exists
3. that file opens with a `---` delimited YAML block containing `name` and `description`
   (parse the delimited block by hand — no YAML dependency for two scalar fields)
4. the frontmatter `name` equals the containing directory name, for **every** directory
   under `skills/`, not just `code-review` — the check should survive a second skill
5. `npm pack --dry-run` exits zero

Deliberately excluded from `package.json`'s `files`, so it never ships to consumers.

#### 2. Publish workflow

**File**: `.github/workflows/publish-ai-toolkit.yml`

**Intent**: Validate every push and PR; publish only on a push to the default branch.

**Contract**: From `m5l4-github-packages-publish-ai-toolkit.yml.template`, with
`permissions: { contents: read, packages: write }`, `on.push.branches: [main, master]`
and the matching `pull_request` trigger, `actions/checkout@v4`, `actions/setup-node@v4`
with `node-version: 20`, `registry-url: https://npm.pkg.github.com`, and
`scope: "@tomskoczewski"` in **both** jobs.

`validate` job: `npm ci` → `npm run validate` → the install smoke test. The smoke test
packs the tarball, installs it into a temp directory outside the workspace, then installs
a second time and asserts that `.claude/skills/code-review/SKILL.md` exists and that
`CLAUDE.md` contains exactly one `<!-- BEGIN @tomskoczewski/ai-toolkit -->` occurrence.
One occurrence after two installs is the idempotency assertion.

`publish` job: `needs: validate`, `if: github.event_name == 'push'`, `npm ci`, then
`npm publish` with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. No PAT, no repository
secret — the automatic token plus `packages: write` is sufficient.

#### 3. First release

**Intent**: Create `main` on the remote and publish `0.1.0`.

**Contract**: Not a file change. `npm run validate` must pass locally first, because this
push is simultaneously the branch creation and the release — there is no earlier PR run to
have caught a mistake. The user performs the commit and push; this plan does not.

### Success Criteria:

#### Automated Verification:

- `npm run validate` exits 0 locally
- `node scripts/validate.js` exits non-zero when `skills/code-review/SKILL.md` frontmatter `name` is temporarily altered (verifies check 4 actually fires)
- the workflow file parses as YAML
- `grep -c 'scope: "@tomskoczewski"' .github/workflows/publish-ai-toolkit.yml` is 2
- `grep -n "twoj-zespol\|AWS_\|CODEARTIFACT\|id-token" .github/workflows/publish-ai-toolkit.yml` returns nothing
- after the push: `gh run list --repo tomskoczewski/ai-toolkit --workflow publish-ai-toolkit.yml` shows a successful run
- `npm view @tomskoczewski/ai-toolkit@0.1.0 --registry=https://npm.pkg.github.com` resolves

#### Manual Verification:

- the Packages tab on the repo shows the package, linked to this repository
- the workflow run's `validate` job shows the double-install assertion passing

**Implementation Note**: Pause for confirmation before proceeding. This phase publishes — it is not reversible by deleting a file.

---

## Phase 4: Second release and evidence

### Overview

Prove the pipeline repeats, prove the install works from the real registry, and capture
the three screenshots the badge requires.

### Changes Required:

#### 1. Version bump

**Files**: `skills/code-review/SKILL.md`, `package.json`, `package-lock.json`

**Intent**: A real (if small) content change plus the version bump that lets it publish.

**Contract**: A substantive edit to `SKILL.md` — not a whitespace change. `version` →
`0.1.1` in `package.json`, with `package-lock.json` regenerated to match (its root entry
carries the version too, and CI's `npm ci` fails on a mismatch). GitHub Packages returns
`409` on a duplicate version, so the bump is mandatory, not cosmetic.

#### 2. Consumer smoke test

**Intent**: Verify the published artifact, not the local tree — the first end-to-end check
that the registry, the auth path, and the installer all work together.

**Contract**: In an empty directory outside this repo: an `.npmrc` with the registry
mapping plus `//npm.pkg.github.com/:_authToken=$(gh auth token)`, then
`npm i @tomskoczewski/ai-toolkit`. Assert `.claude/skills/code-review/SKILL.md` landed and
`CLAUDE.md` has the sentinel block. Run the install a second time and assert no
duplication. The `.npmrc` holds a live token — keep the directory in the scratchpad and
delete it afterwards.

### Success Criteria:

#### Automated Verification:

- `npm run validate` passes with version `0.1.1`
- `package.json` and `package-lock.json` report the same version
- second workflow run succeeds
- `npm view @tomskoczewski/ai-toolkit versions --registry=https://npm.pkg.github.com` lists both `0.1.0` and `0.1.1`
- consumer smoke test: skill file present, exactly one sentinel block, second install produces no diff
- scratchpad consumer directory containing the token is deleted

#### Manual Verification:

- screenshot 1 — repo Packages tab or the workflow run view
- screenshot 2 — `package.json`
- screenshot 3 — version list, from the registry UI or `npm view` output

**Implementation Note**: Final phase. Confirm all three screenshots are captured and legible before closing the change.

---

## Testing Strategy

There is no unit test framework and nothing to unit test — the package has no runtime
library code. Verification is behavioral and happens at three levels:

### Fixture tests (Phase 1–2, local):

- installer against a scratchpad consumer with `PROJECT_ROOT` set: first install, second
  install (idempotency), install after removing a source file (pruning), uninstall
- the self-install guard: `node install.js` at the repo root must write nothing

### Structural validation (Phase 3, local + CI):

- `scripts/validate.js` — the five spec checks, run identically in both places
- negative test: temporarily break the frontmatter name and confirm validation fails.
  A validator that has never failed has not been tested

### End-to-end (Phase 3–4, CI + local):

- CI: pack → install → install again → assert exactly one sentinel block
- local: install from the live registry with a real read token, twice

### Manual Testing Steps:

1. From the repo root, `node install.js` — confirm no `.claude/skills/` or `CLAUDE.md` appears
2. In a scratchpad consumer with pre-existing `CLAUDE.md` content, install and confirm the
   existing text is untouched above and below the sentinel block
3. Install twice; `diff -r` between the two states must be empty
4. `node install.js uninstall`; confirm the original `CLAUDE.md` content survives intact
5. After Phase 4, install from the registry into an empty directory and open the resulting
   `.claude/skills/code-review/SKILL.md`

## Performance Considerations

None. The installer copies a handful of markdown files; the workflow has no dependencies
to resolve. `npm ci` on an empty lockfile is effectively instant.

## Migration Notes

No existing installs to migrate — `0.1.0` is the first release. The forward-compatibility
constraint worth recording: the sentinel strings are derived from `PACKAGE_NAME`, so
renaming the package after `0.1.0` ships would orphan every installed rules block. Treat
`PACKAGE_NAME` as frozen.

## References

- Related research: `context/changes/ai-toolkit-package/research.md`
- Change identity: `context/changes/ai-toolkit-package/change.md`
- Specs (course material, git-excluded), under `.claude/10xdevs3-artifacts-m5/claude-code/m5l4/`:
  `prompts/m5l4-github-packages-spec-pack.md`, `prompts/m5l4-shared-spec-skill.md`,
  `prompts/m5l4-github-packages-spec-cicd.md`, `prompts/m5l4-shared-conventions.md`
- Templates: `configs/m5l4-github-packages-{package.json,install.js,uninstall.js,consumer.npmrc,publish-ai-toolkit.yml}.template`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. See `references/progress-format.md`.
>
> **This change does not commit.** The standard ` — <sha>` suffix is intentionally not
> used here: the user commits after their own review, so Progress rows stay bare. Phases
> 3 and 4 push to GitHub because publishing is the deliverable; that is the only exception.

### Phase 1: Package skeleton

#### Automated

- [x] 1.1 package.json parses and name is @tomskoczewski/ai-toolkit
- [x] 1.2 No twoj-zespol placeholder remains in package.json, install.js, uninstall.js
- [x] 1.3 install.js and uninstall.js agree on PACKAGE_NAME
- [x] 1.4 package-lock.json exists with lockfileVersion >= 3
- [x] 1.5 npm ci succeeds
- [x] 1.6 node install.js at repo root writes nothing (self-install guard)
- [x] 1.7 Fixture install places stub skill and a single sentinel block
- [x] 1.8 Second fixture install leaves the tree byte-identical
- [x] 1.9 Manifest pruning removes files dropped between installs
- [x] 1.10 Uninstall removes managed files and sentinel block, leaving surrounding text intact
- [x] 1.11 npm pack --dry-run succeeds and excludes scripts/, context/, .claude/

#### Manual

- [x] 1.12 git status shows only intended new files; working tree not self-installed into

### Phase 2: Toolkit content

#### Automated

- [x] 2.1 SKILL.md frontmatter parses and name equals code-review
- [x] 2.2 All six category headings present in SKILL.md
- [x] 2.3 All three verdict tokens present in SKILL.md
- [x] 2.4 rules/CLAUDE.md has no top-level heading
- [x] 2.5 No twoj-zespol placeholder anywhere in tracked files
- [x] 2.6 npm pack --dry-run lists SKILL.md, rules/CLAUDE.md, README.md
- [x] 2.7 Fixture install places the real skill; second install is a no-op

#### Manual

- [x] 2.8 SKILL.md reads as reviewer instructions, not a restated rule list
- [x] 2.9 README rationale is defensible in 2-3 sentences
- [x] 2.10 rules/CLAUDE.md reads correctly embedded mid-document

### Phase 3: Validation and first release

#### Automated

- [x] 3.1 npm run validate exits 0 locally
- [x] 3.2 Validator fails when frontmatter name is deliberately broken
- [x] 3.3 Workflow file parses as YAML
- [x] 3.4 scope "@tomskoczewski" appears in both setup-node steps
- [x] 3.5 No twoj-zespol, AWS, CodeArtifact or id-token references in the workflow
- [ ] 3.6 Workflow run succeeds after the push
- [ ] 3.7 Version 0.1.0 resolves from the registry

#### Manual

- [ ] 3.8 Packages tab shows the package linked to this repository
- [ ] 3.9 validate job shows the double-install assertion passing

### Phase 4: Second release and evidence

#### Automated

- [ ] 4.1 npm run validate passes at version 0.1.1
- [ ] 4.2 package.json and package-lock.json report the same version
- [ ] 4.3 Second workflow run succeeds
- [ ] 4.4 Registry lists both 0.1.0 and 0.1.1
- [ ] 4.5 Consumer smoke test: skill present, one sentinel block, second install clean
- [ ] 4.6 Scratchpad consumer directory containing the token deleted

#### Manual

- [ ] 4.7 Screenshot 1 - Packages tab or workflow run view
- [ ] 4.8 Screenshot 2 - package.json
- [ ] 4.9 Screenshot 3 - version list
