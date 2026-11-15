const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const REGION = "australia-southeast1";
const CLASSROOM_PATH = "classrooms/economic-pet-academy";
const TEACHER_EMAIL = "mariannamangyh@gmail.com";

function requireAnonymous(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入學生帳號。");
  if (request.auth.token.firebase?.sign_in_provider !== "anonymous") {
    throw new HttpsError("permission-denied", "此操作只供學生帳號使用。");
  }
}

function requireTeacher(request) {
  const token = request.auth?.token;
  if (!token || String(token.email || "").toLowerCase() !== TEACHER_EMAIL ||
      token.email_verified !== true || token.firebase?.sign_in_provider !== "password") {
    throw new HttpsError("permission-denied", "只有已驗證的老師可以執行此操作。");
  }
}

function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function deviceRef(uid) {
  return db.collection("devices").doc(uid);
}
function accountRef(studentId) {
  return db.collection("studentAccounts").doc(studentId);
}
function classroomRef() {
  return db.doc(CLASSROOM_PATH);
}

exports.bindStudent = onCall({ region: REGION, enforceAppCheck: false }, async (request) => {
  requireAnonymous(request);
  const studentId = request.data?.studentId;
  if (!validId(studentId)) throw new HttpsError("invalid-argument", "學生資料不正確。");
  const uid = request.auth.uid;
  const dRef = deviceRef(uid);
  const aRef = accountRef(studentId);
  const cRef = classroomRef();

  return db.runTransaction(async (tx) => {
    const [deviceSnap, accountSnap, classroomSnap] = await Promise.all([
      tx.get(dRef), tx.get(aRef), tx.get(cRef)
    ]);
    if (!classroomSnap.exists) throw new HttpsError("failed-precondition", "班級資料尚未建立。");
    const students = Array.isArray(classroomSnap.get("students")) ? classroomSnap.get("students") : [];
    const student = students.find((item) => item && item.id === studentId);
    if (!student) throw new HttpsError("not-found", "找不到這位學生，請先聯絡老師。");

    if (deviceSnap.exists && deviceSnap.get("studentId") !== studentId) {
      throw new HttpsError("already-exists", "這部裝置已綁定其他學生，請聯絡老師協助。");
    }
    if (accountSnap.exists && accountSnap.get("boundUid") && accountSnap.get("boundUid") !== uid) {
      throw new HttpsError("already-exists", "這位學生已綁定另一部裝置，請老師先解除舊裝置。");
    }

    if (!accountSnap.exists) {
      // Legacy local spending is deliberately NOT imported: it was client-controlled
      // and cannot be treated as an authoritative cloud ledger.
      tx.create(aRef, {
        studentId,
        earnedScore: Math.max(0, Number(student.score) || 0),
        spentScore: 0,
        availableScore: Math.max(0, Number(student.score) || 0),
        boundUid: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      tx.set(aRef, { boundUid: uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.set(dRef, {
      studentId,
      boundAt: deviceSnap.exists ? deviceSnap.get("boundAt") : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return {
      studentId,
      earnedScore: accountSnap.exists ? Number(accountSnap.get("earnedScore")) || 0 : Math.max(0, Number(student.score) || 0),
      spentScore: accountSnap.exists ? Number(accountSnap.get("spentScore")) || 0 : 0,
      availableScore: accountSnap.exists ? Math.max(0, (Number(accountSnap.get("earnedScore")) || 0) - (Number(accountSnap.get("spentScore")) || 0)) : Math.max(0, Number(student.score) || 0)
    };
  });
});

exports.spendPoints = onCall({ region: REGION, enforceAppCheck: false }, async (request) => {
  requireAnonymous(request);
  const amount = Number(request.data?.amount);
  const reason = typeof request.data?.reason === "string" ? request.data.reason.trim().slice(0, 120) : "";
  const requestId = request.data?.requestId;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100 ||
      !reason || !validId(requestId)) {
    throw new HttpsError("invalid-argument", "消費資料不正確。");
  }
  const uid = request.auth.uid;
  const dRef = deviceRef(uid);
  const txResult = await db.runTransaction(async (tx) => {
    const deviceSnap = await tx.get(dRef);
    if (!deviceSnap.exists || !deviceSnap.get("studentId")) {
      throw new HttpsError("failed-precondition", "此裝置尚未綁定學生。");
    }
    const studentId = deviceSnap.get("studentId");
    const aRef = accountRef(studentId);
    const ledgerRef = aRef.collection("transactions").doc(requestId);
    const [accountSnap, priorSnap] = await Promise.all([tx.get(aRef), tx.get(ledgerRef)]);
    if (!accountSnap.exists || accountSnap.get("boundUid") !== uid) {
      throw new HttpsError("permission-denied", "學生裝置綁定無效，請聯絡老師。");
    }
    if (priorSnap.exists) {
      return {
        duplicate: true,
        studentId,
        earnedScore: Number(accountSnap.get("earnedScore")) || 0,
        spentScore: Number(accountSnap.get("spentScore")) || 0,
        availableScore: Math.max(0, (Number(accountSnap.get("earnedScore")) || 0) - (Number(accountSnap.get("spentScore")) || 0))
      };
    }
    const earnedScore = Math.max(0, Number(accountSnap.get("earnedScore")) || 0);
    const spentScore = Math.max(0, Number(accountSnap.get("spentScore")) || 0);
    const availableScore = Math.max(0, earnedScore - spentScore);
    if (availableScore < amount) {
      throw new HttpsError("failed-precondition", "可用積分不足。", { availableScore, required: amount });
    }
    const nextSpent = spentScore + amount;
    const nextAvailable = earnedScore - nextSpent;
    tx.update(aRef, {
      spentScore: nextSpent,
      availableScore: nextAvailable,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.create(ledgerRef, {
      type: "spend",
      amount,
      delta: -amount,
      reason,
      requestId,
      uid,
      createdAt: FieldValue.serverTimestamp()
    });
    return { duplicate: false, studentId, earnedScore, spentScore: nextSpent, availableScore: nextAvailable };
  });
  return txResult;
});

exports.adjustStudentScore = onCall({ region: REGION }, async (request) => {
  requireTeacher(request);
  const studentId = request.data?.studentId;
  const delta = Number(request.data?.delta);
  const reason = typeof request.data?.reason === "string" ? request.data.reason.trim().slice(0, 120) : "老師評分";
  if (!validId(studentId) || !Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1000) {
    throw new HttpsError("invalid-argument", "加減分資料不正確。");
  }
  const cRef = classroomRef();
  const aRef = accountRef(studentId);
  const ledgerRef = aRef.collection("transactions").doc();
  return db.runTransaction(async (tx) => {
    const [classSnap, accountSnap] = await Promise.all([tx.get(cRef), tx.get(aRef)]);
    if (!classSnap.exists) throw new HttpsError("failed-precondition", "班級資料尚未建立。");
    const students = Array.isArray(classSnap.get("students")) ? classSnap.get("students") : [];
    const index = students.findIndex((item) => item && item.id === studentId);
    if (index < 0) throw new HttpsError("not-found", "找不到這位學生。");
    const student = { ...students[index] };
    const earned = accountSnap.exists ? Math.max(0, Number(accountSnap.get("earnedScore")) || 0) : Math.max(0, Number(student.score) || 0);
    const spent = accountSnap.exists ? Math.max(0, Number(accountSnap.get("spentScore")) || 0) : 0;
    const nextEarned = Math.max(0, earned + delta);
    const nextAvailable = Math.max(0, nextEarned - spent);
    student.score = nextEarned;
    students[index] = student;
    tx.set(aRef, {
      studentId,
      earnedScore: nextEarned,
      spentScore: spent,
      availableScore: nextAvailable,
      ...(accountSnap.exists ? {} : { boundUid: null, createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.update(cRef, {
      students,
      logs: FieldValue.arrayUnion({
        id: "server_" + ledgerRef.id,
        studentId,
        studentName: student.name || "",
        delta,
        reason,
        time: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })
      }),
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.create(ledgerRef, {
      type: "teacher_adjustment",
      amount: Math.abs(delta),
      delta,
      reason,
      createdAt: FieldValue.serverTimestamp(),
      actorUid: request.auth.uid
    });
    return { studentId, earnedScore: nextEarned, spentScore: spent, availableScore: nextAvailable };
  });
});

exports.unbindStudentDevice = onCall({ region: REGION }, async (request) => {
  requireTeacher(request);
  const studentId = request.data?.studentId;
  if (!validId(studentId)) throw new HttpsError("invalid-argument", "學生資料不正確。");
  const aRef = accountRef(studentId);
  return db.runTransaction(async (tx) => {
    const accountSnap = await tx.get(aRef);
    if (!accountSnap.exists || !accountSnap.get("boundUid")) {
      return { studentId, unbound: false };
    }
    const uid = accountSnap.get("boundUid");
    const dRef = deviceRef(uid);
    const deviceSnap = await tx.get(dRef);
    tx.update(aRef, { boundUid: null, updatedAt: FieldValue.serverTimestamp() });
    if (deviceSnap.exists && deviceSnap.get("studentId") === studentId) tx.delete(dRef);
    return { studentId, unbound: true };
  });
});
