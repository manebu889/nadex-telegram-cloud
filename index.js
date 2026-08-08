require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = parseInt(process.env.CHAT_ID); 
const WATCH_DIR = process.env.WATCH_DIR;
const TOPIC_GENERAL = parseInt(process.env.TOPIC_GENERAL);
const TOPIC_PICTURES = parseInt(process.env.TOPIC_PICTURES);
const TOPIC_PROJECT = parseInt(process.env.TOPIC_PROJECT);
const TOPIC_DOCUMENT = parseInt(process.env.TOPIC_DOCUMENT);

if (!BOT_TOKEN || !CHAT_ID || !TOPIC_GENERAL) {
  console.error('[ERROR] BOT_TOKEN, CHAT_ID, atau TOPIC_GENERAL belum diisi di .env!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

if (!fs.existsSync(WATCH_DIR)) {
  fs.mkdirSync(WATCH_DIR, { recursive: true });
  console.log(`[INFO] Folder ${WATCH_DIR} dibuat untuk menyimpan unduhan di STB.`);
}

console.log(`[INFO] Bot siap! Menunggu file masuk di Grup: ${CHAT_ID}, Topik General: ${TOPIC_GENERAL}`);

function getTopicIdByExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  
  const picturesExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const projectExt = ['.zip', '.rar', '.tar', '.gz', '.7z', '.cdr', '.psd'];
  const documentExt = ['.pdf', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'];
  
  if (picturesExt.includes(ext) && TOPIC_PICTURES) return TOPIC_PICTURES;
  if (projectExt.includes(ext) && TOPIC_PROJECT) return TOPIC_PROJECT;
  if (documentExt.includes(ext) && TOPIC_DOCUMENT) return TOPIC_DOCUMENT;
  
  return undefined; 
}

// Fungsi helper untuk mendownload file
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

bot.on(['document', 'photo', 'video'], async (ctx) => {
  try {
    const msg = ctx.message;
    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id || undefined;

    // Pastikan pesan berasal dari Grup dan Topik General yang benar
    if (chatId !== CHAT_ID || threadId !== TOPIC_GENERAL) {
      return; 
    }

    let fileId;
    let fileName = '';

    if (msg.document) {
      fileId = msg.document.file_id;
      fileName = msg.document.file_name;
    } else if (msg.photo) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      fileName = `photo_${Date.now()}.jpg`; // Default nama untuk foto
    } else if (msg.video) {
      fileId = msg.video.file_id;
      fileName = msg.video.file_name || `video_${Date.now()}.mp4`;
    }

    if (!fileId) return;

    console.log(`\n[TERIMA] Terdeteksi file baru di Topik General. Memproses...`);

    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    if (!path.extname(fileName)) {
      const ext = path.extname(fileLink.pathname);
      fileName = fileName + ext;
    }

    const destPath = path.join(WATCH_DIR, fileName);

    console.log(`[UNDUH] Sedang mengunduh file ${fileName} ke STB...`);
    await downloadFile(fileLink.href, destPath);
    console.log(`[SIMPAN] Berhasil disimpan di HDD: ${destPath}`);

    const targetTopicId = getTopicIdByExtension(fileName);

    if (targetTopicId) {
      await ctx.telegram.copyMessage(CHAT_ID, CHAT_ID, msg.message_id, {
        message_thread_id: targetTopicId
      });
      console.log(`[SORTIR] Berhasil disalin ke Topik ID: ${targetTopicId}`);
      await ctx.telegram.sendMessage(CHAT_ID, `✅ Tersimpan di STB & Disortir.`, {
        reply_to_message_id: msg.message_id,
        message_thread_id: TOPIC_GENERAL
      });

    } else {
      console.log(`[SKIP] Ekstensi tidak terdaftar, file hanya disimpan di HDD.`);
      await ctx.telegram.sendMessage(CHAT_ID, `💾 Tersimpan di STB (Tanpa sortir).`, {
        reply_to_message_id: msg.message_id,
        message_thread_id: TOPIC_GENERAL
      });
    }

  } catch (error) {
    console.error(`[ERROR] Terjadi kesalahan:`, error.message);
  }
});

bot.launch().then(() => {
    console.log("[INFO] Bot Telegram Auto-Downloader & Sorter Berjalan!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
