const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 20 * 1024 * 1024 } });

function moveUploadWithSessionName(sessionId, slot, file) {
  const originalExt = path.extname(file.originalname || '') || '.jpg';
  const safeExt = originalExt.toLowerCase();
  const timestamp = Date.now();
  const filename = `${sessionId}_${slot}_${timestamp}${safeExt}`;
  const finalPath = path.join(UPLOADS_DIR, filename);
  fs.renameSync(file.path, finalPath);
  return filename;
}

function saveUploadedFile(sessionId, slot, file) {
  const filename = moveUploadWithSessionName(sessionId, slot, file);
  return {
    filename,
    url: `/uploads/${filename}`,
    absolutePath: path.join(UPLOADS_DIR, filename)
  };
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.heic') return 'image/heic';
  return 'image/jpeg';
}

function readFileAsBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

function readFileBuffer(filePath) {
  return fs.readFileSync(filePath);
}

module.exports = { UPLOADS_DIR, upload, saveUploadedFile, guessMimeType, readFileAsBase64, readFileBuffer };
