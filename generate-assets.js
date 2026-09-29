import fs from 'fs';
import path from 'path';

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

const publicFiles = getFiles('public').map(f => f.replace(/\\/g, '/').replace(/^public\//, ''));
// Do NOT include the content files here because they are bundled by Vite
// into the app shell and do not exist at runtime in the public dist directory.
// Attempting to manually cache them causes infinite 404 fetch loops.
const allFiles = [...publicFiles];

fs.writeFileSync('public/assets.json', JSON.stringify(allFiles, null, 2));
