require('dotenv').config();
const { Telegraf } = require('telegraf');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const WATCH_DIR = process.env.WATCH_DIR;
const DELETE_AFTER_UPLOAD = process.env.DELETE_AFTER_UPLOAD === 'true';

const TOPIC_PICTURES = process.env.TOPIC_PICTURES;
const TOPIC_PROJECT = process.env.TOPIC_PROJECT;
const TOPIC_DOCUMENT = process.env.TOPIC_DOCUMENT;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('[ERROR] BOT_TOKEN atau CHAT_ID belum diisi di .env!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

if (!fs.existsSync(WATCH_DIR)) {
  fs.mkdirSync(WATCH_DIR, { recursive: true });
  console.log(`[INFO] Folder ${WATCH_DIR} dibuat.`);
}

console.log(`[INFO] Memulai monitoring di folder: ${WATCH_DIR}`);

function getTopicIdByExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  
  const picturesExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const projectExt = ['.zip', '.rar', '.tar', '.gz', '.7z', '.cdr', 'psd'];
  const documentExt = ['.pdf', '.docx', '.ppt'];
  
  if (picturesExt.includes(ext) && TOPIC_PICTURES) {
    return TOPIC_PICTURES;
  }
  
  if (projectExt.includes(ext) && TOPIC_PROJECT) {
    return TOPIC_PROJECT;
  }
  
  if (documentExt.includes(ext) && TOPIC_DOCUMENT) {
    return TOPIC_DOCUMENT;
  }
  
  return undefined; 
}


const watcher = chokidar.watch(WATCH_DIR, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000, 
    pollInterval: 100,
  },
});

watcher.on('add', async (filePath) => {
  const fileName = path.basename(filePath);
  console.log(`\n[FILE BARU] Terdeteksi: ${fileName}`);
  
  try {
    const threadId = getTopicIdByExtension(fileName);
    
    let topikLabel = "General";
    switch (threadId) {
      case TOPIC_PICTURES:
        topikLabel = "Pictures";
        break;
      case TOPIC_PROJECT:
        topikLabel = "Project";
        break;
      case TOPIC_DOCUMENT:
        topikLabel = "Document";
        break;
    }

    console.log(`[UPLOAD] Mengunggah ${fileName} ke topik [${topikLabel}]...`);
    
    const extraOptions = {};
    if (threadId) {
      extraOptions.message_thread_id = parseInt(threadId);
    }
    
    await bot.telegram.sendDocument(CHAT_ID, {
      source: filePath,
      filename: fileName
    }, extraOptions);

    console.log(`[SUKSES] ${fileName} berhasil diunggah.`);

    if (DELETE_AFTER_UPLOAD) {
      fs.unlinkSync(filePath);
      console.log(`[HAPUS] ${fileName} telah dihapus dari HDD lokal STB.`);
    }

  } catch (error) {
    console.error(`[ERROR] Gagal mengunggah ${fileName}:`, error.message);
  }
});

bot.launch().then(() => {
    console.log("[INFO] Bot Telegram Auto-Uploader Berjalan!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
