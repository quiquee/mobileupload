const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const PORT       = process.env.PORT       || cfg.port      || 3456;
const HOST       = process.env.HOST       || cfg.host      || '0.0.0.0';
const PUBLIC_URL = (process.env.PUBLIC_URL || cfg.publicUrl || `http://localhost:${PORT}`)
  .replace(/\/$/, '');

const app = express();
const server = http.createServer(app);
// The widget is embedded from other origins (e.g. the POS app), so the desktop
// browser makes cross-origin calls to /api/* and opens a cross-origin socket.
// Allow CORS for both the HTTP routes and the Socket.IO transport.
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST'] } });

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

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Generate a new session ID
app.get('/api/session', (req, res) => {
  res.json({ id: uuidv4(), publicUrl: PUBLIC_URL });
});

// Expose public URL so the widget can build QR codes correctly
app.get('/api/config', (req, res) => {
  res.json({ publicUrl: PUBLIC_URL });
});

// Mobile upload page — no-cache so phones always receive the latest version
app.get('/upload', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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

  // 'slot' is an optional field sent by the mobile page ('front' or 'back')
  const slot = typeof req.body.slot === 'string' ? req.body.slot : undefined;

  const photoUrl = `/uploads/${newName}`;
  io.to(id).emit('photo-ready', { url: photoUrl, slot });
  res.json({ ok: true, url: photoUrl });
});

// Socket.io: desktop widget joins room by session ID
io.on('connection', (socket) => {
  socket.on('join', (id) => {
    socket.join(id);
  });
});

server.listen(PORT, HOST, () => console.log(`mobileupload running on ${PUBLIC_URL}  (binding ${HOST}:${PORT})`));
