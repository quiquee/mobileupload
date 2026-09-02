const fs = require('fs');
const path = require('path');

const { upload, UPLOADS_DIR } = require('../lib/storage');
const { readSecret } = require('../lib/secrets');
const { ValidationError } = require('../lib/errors');
const { logInfo, logError } = require('../lib/logger');
const { uiWorkflowToApiPrompt, findNodeIdByClassType } = require('../lib/comfyWorkflow');
const { buildCollage } = require('../lib/collage');
const comfyCloud = require('../lib/comfyCloud');

const TYPE = 'jewel';
const MAX_JEWEL_PHOTOS = 8;

// Bounded timeout appropriate for a synchronous HTTP request a phone is waiting on --
// the reference CLI script's own defaults (5s/300s) are fine for an offline batch job
// but far too long here. Only one Comfy Cloud job runs per jewel (see below), so this
// bound is the whole request's recognition latency budget, independent of photo count.
const COMFY_POLL_INTERVAL_MS = 3000;
const COMFY_MAX_WAIT_MS = 90000;

const WORKFLOW_PATH = path.join(__dirname, 'jewel-workflow.json');
const PROMPT_PATH = path.join(__dirname, 'jewel-prompt.txt');

// Flattened once at module load (mirrors the reference script building its template
// once before looping over images), not on every request.
const uiWorkflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
const workflowTemplate = uiWorkflowToApiPrompt(uiWorkflow);
const loadImageNodeId = findNodeIdByClassType(workflowTemplate, 'LoadImage');
const textGenerateNodeId = findNodeIdByClassType(workflowTemplate, 'TextGenerate');
const jewelPrompt = fs.existsSync(PROMPT_PATH)
  ? fs.readFileSync(PROMPT_PATH, 'utf8').replace(/\n+$/, '')
  : null;

if (!loadImageNodeId) {
  throw new Error('jewel-workflow.json has no LoadImage node');
}

function stripAccents(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeLabel(label) {
  return stripAccents(label).toLowerCase().trim();
}

// Best-effort parse of the "- Label: value" bullet list the workflow's prompt asks
// for (see jewel-prompt.txt). Real output (see VendeOro/inventario/descriptions.csv)
// varies in dash/spacing and accents ("Descripcion" vs "Descripción"), so labels are
// matched loosely; rawText is always kept as the source of truth, so a parse miss
// here never loses information.
function parseJewelDescription(rawText) {
  const parsed = {
    metal: null,
    reference: null,
    jewelType: null,
    weightGrams: null,
    metalColor: null,
    hasGems: null,
    gemsDescription: null,
    description: null
  };

  for (const line of rawText.split('\n')) {
    const match = line.trim().match(/^-\s*([^:]+):\s*(.*)$/);
    if (!match) continue;
    const label = normalizeLabel(match[1]);
    const value = match[2].trim();
    if (!value) continue;

    if (label === 'metal') {
      parsed.metal = value;
    } else if (label === 'referencia') {
      parsed.reference = value;
    } else if (label === 'tipo de joya') {
      parsed.jewelType = value;
    } else if (label === 'peso') {
      const numeric = value.replace(',', '.').match(/[\d.]+/);
      parsed.weightGrams = numeric ? parseFloat(numeric[0]) : null;
    } else if (label === 'color del metal') {
      parsed.metalColor = value;
    } else if (label === 'presencia de gemas') {
      const normalizedValue = normalizeLabel(value);
      if (normalizedValue.startsWith('si')) parsed.hasGems = true;
      else if (normalizedValue.startsWith('no')) parsed.hasGems = false;
    } else if (label.startsWith('descripcion de')) {
      parsed.gemsDescription = value;
    } else if (label === 'descripcion') {
      parsed.description = value;
    }
  }

  return parsed;
}

// Builds one collage image out of every uploaded photo and saves it alongside them
// (for debugging/audit -- it's not part of the `photos` returned to the widget, only
// the individual photos are).
function saveCollage(id, collageBuffer) {
  const filename = `${id}_collage_${Date.now()}.jpg`;
  const absolutePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(absolutePath, collageBuffer);
  return { filename, url: `/uploads/${filename}`, absolutePath };
}

async function recognizeCollage({ traceId, apiKey, collage, collageBuffer }) {
  try {
    const uploadedName = await comfyCloud.uploadImage(apiKey, collageBuffer, collage.filename, 'image/jpeg');

    const prompt = JSON.parse(JSON.stringify(workflowTemplate));
    prompt[loadImageNodeId].inputs.image = uploadedName;
    if (jewelPrompt && textGenerateNodeId) {
      prompt[textGenerateNodeId].inputs.prompt = jewelPrompt;
    }

    const promptId = await comfyCloud.submitPrompt(apiKey, prompt);
    const outputs = await comfyCloud.pollForCompletion(apiKey, promptId, {
      pollIntervalMs: COMFY_POLL_INTERVAL_MS,
      maxWaitMs: COMFY_MAX_WAIT_MS
    });

    const rawText = comfyCloud.extractText(outputs);
    if (!rawText) {
      logError('jewel_extraction_empty_response', { traceId });
      return { status: 'error', rawText: null, parsed: null };
    }

    logInfo('jewel_extraction_success', { traceId, rawText });
    return { status: 'ok', rawText, parsed: parseJewelDescription(rawText) };
  } catch (err) {
    const status = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'error';
    logError('jewel_extraction_failed', {
      traceId,
      status,
      error: { message: err.message, name: err.name }
    });
    return { status, rawText: null, parsed: null };
  }
}

async function extractJewelData({ id, traceId, photos }) {
  const apiKey = readSecret('COMFY_API_KEY');
  if (!apiKey) {
    logInfo('comfy_key_missing_using_placeholder', { traceId, photoCount: photos.length });
    return { status: 'unavailable', rawText: null, parsed: null };
  }

  const collageBuffer = await buildCollage(photos.map((photo) => photo.absolutePath));
  const collage = saveCollage(id, collageBuffer);
  logInfo('jewel_collage_built', { traceId, photoCount: photos.length, collageUrl: collage.url });

  return recognizeCollage({ traceId, apiKey, collage, collageBuffer });
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

  const documentData = await extractJewelData({ id, traceId, photos: saved });

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
