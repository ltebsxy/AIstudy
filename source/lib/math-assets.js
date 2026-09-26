const fs = require('node:fs');
const path = require('node:path');

// Use Electron's ASAR-aware read APIs: Node's fs.cp internally bypasses them.
function copyMathAssets(folder) {
  const root = path.join(__dirname, '..', 'renderer');
  const target = path.join(folder, 'math');
  function copyFile(source, destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, fs.readFileSync(source));
  }
  const katex = path.join(root, 'vendor', 'katex');
  for (const file of ['katex.min.css', 'LICENSE']) copyFile(path.join(katex, file), path.join(target, file));
  for (const file of fs.readdirSync(path.join(katex, 'fonts'))) copyFile(path.join(katex, 'fonts', file), path.join(target, 'fonts', file));
  copyFile(path.join(root, 'math.css'), path.join(target, 'math.css'));
}
module.exports = { copyMathAssets };
