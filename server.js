const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${req.params.id}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));

// Generate a new session ID
app.get('/api/session', (req, res) => {
  res.json({ id: uuidv4() });
});

// Mobile upload page
app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// Notify desktop when mobile opens the upload page
app.get('/api/mobile-ready/:id', (req, res) => {
  io.to(req.params.id).emit('mobile-connected');
  res.json({ ok: true });
});

// Handle photo upload from mobile (supports multiple uploads per session)
app.post('/api/upload/:id', upload.single('photo'), (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file received' });

  // Rename to avoid overwriting previous uploads in the same session
  const ext = path.extname(req.file.filename);
  const base = path.basename(req.file.filename, ext);
  const timestamp = Date.now();
  const newName = `${base}_${timestamp}${ext}`;
  const newPath = path.join(UPLOADS_DIR, newName);
  fs.renameSync(req.file.path, newPath);

  const photoUrl = `/uploads/${newName}`;
  io.to(id).emit('photo-ready', { url: photoUrl });
  res.json({ ok: true, url: photoUrl });
});

// Socket.io: desktop widget joins room by session ID
io.on('connection', (socket) => {
  socket.on('join', (id) => {
    socket.join(id);
  });
});

const PORT = process.env.PORT || 3456;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => console.log(`mobileupload running on http://${HOST}:${PORT}`));
