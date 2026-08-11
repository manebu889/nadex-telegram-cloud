const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const config = require('./config');

let dbFirestore;
let serviceAccount;

const envCred = config.FIREBASE_CREDENTIALS;

if (envCred) {
  if (envCred.startsWith('{')) {
    try {
      serviceAccount = JSON.parse(envCred);
    } catch (e) {
      console.error("⚠️ [ERROR] Gagal mem-parsing JSON dari variabel FIREBASE_CREDENTIALS di .env");
    }
  } else {
    const resolvedPath = path.resolve(__dirname, '..', envCred);
    if (fs.existsSync(resolvedPath)) {
      serviceAccount = require(resolvedPath);
    } else {
      console.error(`⚠️ [ERROR] File credential Firebase tidak ditemukan di path: ${resolvedPath}`);
    }
  }
}

if (serviceAccount) {
  try {
    initializeApp({
      credential: cert(serviceAccount)
    });
    dbFirestore = getFirestore();
    console.log("[INFO] Firebase Firestore berhasil diinisialisasi melalui credential.");
  } catch (error) {
    console.error("⚠️ [ERROR] Gagal menginisialisasi Firebase:", error.message);
  }
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

async function deleteLabel(labelName) {
  if (!dbFirestore) return [];
  try {
    const snapshot = await dbFirestore.collection('files').where('label', '==', labelName).get();
    if (snapshot.empty) return [];
    
    const batch = dbFirestore.batch();
    const deletedItems = [];
    
    snapshot.docs.forEach((doc) => {
      deletedItems.push(doc.data());
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    return deletedItems;
  } catch (e) {
    console.error("Gagal menghapus label di Firestore:", e);
    return [];
  }
}

module.exports = { readDB, saveDB, deleteLabel };
