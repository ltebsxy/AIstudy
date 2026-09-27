const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Windows caches icons by file path. Give each artwork revision its own path.
function resolveAppIcon(sourcePath, dataDirectory) {
  const bytes = fs.readFileSync(sourcePath);
  const revision = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const directory = path.join(dataDirectory, 'icon-cache');
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, `ai-studydesk-${revision}.ico`);
  if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes)) fs.writeFileSync(target, bytes);
  return target;
}

module.exports = { resolveAppIcon };
