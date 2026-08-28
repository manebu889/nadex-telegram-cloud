const config = require('./config');

module.exports = (bot) => {
  // ================= MIDDLEWARE: Restriksi Command =================
  bot.use((ctx, next) => {
    if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
      const chatId = ctx.message.chat.id;
      const threadId = ctx.message.message_thread_id || undefined;
      const isGeneralTopic = (threadId === config.TOPICS.TOPIC_GENERAL) || (!threadId && config.TOPICS.TOPIC_GENERAL === 1);
      
      // Jika bukan di chat utama atau bukan di General Topic, abaikan command tanpa peringatan
      if (chatId !== config.CHAT_ID || !isGeneralTopic) {
        return; 
      }
    }
    return next();
  });
};
