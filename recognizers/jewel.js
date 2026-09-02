const { upload } = require('../lib/storage');
const { ValidationError } = require('../lib/errors');
const { logInfo } = require('../lib/logger');

const TYPE = 'jewel';
const MAX_JEWEL_PHOTOS = 8;

const JEWEL_PLACEHOLDER_JSON = {
  category: null,
  metalType: null,
  gemstones: [],
  estimatedWeightGrams: null,
  condition: null,
  _placeholder: true,
  notes: 'jewel recognition provider not yet integrated'
};

// Seam for the future jewel-recognition provider (cloud service TBD). Until it's
// wired up this ignores imagePaths and returns a fixed placeholder, so the capture
// UI and the rest of the pipeline are testable end-to-end ahead of that decision.
// eslint-disable-next-line no-unused-vars
async function extractJewelData({ traceId, imagePaths }) {
  logInfo('jewel_extraction_placeholder', { traceId, imageCount: imagePaths.length });
  return JEWEL_PLACEHOLDER_JSON;
}

async function handle({ id, traceId, req, saveFile }) {
  const files = Array.isArray(req.files) ? req.files : [];

  logInfo('complete_request_received', {
    traceId,
    id,
    type: TYPE,
    photoCount: files.length
  });

  if (files.length === 0) {
    throw new ValidationError('No files received');
  }

  const saved = files.map((file, index) => saveFile(`image-${index}`, file));
  const photos = saved.map((entry) => entry.url);

  const documentData = await extractJewelData({
    traceId,
    imagePaths: saved.map((entry) => entry.absolutePath)
  });

  return {
    ok: true,
    id,
    type: TYPE,
    photos,
    photoUrls: photos,
    documentData
  };
}

module.exports = {
  type: TYPE,
  MAX_JEWEL_PHOTOS,
  multer: upload.array('images', MAX_JEWEL_PHOTOS),
  handle
};
