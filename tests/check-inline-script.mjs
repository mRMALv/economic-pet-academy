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
const balanceMergeFunction = inlineScripts[0].match(/function sparkPreserveActiveStudentBalance\(remote,local,role,studentId\)\{[\s\S]*?\n\}/);
if (!balanceMergeFunction) {
  throw new Error("Could not locate the active-student balance merge helper");
}
const mergeSandbox = {};
vm.runInNewContext(balanceMergeFunction[0], mergeSandbox);
const mergedBalance = mergeSandbox.sparkPreserveActiveStudentBalance(
  { id: "stu-a", name: "Student A", score: 10 },
  { id: "stu-a", score: 18, spentScore: 3 },
  "student",
  "stu-a"
);
if (mergedBalance.score !== 18 || mergedBalance.spentScore !== 3) {
  throw new Error("A classroom roster snapshot rolled back the student's account balance");
}
const unchangedBalance = mergeSandbox.sparkPreserveActiveStudentBalance(
  { id: "stu-b", score: 10 },
  { id: "stu-b", score: 18, spentScore: 3 },
  "student",
  "stu-a"
);
if (unchangedBalance.score !== 10 || unchangedBalance.spentScore !== undefined) {
  throw new Error("A student session must not override another student's roster fields");
}
const wishFunction = inlineScripts[0].match(/async function rollNewPetRequest\(\)\{[\s\S]*?\n\}/);
if (!wishFunction || !/await persistState\(\)/.test(wishFunction[0])) {
  throw new Error("Wish refresh must await its cloud save");
}

const wishPoolMatch = inlineScripts[0].match(/const WISH_POOL=(\[[\s\S]*?\]);/);
if (!wishPoolMatch) throw new Error("Could not locate WISH_POOL");
const wishPool = vm.runInNewContext("(" + wishPoolMatch[1] + ")");
if (wishPool.length < 30 || new Set(wishPool.map((wish) => wish.id)).size !== wishPool.length) {
  throw new Error("Wish pool must contain at least 30 wishes with unique IDs");
}
if (wishPool.some((wish) => !Number.isInteger(wish.req) || wish.req < 1 || !wish.zh || !wish.en)) {
  throw new Error("Every wish must have bilingual titles and a positive integer point cost");
}
if (!inlineScripts[0].includes('src="assets/pets/pet-sprite.jpg"')) {
  throw new Error("Pet avatar renderer must load the shared pet sprite sheet");
}
const spriteMapMatch = inlineScripts[0].match(/const PET_SPRITE_POSITIONS=(\{[\s\S]*?\});/);
if (!spriteMapMatch) throw new Error("Could not locate pet sprite positions");
const spriteMap = vm.runInNewContext("(" + spriteMapMatch[1] + ")");
const spriteIds = ["alien","totoro","flyingsquirrel","fox","hedgehog","rabbit","hamster","shiba","cat","panda","penguin","capybara"];
const spriteCells = new Set();
spriteIds.forEach((id,index) => {
  const position = spriteMap[id];
  if (!Array.isArray(position) || position[0] !== index % 4 || position[1] !== Math.floor(index / 4)) {
    throw new Error("Pet sprite position is missing or incorrect for " + id);
  }
  spriteCells.add(position.join(":"));
});
if (spriteCells.size !== 12 || Object.keys(spriteMap).length !== 12) {
  throw new Error("Every pet must use one unique sprite cell");
}
if (!inlineScripts[0].includes('id:"alien",nameZH:"三眼仔"') ||
    !inlineScripts[0].includes('id:"flyingsquirrel",nameZH:"飛鼠"')) {
  throw new Error("Three-Eyed Alien and Flying Squirrel species must remain available");
}
const premiumActions = inlineScripts[0].match(/const PREMIUM_INTERACTIONS=(\[[\s\S]*?\]);/);
if (!premiumActions || vm.runInNewContext("(" + premiumActions[1] + ")").length < 4 ||
    !/async function completePremiumInteraction\(action\)[\s\S]*?await sparkSpend\(/.test(inlineScripts[0])) {
  throw new Error("Premium activities must use the transactional spend ledger");
}

console.log("Inline JavaScript, balance guards, 36 wishes, pet-image routing, and premium activities: OK");
