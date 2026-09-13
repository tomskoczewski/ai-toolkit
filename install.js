#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "@tomskoczewski/ai-toolkit";
const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;
const MANIFEST = ".ai-toolkit-manifest.json";

function packageVersion() {
  try {
    return require(path.join(__dirname, "package.json")).version;
  } catch {
    return "unknown";
  }
}

// Returns null when no node_modules ancestor exists, which means this script is
// running inside the package's own checkout rather than in a consumer. Falling
// back to process.cwd() here would make postinstall install into ourselves.
function findProjectRoot() {
  if (process.env.PROJECT_ROOT) return process.env.PROJECT_ROOT;

  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === "node_modules") return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return null;
}

// Deletion guard. Keep in sync with the copy in uninstall.js.
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

function readManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, ".claude", MANIFEST);
  if (!fs.existsSync(manifestPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function copyDir(source, target, installedFiles, root) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst, installedFiles, root);
    } else {
      fs.copyFileSync(src, dst);
      installedFiles.push(path.relative(root, dst));
    }
  }
}

function installSkills(projectRoot, installedFiles) {
  const source = path.join(__dirname, "skills");
  if (!fs.existsSync(source)) return;

  const targetRoot = path.join(projectRoot, ".claude", "skills");
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const skill of fs.readdirSync(source, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    const target = path.join(targetRoot, skill.name);
    fs.rmSync(target, { recursive: true, force: true });
    copyDir(path.join(source, skill.name), target, installedFiles, projectRoot);
  }
}

function applyRulesBlock(existing, teamRules) {
  const block = `${BEGIN}\n${teamRules.trim()}\n${END}`;
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);

  if (start !== -1 && end !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }

  return existing.trimEnd() + "\n\n" + block + "\n";
}

function installRules(projectRoot, installedFiles) {
  const rulesFile = path.join(__dirname, "rules", "CLAUDE.md");
  if (!fs.existsSync(rulesFile)) return;

  const target = path.join(projectRoot, "CLAUDE.md");
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const teamRules = fs.readFileSync(rulesFile, "utf8");
  fs.writeFileSync(target, applyRulesBlock(existing, teamRules));
  installedFiles.push("CLAUDE.md");
}

// Files the previous version installed that this one no longer ships would
// otherwise linger in the consumer and keep loading. CLAUDE.md is exempt: the
// sentinel block owns it, not the manifest.
function pruneStaleFiles(projectRoot, previous, installedFiles) {
  if (previous === null) return [];

  const current = new Set(installedFiles);
  const pruned = [];

  for (const relPath of previous.files || []) {
    if (relPath === "CLAUDE.md") continue;
    if (current.has(relPath)) continue;
    if (!isManagedPath(projectRoot, relPath)) continue;

    fs.rmSync(path.resolve(projectRoot, relPath), { force: true });
    removeEmptyParents(projectRoot, relPath);
    pruned.push(relPath);
  }

  return pruned;
}

function sameInstall(a, b) {
  return a.package === b.package
    && a.version === b.version
    && JSON.stringify(a.files) === JSON.stringify(b.files);
}

function writeManifest(projectRoot, previous, installedFiles) {
  const manifest = {
    package: PACKAGE_NAME,
    version: packageVersion(),
    installedAt: new Date().toISOString(),
    files: [...installedFiles].sort(),
  };

  // Carry the old timestamp forward when the install is unchanged, so a repeat
  // install leaves the consumer's tree byte-identical instead of dirtying it.
  if (previous !== null && sameInstall(previous, manifest)) {
    manifest.installedAt = previous.installedAt;
  }

  const manifestDir = path.join(projectRoot, ".claude");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
}

function main() {
  const projectRoot = findProjectRoot();
  if (projectRoot === null) {
    console.log(`${PACKAGE_NAME}: running inside the package itself, nothing to install`);
    return;
  }

  const previous = readManifest(projectRoot);
  const installedFiles = [];

  installSkills(projectRoot, installedFiles);
  installRules(projectRoot, installedFiles);
  const pruned = pruneStaleFiles(projectRoot, previous, installedFiles);
  writeManifest(projectRoot, previous, installedFiles);

  const prunedNote = pruned.length > 0 ? `, pruned ${pruned.length}` : "";
  console.log(`${PACKAGE_NAME}: installed ${installedFiles.length} file(s)${prunedNote}`);
}

// An explicit uninstall should fail loudly, so it runs outside the try/catch
// that keeps a broken install from failing a consumer's npm install.
if (process.argv[2] === "uninstall") {
  require("./uninstall.js");
} else {
  try {
    main();
  } catch (error) {
    console.warn(`${PACKAGE_NAME}: postinstall warning: ${error.message}`);
  }
}
