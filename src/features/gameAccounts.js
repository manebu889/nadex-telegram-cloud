const { Markup } = require('telegraf');
const config = require('../config');
const { getMasterGames, getAccounts, addDocument, updateAccount, saveAccount } = require('../database');
const { decryptPassword, encryptPassword, formatDate } = require('../utils');

module.exports = (bot) => {
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
      const gameAccounts = accounts.filter(acc => acc.gameId === game.id);
      const totalAccounts = gameAccounts.length;
      
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
    ctx.session.isEditingSpec = false;
    ctx.session.passEditStep = null;
    ctx.session.saveStep = 'WAITING_DESC';
    ctx.session.selectedGame = gameId;

    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(()=>{});
    await ctx.reply(`Game telah dipilih.\n\nSilakan masukkan Spesifikasi/Deskripsi akun ini:\nContoh: _Akun Smurf Tier Mythic_`, { parse_mode: 'Markdown' });
  });

  bot.command('check', async (ctx) => {
    const accRes = await getAccounts();
    const gamesRes = await getMasterGames();
    
    if (!accRes.success || accRes.data.length === 0) {
      return ctx.reply('Belum ada akun yang tersimpan di database.');
    }

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
    await ctx.deleteMessage().catch(()=>{});
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
      await ctx.deleteMessage().catch(()=>{});
      
      const descText = acc.description ? `\n📝 Spesifikasi: _${acc.description}_` : '';
      const sentMsg = await ctx.reply(`🔐 Username: \`${acc.username}\`\n🔑 Password: \`${decryptedPass}\`${descText}\n\n_(Pesan ini akan otomatis terhapus dalam 25 detik)_`, { parse_mode: 'Markdown' });
      
      setTimeout(() => {
        ctx.telegram.deleteMessage(ctx.chat.id, sentMsg.message_id).catch(() => {});
      }, 25000);
    } catch(e) {
      await ctx.answerCbQuery("Gagal membuka password (Kunci Enkripsi mungkin berubah)");
      console.error(e);
    }
  });

  bot.command('change', async (ctx) => {
    const buttons = [
      [Markup.button.callback('📝 Ubah Spesifikasi', 'CMD_CHANGE_SPEC')],
      [Markup.button.callback('🔑 Ubah Password', 'CMD_CHANGE_PASS')]
    ];
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

  bot.action('CMD_CHANGE_PASS', async (ctx) => {
    const accRes = await getAccounts();
    const gamesRes = await getMasterGames();
    
    if (!accRes.success || accRes.data.length === 0) {
      return ctx.answerCbQuery('Belum ada akun di database.', { show_alert: true });
    }

    const activeGameIds = new Set(accRes.data.map(acc => acc.gameId));
    const activeGames = gamesRes.success ? gamesRes.data.filter(g => activeGameIds.has(g.id)) : [];

    const buttons = activeGames.map(game => 
      [Markup.button.callback(`🎮 ${game.name}`, `CHGPASS_GAME_${game.id}`)]
    );

    await ctx.answerCbQuery();
    await ctx.editMessageText('Pilih game untuk mereset password akunnya:', {
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

  bot.action(/^CHGPASS_GAME_(.+)$/, async (ctx) => {
    const gameId = ctx.match[1];
    const accRes = await getAccounts();
    
    if (!accRes.success) return ctx.answerCbQuery("Gagal memuat akun.");
    
    const gameAccounts = accRes.data.filter(a => a.gameId === gameId);
    if (gameAccounts.length === 0) return ctx.answerCbQuery("Tidak ada akun untuk game ini.");
    
    const buttons = gameAccounts.map(acc => {
      const label = `${acc.username}`;
      return [Markup.button.callback(`👤 ${label.substring(0, 40)}`, `CHGPASS_ACC_${acc.id}`)];
    });

    await ctx.answerCbQuery();
    await ctx.editMessageText('Pilih akun yang passwordnya ingin Anda ganti:', {
      ...Markup.inlineKeyboard(buttons)
    }).catch(()=>{});
  });

  bot.action(/^CHG_ACC_(.+)$/, async (ctx) => {
    const accId = ctx.match[1];
    
    ctx.session ??= {};
    ctx.session.isEditingSpec = true;
    ctx.session.passEditStep = null;
    ctx.session.isAddingAccount = false;
    ctx.session.editSpecAccountId = accId;

    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(()=>{});
    
    await ctx.reply("📝 **Mode Edit Spesifikasi**\n\nSilakan masukkan teks spesifikasi baru untuk akun ini:\n_(Kirim teks seperti biasa. Ketik '-' untuk mengosongkan deskripsi)_", { parse_mode: 'Markdown' });
  });

  bot.action(/^CHGPASS_ACC_(.+)$/, async (ctx) => {
    const accId = ctx.match[1];
    
    ctx.session ??= {};
    ctx.session.passEditStep = 'OLD_PASS';
    ctx.session.isEditingSpec = false;
    ctx.session.isAddingAccount = false;
    ctx.session.editPassAccountId = accId;

    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(()=>{});
    
    await ctx.reply("🔒 **Verifikasi Keamanan**\n\nUntuk mengubah password, silakan ketik **Password Lama** akun ini terlebih dahulu:", { parse_mode: 'Markdown' });
  });

  // Interceptors for Session Steps
  bot.on('message', async (ctx, next) => {
    const msg = ctx.message;
    if (msg.text && msg.text.startsWith('/')) return next();

    if (ctx.session?.isEditingSpec && msg.text) {
      let newDesc = msg.text.trim();
      if (newDesc === '-') newDesc = '';
      
      const accId = ctx.session.editSpecAccountId;
      
      await updateAccount(accId, { description: newDesc });
      
      const targetTopic = config.TOPICS.TOPIC_ACCOUNTS;
      if (targetTopic) {
        const accRes = await getAccounts();
        const acc = accRes.success ? accRes.data.find(a => a.id === accId) : null;
        if (acc) {
          const gamesRes = await getMasterGames();
          const game = gamesRes.success ? gamesRes.data.find(g => g.id === acc.gameId) : null;
          const gameName = game ? game.name : "Unknown";
          
          await ctx.telegram.sendMessage(config.CHAT_ID, `🔄 **Spesifikasi Akun Diperbarui**\n\nGame: ${gameName}\n📝 Spesifikasi Baru: ${newDesc || '-'}\nUser: \`${acc.username}\``, {
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

    if (ctx.session?.passEditStep && msg.text) {
      const inputPass = msg.text.trim();
      const accId = ctx.session.editPassAccountId;
      
      await ctx.deleteMessage().catch(()=>{});
      
      if (ctx.session.passEditStep === 'OLD_PASS') {
        const accRes = await getAccounts();
        const acc = accRes.success ? accRes.data.find(a => a.id === accId) : null;
        
        if (!acc) {
           ctx.session.passEditStep = null;
           return ctx.reply("❌ Gagal: Akun tidak ditemukan.");
        }
        
        try {
           const decryptedPass = decryptPassword(acc.password);
           if (inputPass !== decryptedPass) {
              ctx.session.passEditStep = null;
              return ctx.reply("❌ **Verifikasi Gagal!** Password lama yang Anda masukkan salah. Proses dibatalkan.", { parse_mode: 'Markdown' });
           }
           
           ctx.session.passEditStep = 'NEW_PASS';
           return ctx.reply("✅ **Terverifikasi!**\n\nSekarang silakan ketik **Password Baru** untuk akun ini:\n_(Sandi baru akan langsung dienkripsi)_", { parse_mode: 'Markdown' });
        } catch (e) {
           ctx.session.passEditStep = null;
           return ctx.reply("❌ Gagal mendekripsi password lama (Kunci Enkripsi mungkin berubah).");
        }
      }
      else if (ctx.session.passEditStep === 'NEW_PASS') {
        const newEncryptedPass = encryptPassword(inputPass);
        
        await updateAccount(accId, { password: newEncryptedPass });
        
        const targetTopic = config.TOPICS.TOPIC_ACCOUNTS;
        if (targetTopic) {
          const accRes = await getAccounts();
          const acc = accRes.success ? accRes.data.find(a => a.id === accId) : null;
          if (acc) {
            const gamesRes = await getMasterGames();
            const game = gamesRes.success ? gamesRes.data.find(g => g.id === acc.gameId) : null;
            const gameName = game ? game.name : "Unknown";
            
            await ctx.telegram.sendMessage(config.CHAT_ID, `🔄 **Password Akun Diperbarui**\n\nGame: ${gameName}\n📝 Spesifikasi: ${acc.description || '-'}\nUser: \`${acc.username}\`\nStatus: Password Baru Terenkripsi 🔐`, {
              parse_mode: 'Markdown',
              message_thread_id: targetTopic
            }).catch(err => console.error("Gagal forward update password:", err.message));
          }
        }

        ctx.session.passEditStep = null;
        ctx.session.editPassAccountId = null;
        
        return ctx.reply('✅ Password akun berhasil diperbarui dan dienkripsi ulang!');
      }
    }

    if (ctx.session?.isAddingAccount && msg.text) {
      if (ctx.session.saveStep === 'WAITING_DESC') {
        ctx.session.tempDesc = msg.text.trim();
        ctx.session.saveStep = 'WAITING_CREDS';
        
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
        const desc = ctx.session.tempDesc;
        
        await saveAccount({ 
          gameId: ctx.session.selectedGame,
          description: desc,
          username: user, 
          password: encryptedPass 
        });
        
        ctx.session.isAddingAccount = false;
        ctx.session.saveStep = null;
        ctx.session.tempDesc = null;
        
        await ctx.deleteMessage().catch(err => console.error("Gagal hapus pesan input:", err.message));
        
        const accRes = await getAccounts();
        const newestAcc = accRes.success ? accRes.data.reduce((prev, current) => (prev.createdAt > current.createdAt) ? prev : current) : null;
        
        const targetTopic = config.TOPICS.TOPIC_ACCOUNTS;
        if (targetTopic && newestAcc) {
          const gamesRes = await getMasterGames();
          const game = gamesRes.success ? gamesRes.data.find(g => g.id === newestAcc.gameId) : null;
          const gameName = game ? game.name : "Unknown";
          
          await ctx.telegram.sendMessage(config.CHAT_ID, `🆕 **Akun Baru Ditambahkan**\n\nGame: ${gameName}\n📝 Spesifikasi: ${newestAcc.description || '-'}\nUser: \`${newestAcc.username}\`\nStatus: Aman & Terenkripsi 🔐`, {
            parse_mode: 'Markdown',
            message_thread_id: targetTopic
          }).catch(err => console.error("Gagal forward info akun:", err.message));
        }

        return ctx.reply("✅ Akun berhasil disimpan dan dienkripsi!");
      }
    }

    return next();
  });
};
