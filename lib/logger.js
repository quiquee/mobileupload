const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'mobileupload-debug.log');

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
    console.error('[log_write_failed]', { message: fileErr.message, stack: fileErr.stack, name: fileErr.name });
  }
}

function logInfo(event, meta) {
  writeLog('info', event, meta);
}

function logError(event, meta) {
  writeLog('error', event, meta);
}

module.exports = { logInfo, logError };
