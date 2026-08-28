const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { Markup } = require('telegraf');

function getTopicIdByExtension(fileName, topicsConfig) {
  const ext = path.extname(fileName).toLowerCase();
  const picturesExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const projectExt = ['.zip', '.rar', '.tar', '.gz', '.7z', '.cdr', '.psd', '.aep', '.kra'];
  const documentExt = ['.pdf', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'];
  
  if (picturesExt.includes(ext) && topicsConfig.TOPIC_PICTURES) return topicsConfig.TOPIC_PICTURES;
  if (projectExt.includes(ext) && topicsConfig.TOPIC_PROJECT) return topicsConfig.TOPIC_PROJECT;
  if (documentExt.includes(ext) && topicsConfig.TOPIC_DOCUMENT) return topicsConfig.TOPIC_DOCUMENT;
  return undefined; 
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function getFileCategory(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const picturesExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const projectExt = ['.zip', '.rar', '.tar', '.gz', '.7z', '.cdr', '.psd', '.aep', '.kra'];
  const documentExt = ['.pdf', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'];

  if (picturesExt.includes(ext)) return 'photo';
  if (projectExt.includes(ext)) return 'project';
  if (documentExt.includes(ext)) return 'document';
  return 'file'; // default fallback
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY belum di-setting di .env');
  }
  // Menghasilkan key berukuran 32-byte (256-bit) secara konsisten
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptPassword(plaintext) {
  if (!plaintext) return plaintext;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptPassword(encryptedText) {
  if (!encryptedText) return encryptedText;
  
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Format teks terenkripsi tidak valid.');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedTextHex = parts[2];
  const key = getEncryptionKey();
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedTextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

async function sendPage(ctx, results, label, page) {
  const ITEMS_PER_PAGE = 5;
  const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const paginated = results.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  
  const replyOpts = {
    message_thread_id: ctx.message?.message_thread_id || ctx.callbackQuery?.message?.message_thread_id
  };

  const keyboard = [];
  
  for (const item of paginated) {
     keyboard.push([Markup.button.callback(`📥 Unduh: ${item.fileName}`, `dl_${item.id}`)]);
  }
  
  const navButtons = [];
  const shortLabel = label.substring(0, 20); 
  if (page > 1) navButtons.push(Markup.button.callback('⬅️ Prev', `p_${page - 1}_${shortLabel}`));
  if (page < totalPages) navButtons.push(Markup.button.callback('Next ➡️', `p_${page + 1}_${shortLabel}`));
  if (navButtons.length > 0) keyboard.push(navButtons);

  const textMsg = `🔍 Ditemukan **${results.length}** file untuk pencarian '*${label}*'\nMenampilkan hal ${page}/${totalPages}.\n\n*Silakan klik file di bawah ini untuk memanggilnya:*`;

  if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('p_')) {
    await ctx.editMessageText(textMsg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) }).catch(()=>{});
  } else {
    await ctx.telegram.sendMessage(ctx.chat.id, textMsg, { parse_mode: 'Markdown', ...replyOpts, ...Markup.inlineKeyboard(keyboard) });
  }
}

async function sendHistoryPage(ctx, results, page) {
  const ITEMS_PER_PAGE = 5;
  const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const paginated = results.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  
  const replyOpts = {
    message_thread_id: ctx.message?.message_thread_id || ctx.callbackQuery?.message?.message_thread_id
  };

  const keyboard = [];
  
  for (const item of paginated) {
     keyboard.push([Markup.button.callback(`📥 Unduh: ${item.fileName}`, `dl_${item.id}`)]);
  }
  
  const navButtons = [];
  if (page > 1) navButtons.push(Markup.button.callback('⬅️ Prev', `h_${page - 1}`));
  if (page < totalPages) navButtons.push(Markup.button.callback('Next ➡️', `h_${page + 1}`));
  if (navButtons.length > 0) keyboard.push(navButtons);

  const textMsg = `🕒 **Riwayat File Terupload** (Terbaru - Terlama)\nTotal: **${results.length}** file\nMenampilkan hal ${page}/${totalPages}.\n\n*Silakan klik file di bawah ini untuk memanggilnya:*`;

  if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('h_')) {
    await ctx.editMessageText(textMsg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) }).catch(()=>{});
  } else {
    await ctx.telegram.sendMessage(ctx.chat.id, textMsg, { parse_mode: 'Markdown', ...replyOpts, ...Markup.inlineKeyboard(keyboard) });
  }
}

module.exports = { 
  getTopicIdByExtension, 
  downloadFile, 
  getFileCategory,
  encryptPassword,
  decryptPassword,
  formatDate,
  sendPage,
  sendHistoryPage
};
