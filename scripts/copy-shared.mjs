import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'shared');
const DEST_DIR = path.join(REPO_ROOT, 'public', 'shared');

fs.rmSync(DEST_DIR, { recursive: true, force: true });
fs.mkdirSync(DEST_DIR, { recursive: true });

for (const file of fs.readdirSync(SRC_DIR)) {
  fs.copyFileSync(path.join(SRC_DIR, file), path.join(DEST_DIR, file));
}

console.log(`shared/ copiado para public/shared/ (${fs.readdirSync(DEST_DIR).length} arquivos)`);
