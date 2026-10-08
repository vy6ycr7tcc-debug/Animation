import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// The files offline play keeps (src/core/offline.ts): every file in public/, each with a short
// hash of its content and its size, so an update downloads only what changed.

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, files);
    } else {
      files.push(filePath);
    }
  }
  return files;
}

// Do NOT include the content files here because they are bundled by Vite
// into the app shell and do not exist at runtime in the public dist directory.
// Attempting to manually cache them causes infinite 404 fetch loops.
const entries = getFiles('public')
  .map((f) => f.replace(/\\/g, '/'))
  .filter((f) => f !== 'public/assets.json')
  .sort()
  .map((f) => {
    const buf = fs.readFileSync(f);
    return { p: f.replace(/^public\//, ''), h: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12), s: buf.length };
  });

// one file a line, so a change shows plainly in a diff
fs.writeFileSync('public/assets.json', '[\n' + entries.map((e) => JSON.stringify(e)).join(',\n') + '\n]\n');
