---
change_id: ai-toolkit-package
title: Ship a shared AI toolkit as a private npm package on GitHub Packages
status: implementing
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Build `@tomskoczewski/ai-toolkit` end-to-end as one change: an npm distribution package that carries a shared `code-review` skill plus team rules, installs them into a consumer repo via lifecycle scripts, and publishes to GitHub Packages from CI.

Scope covers three deliverables that ship together:
1. **Package skeleton** — `package.json` with `publishConfig.registry: https://npm.pkg.github.com`, `bin` → `install.js` (shebang required), and `install.js` / `uninstall.js` that copy `skills/` and `rules/` into the consumer and are idempotent on re-run.
2. **Content** — `skills/code-review/SKILL.md` generated from the team conventions (Naming, Error handling, TypeScript, Function design, Security, Testing), `rules/CLAUDE.md`, and a `README.md` that justifies choosing GitHub Packages over AWS CodeArtifact for this audience.
3. **CI/CD** — `.github/workflows/publish-ai-toolkit.yml` with a `validate` job (package.json + SKILL.md present, frontmatter `name` matches directory name, `npm pack --dry-run`) and a `publish` job gated on it.

Input specs (course material, not versioned) live under
`.claude/10xdevs3-artifacts-m5/claude-code/m5l4/`:
- `prompts/m5l4-shared-conventions.md` — source material for the skill
- `prompts/m5l4-shared-spec-skill.md` — skill spec
- `prompts/m5l4-github-packages-spec-pack.md` — package spec
- `prompts/m5l4-github-packages-spec-cicd.md` — CI/CD spec
- `configs/m5l4-github-packages-*.template` — starting points, adapted rather than copied verbatim

Binding constraints:
- **Scope must equal the GitHub repo owner** → `@tomskoczewski`, never the `@twoj-zespol` placeholder from the templates. Applies to `package.json`, the workflow's `scope:`, and the consumer `.npmrc`.
- Publishing needs **no secret** — the built-in `secrets.GITHUB_TOKEN` plus `permissions: packages: write`. Do not wire a PAT.
- The repo is **private**, so the package is private too; consumer installs need a token with `read:packages`.
- GitHub Packages rejects a duplicate version (409) — every publish needs a version bump.
- The templates are a reference, not a contract: names, scope, artifact layout, and readiness criteria are ours to decide.
