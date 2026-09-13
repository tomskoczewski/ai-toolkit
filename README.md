# @tomskoczewski/ai-toolkit

Shared AI artifacts for the team — a `code-review` Agent Skill and a short rules file —
distributed as a private npm package on GitHub Packages. Install it once and every repo
picks up the same reviewed, versioned copy instead of a hand-pasted one that drifts.

## What it installs, and where

`postinstall` runs the installer automatically. It resolves your project root by walking
up to the `node_modules` ancestor, then writes:

| Path | What lands there |
| --- | --- |
| `.claude/skills/code-review/SKILL.md` | The review skill. Replaced wholesale on every install. |
| `CLAUDE.md` | The team rules, spliced between `<!-- BEGIN @tomskoczewski/ai-toolkit -->` and `<!-- END @tomskoczewski/ai-toolkit -->`. |
| `.claude/.ai-toolkit-manifest.json` | Record of what was installed, used to clean up on upgrade and uninstall. |

The package owns the text **between the sentinels and nothing else** — edit the rest of
your `CLAUDE.md` freely. Installing twice is a no-op: the block is updated in place, never
appended a second time, and the tree is left byte-identical.

## Consumer setup

The package is private, so npm needs to know which registry serves this scope and needs a
token with `read:packages`.

Add the scope mapping to your repository's `.npmrc` and commit it:

```
@tomskoczewski:registry=https://npm.pkg.github.com
```

That file carries the mapping **only**. Never commit `_authToken` — the token is a
credential and belongs outside version control:

- **Locally**: `npm login --scope=@tomskoczewski --registry=https://npm.pkg.github.com`,
  which writes the token to your user-level `~/.npmrc`.
- **In CI**: expose it as a secret and let `actions/setup-node` consume it, or write it to
  the runner's `.npmrc` at build time. Never into the repository's.

Then install:

```bash
npm install @tomskoczewski/ai-toolkit
```

## Manual install and uninstall

```bash
npx ai-toolkit             # install without reinstalling the package
npx ai-toolkit uninstall   # remove managed files and the rules block
```

Uninstall removes exactly what the manifest recorded and strips the sentinel block,
leaving the rest of your `CLAUDE.md` untouched.

## Why GitHub Packages, not AWS CodeArtifact

The team already lives on GitHub, and GitHub Packages needs nothing that does not exist
there: publishing authenticates with the workflow's built-in `GITHUB_TOKEN`, so there is
no cloud account, IAM role, or Terraform state to own for the sake of shipping a few
markdown files. Package visibility follows repository visibility for free — this repo is
private, so the package is too. CodeArtifact would buy cross-account policy control and
upstream proxying that an internal, GitHub-hosted team toolkit has no use for, at the cost
of infrastructure someone then has to maintain.

## Publishing a new version

Publishing is automated. Bump `version` in `package.json`, regenerate `package-lock.json`,
and push to `main` — the workflow validates and publishes. GitHub Packages rejects a
duplicate version with a `409`, so every release needs a version bump.

## Requirements

Node.js >= 20.
