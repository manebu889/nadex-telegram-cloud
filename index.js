const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ================= IMPORT CONFIG & FUNGSI =================
const config = require('./src/config');
const { readDB, saveDB, deleteLabel } = require('./src/database');
const { getTopicIdByExtension, downloadFile, getFileCategory } = require('./src/utils');

const bot = new Telegraf(config.BOT_TOKEN);

if (!fs.existsSync(config.WATCH_DIR)) {
  fs.mkdirSync(config.WATCH_DIR, { recursive: true });
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
  
  // Buat tombol untuk setiap file
  for (const item of paginated) {
     keyboard.push([Markup.button.callback(`📥 Unduh: ${item.fileName}`, `dl_${item.id}`)]);
  }
  
  // Buat tombol navigasi Prev/Next
  const navButtons = [];
  const shortLabel = label.substring(0, 20); 
  if (page > 1) navButtons.push(Markup.button.callback('⬅️ Prev', `p_${page - 1}_${shortLabel}`));
  if (page < totalPages) navButtons.push(Markup.button.callback('Next ➡️', `p_${page + 1}_${shortLabel}`));
  if (navButtons.length > 0) keyboard.push(navButtons);

  const textMsg = `🔍 Ditemukan **${results.length}** file untuk pencarian '*${label}*'\nMenampilkan hal ${page}/${totalPages}.\n\n*Silakan klik file di bawah ini untuk memanggilnya:*`;

  // Jika callback dari pagination, cukup edit pesan
  if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('p_')) {
    await ctx.editMessageText(textMsg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) }).catch(()=>{});
  } else {
    await ctx.telegram.sendMessage(ctx.chat.id, textMsg, { parse_mode: 'Markdown', ...replyOpts, ...Markup.inlineKeyboard(keyboard) });
  }
}

// Command: /find [label/nama_file/extensi]
bot.command('find', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const replyOpts = { message_thread_id: ctx.message.message_thread_id };

  if (args.length < 2) {
    return ctx.reply("Gunakan format: /find [kata_kunci]", replyOpts);
  }
  
  const keyword = args.slice(1).join(' ').toLowerCase();
  
  const db = await readDB();
  const results = db.filter(item => {
    const lbl = item.label ? item.label.toLowerCase() : '';
    const fn = item.fileName ? item.fileName.toLowerCase() : '';
    return lbl.includes(keyword) || fn.includes(keyword);
  });
  
  if (results.length === 0) {
    return ctx.reply(`❌ Tidak ditemukan file/label dengan kata kunci: *${keyword}*`, { parse_mode: 'Markdown', ...replyOpts });
  }
  
  await sendPage(ctx, results, keyword, 1);
});

// Listener Tombol Paginasi
bot.action(/^p_(\d+)_(.+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  const keyword = ctx.match[2];
  
  const db = await readDB();
  const results = db.filter(item => {
    const lbl = item.label ? item.label.toLowerCase() : '';
    const fn = item.fileName ? item.fileName.toLowerCase() : '';
    return lbl.includes(keyword) || fn.includes(keyword);
  });
  
  await ctx.answerCbQuery();
  if (results.length > 0) {
    await sendPage(ctx, results, keyword, page);
  }
});

// Command: /del [label]
bot.command('del', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const replyOpts = { message_thread_id: ctx.message.message_thread_id };

  const db = await readDB();
  const uniqueLabels = [...new Set(db.filter(x => x.label).map(x => x.label))];

  if (uniqueLabels.length === 0) {
    return ctx.reply("❌ Tidak ada label yang tersimpan di database.", replyOpts);
  }

  // Kondisi 2: /del <nama_label>
  if (args.length > 1) {
    const labelToDelete = args.slice(1).join(' ').toLowerCase();
    
    if (!uniqueLabels.includes(labelToDelete)) {
      return ctx.reply(`❌ Label *${labelToDelete}* tidak ditemukan!`, { parse_mode: 'Markdown', ...replyOpts });
    }

    const deletedItems = await deleteLabel(labelToDelete);
    const deletedCount = deletedItems.length;
    
    // Hapus fisik dan pesan Telegram
    for (const item of deletedItems) {
      const filePath = path.join(config.WATCH_DIR, item.fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (item.topicMsgId) await ctx.telegram.deleteMessage(config.CHAT_ID, item.topicMsgId).catch(()=>{});
    }

    return ctx.reply(`🗑️ Berhasil menghapus label *${labelToDelete}* secara menyeluruh (${deletedCount} file dihapus dari DB, STB, dan Topik).`, { parse_mode: 'Markdown', ...replyOpts });
  }

  // Kondisi 1: Hanya /del (menampilkan daftar label)
  const keyboard = [];
  uniqueLabels.forEach(lbl => {
    const shortLbl = lbl.length > 30 ? lbl.substring(0, 30) + '...' : lbl;
    keyboard.push([Markup.button.callback(`🗑️ Hapus: ${shortLbl}`, `del_lbl_${lbl.substring(0, 30)}`)]);
  });
  
  keyboard.push([Markup.button.callback('❌ Batal', 'cancel_delete')]);

  await ctx.reply("Pilih label yang ingin dihapus:", {
    reply_to_message_id: ctx.message.message_thread_id ? undefined : ctx.message.message_id,
    ...replyOpts,
    ...Markup.inlineKeyboard(keyboard)
  });
});

// Listener Tombol Hapus Label
bot.action(/^del_lbl_(.+)$/, async (ctx) => {
  const labelSubstring = ctx.match[1];
  
  const db = await readDB();
  const matchedLabel = db.map(x => x.label).find(l => l && l.substring(0, 30) === labelSubstring);
  
  if (!matchedLabel) {
    return ctx.editMessageText(`❌ Label tidak ditemukan atau sudah terhapus.`, { parse_mode: 'Markdown' }).catch(()=>{});
  }

  const deletedItems = await deleteLabel(matchedLabel);
  const deletedCount = deletedItems.length;
  
  if (deletedCount > 0) {
    // Hapus fisik dan pesan Telegram
    for (const item of deletedItems) {
      const filePath = path.join(config.WATCH_DIR, item.fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (item.topicMsgId) await ctx.telegram.deleteMessage(config.CHAT_ID, item.topicMsgId).catch(()=>{});
    }
    
    await ctx.editMessageText(`🗑️ Berhasil menghapus label *${matchedLabel}* secara menyeluruh (${deletedCount} file dihapus dari DB, STB, dan Topik).`, { parse_mode: 'Markdown' }).catch(()=>{});
  } else {
    await ctx.editMessageText(`❌ Gagal atau label *${matchedLabel}* sudah tidak ada.`, { parse_mode: 'Markdown' }).catch(()=>{});
  }
});

// Listener Tombol Batal Hapus
bot.action('cancel_delete', async (ctx) => {
  await ctx.deleteMessage().catch(()=>{});
  await ctx.answerCbQuery("Proses hapus dibatalkan.");
});

// Listener Tombol Unduh File
bot.action(/^dl_(.+)$/, async (ctx) => {
  const docId = ctx.match[1];
  
  const db = await readDB();
  const item = db.find(x => x.id === docId);
  
  await ctx.answerCbQuery("Memanggil file... 🚀");
  
  if (!item) {
    return ctx.reply(`❌ File sudah tidak ada di database.`, { message_thread_id: ctx.callbackQuery.message.message_thread_id });
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
    
    // Menghapus pesan list (inline keyboard) hasil dari perintah /find
    await ctx.deleteMessage().catch(()=>{});
    
  } catch (err) {
    console.error(`Gagal mengirim file ${item.fileName}:`, err.message);
  }
});


// ================= CORE UPLOAD & SORTER =================
const mediaGroupLabels = {};

bot.on('message', async (ctx) => {
  try {
    const msg = ctx.message;
    
    // Jangan proses command text
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.document && !msg.photo && !msg.video) return;

    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id || undefined;
    const isGeneralTopic = (threadId === config.TOPICS.TOPIC_GENERAL) || (!threadId && config.TOPICS.TOPIC_GENERAL === 1);

    if (chatId !== config.CHAT_ID || !isGeneralTopic) return; 

    // Ambil Label dari Caption terlebih dahulu (karena kita butuh label untuk nama file)
    let label = (msg.caption || '').trim().toLowerCase();
    
    if (msg.media_group_id) {
      if (label) {
        mediaGroupLabels[msg.media_group_id] = label;
        setTimeout(() => { delete mediaGroupLabels[msg.media_group_id]; }, 600000);
      } else {
        // [FIX] Mengatasi Race Condition Telegram
        // Telegram mengirim file dalam satu album secara bersamaan.
        // File tanpa caption akan disuruh 'menunggu' maksimal 3 detik sampai file yang memiliki caption menetapkan labelnya.
        let retries = 0;
        while (!mediaGroupLabels[msg.media_group_id] && retries < 15) {
          await new Promise(r => setTimeout(r, 200));
          retries++;
        }
        label = mediaGroupLabels[msg.media_group_id] || '';
      }
    }
    
    // Membersihkan label dari karakter aneh agar aman dijadikan nama file
    const safeLabel = label ? label.replace(/[^a-z0-9_-]/gi, '') : 'tanpalabel';

    let fileId, originalFileName = '', fileType = '';

    if (msg.document) {
      fileId = msg.document.file_id;
      originalFileName = msg.document.file_name;
      fileType = 'document';
    } else if (msg.photo) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      originalFileName = `photo_${msg.message_id}.jpg`; 
      fileType = 'photo';
    } else if (msg.video) {
      fileId = msg.video.file_id;
      originalFileName = msg.video.file_name || `video_${msg.message_id}.mp4`;
      fileType = 'video';
    }

    if (!fileId) return;

    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    let ext = path.extname(originalFileName) || path.extname(fileLink.pathname) || '';
    ext = ext.toLowerCase();
    // Tentukan kategori dari file yang diupload (document, photo, project)
    const categoryName = getFileCategory(originalFileName || fileLink.pathname);

    let fileName = '';
    if (categoryName === 'document' || categoryName === 'project') {
      // Khusus Document & Project: [label]-[nama_file_asli]
      fileName = `${safeLabel}-${originalFileName}`;
    } else {
      // Khusus Photo & Video: [label]-[kategori]_[id].[ext]
      fileName = `${safeLabel}-${categoryName}_${msg.message_id}${ext}`;
    }

    const destPath = path.join(config.WATCH_DIR, fileName);
    
    await downloadFile(fileLink.href, destPath);

    const targetTopicId = getTopicIdByExtension(fileName, config.TOPICS);

    if (targetTopicId) {
      try {
        const copiedMsg = await ctx.telegram.copyMessage(config.CHAT_ID, config.CHAT_ID, msg.message_id, {
          message_thread_id: targetTopicId
        });
        
        await saveDB({ fileId, fileName, type: fileType, label, topicId: targetTopicId, topicMsgId: copiedMsg.message_id });

        await ctx.telegram.deleteMessage(config.CHAT_ID, msg.message_id).catch(()=>{});
        
        if (!msg.media_group_id || (msg.media_group_id && msg.caption)) {
          const replyOpts = threadId ? { message_thread_id: threadId } : {};
          const lblMsg = label ? ` (Label: ${label})` : ' (Tanpa Label)';
          await ctx.telegram.sendMessage(config.CHAT_ID, `✅ File tersimpan dengan label: ${lblMsg}`, replyOpts);
        }
        
      } catch (err) {
        if (!err.message.includes('MESSAGE_ID_INVALID') && !err.message.includes('message to copy not found')) {
          console.error(`[ERROR] Gagal memproses: ${err.message}`);
        }
      }
    } else {
      await saveDB({ fileId, fileName, type: fileType, label, topicId: threadId, topicMsgId: msg.message_id });

      if (!msg.media_group_id || (msg.media_group_id && msg.caption)) {
        const replyOpts = { reply_to_message_id: msg.message_id };
        if (threadId) replyOpts.message_thread_id = threadId;
        await ctx.telegram.sendMessage(config.CHAT_ID, `💾 Tersimpan di STB: ${fileName}`, replyOpts);
      }
    }
  } catch (error) {
    console.error(`[ERROR UMUM] Terjadi kesalahan:`, error.message);
  }
});

bot.launch().then(() => {
    console.log("[INFO] Bot Telegram Berjalan (Dengan Filter Ekstensi & Auto-Rename)!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
