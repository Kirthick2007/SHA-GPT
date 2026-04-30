const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "backend", "firebase-service-account.json");

let db = null;
let firebaseError = null;

function initializeFirebase() {
  if (db) return db;

  try {
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      throw new Error("Firebase service account file not found");
    }

    const serviceAccount = require(SERVICE_ACCOUNT_PATH);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    db = admin.firestore();
    return db;
  } catch (error) {
    firebaseError = error;
    console.warn(`Firebase disabled: ${error.message}`);
    return null;
  }
}

function getFirebaseStatus() {
  return {
    enabled: Boolean(db),
    service_account_found: fs.existsSync(SERVICE_ACCOUNT_PATH),
    error: firebaseError ? firebaseError.message : null,
  };
}

module.exports = {
  admin,
  initializeFirebase,
  getFirebaseStatus,
};
