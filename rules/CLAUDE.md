## Engineering conventions

These rules are always on. The full review procedure — what to flag, at which severity,
and how to report it — lives in the `code-review` skill at
`.claude/skills/code-review/SKILL.md`. Consult it when reviewing a diff.

**Non-negotiable**

- No secrets in source. Keys, tokens, passwords and connection strings come from
  environment variables.
- SQL uses parameterized statements — never concatenation or interpolation.
- Validate input where it crosses a system boundary: HTTP handlers, queue consumers,
  CLI arguments, file imports.
- No empty catch blocks. Log or rethrow, naming the failed operation and its inputs.
- Every async operation has a `try`/`catch` or `.catch()`; release resources in `finally`.
- `any` requires a justification comment. Type external data as `unknown`, then narrow it.
- API responses never expose stack traces or internal paths.

**Defaults**

- A function does one thing; if describing it needs an "and", split it. Three positional
  parameters maximum, then an options object.
- Names are descriptive and verb-first; booleans start with `is`, `has`, `should` or `can`.
- Tests assert specific values and are named for the behavior they pin down.
