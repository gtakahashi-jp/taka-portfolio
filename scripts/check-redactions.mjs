import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const MAP_PATH = "_private/redaction-map.json";

function fail(msg) {
  console.error("\n  ✖ REDACTION CHECK FAILED\n");
  console.error("  " + msg + "\n");
  process.exit(1);
}

let map;
try {
  map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
} catch {
  fail(`Cannot read ${MAP_PATH}. Safety net is down — blocking commit (fail-closed).`);
}

const rules = (map.redactions || []).filter(
  (r) => r.real && !r.real.startsWith("PUT_")
);
if (rules.length === 0) {
  fail("Redaction map has no active rules — blocking commit (fail-closed).");
}

let staged = [];
try {
  staged = execSync("git diff --cached --name-only --diff-filter=ACM", {
    encoding: "utf8",
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
} catch {
  fail("Could not read staged files from git.");
}

const hits = [];
for (const file of staged) {
  let content;
  try {
    content = execSync(`git show :"${file}"`, { encoding: "utf8" });
  } catch {
    continue;
  }
  const lines = content.split("\n");
  for (const rule of rules) {
    lines.forEach((line, i) => {
      if (line.includes(rule.real)) {
        hits.push({ file, line: i + 1, real: rule.real, placeholder: rule.placeholder });
      }
    });
  }
}

if (hits.length > 0) {
  console.error("\n  ✖ REDACTION CHECK FAILED — real strings found in staged content:\n");
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  "${h.real}"  →  use "${h.placeholder}"`);
  }
  console.error("\n  Fix these, re-stage, and commit again.\n");
  process.exit(1);
}

console.log("  ✔ Redaction check passed — no real strings in staged content.");
process.exit(0);