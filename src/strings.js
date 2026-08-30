// src/strings.js
// Tempat menyimpan kumpulan teks (string) agar mudah diubah tanpa membongkar logika utama

module.exports = {
    // Teks untuk Dashboard
    DASHBOARD: {
        ACTIVITY_TITLE: "Log Aktivitas",
        ACTIVITY_SUBTITLE: "5 File terakhir yang baru saja diunggah ke cloud",
        TABLE_NO: "NO",
        TABLE_FILE: "Nama File",
        TABLE_CATEGORY: "Kategori",
        TABLE_LABEL: "Label / Topik",
        TABLE_TIME: "Waktu",
        NO_ACTIVITY: "Belum ada aktivitas file terbaru.",
        
        // Kategori File
        CAT_DOCUMENT: "📄 Dokumen",
        CAT_VIDEO: "🎥 Video",
        CAT_PHOTO: "📸 Foto",
        CAT_AUDIO: "🎵 Audio",
        CAT_UNKNOWN: "❓ Lainnya",
        
        // Label badge
        BADGE_NEW: "Baru"
    },
    
    // Fungsi bantuan untuk mendapatkan teks kategori
    getCategoryText: function(fileName, fileType) {
        const utils = require('./utils');
        let category = 'file';
        
        // Prioritaskan deteksi via utils.js berdasarkan ekstensi file
        if (fileName) {
            category = utils.getFileCategory(fileName);
        } else if (fileType) {
            category = fileType.toLowerCase();
        }

        if (category === 'video') return this.DASHBOARD.CAT_VIDEO;
        if (category === 'photo') return this.DASHBOARD.CAT_PHOTO;
        if (category === 'project') return this.DASHBOARD.CAT_DOCUMENT; // Anggap project sbg dokumen zip/rar di UI
        if (category === 'document') return this.DASHBOARD.CAT_DOCUMENT;
        if (category === 'audio') return this.DASHBOARD.CAT_AUDIO;
        
        return this.DASHBOARD.CAT_UNKNOWN;
    }
};
