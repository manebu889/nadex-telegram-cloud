const fs = require('fs');
const path = require('path');
const https = require('https');

function getTopicIdByExtension(fileName, topicsConfig) {
  const ext = path.extname(fileName).toLowerCase();
  const picturesExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const projectExt = ['.zip', '.rar', '.tar', '.gz', '.7z', '.cdr', '.psd'];
  const documentExt = ['.pdf', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'];
  
  if (picturesExt.includes(ext) && topicsConfig.TOPIC_PICTURES) return topicsConfig.TOPIC_PICTURES;
  if (projectExt.includes(ext) && topicsConfig.TOPIC_PROJECT) return topicsConfig.TOPIC_PROJECT;
  if (documentExt.includes(ext) && topicsConfig.TOPIC_DOCUMENT) return topicsConfig.TOPIC_DOCUMENT;
  return undefined; 
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function getFileCategory(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const picturesExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const projectExt = ['.zip', '.rar', '.tar', '.gz', '.7z', '.cdr', '.psd'];
  const documentExt = ['.pdf', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'];

  if (picturesExt.includes(ext)) return 'photo';
  if (projectExt.includes(ext)) return 'project';
  if (documentExt.includes(ext)) return 'document';
  return 'file'; // default fallback
}

module.exports = { getTopicIdByExtension, downloadFile, getFileCategory };
