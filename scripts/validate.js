#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const REVIEW_SKILL = path.join(SKILLS_DIR, "code-review", "SKILL.md");

const failures = [];

// Each check returns a problem description, or null when it passes.
function check(label, fn) {
  let problem;
  try {
    problem = fn();
  } catch (error) {
    problem = error.message;
  }

  if (problem) {
    failures.push(label);
    console.error(`FAIL  ${label}\n      ${problem}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

// Two scalar fields do not justify a YAML dependency in a zero-dependency package.
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) return null;

  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return fields;
}

check("package.json declares name, version and publishConfig.registry", () => {
  const file = path.join(ROOT, "package.json");
  if (!fs.existsSync(file)) return "package.json not found";

  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const missing = ["name", "version"].filter((field) => !pkg[field]);
  if (!pkg.publishConfig || !pkg.publishConfig.registry) missing.push("publishConfig.registry");

  return missing.length > 0 ? `missing: ${missing.join(", ")}` : null;
});

check("skills/code-review/SKILL.md exists", () => {
  return fs.existsSync(REVIEW_SKILL) ? null : `${path.relative(ROOT, REVIEW_SKILL)} not found`;
});

check("code-review frontmatter carries name and description", () => {
  if (!fs.existsSync(REVIEW_SKILL)) return "SKILL.md not found";

  const fields = parseFrontmatter(fs.readFileSync(REVIEW_SKILL, "utf8"));
  if (fields === null) return "no --- delimited frontmatter block at the top of the file";

  const missing = ["name", "description"].filter((field) => !fields[field]);
  return missing.length > 0 ? `frontmatter missing: ${missing.join(", ")}` : null;
});

// Every skill, not just code-review: the check has to survive a second skill landing.
check("every skill's frontmatter name matches its directory name", () => {
  if (!fs.existsSync(SKILLS_DIR)) return "skills/ not found";

  const directories = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (directories.length === 0) return "skills/ contains no skill directories";

  const problems = [];
  for (const name of directories) {
    const skillFile = path.join(SKILLS_DIR, name, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      problems.push(`skills/${name}/ has no SKILL.md`);
      continue;
    }

    const fields = parseFrontmatter(fs.readFileSync(skillFile, "utf8"));
    if (fields === null) {
      problems.push(`skills/${name}/SKILL.md has no frontmatter`);
    } else if (fields.name !== name) {
      problems.push(`skills/${name}/SKILL.md declares name "${fields.name}"`);
    }
  }

  return problems.length > 0 ? problems.join("; ") : null;
});

check("npm pack --dry-run succeeds", () => {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["pack", "--dry-run"], { cwd: ROOT, encoding: "utf8" });

  if (result.error) return result.error.message;
  if (result.status !== 0) return `exited ${result.status}: ${(result.stderr || "").trim()}`;
  return null;
});

if (failures.length > 0) {
  console.error(`\n${failures.length} of 5 checks failed.`);
  process.exit(1);
}

console.log("\nAll 5 checks passed.");
