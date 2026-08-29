const path = require('path');
const config = require('../config');
const { saveDB } = require('../database');
const { getTopicIdByExtension, downloadFile, getFileCategory } = require('../utils');

const mediaGroupLabels = {};
let downloadQueue = Promise.resolve();

// Helper untuk retry fungsi API Telegram yang gagal karena dikeroyok banyak file (Multiple Upload)
async function withRetry(fn, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      // Beri jeda acak 1-3 detik agar tidak tabrakan dengan file lain
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }
  }
}

module.exports = (bot) => {
  bot.on('message', async (ctx, next) => {
    try {
      const msg = ctx.message;
      
      if (!msg.document && !msg.photo && !msg.video) return next();

      const chatId = msg.chat.id;
      const threadId = msg.message_thread_id || undefined;
      const isGeneralTopic = (threadId === config.TOPICS.TOPIC_GENERAL) || (!threadId && config.TOPICS.TOPIC_GENERAL === 1);

      if (chatId !== config.CHAT_ID || !isGeneralTopic) return next(); 

      // Ambil Label dari Caption terlebih dahulu (karena kita butuh label untuk nama file)
      let label = (msg.caption || '').trim().toLowerCase();
      
      if (msg.media_group_id) {
        if (label) {
          mediaGroupLabels[msg.media_group_id] = label;
          setTimeout(() => { delete mediaGroupLabels[msg.media_group_id]; }, 600000);
        } else {
          // [FIX] Mengatasi Race Condition Telegram
          // Telegram mengirim file dalam satu album secara bersamaan.
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

      if (!fileId) return next();

      // [FIX] Gunakan retry untuk getFileLink karena Telegram membatasi API jika file dikirim serentak
      const fileLink = await withRetry(() => ctx.telegram.getFileLink(fileId));
      
      let ext = path.extname(originalFileName) || path.extname(fileLink.pathname) || '';
      ext = ext.toLowerCase();
      
      const categoryName = getFileCategory(originalFileName || fileLink.pathname);

      let fileName = '';
      if (categoryName === 'document' || categoryName === 'project') {
        fileName = `${safeLabel}-${originalFileName}`;
      } else {
        fileName = `${safeLabel}-${categoryName}_${msg.message_id}${ext}`;
      }

      const destPath = path.join(config.WATCH_DIR, fileName);
      
      // [FIX] Sistem Antrean (Queue) Download
      // Mencegah jaringan STB mati/timeout karena mendownload banyak file secara bersamaan
      await new Promise((resolve, reject) => {
        downloadQueue = downloadQueue.then(async () => {
          try {
            await downloadFile(fileLink.href, destPath);
            resolve();
          } catch (e) {
            reject(e);
          }
        }).catch(reject); // tangkap error sebelumnya agar antrean tidak macet selamanya
      });

      const targetTopicId = getTopicIdByExtension(fileName, config.TOPICS);

      if (targetTopicId) {
        try {
          // [FIX] Gunakan retry untuk copyMessage agar tidak gagal
          const copiedMsg = await withRetry(() => ctx.telegram.copyMessage(config.CHAT_ID, config.CHAT_ID, msg.message_id, {
            message_thread_id: targetTopicId
          }));
          
          await saveDB({ fileId, fileName, type: fileType, label, topicId: targetTopicId, topicMsgId: copiedMsg.message_id });

          await ctx.telegram.deleteMessage(config.CHAT_ID, msg.message_id).catch(()=>{});
          
          if (!msg.media_group_id || (msg.media_group_id && msg.caption)) {
            const replyOpts = threadId ? { message_thread_id: threadId } : {};
            const lblMsg = label ? ` (Label: ${label})` : ' (Tanpa Label)';
            await ctx.telegram.sendMessage(config.CHAT_ID, `✅ File tersimpan dengan label: ${lblMsg}`, replyOpts);
          }
          
        } catch (err) {
          if (err && err.message && !err.message.includes('MESSAGE_ID_INVALID') && !err.message.includes('message to copy not found')) {
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
      console.error(`[ERROR UMUM] Terjadi kesalahan:`, error ? error.message || error : 'Unknown Error');
    }
    
    return next();
  });
};
