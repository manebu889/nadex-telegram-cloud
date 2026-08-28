const fs = require('fs');
const path = require('path');
const { Markup } = require('telegraf');
const config = require('../config');
const { readDB, deleteLabel, getAccounts, getMasterGames, deleteAccount } = require('../database');

module.exports = (bot) => {
  // Command: /del
  bot.command('del', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const replyOpts = { message_thread_id: ctx.message.message_thread_id };

    // Kondisi 2: /del <nama_label> (Hapus cepat via teks)
    if (args.length > 1) {
      const db = await readDB();
      const uniqueLabels = [...new Set(db.filter(x => x.label).map(x => x.label))];
      const labelToDelete = args.slice(1).join(' ').toLowerCase();
      
      if (!uniqueLabels.includes(labelToDelete)) {
        return ctx.reply(`❌ Label *${labelToDelete}* tidak ditemukan!`, { parse_mode: 'Markdown', ...replyOpts });
      }

      const deletedItems = await deleteLabel(labelToDelete);
      const deletedCount = deletedItems.length;
      
      for (const item of deletedItems) {
        const filePath = path.join(config.WATCH_DIR, item.fileName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (item.topicMsgId) {
           await ctx.telegram.deleteMessage(config.CHAT_ID, item.topicMsgId)
              .catch(e => console.error(`[ERROR] Gagal menghapus pesan topik (${item.topicMsgId}):`, e.message));
        }
      }

      return ctx.reply(`🗑️ Berhasil menghapus label *${labelToDelete}* secara menyeluruh (${deletedCount} file).`, { parse_mode: 'Markdown', ...replyOpts });
    }

    // Kondisi 1: Hanya /del (menampilkan menu pilihan)
    const buttons = [
      [Markup.button.callback('🖼 Hapus Label Foto', 'DEL_MENU_LABEL')],
      [Markup.button.callback('🎮 Hapus Akun Game', 'DEL_MENU_ACCOUNT')]
    ];

    await ctx.reply("Menu Penghapusan Data:", {
      ...replyOpts,
      ...Markup.inlineKeyboard(buttons)
    });
  });

  bot.action('DEL_MENU_LABEL', async (ctx) => {
    const db = await readDB();
    const uniqueLabels = [...new Set(db.filter(x => x.label).map(x => x.label))];

    if (uniqueLabels.length === 0) {
      return ctx.answerCbQuery("❌ Tidak ada label foto di database.", { show_alert: true });
    }

    const keyboard = [];
    uniqueLabels.forEach(lbl => {
      const shortLbl = lbl.length > 30 ? lbl.substring(0, 30) + '...' : lbl;
      keyboard.push([Markup.button.callback(`🗑️ Hapus: ${shortLbl}`, `del_lbl_${lbl.substring(0, 30)}`)]);
    });
    
    keyboard.push([Markup.button.callback('❌ Batal', 'cancel_delete')]);

    await ctx.answerCbQuery();
    await ctx.editMessageText("Pilih label foto yang ingin dihapus:", {
      ...Markup.inlineKeyboard(keyboard)
    }).catch(()=>{});
  });

  bot.action('DEL_MENU_ACCOUNT', async (ctx) => {
    const accRes = await getAccounts();
    const gamesRes = await getMasterGames();
    
    if (!accRes.success || accRes.data.length === 0) {
      return ctx.answerCbQuery('Belum ada akun di database.', { show_alert: true });
    }

    const activeGameIds = new Set(accRes.data.map(acc => acc.gameId));
    const activeGames = gamesRes.success ? gamesRes.data.filter(g => activeGameIds.has(g.id)) : [];

    const buttons = activeGames.map(game => 
      [Markup.button.callback(`🎮 ${game.name}`, `DEL_GAME_${game.id}`)]
    );
    buttons.push([Markup.button.callback('❌ Batal', 'cancel_delete')]);

    await ctx.answerCbQuery();
    await ctx.editMessageText('Pilih game dari akun yang ingin dihapus:', {
      ...Markup.inlineKeyboard(buttons)
    }).catch(()=>{});
  });

  bot.action(/^DEL_GAME_(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const accRes = await getAccounts();
    
    if (!accRes.success) return ctx.answerCbQuery("Gagal memuat akun.");
    
    const gameAccounts = accRes.data.filter(a => a.gameId === gameId);
    if (gameAccounts.length === 0) return ctx.answerCbQuery("Tidak ada akun untuk game ini.");
    
    const buttons = gameAccounts.map(acc => {
      const label = `${acc.username}`;
      return [Markup.button.callback(`👤 ${label.substring(0, 40)}`, `DEL_ACC_${acc.id}`)];
    });
    buttons.push([Markup.button.callback('❌ Batal', 'cancel_delete')]);

    await ctx.answerCbQuery();
    await ctx.editMessageText('⚠️ Pilih akun yang akan DIHAPUS PERMANEN:', {
      ...Markup.inlineKeyboard(buttons)
    }).catch(()=>{});
  });

  bot.action(/^DEL_ACC_(.+)$/, async (ctx) => {
    const accId = ctx.match[1];
    
    const accRes = await getAccounts();
    const acc = accRes.success ? accRes.data.find(a => a.id === accId) : null;
    
    if (!acc) return ctx.answerCbQuery("Akun tidak ditemukan atau sudah terhapus.", { show_alert: true });

    const delRes = await deleteAccount(accId);
    await ctx.answerCbQuery();
    
    if (delRes.success) {
      await ctx.editMessageText(`✅ Akun \`${acc.username}\` berhasil dihapus secara permanen.`, { parse_mode: 'Markdown' }).catch(()=>{});
      
      // Notif ke topic
      const targetTopic = config.TOPICS.TOPIC_ACCOUNTS;
      if (targetTopic) {
          const gamesRes = await getMasterGames();
          const game = gamesRes.success ? gamesRes.data.find(g => g.id === acc.gameId) : null;
          const gameName = game ? game.name : "Unknown";
          
          await ctx.telegram.sendMessage(config.CHAT_ID, `🗑 **Akun Dihapus**\n\nGame: ${gameName}\nUser: \`${acc.username}\`\nStatus: Terhapus Permanen 🚫`, {
            parse_mode: 'Markdown',
            message_thread_id: targetTopic
          }).catch(err => console.error("Gagal forward info hapus:", err.message));
      }
    } else {
      await ctx.editMessageText(`❌ Gagal menghapus akun: ${delRes.message}`).catch(()=>{});
    }
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
        if (item.topicMsgId) {
           await ctx.telegram.deleteMessage(config.CHAT_ID, item.topicMsgId)
              .catch((e) => console.error(`[ERROR] Gagal menghapus pesan topik (${item.topicMsgId}):`, e.message));
        }
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
};
