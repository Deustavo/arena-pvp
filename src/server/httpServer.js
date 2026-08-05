import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { getOnlineCount } from './wsServer.js';
import { auth } from './auth.js';
import {
  getHistory, getSummary, findUserIdByName, parsePaginacao,
} from './matchHistory.js';
import { getRanking } from './ranking.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const SHARED_DIR = path.join(REPO_ROOT, 'shared');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.mp3': 'audio/mpeg',
};

// Origem do front na Vercel, liberada para o fetch cross-origin de /api/online-count.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://demonarena.vercel.app';

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

    if (req.url.split('?')[0] === '/api/player/matches') {
      res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
      servePlayerProfile(req, res);
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
    json(200, await paginaDoHistorico(session.user.id, req.url));
  } catch (erro) {
    console.error('[historico] falha ao consultar:', erro.message);
    json(500, { error: 'Não foi possível carregar o histórico' });
  }
}

// Perfil público de uma conta pelo nome exibido (o que aparece no ranking).
// Público pela mesma política do ranking: só devolve o que o ranking já
// mostraria em mais detalhe (nome, classes e resultados de partidas), nada
// de e-mail ou dado de conta.
async function servePlayerProfile(req, res) {
  function json(status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }

  if (req.method !== 'GET') {
    json(405, { error: 'Método não permitido' });
    return;
  }

  const nome = new URL(req.url, 'http://localhost').searchParams.get('name') ?? '';
  if (nome.trim() === '') {
    json(400, { error: 'Informe o nome do jogador' });
    return;
  }

  try {
    const userId = await findUserIdByName(nome);
    if (!userId) {
      json(404, { error: 'Jogador não encontrado' });
      return;
    }
    json(200, await paginaDoHistorico(userId, req.url));
  } catch (erro) {
    console.error('[perfil] falha ao consultar:', erro.message);
    json(500, { error: 'Não foi possível carregar o perfil' });
  }
}

// Payload comum das duas rotas de perfil: uma página do histórico (paginada por
// `limit`/`offset` na query string) e, só na primeira página, o resumo de
// vitórias/derrotas. Nas páginas seguintes o resumo vem null porque o cliente
// já o tem na tela — não faz sentido reconsultar a cada scroll.
async function paginaDoHistorico(userId, url) {
  const params = new URL(url, 'http://localhost').searchParams;
  const { limite, offset } = parsePaginacao({
    limit: params.get('limit'),
    offset: params.get('offset'),
  });

  const [pagina, summary] = await Promise.all([
    getHistory(userId, { limite, offset }),
    offset === 0 ? getSummary(userId) : null,
  ]);

  return { matches: pagina.matches, hasMore: pagina.hasMore, summary };
}

// Ranking global de contas por vitórias. Público (mesma política do
// online-count): não expõe nada sensível, só nome e contagem de vitórias.
async function serveRanking(req, res) {
  try {
    const ranking = await getRanking(10);
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
  // x-captcha-response: header custom que o plugin captcha do Better Auth
  // manda em sign-up/sign-in/forget-password quando o Turnstile está ativo.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-captcha-response');
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
