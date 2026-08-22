const { Telegraf, Markup, session } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ================= IMPORT CONFIG & FUNGSI =================
const config = require('./src/config');
const { readDB, saveDB, deleteLabel, saveAccount, getMasterGames, getAccounts, addDocument, updateAccount } = require('./src/database');
const { getTopicIdByExtension, downloadFile, getFileCategory, encryptPassword, decryptPassword, formatDate } = require('./src/utils');

const bot = new Telegraf(config.BOT_TOKEN);
bot.use(session());

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

// ================= FITUR HISTORY (List & Paginasi) =================
async function sendHistoryPage(ctx, results, page) {
  const ITEMS_PER_PAGE = 5;
  const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const paginated = results.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  
  const replyOpts = {
    message_thread_id: ctx.message?.message_thread_id || ctx.callbackQuery?.message?.message_thread_id
  };

  const keyboard = [];
  
  for (const item of paginated) {
     keyboard.push([Markup.button.callback(`📥 Unduh: ${item.fileName}`, `dl_${item.id}`)]);
  }
  
  const navButtons = [];
  if (page > 1) navButtons.push(Markup.button.callback('⬅️ Prev', `h_${page - 1}`));
  if (page < totalPages) navButtons.push(Markup.button.callback('Next ➡️', `h_${page + 1}`));
  if (navButtons.length > 0) keyboard.push(navButtons);

  const textMsg = `🕒 **Riwayat File Terupload** (Terbaru - Terlama)\nTotal: **${results.length}** file\nMenampilkan hal ${page}/${totalPages}.\n\n*Silakan klik file di bawah ini untuk memanggilnya:*`;

  if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('h_')) {
    await ctx.editMessageText(textMsg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) }).catch(()=>{});
  } else {
    await ctx.telegram.sendMessage(ctx.chat.id, textMsg, { parse_mode: 'Markdown', ...replyOpts, ...Markup.inlineKeyboard(keyboard) });
  }
}

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


// ================= FITUR AKUN GAME =================

bot.command('addgame', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) return ctx.reply("Gunakan format: /addgame [Nama Game]");
  const gameName = args.join(' ');
  const res = await addDocument('master_games', { name: gameName });
  if (res.success) {
    ctx.reply(`✅ Game '${gameName}' berhasil ditambahkan ke Master Data.`);
  } else {
    ctx.reply(`❌ Gagal: ${res.message}`);
  }
});

bot.command('listgame', async (ctx) => {
  const gamesRes = await getMasterGames();
  const accRes = await getAccounts();
  
  if (!gamesRes.success || gamesRes.data.length === 0) {
    return ctx.reply('❌ Belum ada game terdaftar di Master Data.');
  }

  const accounts = accRes.success ? accRes.data : [];
  let messageText = '🎮 **Daftar Master Data Game**\n\n';

  gamesRes.data.forEach((game, index) => {
    // Filter akun untuk game ini
    const gameAccounts = accounts.filter(acc => acc.gameId === game.id);
    const totalAccounts = gameAccounts.length;
    
    // Cari waktu penambahan akun terakhir
    let lastAdded = '-';
    if (totalAccounts > 0) {
      const latestAcc = gameAccounts.reduce((prev, current) => 
        (prev.createdAt > current.createdAt) ? prev : current
      );
      lastAdded = formatDate(latestAcc.createdAt);
    }
    
    messageText += `*${index + 1}. ${game.name}*\n`;
    messageText += ` ├ 👥 Total akun : **${totalAccounts}**\n`;
    messageText += ` └ 🔄 Diperbarui : _${lastAdded}_\n\n`;
  });

  ctx.reply(messageText, { parse_mode: 'Markdown' });
});

bot.command('save', async (ctx) => {
  const gamesRes = await getMasterGames();
  if (!gamesRes.success || gamesRes.data.length === 0) {
    return ctx.reply('Daftar game masih kosong! Tambahkan terlebih dahulu dengan perintah: /addgame Nama Game');
  }

  const buttons = gamesRes.data.map(game => 
    [Markup.button.callback(game.name, `SEL_GAME_${game.id}`)]
  );
  
  await ctx.reply('Pilih game yang akan disimpan informasinya:', {
    message_thread_id: ctx.message.message_thread_id,
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action(/^SEL_GAME_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  
  ctx.session ??= {}; 
  ctx.session.isAddingAccount = true;
  ctx.session.saveStep = 'WAITING_DESC'; // Tambahan flow deskripsi
  ctx.session.selectedGame = gameId;

  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(()=>{}); // Hapus opsi agar chat rapi
  await ctx.reply(`Game telah dipilih.\n\nSilakan masukkan Spesifikasi/Deskripsi akun ini:\nContoh: _Akun Smurf Tier Mythic_`, { parse_mode: 'Markdown' });
});

bot.command('check', async (ctx) => {
  const accRes = await getAccounts();
  const gamesRes = await getMasterGames();
  
  if (!accRes.success || accRes.data.length === 0) {
    return ctx.reply('Belum ada akun yang tersimpan di database.');
  }

  // Hanya tampilkan master game yang memiliki akun
  const activeGameIds = new Set(accRes.data.map(acc => acc.gameId));
  const activeGames = gamesRes.success ? gamesRes.data.filter(g => activeGameIds.has(g.id)) : [];

  if (activeGames.length === 0) {
    return ctx.reply('Belum ada akun yang bisa ditampilkan.');
  }

  const buttons = activeGames.map(game => 
    [Markup.button.callback(`🎮 ${game.name}`, `CHK_GAME_${game.id}`)]
  );

  await ctx.reply('Pilih game untuk melihat daftar akunnya:', {
    message_thread_id: ctx.message.message_thread_id,
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action(/^CHK_GAME_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  const accRes = await getAccounts();
  
  if (!accRes.success) return ctx.answerCbQuery("Gagal memuat akun.");
  
  const gameAccounts = accRes.data.filter(a => a.gameId === gameId);
  
  if (gameAccounts.length === 0) {
    return ctx.answerCbQuery("Tidak ada akun untuk game ini.");
  }
  
  const buttons = gameAccounts.map(acc => {
    const label = `${acc.username}`;
    return [Markup.button.callback(`👤 ${label.substring(0, 40)}`, `CHK_ACC_${acc.id}`)];
  });

  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(()=>{}); // Hapus opsi agar chat rapi
  await ctx.reply('Daftar Akun:\nPilih akun yang ingin Anda lihat detailnya:', {
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action(/^CHK_ACC_(.+)$/, async (ctx) => {
  const accId = ctx.match[1];
  const accRes = await getAccounts();
  const acc = accRes.data.find(a => a.id === accId);
  
  if (!acc) return ctx.answerCbQuery("Akun tidak ditemukan atau sudah terhapus.");
  
  try {
    const decryptedPass = decryptPassword(acc.password);
    await ctx.answerCbQuery("Mengambil password...");
    await ctx.deleteMessage().catch(()=>{}); // Hapus opsi agar chat rapi
    
    const descText = acc.description ? `\n📝 Spesifikasi: _${acc.description}_` : '';
    const sentMsg = await ctx.reply(`🔐 Username: \`${acc.username}\`\n🔑 Password: \`${decryptedPass}\`${descText}\n\n_(Pesan ini akan otomatis terhapus dalam 25 detik)_`, { parse_mode: 'Markdown' });
    
    // Auto-delete pesan berisi password setelah 25 detik (25000 ms)
    setTimeout(() => {
      ctx.telegram.deleteMessage(ctx.chat.id, sentMsg.message_id).catch(() => {});
    }, 25000);
  } catch(e) {
    await ctx.answerCbQuery("Gagal membuka password (Kunci Enkripsi mungkin berubah)");
    console.error(e);
  }
});


// ================= FITUR EDIT SPESIFIKASI =================
bot.command('change', async (ctx) => {
  const buttons = [[Markup.button.callback('📝 Ubah Spesifikasi', 'CMD_CHANGE_SPEC')]];
  await ctx.reply('Menu Perubahan Data:', {
    message_thread_id: ctx.message.message_thread_id,
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action('CMD_CHANGE_SPEC', async (ctx) => {
  const accRes = await getAccounts();
  const gamesRes = await getMasterGames();
  
  if (!accRes.success || accRes.data.length === 0) {
    return ctx.answerCbQuery('Belum ada akun di database.', { show_alert: true });
  }

  const activeGameIds = new Set(accRes.data.map(acc => acc.gameId));
  const activeGames = gamesRes.success ? gamesRes.data.filter(g => activeGameIds.has(g.id)) : [];

  const buttons = activeGames.map(game => 
    [Markup.button.callback(`🎮 ${game.name}`, `CHG_GAME_${game.id}`)]
  );

  await ctx.answerCbQuery();
  await ctx.editMessageText('Pilih game untuk mengedit spesifikasi akun:', {
    ...Markup.inlineKeyboard(buttons)
  }).catch(()=>{});
});

bot.action(/^CHG_GAME_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  const accRes = await getAccounts();
  
  if (!accRes.success) return ctx.answerCbQuery("Gagal memuat akun.");
  
  const gameAccounts = accRes.data.filter(a => a.gameId === gameId);
  if (gameAccounts.length === 0) return ctx.answerCbQuery("Tidak ada akun untuk game ini.");
  
  const buttons = gameAccounts.map(acc => {
    const label = `${acc.username}`;
    return [Markup.button.callback(`👤 ${label.substring(0, 40)}`, `CHG_ACC_${acc.id}`)];
  });

  await ctx.answerCbQuery();
  await ctx.editMessageText('Pilih akun yang spesifikasinya ingin diubah:', {
    ...Markup.inlineKeyboard(buttons)
  }).catch(()=>{});
});

bot.action(/^CHG_ACC_(.+)$/, async (ctx) => {
  const accId = ctx.match[1];
  
  ctx.session ??= {};
  ctx.session.isEditingSpec = true;
  ctx.session.editSpecAccountId = accId;

  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(()=>{});
  
  await ctx.reply("📝 **Mode Edit Spesifikasi**\n\nSilakan masukkan teks spesifikasi baru untuk akun ini:\n_(Kirim teks seperti biasa. Ketik '-' untuk mengosongkan deskripsi)_", { parse_mode: 'Markdown' });
});

// ================= CORE UPLOAD & SORTER =================
const mediaGroupLabels = {};

bot.on('message', async (ctx) => {
  try {
    const msg = ctx.message;
    
    // Jangan proses command text
    if (msg.text && msg.text.startsWith('/')) return;

    // === INTERSEPTOR: Edit Spesifikasi Akun ===
    if (ctx.session?.isEditingSpec && msg.text) {
      let newDesc = msg.text.trim();
      if (newDesc === '-') newDesc = ''; // Hapus deskripsi jika input '-'
      
      const accId = ctx.session.editSpecAccountId;
      
      await updateAccount(accId, {
        description: newDesc
      });
      
      // Mengirimkan Notifikasi Perubahan ke Topik Game Center
      const targetTopic = config.TOPICS.TOPIC_ACCOUNTS;
      if (targetTopic) {
        const accRes = await getAccounts();
        const acc = accRes.success ? accRes.data.find(a => a.id === accId) : null;
        if (acc) {
          const gamesRes = await getMasterGames();
          const game = gamesRes.success ? gamesRes.data.find(g => g.id === acc.gameId) : null;
          const gameName = game ? game.name : "Unknown";
          
          await ctx.telegram.sendMessage(config.CHAT_ID, `🔄 **Spesifikasi Akun Diperbarui**\n\nGame: ${gameName}\nUser: \`${acc.username}\`\n📝 Spesifikasi Baru: ${newDesc || '-'}`, {
            parse_mode: 'Markdown',
            message_thread_id: targetTopic
          }).catch(err => console.error("Gagal forward update spesifikasi:", err.message));
        }
      }

      ctx.session.isEditingSpec = false;
      ctx.session.editSpecAccountId = null;
      
      await ctx.deleteMessage().catch(()=>{});
      return ctx.reply('✅ Spesifikasi akun berhasil diperbarui!');
    }

    // === INTERSEPTOR: Tambah Akun Game ===
    if (ctx.session?.isAddingAccount && msg.text) {
      if (ctx.session.saveStep === 'WAITING_DESC') {
        ctx.session.tempDesc = msg.text.trim();
        ctx.session.saveStep = 'WAITING_CREDS';
        
        // Hapus pesan deskripsi agar chat tetap rapi
        await ctx.deleteMessage().catch(()=>{}); 
        
        return ctx.reply("✅ Spesifikasi tersimpan.\n\nSekarang masukkan Username/Email dan Password (pisahkan dengan spasi):\nContoh: `user@email.com pass123`", { parse_mode: 'Markdown' });
      }
      else if (ctx.session.saveStep === 'WAITING_CREDS') {
        const input = msg.text.trim().split(/\s+/);
        if (input.length < 2) {
          return ctx.reply("❌ Format salah. Harus ada username dan password dipisah dengan spasi.");
        }
        
        const user = input[0];
        const passwordRaw = input.slice(1).join(' ');
        
        const encryptedPass = encryptPassword(passwordRaw);
        const desc = ctx.session.tempDesc; // Simpan ke variabel lokal dulu
        
        await saveAccount({ 
          gameId: ctx.session.selectedGame,
          description: desc,
          username: user, 
          password: encryptedPass 
        });
        
        ctx.session.isAddingAccount = false; // Reset session
        ctx.session.saveStep = null;
        ctx.session.tempDesc = null;
        
        // Hapus pesan teks user agar password mentah tidak tertinggal di chat
        await ctx.deleteMessage().catch(err => console.error("Gagal hapus pesan input:", err.message));
        
        // Forward ke topic akun jika ada
        const targetTopic = config.TOPICS.TOPIC_ACCOUNTS;
        if (targetTopic) {
          const gamesRes = await getMasterGames();
          let gameName = "Unknown";
          if (gamesRes.success) {
            const matched = gamesRes.data.find(g => g.id === ctx.session.selectedGame);
            if (matched) gameName = matched.name;
          }

          await ctx.telegram.sendMessage(config.CHAT_ID, `🎮 **Akun Game Baru Ditambahkan**\n\nGame: ${gameName}\n📝 Spesifikasi: ${desc || '-'}\nUser: \`${user}\`\nStatus: Terenkripsi 🔐`, {
            parse_mode: 'Markdown',
            message_thread_id: targetTopic
          }).catch(err => console.error("Gagal forward info akun:", err.message));
        }
        
        return ctx.reply('✅ Akun beserta spesifikasinya berhasil disimpan ke database!');
      }
    }
    // =====================================

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
