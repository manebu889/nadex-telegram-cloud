const { readDB } = require('../database');
const { sendPage } = require('../utils');

module.exports = (bot) => {
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
};
