require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ================= IMPORT FUNGSI =================
const { readDB, saveDB } = require('./src/database');
const { getTopicIdByExtension, downloadFile } = require('./src/utils');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = parseInt(process.env.CHAT_ID); 
const WATCH_DIR = process.env.WATCH_DIR;
const TOPICS = {
  TOPIC_GENERAL: parseInt(process.env.TOPIC_GENERAL),
  TOPIC_PICTURES: parseInt(process.env.TOPIC_PICTURES),
  TOPIC_PROJECT: parseInt(process.env.TOPIC_PROJECT),
  TOPIC_DOCUMENT: parseInt(process.env.TOPIC_DOCUMENT),
};

if (!BOT_TOKEN || !CHAT_ID || !TOPICS.TOPIC_GENERAL) {
  console.error('[ERROR] BOT_TOKEN, CHAT_ID, atau TOPIC_GENERAL belum diisi di .env!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

if (!fs.existsSync(WATCH_DIR)) {
  fs.mkdirSync(WATCH_DIR, { recursive: true });
}

// ================= FITUR FIND (List & Paginasi) =================
async function sendPage(ctx, results, label, page) {
  const ITEMS_PER_PAGE = 5;
  const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const paginated = results.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  
  const replyOpts = {
    message_thread_id: ctx.message?.message_thread_id || ctx.callbackQuery?.message?.message_thread_id
  };

  const keyboard = [];
  
  // Buat tombol untuk setiap file (satu tombol memakan satu baris)
  for (const item of paginated) {
     keyboard.push([Markup.button.callback(`📥 Unduh: ${item.fileName}`, `dl_${item.fileName}`)]);
  }
  
  // Buat tombol navigasi Prev/Next di baris paling bawah
  const navButtons = [];
  const shortLabel = label.substring(0, 20); 
  if (page > 1) navButtons.push(Markup.button.callback('⬅️ Prev', `p_${page - 1}_${shortLabel}`));
  if (page < totalPages) navButtons.push(Markup.button.callback('Next ➡️', `p_${page + 1}_${shortLabel}`));
  if (navButtons.length > 0) keyboard.push(navButtons);

  const textMsg = `🔍 Ditemukan **${results.length}** file untuk label '*${label}*'\nMenampilkan hal ${page}/${totalPages}.\n\n*Silakan klik file di bawah ini untuk memanggilnya:*`;
  if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('p_')) {
    await ctx.editMessageText(textMsg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) }).catch(()=>{});
  } else {
    await ctx.telegram.sendMessage(ctx.chat.id, textMsg, { parse_mode: 'Markdown', ...replyOpts, ...Markup.inlineKeyboard(keyboard) });
  }
}

// Command: /find [label]
bot.command('find', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const replyOpts = { message_thread_id: ctx.message.message_thread_id };

  if (args.length < 2) {
    return ctx.reply("Gunakan format: /find [nama_label]", replyOpts);
  }
  
  const labelToFind = args.slice(1).join(' ').toLowerCase();
  const db = await readDB();
  const results = db.filter(item => item.label && item.label.includes(labelToFind));
  
  if (results.length === 0) {
    return ctx.reply(`❌ Tidak ada file dengan label: ${labelToFind}`, replyOpts);
  }
  
  await sendPage(ctx, results, labelToFind, 1);
});

// Listener Tombol Paginasi (Prev/Next)
bot.action(/^p_(\d+)_(.+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  const labelToFind = ctx.match[2];
  
  // MENGGUNAKAN FIRESTORE: await readDB()
  const db = await readDB();
  const results = db.filter(item => item.label && item.label.includes(labelToFind));
  
  await ctx.answerCbQuery();
  if (results.length > 0) {
    await sendPage(ctx, results, labelToFind, page);
  }
});

// Listener Tombol Unduh File
bot.action(/^dl_(.+)$/, async (ctx) => {
  const fileName = ctx.match[1];
  
  // MENGGUNAKAN FIRESTORE: await readDB()
  const db = await readDB();
  const item = db.find(x => x.fileName === fileName);
  
  await ctx.answerCbQuery("Memanggil file... 🚀");
  
  if (!item) {
    return ctx.reply(`❌ File ${fileName} sudah tidak ada di database.`, { message_thread_id: ctx.callbackQuery.message.message_thread_id });
  }

  const sendOptions = { 
    caption: `📁 ${item.fileName}\n🏷 Label: ${item.label}`,
    message_thread_id: ctx.callbackQuery.message.message_thread_id
  };
  
  try {
    if (item.type === 'photo') {
      await ctx.telegram.sendPhoto(ctx.chat.id, item.fileId, sendOptions);
    } else if (item.type === 'video') {
      await ctx.telegram.sendVideo(ctx.chat.id, item.fileId, sendOptions);
    } else {
      await ctx.telegram.sendDocument(ctx.chat.id, item.fileId, sendOptions);
    }
  } catch (err) {
    console.error(`Gagal mengirim file ${item.fileName}:`, err.message);
  }
});


// ================= CORE UPLOAD & SORTER =================
const mediaGroupLabels = {};

bot.on('message', async (ctx) => {
  try {
    const msg = ctx.message;
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.document && !msg.photo && !msg.video) return;

    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id || undefined;
    const isGeneralTopic = (threadId === TOPICS.TOPIC_GENERAL) || (!threadId && TOPICS.TOPIC_GENERAL === 1);

    if (chatId !== CHAT_ID || !isGeneralTopic) return; 

    let fileId, fileName = '', fileType = '';

    if (msg.document) {
      fileId = msg.document.file_id;
      fileName = msg.document.file_name;
      fileType = 'document';
    } else if (msg.photo) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      // Gunakan message_id agar nama file 100% unik meskipun di-upload bersamaan
      fileName = `photo_${msg.message_id}.jpg`; 
      fileType = 'photo';
    } else if (msg.video) {
      fileId = msg.video.file_id;
      fileName = msg.video.file_name || `video_${msg.message_id}.mp4`;
      fileType = 'video';
    }

    if (!fileId) return;

    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    if (!path.extname(fileName)) {
      const ext = path.extname(fileLink.pathname);
      fileName = fileName + ext;
    }

    const destPath = path.join(WATCH_DIR, fileName);
    
    // MENGGUNAKAN UTILS: downloadFile
    await downloadFile(fileLink.href, destPath);

    // Ambil Label dari Caption. Jika file ini bagian dari Album (Media Group):
    let label = (msg.caption || '').trim().toLowerCase();
    
    if (msg.media_group_id) {
      if (label) {
        mediaGroupLabels[msg.media_group_id] = label;
        setTimeout(() => { delete mediaGroupLabels[msg.media_group_id]; }, 600000);
      } else if (mediaGroupLabels[msg.media_group_id]) {
        label = mediaGroupLabels[msg.media_group_id];
      }
    }

    // MENGGUNAKAN UTILS: getTopicIdByExtension
    const targetTopicId = getTopicIdByExtension(fileName, TOPICS);

    if (targetTopicId) {
      try {
        await ctx.telegram.copyMessage(CHAT_ID, CHAT_ID, msg.message_id, {
          message_thread_id: targetTopicId
        });
        
        // MENGGUNAKAN FIRESTORE: await saveDB()
        await saveDB({ fileId, fileName, type: fileType, label, topicId: targetTopicId });

        // Hapus pesan asli
        await ctx.telegram.deleteMessage(CHAT_ID, msg.message_id).catch(()=>{});
        
        if (!msg.media_group_id || (msg.media_group_id && msg.caption)) {
          const replyOpts = threadId ? { message_thread_id: threadId } : {};
          const lblMsg = label ? ` (Label: ${label})` : ' (Tanpa Label)';
          await ctx.telegram.sendMessage(CHAT_ID, `✅ File dipindahkan ke topik & disimpan di STB.${lblMsg}`, replyOpts);
        }
        
      } catch (err) {
        // Sembunyikan error jika pesan aslinya sudah terhapus di Telegram
        if (!err.message.includes('MESSAGE_ID_INVALID') && !err.message.includes('message to copy not found')) {
          console.error(`[ERROR] Gagal memproses: ${err.message}`);
        }
      }
    } else {
      // MENGGUNAKAN FIRESTORE: await saveDB()
      await saveDB({ fileId, fileName, type: fileType, label, topicId: threadId });

      if (!msg.media_group_id || (msg.media_group_id && msg.caption)) {
        const replyOpts = { reply_to_message_id: msg.message_id };
        if (threadId) replyOpts.message_thread_id = threadId;
        await ctx.telegram.sendMessage(CHAT_ID, `💾 Tersimpan di STB (Tanpa sortir).`, replyOpts);
      }
    }
  } catch (error) {
    console.error(`[ERROR UMUM] Terjadi kesalahan:`, error.message);
  }
});

bot.launch().then(() => {
    console.log("[INFO] Bot Telegram Berjalan (Refactored & Firestore)!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
