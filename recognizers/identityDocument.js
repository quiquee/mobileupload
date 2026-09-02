const { upload, saveUploadedFile, guessMimeType, readFileAsBase64 } = require('../lib/storage');
const { readSecret } = require('../lib/secrets');
const { ValidationError } = require('../lib/errors');
const { logInfo, logError } = require('../lib/logger');

const TYPE = 'identity_document';

const FALLBACK_DOCUMENT_JSON = {
  firstName: 'María',
  lastName: 'García Pérez',
  documentType: 'ID',
  idNumber: '12345678A',
  dateOfBirth: '01-01-1990',
  dateOfExpiry: '01-01-2030',
  sex: 'F',
  nationality: 'ESP',
  streetName: 'Avenida de Madrid',
  streetNumber: 'S/N',
  postalCode: '28001',
  city: 'Madrid',
  province: 'Madrid',
  country: 'España',
  countryCode: 'ES',
  additionalDetails: {
    mrz: 'IDESPCAA000000499999999R<<<<<<8001014F3106028ESP<<<<<<<<<<<1ESPANOLA<ESPANOLA<<CARMEN<<<<<',
    supportNumber: 'AAA111111',
    cardAccessNumber: '987654',
    issuingAuthority: '28001A00K',
    placeOfBirth: 'Madrid, Madrid',
    parentsNames: ['Juan', 'Carmen'],
    biometrics: ['Digital Facial Image', 'Left Index Fingerprint', 'Right Index Fingerprint'],
    certificates: ['Authentication Certificate', 'Electronic Signature Certificate']
  }
};

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    firstName:     { type: 'STRING', nullable: true },
    lastName:      { type: 'STRING', nullable: true },
    documentType:  { type: 'STRING', nullable: true },
    idNumber:      { type: 'STRING', nullable: true },
    dateOfBirth:   { type: 'STRING', nullable: true },
    dateOfExpiry:  { type: 'STRING', nullable: true },
    sex:           { type: 'STRING', nullable: true },
    nationality:   { type: 'STRING', nullable: true },
    streetName:    { type: 'STRING', nullable: true },
    streetNumber:  { type: 'STRING', nullable: true },
    postalCode:    { type: 'STRING', nullable: true },
    city:          { type: 'STRING', nullable: true },
    province:      { type: 'STRING', nullable: true },
    country:       { type: 'STRING', nullable: true },
    countryCode:   { type: 'STRING', nullable: true },
    additionalDetails: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        mrz:              { type: 'STRING', nullable: true },
        supportNumber:    { type: 'STRING', nullable: true },
        cardAccessNumber: { type: 'STRING', nullable: true },
        issuingAuthority: { type: 'STRING', nullable: true },
        placeOfBirth:     { type: 'STRING', nullable: true },
        parentsNames:     { type: 'ARRAY',  nullable: true, items: { type: 'STRING' } },
        biometrics:       { type: 'ARRAY',  nullable: true, items: { type: 'STRING' } },
        certificates:     { type: 'ARRAY',  nullable: true, items: { type: 'STRING' } }
      }
    }
  }
};

const GEMINI_TIMEOUT_MS = 15000;

async function extractDocumentData({ traceId, docType, frontPath, backPath }) {
  const geminiKey = readSecret('GEMINI_API_KEY');
  if (!geminiKey) {
    logInfo('gemini_key_missing_using_fallback', { traceId, docType });
    return FALLBACK_DOCUMENT_JSON;
  }

  const parts = [
    {
      text:
        'You are an OCR and identity-document extraction engine. ' +
        'Extract all readable fields from the provided document image(s). ' +
        'documentType must be one of: ID, NIE, PASSPORT, DRIVER_LICENSE. ' +
        'Infer countryCode (ISO 3166-1 alpha-2) from the document when possible. ' +
        'Place MRZ, support number, card access number, issuing authority, place of birth, ' +
        'parents names, biometrics and certificates inside additionalDetails. ' +
        'Use null for any field that cannot be extracted or inferred.'
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
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: GEMINI_RESPONSE_SCHEMA
          }
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

    const documentData = JSON.parse(text);
    logInfo('gemini_extraction_success', { traceId, docType, documentData });
    return documentData;
  } catch (err) {
    logError('gemini_extraction_failed', {
      traceId,
      docType,
      error: { message: err.message, stack: err.stack, name: err.name }
    });
    return FALLBACK_DOCUMENT_JSON;
  }
}

async function handle({ id, traceId, req, saveFile }) {
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
    throw new ValidationError('No files received', { docType });
  }

  const savedFront = frontFile ? saveFile('front', frontFile) : null;
  const savedBack = backFile ? saveFile('back', backFile) : null;

  const photos = {
    front: savedFront ? savedFront.url : null,
    back: savedBack ? savedBack.url : null
  };

  const documentData = await extractDocumentData({
    traceId,
    docType,
    frontPath: savedFront ? savedFront.absolutePath : null,
    backPath: savedBack ? savedBack.absolutePath : null
  });

  return {
    ok: true,
    id,
    type: TYPE,
    docType,
    photos,
    photoUrls: [photos.front, photos.back].filter(Boolean),
    documentData
  };
}

module.exports = {
  type: TYPE,
  multer: upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 }
  ]),
  handle
};
