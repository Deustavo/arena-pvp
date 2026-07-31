import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOnlineCount } from './wsServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const SHARED_DIR = path.join(REPO_ROOT, 'shared');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

export function createHttpServer() {
  return http.createServer((req, res) => {
    if (req.url === '/api/online-count') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: getOnlineCount() }));
      return;
    }

    serveStaticFile(req, res);
  });
}

// O código de regras do jogo em shared/ é usado tanto pelo servidor quanto
// pelo cliente (para simular localmente o modo bot com as mesmas regras),
// então também precisa ser servido como arquivo estático.
function resolveRequestPath(url) {
  if (url.startsWith('/shared/')) {
    return { root: SHARED_DIR, relative: url.slice('/shared'.length) };
  }
  return { root: PUBLIC_DIR, relative: url === '/' ? '/index.html' : url };
}

function serveStaticFile(req, res) {
  const { root, relative } = resolveRequestPath(req.url);
  const filePath = path.join(root, relative);

  // Impede escapar do diretório raiz correspondente via "..".
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}
