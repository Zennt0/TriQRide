const path = require("path");
const admin = require("firebase-admin");
require("dotenv").config();

const serviceAccountPath = path.resolve(
  __dirname,
  "../../signup-1e8a0-firebase-adminsdk-zr2df-da405d54aa.json",
);

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  console.log("Firebase admin initialized successfully.");
} catch (error) {
  console.error("Failed to load Firebase service account key:", error);
  process.exit(1);
}

const bucket = admin.storage().bucket();

module.exports = { admin, bucket };
