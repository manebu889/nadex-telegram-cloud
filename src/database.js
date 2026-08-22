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
    
    // Mengurutkan dari yang paling awal diupload (berdasarkan createdAt atau fallback ke topicMsgId)
    data.sort((a, b) => {
      const timeDiff = (a.createdAt || 0) - (b.createdAt || 0);
      if (timeDiff !== 0) return timeDiff;
      return (a.topicMsgId || 0) - (b.topicMsgId || 0);
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
    // Tambahkan timestamp saat ini untuk keperluan sorting
    newData.createdAt = Date.now();
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

/**
 * Fungsi generik dan reusable untuk menambahkan dokumen ke collection apa pun.
 * Mengikuti aturan "API Response Format" di AGENTS.md.
 */
async function addDocument(collectionName, data) {
  if (!dbFirestore) {
    console.error(`[ERROR] Firestore belum terhubung. Gagal menyimpan ke ${collectionName}.`);
    return { success: false, data: null, message: 'Firestore is not connected' };
  }
  
  try {
    const dataToSave = { ...data, createdAt: Date.now() };
    const docRef = await dbFirestore.collection(collectionName).add(dataToSave);
    
    return { 
      success: true, 
      data: { id: docRef.id, ...dataToSave }, 
      message: `Data successfully saved to ${collectionName}` 
    };
  } catch (error) {
    console.error(`[ERROR] Gagal menyimpan data ke ${collectionName}:`, error);
    return { success: false, data: null, message: error.message };
  }
}

/**
 * Fungsi generik dan reusable untuk membaca semua dokumen dari collection apa pun.
 */
async function getDocuments(collectionName) {
  if (!dbFirestore) {
    console.error(`[ERROR] Firestore belum terhubung. Gagal membaca ${collectionName}.`);
    return { success: false, data: null, message: 'Firestore is not connected' };
  }
  
  try {
    const snapshot = await dbFirestore.collection(collectionName).get();
    const data = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() });
    });
    
    return { 
      success: true, 
      data: data, 
      message: `Successfully retrieved ${data.length} documents from ${collectionName}` 
    };
  } catch (error) {
    console.error(`[ERROR] Gagal membaca data dari ${collectionName}:`, error);
    return { success: false, data: null, message: error.message };
  }
}

/**
 * Fungsi khusus untuk menyimpan akun game
 */
async function saveAccount(accountData) {
  return await addDocument('account', accountData);
}

/**
 * Fungsi khusus untuk mengambil semua daftar Master Game
 */
async function getMasterGames() {
  return await getDocuments('master_games');
}

/**
 * Fungsi khusus untuk mengambil semua akun yang tersimpan
 */
async function getAccounts() {
  return await getDocuments('account');
}

module.exports = { 
  readDB, saveDB, deleteLabel, 
  addDocument, saveAccount, 
  getDocuments, getMasterGames, getAccounts 
};
