const { Telegraf, session } = require('telegraf');
const fs = require('fs');
const config = require('./src/config');

const bot = new Telegraf(config.BOT_TOKEN);
bot.use(session());

// Pastikan folder watch_dir tersedia
if (!fs.existsSync(config.WATCH_DIR)) {
  fs.mkdirSync(config.WATCH_DIR, { recursive: true });
}

// 1. Daftarkan Middleware
require('./src/middlewares')(bot);

// 2. Daftarkan Fitur-Fitur (Routes & Actions)
require('./src/features/search')(bot);
require('./src/features/history')(bot);
require('./src/features/delete')(bot);
require('./src/features/gameAccounts')(bot);
require('./src/features/upload')(bot);

bot.launch().then(() => {
    console.log("[INFO] Bot Telegram Berjalan (Dengan Filter Ekstensi & Auto-Rename)!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
