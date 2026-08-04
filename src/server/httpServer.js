import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { getOnlineCount } from './wsServer.js';
import { auth } from './auth.js';
import { getHistory, getSummary } from './matchHistory.js';
import { getRanking } from './ranking.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const SHARED_DIR = path.join(REPO_ROOT, 'shared');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

// Origem do front na Vercel, liberada para o fetch cross-origin de /api/online-count.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://playarenapvp.vercel.app';

const authHandler = toNodeHandler(auth);

export function createHttpServer() {
  return http.createServer((req, res) => {
    if (req.url === '/api/online-count') {
      res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: getOnlineCount() }));
      return;
    }

    // Rotas de autenticação do Better Auth. Precisam vir antes do serviço de
    // arquivos estáticos, senão cairiam no 404 do serveStaticFile.
    if (req.url.startsWith('/api/auth/')) {
      applyCorsHeaders(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      authHandler(req, res);
      return;
    }

    if (req.url === '/api/ranking') {
      res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
      serveRanking(req, res);
      return;
    }

    if (req.url.split('?')[0] === '/api/me/matches') {
      applyCorsHeaders(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      serveMatchHistory(req, res);
      return;
    }

    serveStaticFile(req, res);
  });
}

// Histórico de partidas da conta logada. Sempre do próprio usuário da sessão —
// o id nunca vem do cliente, para ninguém ler o histórico alheio.
async function serveMatchHistory(req, res) {
  function json(status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }

  if (req.method !== 'GET') {
    json(405, { error: 'Método não permitido' });
    return;
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) {
      json(401, { error: 'Não autenticado' });
      return;
    }
    const [matches, summary] = await Promise.all([
      getHistory(session.user.id),
      getSummary(session.user.id),
    ]);
    json(200, { matches, summary });
  } catch (erro) {
    console.error('[historico] falha ao consultar:', erro.message);
    json(500, { error: 'Não foi possível carregar o histórico' });
  }
}

// Ranking global de contas por vitórias. Público (mesma política do
// online-count): não expõe nada sensível, só nome e contagem de vitórias.
async function serveRanking(req, res) {
  try {
    const ranking = await getRanking();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ranking }));
  } catch (erro) {
    console.error('[ranking] falha ao consultar:', erro.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Não foi possível carregar o ranking' }));
  }
}

// O front (Vercel) e o backend (Cloud Run) ficam em domínios diferentes, então
// as chamadas de auth são cross-origin e precisam de CORS explícito. O header
// set-auth-token precisa ser exposto para o cliente conseguir ler o token de
// sessão devolvido pelo plugin bearer.
function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && auth.options.trustedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'set-auth-token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// O código de regras do jogo em shared/ é usado tanto pelo servidor quanto
// pelo cliente (para simular localmente o modo bot com as mesmas regras),
// então também precisa ser servido como arquivo estático.
function resolveRequestPath(url) {
  // Só o caminho interessa: a query string (ex.: /reset-password.html?token=...
  // vindo do link de e-mail) não faz parte do nome do arquivo em disco.
  const pathname = decodeURIComponent(url.split('?')[0].split('#')[0]);

  if (pathname.startsWith('/shared/')) {
    return { root: SHARED_DIR, relative: pathname.slice('/shared'.length) };
  }
  return { root: PUBLIC_DIR, relative: pathname === '/' ? '/index.html' : pathname };
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
