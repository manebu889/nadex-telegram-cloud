const path = require('path');
const config = require('../config');
const { saveDB } = require('../database');
const { getTopicIdByExtension, downloadFile, getFileCategory } = require('../utils');

const mediaGroupLabels = {};

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

      if (!fileId) return next();

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
    
    return next();
  });
};
