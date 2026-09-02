const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const { saveUploadedFile } = require('./lib/storage');
const { ValidationError, serializeError } = require('./lib/errors');
const { logInfo, logError } = require('./lib/logger');
const { getRecognizer } = require('./recognizers');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const PORT = process.env.PORT || cfg.port || 3456;
const HOST = process.env.HOST || cfg.host || '0.0.0.0';
const PUBLIC_URL = (process.env.PUBLIC_URL || cfg.publicUrl || `http://localhost:${PORT}`).replace(/\/$/, '');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/session', (req, res) => {
  res.json({ id: uuidv4(), publicUrl: PUBLIC_URL });
});

app.get('/api/config', (req, res) => {
  res.json({ publicUrl: PUBLIC_URL });
});

app.get('/upload', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.get('/api/mobile-ready/:id', (req, res) => {
  io.to(req.params.id).emit('mobile-connected');
  res.json({ ok: true });
});

app.post(
  '/api/complete/:id',
  (req, res, next) => {
    req.recognizer = getRecognizer(req.query.type);
    next();
  },
  (req, res, next) => req.recognizer.multer(req, res, next),
  async (req, res) => {
    const { id } = req.params;
    const traceId = `${id}-${Date.now()}`;
    const saveFile = (slot, file) => saveUploadedFile(id, slot, file);

    try {
      const payload = await req.recognizer.handle({ id, traceId, req, saveFile });

      io.to(id).emit('session-complete', payload);
      logInfo('complete_request_success', {
        traceId,
        id,
        type: req.recognizer.type,
        payload
      });
      return res.json(payload);
    } catch (err) {
      if (err instanceof ValidationError) {
        logError('complete_request_missing_files', {
          traceId,
          id,
          type: req.recognizer.type,
          ...err.meta
        });
        return res.status(400).json({ ok: false, error: err.message, traceId });
      }

      logError('complete_request_failed', {
        traceId,
        id,
        type: req.recognizer.type,
        error: serializeError(err)
      });
      return res.status(500).json({ ok: false, error: 'Unable to process document', traceId });
    }
  },
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const traceId = `${req.params.id}-${Date.now()}`;
      logError('complete_request_multer_error', {
        traceId,
        id: req.params.id,
        error: serializeError(err)
      });
      return res.status(400).json({ ok: false, error: err.message, traceId });
    }
    next(err);
  }
);

io.on('connection', (socket) => {
  socket.on('join', (id) => {
    socket.join(id);
  });
});

app.use((err, req, res, next) => {
  const traceId = `uncaught-${Date.now()}`;
  logError('express_unhandled_error', {
    traceId,
    method: req.method,
    url: req.originalUrl,
    error: serializeError(err)
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({ ok: false, error: 'Internal server error', traceId });
});

server.listen(PORT, HOST, () => {
  console.log(`mobileupload running on ${PUBLIC_URL}  (binding ${HOST}:${PORT})`);
});
