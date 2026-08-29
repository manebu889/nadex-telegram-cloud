const express = require('express');
const path = require('path');
const os = require('os');
const { getMasterGames, getAccounts, getDocuments } = require('../database');
const config = require('../config');

function startDashboard(port = 3000) {
  const app = express();
  
  // Serve the HTML file
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  // API endpoint for dashboard to fetch stats
  app.get('/api/stats', async (req, res) => {
    try {
      const gamesRes = await getMasterGames();
      const accRes = await getAccounts();
      const filesRes = await getDocuments('files');

      const totalGames = gamesRes.success && gamesRes.data ? gamesRes.data.length : 0;
      const totalAccounts = accRes.success && accRes.data ? accRes.data.length : 0;
      const totalFiles = filesRes.success && filesRes.data ? filesRes.data.length : 0;

      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      const usedMem = totalMem - freeMem;
      const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);

      const stats = {
        uptime: process.uptime(), 
        botStatus: 'Online', 
        memory: {
          used: (usedMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
          total: (totalMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
          percent: memUsagePercent
        },
        database: {
          totalGames,
          totalAccounts,
          totalFiles
        }
      };

      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`[INFO] Web Monitoring berjalan di http://0.0.0.0:${port}`);
  });
}

module.exports = startDashboard;
