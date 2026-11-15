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
// A cached Firestore document must not overwrite a more recent server balance.
const snapshotGuard = inlineScripts[0].match(/function sparkShouldApplyServerAccountSnapshot\(snapshot\)\{[\s\S]*?\n\}/);
if (!snapshotGuard) {
  throw new Error("Could not locate the account snapshot freshness guard");
}
const snapshotSandbox = {};
vm.runInNewContext(snapshotGuard[0], snapshotSandbox);
if (snapshotSandbox.sparkShouldApplyServerAccountSnapshot({ metadata: { fromCache: true } }) !== false) {
  throw new Error("Cached account snapshots must be ignored");
}
if (snapshotSandbox.sparkShouldApplyServerAccountSnapshot({ metadata: { fromCache: false } }) !== true) {
  throw new Error("Server-confirmed account snapshots must be applied");
}

// A classroom roster update must not overwrite the active student's balance;
// the account listener is the single source of truth for these values.
const mergeFunction = inlineScripts[0].match(/function mergeCloudState\(data\)\{[\s\S]*?\n\}/);
if (!mergeFunction) {
  throw new Error("Could not locate mergeCloudState for balance regression check");
}
const mergeSandbox = {
  appState: { students: [{ id: "stu-a", name: "Student A", score: 18, spentScore: 3, happiness: 80 }], logs: [] },
  legacySpendSnapshots: new Map(),
  currentRole: "student",
  lockedStudentId: "stu-a",
  saveLocalStateOnly() {},
  renderStudentRoom() {},
  renderLandingRoster() {},
  renderTeacherAdmin() {},
  switchView() {}
};
vm.runInNewContext(mergeFunction[0], mergeSandbox);
mergeSandbox.mergeCloudState({
  students: [{ id: "stu-a", name: "Student A", score: 10, happiness: 40 }],
  logs: []
});
if (mergeSandbox.appState.students[0].score !== 18 || mergeSandbox.appState.students[0].spentScore !== 3) {
  throw new Error("A classroom roster snapshot rolled back the student's account balance");
}
if (mergeSandbox.appState.students[0].happiness !== 80) {
  throw new Error("Existing pet state should continue to be preserved during roster merge");
}
const wishFunction = inlineScripts[0].match(/async function rollNewPetRequest\(\)\{[\s\S]*?\n\}/);
if (!wishFunction || !/await persistState\(\)/.test(wishFunction[0])) {
  throw new Error("Wish refresh must await its cloud save");
}
console.log("Inline application JavaScript syntax, roster readiness, and balance freshness regressions: OK");
