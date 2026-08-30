const mongoose = require('mongoose');
const config = require('./config');

// Ambil URI secara ketat dari config (.env) sesuai aturan
const mongoURI = config.MONGODB_URI;

mongoose.connect(mongoURI).then(() => {
    console.log("[INFO] Database MongoDB berhasil terhubung!");
}).catch(err => {
    console.error("⚠️ [ERROR] Gagal terhubung ke MongoDB:", err.message);
});

// ============================================
// MODEL MONGOOSE (Dibuat semirip mungkin dengan Firestore)
// strict: false memungkinkan objek JSON bebas seperti Firestore
// ============================================
const FileModel = mongoose.model('files', new mongoose.Schema({
    createdAt: { type: Number, default: Date.now }
}, { strict: false, collection: 'files' }));

const AccountModel = mongoose.model('account', new mongoose.Schema({
    createdAt: { type: Number, default: Date.now }
}, { strict: false, collection: 'accounts' }));

const GameModel = mongoose.model('master_accounts', new mongoose.Schema({
    createdAt: { type: Number, default: Date.now }
}, { strict: false, collection: 'master_accounts' }));

// Fungsi pemetaan nama collection ke Model Mongoose
function getModel(collectionName) {
    if (collectionName === 'files') return FileModel;
    if (collectionName === 'account') return AccountModel;
    if (collectionName === 'master_accounts') return GameModel;
    
    // Fallback model dinamis jika ada collection baru
    return mongoose.model(collectionName, new mongoose.Schema({
        createdAt: { type: Number, default: Date.now }
    }, { strict: false }));
}

// ============================================
// FUNGSI-FUNGSI DATABASE UTAMA
// (Semua output disamakan 100% dengan versi Firestore lama)
// ============================================

async function readDB() {
  try {
    const data = await FileModel.find().lean();
    
    // Ubah _id bawaan MongoDB menjadi 'id' agar fitur lain tidak rusak
    const mapped = data.map(doc => ({ id: doc._id.toString(), ...doc }));
    
    mapped.sort((a, b) => {
      const timeDiff = (a.createdAt || 0) - (b.createdAt || 0);
      if (timeDiff !== 0) return timeDiff;
      return (a.topicMsgId || 0) - (b.topicMsgId || 0);
    });
    
    return mapped;
  } catch (e) {
    console.error("Gagal membaca database dari MongoDB:", e);
    return [];
  }
}

async function saveDB(newData) {
  try {
    newData.createdAt = Date.now();
    await FileModel.create(newData);
  } catch (e) {
    console.error("Gagal menyimpan data ke MongoDB:", e);
  }
}

async function deleteLabel(labelName) {
  try {
    const docs = await FileModel.find({ label: labelName }).lean();
    if (docs.length === 0) return [];
    
    await FileModel.deleteMany({ label: labelName });
    
    return docs.map(doc => ({ id: doc._id.toString(), ...doc }));
  } catch (e) {
    console.error("Gagal menghapus label di MongoDB:", e);
    return [];
  }
}

async function addDocument(collectionName, data) {
  try {
    const Model = getModel(collectionName);
    const dataToSave = { ...data, createdAt: Date.now() };
    const saved = await Model.create(dataToSave);
    
    return { 
      success: true, 
      data: { id: saved._id.toString(), ...saved.toObject() }, 
      message: `Data successfully saved to ${collectionName}` 
    };
  } catch (error) {
    console.error(`[ERROR] Gagal menyimpan data ke ${collectionName}:`, error);
    return { success: false, data: null, message: error.message };
  }
}

async function getDocuments(collectionName) {
  try {
    const Model = getModel(collectionName);
    const data = await Model.find().lean();
    
    const mapped = data.map(doc => ({ id: doc._id.toString(), ...doc }));
    
    return { 
      success: true, 
      data: mapped, 
      message: `Successfully retrieved ${mapped.length} documents from ${collectionName}` 
    };
  } catch (error) {
    console.error(`[ERROR] Gagal membaca data dari ${collectionName}:`, error);
    return { success: false, data: null, message: error.message };
  }
}

async function saveAccount(accountData) {
  return await addDocument('account', accountData);
}

async function getMasterAccounts() {
  return await getDocuments('master_accounts');
}

async function getAccounts() {
  return await getDocuments('account');
}

async function updateDocument(collectionName, docId, updatedFields) {
  try {
    const Model = getModel(collectionName);
    const updated = await Model.findByIdAndUpdate(docId, updatedFields, { returnDocument: 'after' }).lean();
    if (!updated) throw new Error("Document not found");

    return { success: true, data: { id: updated._id.toString(), ...updated }, message: `Document updated` };
  } catch (error) {
    return { success: false, data: null, message: error.message };
  }
}

async function deleteDocument(collectionName, docId) {
  try {
    const Model = getModel(collectionName);
    await Model.findByIdAndDelete(docId);
    return { success: true, data: null, message: `Document deleted` };
  } catch (error) {
    return { success: false, data: null, message: error.message };
  }
}

async function updateAccount(accId, updatedFields) {
  return await updateDocument('account', accId, updatedFields);
}

async function deleteAccount(accId) {
  return await deleteDocument('account', accId);
}

module.exports = { 
  readDB, saveDB, deleteLabel, 
  addDocument, saveAccount, 
  getDocuments, getMasterAccounts, getAccounts,
  updateDocument, updateAccount,
  deleteDocument, deleteAccount
};
