const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveAppIcon } = require('../lib/app-icon');

test('icon changes at the same source path invalidate the Windows cache path', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-icon-'));
  try {
    const source = path.join(directory, 'source.ico');
    fs.writeFileSync(source, 'old icon');
    const oldPath = resolveAppIcon(source, directory);
    assert.equal(resolveAppIcon(source, directory), oldPath);
    fs.writeFileSync(source, 'new icon');
    const newPath = resolveAppIcon(source, directory);
    assert.notEqual(newPath, oldPath);
    assert.equal(fs.readFileSync(newPath, 'utf8'), 'new icon');
    fs.writeFileSync(newPath, 'broken cache');
    assert.equal(resolveAppIcon(source, directory), newPath);
    assert.equal(fs.readFileSync(newPath, 'utf8'), 'new icon');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
