---
name: code-review
description: Review code changes against the team's engineering conventions - naming, error handling, TypeScript, function design, security and testing - and return a severity-ranked verdict. Use when asked to "review code", "check this PR", "review my changes", or for a "code review".
---

# Code review

Review a diff against this team's conventions and close with a single verdict. The
goal is agreement: two runs over the same diff should produce the same severities.
That only holds if severity comes from the rubric below rather than from how strongly
a finding feels, so assign it mechanically.

## Procedure

1. **Establish scope.** Get the changed files (`git diff`, or the PR's file list).
   Read enough surrounding code to judge the change, but review the diff — not the
   file. Pre-existing problems in untouched lines are out of scope unless the change
   makes them materially worse; if you raise one, say that is why.
2. **Read for intent first.** Work out what the change is trying to do before testing
   it against rules. A finding that misreads the intent costs the author more time
   than it saves.
3. **Walk the six categories below**, in order. Each says what to look for and at
   which severity it lands.
4. **Assign severity from the rubric**, then group and report.

## Severity rubric

**Critical** — blocks the merge. Security exposure, or error handling broken badly
enough to threaten correctness: secrets in code, unparameterized SQL, unvalidated
boundary input, stack traces in responses, empty catch blocks, unhandled async
rejections, resources opened without cleanup.

**Warning** — does not block, but carries real maintenance cost: `any` without a
justification comment, a function doing two things, more than three positional
parameters, optional fields modeling states that want a discriminated union,
assertions like `toBeTruthy()` where a specific one exists.

**Suggestion** — naming and style: abbreviations, function names that are not
verb-first, booleans missing their prefix, a filename that disagrees with its primary
export, nesting an early return would flatten.

When a finding could sit in two bands, place it by consequence: what breaks in
production if it ships unchanged?

## Naming

Read each new name as someone who has not seen the change. Does it say what the thing
is, or does it need the surrounding code to be understood?

Flag at **Suggestion**: abbreviations other than `url`, `id`, `api`, `config`;
functions that do not start with a verb (`getUserById`, never `user`); booleans
without `is` / `has` / `should` / `can`; a file whose name does not match its primary
export (`UserService.ts` exports `UserService`); constants that are not
`UPPER_SNAKE_CASE`.

Naming is almost never Critical. The exception is a name that actively lies about
behavior — a `get*` that writes — and that belongs under Function design as a Warning.

## Error handling

Ask what the on-call engineer sees when this fails at 3am. If the message does not
name the failed operation and the inputs it failed on, the handler is incomplete.

Flag at **Critical**: an empty catch block; an async operation with no `try`/`catch`
and no `.catch()`; a resource opened without a `finally` that releases it.

Flag at **Warning**: an error message that omits the operation or its inputs; an HTTP
error without a status code and an actionable message; a catch that swallows the
original error instead of logging or rethrowing it.

## TypeScript

The type system is here to make illegal states unrepresentable, so look at what the
types permit, not only at what they describe.

Flag at **Warning**: `any` with no justification comment alongside it; external data
(network, disk, user input) typed as anything other than `unknown` before a type guard
narrows it; optional fields used to model mutually exclusive states where a
discriminated union fits.

Flag at **Suggestion**: `type` used for an object shape where the convention is
`interface`; single-letter generic parameters instead of descriptive ones (`TUser`).

## Function design

One test carries most of this category: describe the function in a single sentence. If
the sentence needs an "and", the function is doing two things.

Flag at **Warning**: a function failing that test; more than three positional
parameters, where an options object belongs; a query function (`get*`, `find*`, `is*`)
that mutates state or performs I/O, since callers assume those are pure.

Flag at **Suggestion**: nested conditionals that early returns would flatten.

## Security

The highest-signal category. Treat everything here as Critical unless the value is
demonstrably inert, and when you are unsure whether something is a real secret, flag
it anyway — a false positive costs one sentence, a miss costs a credential rotation.

Flag at **Critical**: keys, tokens, passwords or connection strings in source instead
of environment variables; SQL assembled by concatenation or interpolation rather than
parameterized; input crossing a system boundary — HTTP handler, queue consumer, CLI
argument, file import — that reaches business logic unvalidated; responses carrying
stack traces, internal paths or raw driver errors.

## Testing

A test suite is reviewed for what it would catch, not for its line count.

Flag at **Warning**: `toBeTruthy()` or `toBeDefined()` where a specific
`toEqual(expected)` is available; a test depending on another test's setup rather than
owning its own; a change that fixes a Critical finding without a test covering the
fixed path.

Flag at **Suggestion**: a test name restating the function name instead of the
behavior — "returns empty array when no results found" is the target shape.

Check the edge cases the change introduces: empty, null, boundary values, and the
error path. New error handling with no test exercising it is a Warning.

## What not to flag

A review loses its value the moment it reads as noise, so the findings you leave out
matter as much as the ones you raise. Leave these alone:

- **Anything the conventions above do not cover.** A personal style preference is not
  a finding. If it is not a rule here, it is not a rule.
- **The same problem repeated.** Report the pattern once, with the clearest example and
  a count, rather than once per occurrence. Ten identical findings read as ten problems
  and get skimmed as one.
- **Code the diff only moved.** A pure move or rename is not an invitation to review
  logic nobody touched.
- **Generated files** — lockfiles, build output, snapshots. Review the input that
  produced them instead.
- **Speculative failure modes** you cannot tie to the code in front of you. "This might
  not scale" is a conversation, not a finding; if it genuinely matters, it is
  NEEDS DISCUSSION with a stated reason.

One Critical finding with a clear fix is worth more than twelve Suggestions.

## Output format

Group findings by severity, Critical first, then Warning, then Suggestion. Omit any
group that is empty. Give every finding a `file:line` reference where the location is
determinable; where it is not — a missing test, an absent validation layer — state
what is missing and where it belongs rather than inventing a line number.

```
## Critical
- `src/db/users.ts:42` - Query built by interpolating `userId` into the SQL string.
  Use a parameterized statement.

## Warning
- `src/api/handler.ts:17` - `parseRequest` validates the payload and writes the audit
  log. Split it.

## Suggestion
- `src/utils/fmt.ts:8` - `usrNm` abbreviates without need; prefer `userName`.

**Verdict: REQUEST CHANGES**
```

Close with exactly one verdict:

- **REQUEST CHANGES** — any Critical finding. The mapping is mechanical: one Critical
  means REQUEST CHANGES no matter how sound the rest of the change is.
- **NEEDS DISCUSSION** — the code works, but it rests on a design decision you
  disagree with, or the intent is too unclear to judge. This verdict is for design
  disagreement only, never for a large number of findings.
- **APPROVE** — no Critical findings. Warnings and Suggestions are worth raising but
  do not block; list them and approve.
