require('dotenv').config();

const config = {
  // Telegram Config
  BOT_TOKEN: process.env.BOT_TOKEN,
  CHAT_ID: parseInt(process.env.CHAT_ID) || null,
  
  // Storage Config
  WATCH_DIR: process.env.WATCH_DIR,
  DELETE_AFTER_UPLOAD: process.env.DELETE_AFTER_UPLOAD === 'true',

  // Firebase Config
  FIREBASE_CREDENTIALS: process.env.FIREBASE_CREDENTIALS,
  
  // Topics Mapping
  TOPICS: {
    TOPIC_GENERAL: parseInt(process.env.TOPIC_GENERAL),
    TOPIC_PICTURES: parseInt(process.env.TOPIC_PICTURES),
    TOPIC_PROJECT: parseInt(process.env.TOPIC_PROJECT),
    TOPIC_DOCUMENT: parseInt(process.env.TOPIC_DOCUMENT),
  }
};

if (!config.BOT_TOKEN || !config.CHAT_ID || !config.TOPICS.TOPIC_GENERAL) {
  console.error('[ERROR CRITICAL] BOT_TOKEN, CHAT_ID, atau TOPIC_GENERAL belum disetting di .env!');
  process.exit(1); // Hentikan sistem jika tidak ada token
}

module.exports = config;
