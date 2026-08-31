const express = require('express');
const path = require('path');
const os = require('os');
const { getMasterAccounts, getAccounts, getDocuments } = require('../database');
const config = require('../config');

function startDashboard(port = 3000) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use('/assets', express.static(path.join(__dirname, 'assets')));
  
  // Serve the dashboard
  app.get('/', (req, res) => {
    res.render('index');
  });

  // API endpoint for dashboard to fetch stats
  app.get('/api/stats', async (req, res) => {
    try {
      const gamesRes = await getMasterAccounts();
      const accRes = await getAccounts();
      const filesRes = await getDocuments('files');

      const totalGames = gamesRes.success && gamesRes.data ? gamesRes.data.length : 0;
      const totalAccounts = accRes.success && accRes.data ? accRes.data.length : 0;
      const totalFiles = filesRes.success && filesRes.data ? filesRes.data.length : 0;

      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      const usedMem = totalMem - freeMem;
      const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);

      // Mengambil Data Hardisk menggunakan fs.promises.statfs (Node 18+)
      const fs = require('fs');
      let diskUsedGB = '0.00 GB', diskTotalGB = '0.00 GB', diskPercent = '0.00';
      try {
          const rootPath = os.platform() === 'win32' ? 'C:/' : '/';
          const diskData = await fs.promises.statfs(rootPath);
          const diskTotal = diskData.blocks * diskData.bsize;
          const diskFree = diskData.bfree * diskData.bsize;
          const diskUsed = diskTotal - diskFree;
          diskPercent = ((diskUsed / diskTotal) * 100).toFixed(2);
          diskUsedGB = (diskUsed / 1024 / 1024 / 1024).toFixed(2) + ' GB';
          diskTotalGB = (diskTotal / 1024 / 1024 / 1024).toFixed(2) + ' GB';
      } catch (err) {
          console.error("[ERROR] Gagal membaca disk:", err.message);
      }

      // Ambil 5 File Terakhir untuk Activity Log
      let recentFiles = [];
      if (filesRes.success && filesRes.data) {
          recentFiles = [...filesRes.data]
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, 5)
              .map(file => {
                  const strings = require('../strings');
                  const fileName = file.fileName || file.name || 'Unknown File';
                  return {
                      name: fileName,
                      category: strings.getCategoryText(fileName, file.type),
                      label: file.label || '-',
                      size: file.size || 0,
                      time: file.createdAt
                  };
              });
      }

      const stats = {
        hostname: os.hostname(),
        uptime: os.uptime(), 
        botStatus: 'Online', 
        memory: {
          used: (usedMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
          total: (totalMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
          percent: memUsagePercent
        },
        disk: {
          used: diskUsedGB,
          total: diskTotalGB,
          percent: diskPercent
        },
        database: {
          totalGames,
          totalAccounts,
          totalFiles
        },
        recentActivity: recentFiles,
        uiStrings: require('../strings').DASHBOARD
      };
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`[INFO] Web Monitoring berjalan di http://127.0.0.1:${port}`);
  });
}

module.exports = startDashboard;
