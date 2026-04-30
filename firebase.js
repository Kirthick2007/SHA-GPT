const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "backend", "firebase-service-account.json");

let db = null;
let firebaseError = null;

function initializeFirebase() {
  if (db) return db;

  try {
    let serviceAccount = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      serviceAccount = require(SERVICE_ACCOUNT_PATH);
    } else {
      throw new Error("Firebase service account file not found");
    }

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
    service_account_env_found: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    error: firebaseError ? firebaseError.message : null,
  };
}

module.exports = {
  admin,
  initializeFirebase,
  getFirebaseStatus,
};
