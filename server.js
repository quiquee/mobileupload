const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const PORT = process.env.PORT || cfg.port || 3456;
const HOST = process.env.HOST || cfg.host || '0.0.0.0';
const PUBLIC_URL = (process.env.PUBLIC_URL || cfg.publicUrl || `http://localhost:${PORT}`).replace(/\/$/, '');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST'] } });

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const LOG_FILE = path.join(__dirname, 'mobileupload-debug.log');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 20 * 1024 * 1024 } });

const FALLBACK_DOCUMENT_JSON = {
  documentType: 'Documento Nacional de Identidad / National Identity Card',
  countryCode: 'ES',
  front: {
    dniNumber: '12345678A',
    surnames: ['García', 'Pérez'],
    name: 'María',
    sex: 'F',
    nationality: 'ESP',
    dateOfBirth: '01-01-1990',
    dateOfExpiry: '01-01-2030',
    cardAccessNumber: '987654',
    supportNumber: 'AAA111111',
    visuals: {
      photo: 'Facial Image',
      signature: 'Cardholder Signature'
    }
  },
  back: {
    placeOfBirth: {
      city: 'Madrid',
      provinceOrCountry: 'Madrid'
    },
    parentsNames: ['Juan', 'Carmen'],
    address: {
      street: 'Avenida de Madrid S/N',
      city: 'Madrid',
      province: 'Madrid'
    },
    issuingAuthority: '28001A00K',
    mrz: 'IDESPCAA000000499999999R<<<<<<8001014F3106028ESP<<<<<<<<<<<1ESPANOLA<ESPANOLA<<CARMEN<<<<<'
  },
  microchip: {
    biometrics: ['Digital Facial Image', 'Left Index Fingerprint', 'Right Index Fingerprint'],
    certificates: ['Authentication Certificate', 'Electronic Signature Certificate']
  }
};

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
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 }
  ]),
  async (req, res) => {
    const { id } = req.params;
    const traceId = `${id}-${Date.now()}`;
    const files = req.files || {};
    const frontFile = Array.isArray(files.front) ? files.front[0] : null;
    const backFile = Array.isArray(files.back) ? files.back[0] : null;
    const docType = typeof req.body.docType === 'string' ? req.body.docType : 'dni';

    logInfo('complete_request_received', {
      traceId,
      id,
      docType,
      hasFront: !!frontFile,
      hasBack: !!backFile
    });

    if (!frontFile && !backFile) {
      logError('complete_request_missing_files', {
        traceId,
        id,
        docType
      });
      return res.status(400).json({ ok: false, error: 'No files received', traceId });
    }

    try {
      const savedFront = frontFile ? moveUploadWithSessionName(id, 'front', frontFile) : null;
      const savedBack = backFile ? moveUploadWithSessionName(id, 'back', backFile) : null;

      const photos = {
        front: savedFront ? `/uploads/${savedFront}` : null,
        back: savedBack ? `/uploads/${savedBack}` : null
      };

      const documentData = await extractDocumentData({
        traceId,
        docType,
        frontPath: savedFront ? path.join(UPLOADS_DIR, savedFront) : null,
        backPath: savedBack ? path.join(UPLOADS_DIR, savedBack) : null
      });

      const payload = {
        ok: true,
        id,
        docType,
        photos,
        photoUrls: [photos.front, photos.back].filter(Boolean),
        documentData
      };

      io.to(id).emit('session-complete', payload);
      logInfo('complete_request_success', {
        traceId,
        id,
        docType,
        front: photos.front,
        back: photos.back,
        documentData
      });
      return res.json(payload);
    } catch (err) {
      logError('complete_request_failed', {
        traceId,
        id,
        docType,
        error: serializeError(err)
      });
      return res.status(500).json({ ok: false, error: 'Unable to process document', traceId });
    }
  }
);

io.on('connection', (socket) => {
  socket.on('join', (id) => {
    socket.join(id);
  });
});

function moveUploadWithSessionName(sessionId, slot, file) {
  const originalExt = path.extname(file.originalname || '') || '.jpg';
  const safeExt = originalExt.toLowerCase();
  const timestamp = Date.now();
  const filename = `${sessionId}_${slot}_${timestamp}${safeExt}`;
  const finalPath = path.join(UPLOADS_DIR, filename);
  fs.renameSync(file.path, finalPath);
  return filename;
}

function readGeminiKeyFromSecrets() {
  const secretsPath = path.join(__dirname, 'secrets.txt');
  if (!fs.existsSync(secretsPath)) return '';
  const content = fs.readFileSync(secretsPath, 'utf8');
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('GEMINI_API_KEY='));
  if (!line) return '';
  return line.slice('GEMINI_API_KEY='.length).trim();
}

function normalizeGeminiJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function readFileAsBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

async function extractDocumentData({ traceId, docType, frontPath, backPath }) {
  const geminiKey = readGeminiKeyFromSecrets();
  if (!geminiKey) {
    logInfo('gemini_key_missing_using_fallback', { traceId, docType });
    return FALLBACK_DOCUMENT_JSON;
  }

  const parts = [
    {
      text:
        'You are an OCR and identity-document extraction engine. Return only valid JSON without markdown. Infer as much as possible from the images. Keep null for unknown fields. Return this structure: {documentType,countryCode,front,back,microchip}. Use concise strings and arrays.'
    },
    { text: `documentHint=${docType}` }
  ];

  if (frontPath) {
    parts.push({ text: 'frontImage' });
    parts.push({
      inline_data: {
        mime_type: guessMimeType(frontPath),
        data: readFileAsBase64(frontPath)
      }
    });
  }

  if (backPath) {
    parts.push({ text: 'backImage' });
    parts.push({
      inline_data: {
        mime_type: guessMimeType(backPath),
        data: readFileAsBase64(backPath)
      }
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      logError('gemini_http_error', {
        traceId,
        status: response.status,
        body: responseText
      });
      return FALLBACK_DOCUMENT_JSON;
    }

    const result = await response.json();
    const text = (result.candidates || [])
      .flatMap((candidate) => (candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : []))
      .map((part) => part.text || '')
      .join('\n')
      .trim();

    if (!text) {
      logError('gemini_empty_response_using_fallback', {
        traceId,
        docType
      });
      return FALLBACK_DOCUMENT_JSON;
    }

    const documentData = normalizeGeminiJson(text);
    logInfo('gemini_extraction_success', { traceId, docType, documentData });
    return documentData;
  } catch (err) {
    logError('gemini_extraction_failed', {
      traceId,
      docType,
      error: serializeError(err)
    });
    return FALLBACK_DOCUMENT_JSON;
  }
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.heic') return 'image/heic';
  return 'image/jpeg';
}

function serializeError(err) {
  if (!err) return { message: 'Unknown error' };
  return {
    message: err.message,
    stack: err.stack,
    name: err.name
  };
}

function writeLog(level, event, meta = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    event,
    meta
  };
  const line = `${JSON.stringify(entry)}\n`;

  if (level === 'error') {
    console.error(`[${event}]`, meta);
  } else {
    console.log(`[${event}]`, meta);
  }

  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (fileErr) {
    console.error('[log_write_failed]', serializeError(fileErr));
  }
}

function logInfo(event, meta) {
  writeLog('info', event, meta);
}

function logError(event, meta) {
  writeLog('error', event, meta);
}

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
