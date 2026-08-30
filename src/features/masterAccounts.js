const { Markup } = require('telegraf');
const config = require('../config');
const { getMasterAccounts, getAccounts, addDocument, updateAccount, saveAccount } = require('../database');
const { decryptPassword, encryptPassword, formatDate } = require('../utils');

module.exports = (bot) => {
  bot.command('addmaster', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) return ctx.reply("Gunakan format: /addmaster [Nama Platform/Layanan]");
    const masterName = args.join(' ');
    const res = await addDocument('master_accounts', { name: masterName });
    if (res.success) {
      ctx.reply(`✅ Platform '${masterName}' berhasil ditambahkan ke Master Data.`);
    } else {
      ctx.reply(`❌ Gagal: ${res.message}`);
    }
  });

  bot.command('listmaster', async (ctx) => {
    const masterRes = await getMasterAccounts();
    const accRes = await getAccounts();
    
    if (!masterRes.success || masterRes.data.length === 0) {
      return ctx.reply('❌ Belum ada platform terdaftar di Master Data.');
    }

    const accounts = accRes.success ? accRes.data : [];
    let messageText = '🏢 **Daftar Master Data Platform**\n\n';

    masterRes.data.forEach((game, index) => {
      const masterAccounts = accounts.filter(acc => acc.masterId === game.id);
      const totalAccounts = masterAccounts.length;
      
      let lastAdded = '-';
      if (totalAccounts > 0) {
        const latestAcc = masterAccounts.reduce((prev, current) => 
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
    const masterRes = await getMasterAccounts();
    if (!masterRes.success || masterRes.data.length === 0) {
      return ctx.reply('Daftar platform masih kosong! Tambahkan terlebih dahulu dengan perintah: /addmaster Nama Platform');
    }

    const buttons = masterRes.data.map(game => 
      [Markup.button.callback(game.name, `SEL_GAME_${game.id}`)]
    );
    
    await ctx.reply('Pilih platform yang akan disimpan informasinya:', {
      message_thread_id: ctx.message.message_thread_id,
      ...Markup.inlineKeyboard(buttons)
    });
  });

  bot.action(/^SEL_GAME_(.+)$/, async (ctx) => {
    const masterId = ctx.match[1];
    
    ctx.session ??= {}; 
    ctx.session.isAddingAccount = true;
    ctx.session.isEditingSpec = false;
    ctx.session.passEditStep = null;
    ctx.session.saveStep = 'WAITING_DESC';
    ctx.session.selectedGame = masterId;

    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(()=>{});
    await ctx.reply(`Platform telah dipilih.\n\nSilakan masukkan Spesifikasi/Deskripsi akun ini:\nContoh: _Akun Premium 1 Bulan_`, { parse_mode: 'Markdown' });
  });

  bot.command('check', async (ctx) => {
    const masterRes = await getMasterAccounts();
    
    if (!masterRes.success || masterRes.data.length === 0) {
      return ctx.reply('Belum ada master platform yang tersedia.');
    }

    const buttons = masterRes.data.map(game => 
      [Markup.button.callback(`🏢 ${game.name}`, `CHK_GAME_${game.id}`)]
    );

    await ctx.reply('Pilih platform untuk melihat daftar akunnya:', {
      message_thread_id: ctx.message.message_thread_id,
      ...Markup.inlineKeyboard(buttons)
    });
  });

  bot.action(/^CHK_GAME_(.+)$/, async (ctx) => {
    const masterId = ctx.match[1];
    const accRes = await getAccounts();
    
    if (!accRes.success) return ctx.answerCbQuery("Gagal memuat akun.");
    
    const masterAccounts = accRes.data.filter(a => a.masterId === masterId);
    
    if (masterAccounts.length === 0) {
      await ctx.answerCbQuery("Tidak ada akun untuk platform ini.", { show_alert: true });
      return;
    }
    
    const buttons = masterAccounts.map(acc => {
      const label = `${acc.username}`;
      return [Markup.button.callback(`👤 ${label.substring(0, 40)}`, `CHK_ACC_${acc.id}`)];
    });
    buttons.push([Markup.button.callback('🔙 Kembali', 'CHK_BACK')]);

    await ctx.answerCbQuery();
    await ctx.editMessageText('Daftar Akun:\nPilih akun yang ingin Anda lihat detailnya:', {
      ...Markup.inlineKeyboard(buttons)
    }).catch(()=>{});
  });

  bot.action('CHK_BACK', async (ctx) => {
    const masterRes = await getMasterAccounts();
    if (!masterRes.success || masterRes.data.length === 0) {
      return ctx.answerCbQuery("Belum ada master platform.");
    }

    const buttons = masterRes.data.map(game => 
      [Markup.button.callback(`🏢 ${game.name}`, `CHK_GAME_${game.id}`)]
    );

    await ctx.answerCbQuery();
    await ctx.editMessageText('Pilih platform untuk melihat daftar akunnya:', {
      ...Markup.inlineKeyboard(buttons)
    }).catch(()=>{});
  });

  bot.action(/^CHK_ACC_(.+)$/, async (ctx) => {
    const accId = ctx.match[1];
    const accRes = await getAccounts();
    const acc = accRes.data.find(a => a.id === accId);
    
    if (!acc) return ctx.answerCbQuery("Akun tidak ditemukan atau sudah terhapus.");
    
    try {
      const decryptedPass = decryptPassword(acc.password);
      await ctx.answerCbQuery("Mengambil password...");
      
      const descText = acc.description ? `\n📝 Spesifikasi: _${acc.description}_` : '';
      const text = `🔐 Username: \`${acc.username}\`\n🔑 Password: \`${decryptedPass}\`${descText}\n\n_(Pesan ini akan otomatis terhapus dalam 25 detik)_`;
      
      await ctx.editMessageText(text, { parse_mode: 'Markdown' }).catch(()=>{});
      
      setTimeout(async () => {
        try {
          if (ctx.callbackQuery && ctx.callbackQuery.message) {
            await ctx.deleteMessage();
          }
        } catch (err) {
          console.error("⚠️ Gagal menghapus pesan akun otomatis (25 detik):", err.message);
        }
      }, 25000);
    } catch(e) {
      await ctx.answerCbQuery("Gagal membuka password (Kunci Enkripsi mungkin berubah)", { show_alert: true });
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
    const masterRes = await getMasterAccounts();
    
    if (!accRes.success || accRes.data.length === 0) {
      return ctx.answerCbQuery('Belum ada akun di database.', { show_alert: true });
    }

    const activeMasterIds = new Set(accRes.data.map(acc => acc.masterId));
    const activeMasters = masterRes.success ? masterRes.data.filter(g => activeMasterIds.has(g.id)) : [];

    const buttons = activeMasters.map(game => 
      [Markup.button.callback(`🏢 ${game.name}`, `CHG_GAME_${game.id}`)]
    );

    await ctx.answerCbQuery();
    await ctx.editMessageText('Pilih platform untuk mengedit spesifikasi akun:', {
      ...Markup.inlineKeyboard(buttons)
    }).catch(()=>{});
  });

  bot.action('CMD_CHANGE_PASS', async (ctx) => {
    const accRes = await getAccounts();
    const masterRes = await getMasterAccounts();
    
    if (!accRes.success || accRes.data.length === 0) {
      return ctx.answerCbQuery('Belum ada akun di database.', { show_alert: true });
    }

    const activeMasterIds = new Set(accRes.data.map(acc => acc.masterId));
    const activeMasters = masterRes.success ? masterRes.data.filter(g => activeMasterIds.has(g.id)) : [];

    const buttons = activeMasters.map(game => 
      [Markup.button.callback(`🏢 ${game.name}`, `CHGPASS_GAME_${game.id}`)]
    );

    await ctx.answerCbQuery();
    await ctx.editMessageText('Pilih platform untuk mereset password akunnya:', {
      ...Markup.inlineKeyboard(buttons)
    }).catch(()=>{});
  });

  bot.action(/^CHG_GAME_(.+)$/, async (ctx) => {
    const masterId = ctx.match[1];
    const accRes = await getAccounts();
    
    if (!accRes.success) return ctx.answerCbQuery("Gagal memuat akun.");
    
    const masterAccounts = accRes.data.filter(a => a.masterId === masterId);
    if (masterAccounts.length === 0) return ctx.answerCbQuery("Tidak ada akun untuk platform ini.");
    
    const buttons = masterAccounts.map(acc => {
      const label = `${acc.username}`;
      return [Markup.button.callback(`👤 ${label.substring(0, 40)}`, `CHG_ACC_${acc.id}`)];
    });

    await ctx.answerCbQuery();
    await ctx.editMessageText('Pilih akun yang spesifikasinya ingin diubah:', {
      ...Markup.inlineKeyboard(buttons)
    }).catch(()=>{});
  });

  bot.action(/^CHGPASS_GAME_(.+)$/, async (ctx) => {
    const masterId = ctx.match[1];
    const accRes = await getAccounts();
    
    if (!accRes.success) return ctx.answerCbQuery("Gagal memuat akun.");
    
    const masterAccounts = accRes.data.filter(a => a.masterId === masterId);
    if (masterAccounts.length === 0) return ctx.answerCbQuery("Tidak ada akun untuk platform ini.");
    
    const buttons = masterAccounts.map(acc => {
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
          const masterRes = await getMasterAccounts();
          const game = masterRes.success ? masterRes.data.find(g => g.id === acc.masterId) : null;
          const masterName = game ? game.name : "Unknown";
          
          await ctx.telegram.sendMessage(config.CHAT_ID, `🔄 **Spesifikasi Akun Diperbarui**\n\nPlatform: ${masterName}\n📝 Spesifikasi Baru: ${newDesc || '-'}\nUser: \`${acc.username}\``, {
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
            const masterRes = await getMasterAccounts();
            const game = masterRes.success ? masterRes.data.find(g => g.id === acc.masterId) : null;
            const masterName = game ? game.name : "Unknown";
            
            await ctx.telegram.sendMessage(config.CHAT_ID, `🔄 **Password Akun Diperbarui**\n\nPlatform: ${masterName}\n📝 Spesifikasi: ${acc.description || '-'}\nUser: \`${acc.username}\`\nStatus: Password Baru Terenkripsi 🔐`, {
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
          masterId: ctx.session.selectedGame,
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
          const masterRes = await getMasterAccounts();
          const game = masterRes.success ? masterRes.data.find(g => g.id === newestAcc.masterId) : null;
          const masterName = game ? game.name : "Unknown";
          
          await ctx.telegram.sendMessage(config.CHAT_ID, `🆕 **Akun Baru Ditambahkan**\n\nPlatform: ${masterName}\n📝 Spesifikasi: ${newestAcc.description || '-'}\nUser: \`${newestAcc.username}\`\nStatus: Aman & Terenkripsi 🔐`, {
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
