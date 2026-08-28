const { readDB } = require('../database');
const { sendHistoryPage } = require('../utils');

module.exports = (bot) => {
  // Command: /history
  bot.command('history', async (ctx) => {
    const db = await readDB();
    if (db.length === 0) {
      return ctx.reply("❌ Belum ada file yang terupload di database.", { message_thread_id: ctx.message.message_thread_id });
    }
    
    // Balikkan urutan agar dari yang terbaru ke terlama
    const results = db.reverse();
    await sendHistoryPage(ctx, results, 1);
  });

  // Listener Tombol Paginasi History
  bot.action(/^h_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    
    const db = await readDB();
    const results = db.reverse();
    
    await ctx.answerCbQuery();
    if (results.length > 0) {
      await sendHistoryPage(ctx, results, page);
    }
  });
};
