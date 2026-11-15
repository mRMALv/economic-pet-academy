import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]))
  .map((match) => match[2])
  .filter((source) => source.trim().length > 0);

if (inlineScripts.length !== 1) {
  throw new Error("Expected exactly one inline application script; found " + inlineScripts.length);
}

new vm.Script(inlineScripts[0], { filename: "index.html inline application script" });

// Regression coverage: public roster writes must preserve readiness when the
// private migration fields have intentionally been removed.
const rosterFunction = inlineScripts[0].match(/function sparkPublicRoster\(students\)\{[\s\S]*?\n\}/);
if (!rosterFunction) {
  throw new Error("Could not locate sparkPublicRoster for regression check");
}
const rosterSandbox = {};
vm.runInNewContext(rosterFunction[0], rosterSandbox);
const roster = rosterSandbox.sparkPublicRoster([
  { id: "ready-public", pointsReady: true, score: 5 },
  { id: "ready-private", migrationVersion: 1, legacySpendNeedsReview: false, score: 3 },
  { id: "needs-review", migrationVersion: 1, legacySpendNeedsReview: true, pointsReady: true }
]);
if (roster[0].pointsReady !== true || roster[1].pointsReady !== true || roster[2].pointsReady !== false) {
  throw new Error("Student pointsReady status was not preserved or derived correctly");
}
if ("migrationVersion" in roster[1] || "legacySpendNeedsReview" in roster[1]) {
  throw new Error("Private migration metadata leaked into the public roster");
}
console.log("Inline application JavaScript syntax and roster-readiness regression: OK");
