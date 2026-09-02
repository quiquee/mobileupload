const fs = require('fs');
const path = require('path');

const SECRETS_PATH = path.join(__dirname, '..', 'secrets.txt');

function readSecret(key) {
  if (!fs.existsSync(SECRETS_PATH)) return '';
  const content = fs.readFileSync(SECRETS_PATH, 'utf8');
  const prefix = `${key}=`;
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(prefix));
  if (!line) return '';
  return line.slice(line.indexOf(prefix) + prefix.length).trim();
}

module.exports = { readSecret };
