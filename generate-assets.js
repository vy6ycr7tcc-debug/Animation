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

const publicFiles = getFiles('public').map(f => f.replace(/^public\//, ''));
// The content files are also part of the asset set. We prefix them with content/
// since the app fetches them from ./content/
const contentFiles = getFiles('content').map(f => f.replace(/^content\//, 'content/'));

const allFiles = [...publicFiles, ...contentFiles];

fs.writeFileSync('public/assets.json', JSON.stringify(allFiles, null, 2));
