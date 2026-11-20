import fs from "node:fs";
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";

const PROJECT_ID = "demo-econ-pet";
const RULES = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
let env;

const teacherClaims = {
  email: "mariannamangyh@gmail.com",
  email_verified: true,
  firebase: { sign_in_provider: "password" }
};
const anonClaims = { firebase: { sign_in_provider: "anonymous" } };

function studentDb(uid = "student-uid") {
  return env.authenticatedContext(uid, anonClaims).firestore();
}
function teacherDb() {
  return env.authenticatedContext("teacher-uid", teacherClaims).firestore();
}
function account(db, id = "stu-a") {
  return doc(db, "studentAccounts", id);
}
function ledger(db, id = "stu-a", txId = "tx-1") {
  return doc(db, "studentAccounts", id, "transactions", txId);
}
async function seedAccount(id = "stu-a", values = {}) {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "studentAccounts", id), {
      studentId: id,
      earnedScore: 30,
      spentScore: 0,
      legacySpendNeedsReview: false,
      migrationVersion: 1,
      boundUid: null,
      lastTransactionId: null,
      updatedAt: serverTimestamp(),
      ...values
    });
  });
}
async function bind(uid = "student-uid", studentId = "stu-a") {
  const db = studentDb(uid);
  await setDoc(doc(db, "devices", uid), {
    studentId,
    boundAt: serverTimestamp()
  });
}
async function spend({ uid = "student-uid", studentId = "stu-a", txId = "tx-1", action = "feed", amount = 5 } = {}) {
  const db = studentDb(uid);
  const accountRef = account(db, studentId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(accountRef);
    const data = snapshot.data();
    transaction.update(accountRef, {
      spentScore: data.spentScore + amount,
      lastTransactionId: txId,
      updatedAt: serverTimestamp()
    });
    transaction.set(ledger(db, studentId, txId), {
      studentId,
      uid,
      action,
      amount,
      reason: "test spend",
      createdAt: serverTimestamp()
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: "127.0.0.1", port: 8080, rules: RULES }
  });
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await env.cleanup();
});

test("unbound anonymous users cannot read the classroom roster; bound students can", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "classrooms", "economic-pet-academy"), {
      students: [{ id: "stu-a", name: "Student A" }]
    });
  });
  const db = studentDb();
  await assertFails(getDoc(doc(db, "classrooms", "economic-pet-academy")));
  await seedAccount();
  await bind();
  await assertSucceeds(getDoc(doc(db, "classrooms", "economic-pet-academy")));
  await assertFails(updateDoc(doc(db, "classrooms", "economic-pet-academy"), { students: [] }));
});

test("anonymous students can read names-only directory but cannot change it", async () => {
  const admin = teacherDb();
  await setDoc(doc(admin, "studentDirectory", "stu-a"), {
    name: "Student A", updatedAt: serverTimestamp()
  });
  const anonymous = studentDb();
  const names = await assertSucceeds(getDocs(collection(anonymous, "studentDirectory")));
  assert.deepEqual(names.docs.map(x => x.data().name), ["Student A"]);
  await assertFails(setDoc(doc(anonymous, "studentDirectory", "stu-b"), {
    name: "Student B", updatedAt: serverTimestamp()
  }));
  await assertFails(getDoc(doc(anonymous, "classrooms", "economic-pet-academy")));
});

test("anonymous students cannot list private student invitation records", async () => {
  await seedAccount();
  const admin = teacherDb();
  await setDoc(doc(admin, "studentInvites", "high-entropy-random-id"), {
    studentId: "stu-a", createdAt: serverTimestamp()
  });
  await assertFails(getDocs(collection(studentDb(), "studentInvites")));
  await assertSucceeds(getDoc(doc(studentDb(), "studentInvites", "high-entropy-random-id")));
});

test("teacher can create and manage student accounts", async () => {
  const db = teacherDb();
  await assertSucceeds(setDoc(account(db), {
    studentId: "stu-a", earnedScore: 20, spentScore: 0,
    boundUid: null, lastTransactionId: null
  }));
  await assertSucceeds(updateDoc(account(db), { earnedScore: 25 }));
});

test("a device can bind to a student without making the student exclusive to that device", async () => {
  await seedAccount();
  await assertSucceeds(bind());
  const db = studentDb();
  assert.equal((await getDoc(account(db))).data().boundUid, null);
  assert.equal((await getDoc(doc(db, "devices", "student-uid"))).data().studentId, "stu-a");
});

test("a confirmed name selection can claim the selected student on this device", async () => {
  await seedAccount();
  await assertSucceeds(bind());
  assert.equal((await getDoc(account(studentDb()))).data().boundUid, null);
  assert.equal((await getDoc(doc(studentDb(), "devices", "student-uid"))).data().studentId, "stu-a");
});

test("student device binding is paused while the teacher resets all devices", async () => {
  await seedAccount();
  const admin = teacherDb();
  await setDoc(doc(admin, "classrooms", "economic-pet-academy"), { deviceResetPending: true });
  await assertFails(bind());
  await updateDoc(doc(admin, "classrooms", "economic-pet-academy"), { deviceResetPending: false });
  await assertSucceeds(bind());
});

test("account without migration metadata cannot be bound", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "studentAccounts", "stu-a"), {
      studentId: "stu-a", earnedScore: 30, spentScore: 0,
      boundUid: null, lastTransactionId: null
    });
  });
  await assertFails(bind());
});



test("student cannot bind until teacher reconciles a legacy balance", async () => {
  await seedAccount("stu-a", { legacySpendNeedsReview: true });
  await assertFails(bind());
  await assertSucceeds(updateDoc(account(teacherDb()), { legacySpendNeedsReview: false }));
  await assertSucceeds(bind());
});

test("student cannot spend after a teacher flags the balance for review", async () => {
  await seedAccount();
  await bind();
  await assertSucceeds(updateDoc(account(teacherDb()), { legacySpendNeedsReview: true }));
  await assertFails(spend());
  assert.equal((await getDoc(account(teacherDb()))).data().spentScore, 0);
});

test("the same shared device can switch between different student accounts", async () => {
  await seedAccount("stu-a");
  await seedAccount("stu-b");
  await bind("student-uid", "stu-a");
  await assertSucceeds(bind("student-uid", "stu-b"));
  const db = studentDb();
  assert.equal((await getDoc(doc(db, "devices", "student-uid"))).data().studentId, "stu-b");
  await assertSucceeds(getDoc(account(db, "stu-b")));
  await assertFails(getDoc(account(db, "stu-a")));
});

test("one student can sign in from multiple different devices", async () => {
  await seedAccount("stu-a");
  await assertSucceeds(bind("device-one", "stu-a"));
  await assertSucceeds(bind("device-two", "stu-a"));
  assert.equal((await getDoc(doc(studentDb("device-one"), "devices", "device-one"))).data().studentId, "stu-a");
  assert.equal((await getDoc(doc(studentDb("device-two"), "devices", "device-two"))).data().studentId, "stu-a");
  assert.equal((await getDoc(account(teacherDb(), "stu-a"))).data().boundUid, null);
});

test("student can atomically spend an allowed amount and create its ledger record", async () => {
  await seedAccount();
  await bind();
  await assertSucceeds(spend());
  const db = studentDb();
  assert.equal((await getDoc(account(db))).data().spentScore, 5);
  assert.equal((await getDoc(ledger(db))).data().amount, 5);
});

test("student cannot spend more than the available balance", async () => {
  await seedAccount("stu-a", { earnedScore: 4 });
  await bind();
  await assertFails(spend({ amount: 5 }));
});

test("bound student can save pet profile fields and teacher can read them", async () => {
  await seedAccount("stu-a");
  await bind();
  const db = studentDb();
  await assertSucceeds(updateDoc(account(db), {
    petCreated: true, petId: "fox",
    conceptZH: "機會成本", conceptEN: "Opportunity Cost",
    adjZH: "精明的", adjEN: "Savvy",
    hunger: 72, cleanliness: 65, happiness: 90,
    habitat: "meadow", wishId: "w5", fulfilledCount: 2,
    companionPetId: "penguin", outfitId: "star-cape",
    adventureCount: 1, birthdayPartyCount: 2, photoCount: 4,
    profileUpdatedAt: serverTimestamp()
  }));
  const saved = (await getDoc(account(teacherDb()))).data();
  assert.equal(saved.petCreated, true);
  assert.equal(saved.petId, "fox");
  assert.equal(saved.hunger, 72);
  assert.equal(saved.fulfilledCount, 2);
  assert.equal(saved.companionPetId, "penguin");
  assert.equal(saved.outfitId, "star-cape");
  assert.equal(saved.adventureCount, 1);
  assert.equal(saved.birthdayPartyCount, 2);
  assert.equal(saved.photoCount, 4);
});

test("student profile writes cannot change scores or another student's account", async () => {
  await seedAccount("stu-a");
  await seedAccount("stu-b");
  await bind();
  const db = studentDb();
  await assertFails(updateDoc(account(db), {
    petCreated: true, petId: "fox", earnedScore: 999,
    conceptZH: "", conceptEN: "", adjZH: "", adjEN: "",
    hunger: 50, cleanliness: 50, happiness: 50,
    habitat: "meadow", wishId: "w5", fulfilledCount: 0,
    companionPetId: "penguin", outfitId: "star-cape",
    adventureCount: 0, birthdayPartyCount: 0, photoCount: 0,
    profileUpdatedAt: serverTimestamp()
  }));
  await assertFails(getDoc(account(db, "stu-b")));
  await assertFails(updateDoc(account(db, "stu-b"), {petCreated: true, petId: "fox"}));
});

test("student cannot write invalid premium pet profile values", async () => {
  await seedAccount("stu-a");
  await bind();
  const db = studentDb();
  await assertFails(updateDoc(account(db), {
    petCreated: true, petId: "fox",
    conceptZH: "機會成本", conceptEN: "Opportunity Cost",
    adjZH: "精明的", adjEN: "Savvy",
    hunger: 50, cleanliness: 50, happiness: 50,
    habitat: "meadow", wishId: "w5", fulfilledCount: 0,
    companionPetId: { invalid: true }, outfitId: "star-cape",
    adventureCount: -1, birthdayPartyCount: 0, photoCount: 0,
    profileUpdatedAt: serverTimestamp()
  }));
});

test("student cannot forge earned score or change another account", async () => {
  await seedAccount("stu-a");
  await seedAccount("stu-b");
  await bind();
  const db = studentDb();
  await assertFails(updateDoc(account(db), { earnedScore: 999 }));
  await assertFails(getDoc(account(db, "stu-b")));
});

test("invalid action amount and ledger-only writes are rejected", async () => {
  await seedAccount();
  await bind();
  const db = studentDb();
  await assertFails(spend({ action: "feed", amount: 999 }));
  await assertFails(setDoc(ledger(db), {
    studentId: "stu-a", uid: "student-uid", action: "feed",
    amount: 5, reason: "forged", createdAt: serverTimestamp()
  }));
});

test("transaction records cannot be edited or deleted by students", async () => {
  await seedAccount();
  await bind();
  await spend();
  const db = studentDb();
  await assertFails(updateDoc(ledger(db), { amount: 1 }));
  await assertFails(deleteDoc(ledger(db)));
});

test("students cannot forge legacy migration ledger entries", async () => {
  await seedAccount();
  await bind();
  const db = studentDb();
  await assertFails(setDoc(ledger(db, "stu-a", "legacy_0001"), {
    studentId: "stu-a", uid: "legacy-import", action: "legacy_import",
    amount: 10, reason: "forged import", createdAt: serverTimestamp()
  }));
});

test("teacher can append imported legacy spend history", async () => {
  await seedAccount("stu-a", { spentScore: 10 });
  const db = teacherDb();
  await assertSucceeds(setDoc(ledger(db, "stu-a", "legacy_0001"), {
    studentId: "stu-a", uid: "legacy-import", action: "legacy_import",
    amount: 10, reason: "舊版紀錄匯入：餵食寵物", createdAt: serverTimestamp()
  }));
  assert.equal((await getDoc(ledger(db, "stu-a", "legacy_0001"))).data().amount, 10);
});

test("student cannot read another device binding", async () => {
  await seedAccount();
  await bind("student-uid", "stu-a");
  await assertFails(getDoc(doc(studentDb(), "devices", "other-uid")));
});

test("a revoked device cannot bind again", async () => {
  await seedAccount("stu-a");
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "revokedDevices", "student-uid"), {
      studentId: "stu-a"
    });
  });
  await assertFails(bind());
});

test("teacher can read spend history and student cannot read another student's history", async () => {
  await seedAccount("stu-a");
  await seedAccount("stu-b");
  await bind("student-uid", "stu-a");
  await spend();
  await assertSucceeds(getDocs(collection(teacherDb(), "studentAccounts", "stu-a", "transactions")));
  await assertFails(getDocs(collection(studentDb(), "studentAccounts", "stu-b", "transactions")));
});

test("students cannot create their own account or write another device's binding", async () => {
  await seedAccount();
  const db = studentDb();
  await assertFails(setDoc(account(db), {
    studentId: "stu-a", earnedScore: 500, spentScore: 0,
    boundUid: "student-uid", lastTransactionId: null
  }));
  await assertFails(updateDoc(account(db), { boundUid: "student-uid" }));
  await assertFails(setDoc(doc(db, "devices", "other-uid"), {
    studentId: "stu-a", boundAt: serverTimestamp()
  }));
});

test("a second anonymous UID can also sign in to the same student", async () => {
  await seedAccount();
  await assertSucceeds(bind("first-uid", "stu-a"));
  await assertSucceeds(bind("second-uid", "stu-a"));
  assert.equal((await getDoc(account(teacherDb()))).data().boundUid, null);
});

test("transaction IDs cannot be replayed", async () => {
  await seedAccount();
  await bind();
  await assertSucceeds(spend({ txId: "same-id", amount: 5 }));
  await assertFails(spend({ txId: "same-id", amount: 5 }));
  assert.equal((await getDoc(account(studentDb()))).data().spentScore, 5);
});

test("concurrent spends cannot exceed the available balance", async () => {
  await seedAccount("stu-a", { earnedScore: 30 });
  await bind();
  const results = await Promise.allSettled([
    spend({ txId: "parallel-a", action: "wish", amount: 25 }),
    spend({ txId: "parallel-b", action: "wish", amount: 25 })
  ]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(results.filter(x => x.status === "rejected").length, 1);
  assert.equal((await getDoc(account(studentDb()))).data().spentScore, 25);
});

test("teacher can revoke one device while another device can still access the same student", async () => {
  await seedAccount();
  await bind("old-uid", "stu-a");
  await bind("other-uid", "stu-a");
  const admin = teacherDb();
  const batch = writeBatch(admin);
  batch.set(doc(admin, "revokedDevices", "old-uid"), {
    studentId: "stu-a", revokedAt: serverTimestamp()
  });
  batch.delete(doc(admin, "devices", "old-uid"));
  batch.update(account(admin), { boundUid: null });
  await assertSucceeds(batch.commit());

  await assertFails(getDoc(account(studentDb("old-uid"))));
  await assertSucceeds(getDoc(account(studentDb("other-uid"))));
  await assertSucceeds(bind("new-uid", "stu-a"));
  assert.equal((await getDoc(account(admin))).data().boundUid, null);
});

