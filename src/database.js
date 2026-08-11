const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Memuat service account dari root direktori (sejajar dengan index.js)
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
let dbFirestore;

if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = require(serviceAccountPath);
    initializeApp({
      credential: cert(serviceAccount)
    });
    dbFirestore = getFirestore();
    console.log("[INFO] Firebase Firestore berhasil diinisialisasi.");
  } catch (error) {
    console.error("⚠️ [ERROR] Gagal menginisialisasi Firebase:", error.message);
  }
} else {
  console.warn("⚠️ [WARNING] serviceAccountKey.json tidak ditemukan! Fitur Database Firebase tidak akan berjalan secara maksimal. Harap tempatkan file tersebut di root folder.");
}

async function readDB() {
  if (!dbFirestore) return [];
  try {
    const snapshot = await dbFirestore.collection('files').get();
    const data = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() });
    });
    return data;
  } catch (e) {
    console.error("Gagal membaca database dari Firestore:", e);
    return [];
  }
}

async function saveDB(newData) {
  if (!dbFirestore) {
    console.error("Gagal menyimpan: Firebase Firestore belum terhubung.");
    return;
  }
  try {
    await dbFirestore.collection('files').add(newData);
  } catch (e) {
    console.error("Gagal menyimpan data ke Firestore:", e);
  }
}

module.exports = { readDB, saveDB };
