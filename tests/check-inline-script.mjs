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
const hdPetIds = ["alien","totoro","fox","hedgehog","rabbit","hamster","shiba","cat","panda","penguin","capybara","flyingsquirrel"];
if (!inlineScripts[0].includes('assets/pets/\u0024{chosen.id}.webp') &&
    !inlineScripts[0].includes('assets/pets/')) {
  throw new Error("Pet avatar renderer must load an individual WebP image for each pet");
}
hdPetIds.forEach((id) => {
  const image = fs.readFileSync(new URL(`../assets/pets/${id}.webp`, import.meta.url));
  if (image.length < 5000 ||
      image.toString("ascii", 0, 4) !== "RIFF" ||
      image.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("Pet image must be a valid standalone WebP asset: " + id);
  }
});

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

const clearDevices = inlineScripts[0].match(/async function adminClearAllDevices\(\)\{[\s\S]*?\n\}/);
if (!clearDevices) throw new Error("Could not locate the clear-all-devices action");
if (!clearDevices[0].includes('collection("devices").get()') ||
    !clearDevices[0].includes('collection("revokedDevices").get()') ||
    clearDevices[0].includes('students:[]') ||
    clearDevices[0].includes('collection("studentDirectory")') ||
    clearDevices[0].includes('collection("transactions")') ||
    !clearDevices[0].includes('deviceResetPending:true')) {
  throw new Error("Clear-all-devices must remove device bindings only and preserve roster, balances, pets, and ledgers");
}
const bindingFunction = inlineScripts[0].match(/async function sparkBindStudent\(studentId,allowAuthRefresh=true\)\{[\\s\\S]*?\n\}/);
if (!bindingFunction ||
    !bindingFunction[0].includes("firestoreDb.runTransaction") ||
    !bindingFunction[0].includes("tx.get(revoked)") ||
    !bindingFunction[0].includes("tx.get(device)") ||
    !bindingFunction[0].includes("tx.set(device") ||
    !bindingFunction[0].includes("return sparkBindStudent(studentId,false)") ||
    bindingFunction[0].includes("await device.get()")) {
  throw new Error("Student device binding must atomically check revocation and switch shared devices, with only one auth refresh retry");
}
const confirmLogin = inlineScripts[0].match(/async function confirmStudentSelection\(\)\{[\\s\\S]*?\n\}/);
if (!confirmLogin ||
    !confirmLogin[0].includes("studentLoginInProgress") ||
    !confirmLogin[0].includes('button.disabled=true') ||
    !confirmLogin[0].includes('select.disabled=true')) {
  throw new Error("Student name selection must prevent repeated submissions while login is running");
}
const enterStudent = inlineScripts[0].match(/async function enterLockedStudentMode\(id,silent=false\)\{[\\s\\S]*?\n\}/);
if (!enterStudent ||
    !enterStudent[0].includes("Promise.all([sparkAccountRef(id).get(),classroomRef().get()])") ||
    !enterStudent[0].includes("sparkLoadTransactions(id).then") ||
    enterStudent[0].indexOf("openPetWizard(false)") > enterStudent[0].indexOf("sparkLoadTransactions(id).then")) {
  throw new Error("Student pet selection must open after essential account reads without waiting for transaction history");
}
if (inlineScripts[0].includes("這不一定代表已有其他裝置登入")) {
  throw new Error("A generic Firebase permission error must not be described as another device binding");
}
console.log("Inline JavaScript, balance guards, 36 wishes, pet-image routing, premium activities, and safe device reset: OK");
