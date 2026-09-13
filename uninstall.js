#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "@tomskoczewski/ai-toolkit";
const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;
const MANIFEST = ".ai-toolkit-manifest.json";

// Deletion guard. Keep in sync with the copy in install.js.
function isManagedPath(projectRoot, relPath) {
  if (typeof relPath !== "string" || relPath.length === 0) return false;
  if (path.isAbsolute(relPath)) return false;
  if (relPath.split(/[\\/]/).includes("..")) return false;

  const claudeDir = path.resolve(projectRoot, ".claude");
  const resolved = path.resolve(projectRoot, relPath);
  return resolved.startsWith(claudeDir + path.sep);
}

// Drop directories left empty by a deletion, stopping at .claude/ itself.
function removeEmptyParents(projectRoot, relPath) {
  const claudeDir = path.resolve(projectRoot, ".claude");
  let dir = path.dirname(path.resolve(projectRoot, relPath));

  while (dir.startsWith(claudeDir + path.sep) && fs.existsSync(dir)) {
    if (fs.readdirSync(dir).length > 0) return;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

function removeRulesBlock(content) {
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1 || end < start) return content;
  return (content.slice(0, start) + content.slice(end + END.length))
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd() + "\n";
}

function main() {
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const manifestPath = path.join(projectRoot, ".claude", MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    console.log(`${PACKAGE_NAME}: no manifest found, nothing to uninstall`);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const relPath of manifest.files || []) {
    if (relPath === "CLAUDE.md") continue;
    if (!isManagedPath(projectRoot, relPath)) continue;

    fs.rmSync(path.resolve(projectRoot, relPath), { recursive: true, force: true });
    removeEmptyParents(projectRoot, relPath);
  }

  const rulesPath = path.join(projectRoot, "CLAUDE.md");
  if (fs.existsSync(rulesPath)) {
    fs.writeFileSync(rulesPath, removeRulesBlock(fs.readFileSync(rulesPath, "utf8")));
  }

  fs.rmSync(manifestPath, { force: true });
  console.log(`${PACKAGE_NAME}: uninstalled managed files`);
}

main();
