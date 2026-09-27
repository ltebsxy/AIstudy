// Refresh the local source launcher without building an installer.
const { app, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { resolveAppIcon } = require('../lib/app-icon');
const root = path.resolve(__dirname, '..');
const scratch = path.join(root, '.tmp', 'shortcut-helper');
fs.mkdirSync(scratch, { recursive: true });
app.setPath('userData', scratch);
app.whenReady().then(() => {
  const link = path.join(app.getPath('desktop'), 'AI-StudyDesk.lnk');
  const icon = resolveAppIcon(path.join(root, 'assets', 'icon.ico'), path.join(app.getPath('appData'), 'study-desk'));
  const options = {
    target: process.execPath, args: '"' + root + '"', cwd: root,
    description: 'AI-StudyDesk 本地源码版', icon, iconIndex: 0,
    appUserModelId: 'local.studydesk.source'
  };
  if (!shell.writeShortcutLink(link, fs.existsSync(link) ? 'update' : 'create', options)) throw new Error('Cannot update desktop shortcut');
  const actual = shell.readShortcutLink(link);
  if (actual.icon !== icon || actual.target !== options.target) throw new Error('Shortcut verification failed');
  console.log('Updated AI-StudyDesk desktop shortcut with current icon');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
