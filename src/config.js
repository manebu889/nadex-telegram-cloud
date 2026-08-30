require('dotenv').config();

const config = {
  // Telegram Config
  BOT_TOKEN: process.env.BOT_TOKEN,
  CHAT_ID: parseInt(process.env.CHAT_ID) || null,
  
  // Storage Config
  WATCH_DIR: process.env.WATCH_DIR,
  DELETE_AFTER_UPLOAD: process.env.DELETE_AFTER_UPLOAD === 'true',

  // Database Config
  MONGODB_URI: process.env.MONGODB_URI,
  
  // Security Config
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  
  // Topics Mapping
  TOPICS: {
    TOPIC_GENERAL: parseInt(process.env.TOPIC_GENERAL),
    TOPIC_PICTURES: parseInt(process.env.TOPIC_PICTURES),
    TOPIC_PROJECT: parseInt(process.env.TOPIC_PROJECT),
    TOPIC_DOCUMENT: parseInt(process.env.TOPIC_DOCUMENT),
    TOPIC_ACCOUNTS: parseInt(process.env.TOPIC_ACCOUNTS),
  }
};

if (!config.BOT_TOKEN || !config.CHAT_ID || !config.TOPICS.TOPIC_GENERAL || !config.MONGODB_URI) {
  console.error('[ERROR CRITICAL] BOT_TOKEN, CHAT_ID, TOPIC_GENERAL, atau MONGODB_URI belum disetting di .env!');
  process.exit(1); // Hentikan sistem jika config penting tidak ada
}

module.exports = config;
