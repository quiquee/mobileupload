// Port of describe-images.py's Comfy Cloud REST client functions
// (upload_image, poll_for_completion, extract_text, raise_for_status/AuthError).
//
// Deliberate differences from the Python original:
//  - poll uses a non-blocking await/setTimeout loop instead of time.sleep(), since
//    this runs inside a Node server and must not block the event loop.
//  - much shorter poll interval/timeout defaults (the CLI script's 5s/300s are fine
//    for an offline batch job, far too long for a phone waiting on an HTTP response).
//  - no separate check_api_key() preflight -- callers just attempt the work and treat
//    an AuthError like any other per-item failure, same pattern as the Gemini recognizer.

const BASE_URL = 'https://cloud.comfy.org';

class ComfyAuthError extends Error {}

async function raiseForStatus(response) {
  if (response.status === 401 || response.status === 403) {
    const body = (await response.text()).trim().slice(0, 300);
    throw new ComfyAuthError(`Invalid or unauthorized Comfy Cloud API key (HTTP ${response.status}): ${body}`);
  }
  if (!response.ok) {
    const body = (await response.text()).trim().slice(0, 300);
    throw new Error(`Comfy Cloud request failed (HTTP ${response.status}): ${body}`);
  }
}

async function uploadImage(apiKey, imageBuffer, filename, mimeType) {
  const form = new FormData();
  form.append('image', new Blob([imageBuffer], { type: mimeType }), filename);
  form.append('overwrite', 'true');

  const response = await fetch(`${BASE_URL}/api/upload/image`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: form,
    signal: AbortSignal.timeout(30000)
  });
  await raiseForStatus(response);
  const data = await response.json();
  return data.name;
}

async function submitPrompt(apiKey, apiPrompt) {
  const response = await fetch(`${BASE_URL}/api/prompt`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: apiPrompt }),
    signal: AbortSignal.timeout(30000)
  });
  await raiseForStatus(response);
  const data = await response.json();
  if (!data.prompt_id) {
    throw new Error(`Unexpected /api/prompt response: ${JSON.stringify(data)}`);
  }
  return data.prompt_id;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForCompletion(apiKey, promptId, { pollIntervalMs = 3000, maxWaitMs = 90000 } = {}) {
  const jobUrl = `${BASE_URL}/api/jobs/${promptId}`;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    await sleep(pollIntervalMs);
    elapsed += pollIntervalMs;

    let data;
    try {
      const response = await fetch(jobUrl, {
        headers: { 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(15000)
      });
      await raiseForStatus(response);
      data = await response.json();
    } catch (err) {
      if (err instanceof ComfyAuthError) throw err;
      continue; // transient poll error, keep trying until maxWaitMs
    }

    const status = data.status;
    if (status === 'error' || status === 'failed') {
      const detail = data.execution_status || data.error || data.errors || data.exception_message || data.node_errors || data;
      throw new Error(`Comfy Cloud job failed: ${JSON.stringify(detail)}`);
    }
    if (status === 'completed') {
      return data.outputs || {};
    }
  }

  const timeoutErr = new Error(`Comfy Cloud job ${promptId} not completed within ${maxWaitMs}ms`);
  timeoutErr.name = 'TimeoutError';
  throw timeoutErr;
}

function extractText(outputs) {
  const candidateKeys = ['text', 'string', 'strings', 'value', 'generated_text'];

  for (const nodeOutput of Object.values(outputs)) {
    if (!nodeOutput || typeof nodeOutput !== 'object') continue;
    for (const key of candidateKeys) {
      const value = nodeOutput[key];
      if (Array.isArray(value) && value.length) return String(value[0]);
      if (typeof value === 'string' && value) return value;
    }
  }

  return null;
}

module.exports = { ComfyAuthError, uploadImage, submitPrompt, pollForCompletion, extractText };
