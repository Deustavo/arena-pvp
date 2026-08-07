import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createHttpServer } from '../src/server/httpServer.js';

function startServer() {
  return new Promise((resolve) => {
    const server = createHttpServer();
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function get(port, requestPath) {
  return request(port, 'GET', requestPath);
}

function request(port, method, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port, path: requestPath, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('httpServer', () => {
  let server;
  let port;

  before(async () => {
    ({ server, port } = await startServer());
  });

  after(() => {
    server.close();
  });

  test('GET / serve o public/index.html', async () => {
    const res = await get(port, '/');
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'text/html');
    assert.match(res.body, /<html/i);
  });

  test('GET /js/main.js serve um arquivo estático com o content-type correto', async () => {
    const res = await get(port, '/js/main.js');
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'text/javascript');
  });

  test('GET /css/style.css serve um arquivo estático com o content-type correto', async () => {
    const res = await get(port, '/css/style.css');
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'text/css');
  });

  test('GET /shared/constants.js serve os arquivos de regras compartilhadas', async () => {
    const res = await get(port, '/shared/constants.js');
    assert.equal(res.status, 200);
    assert.match(res.body, /ARENA/);
  });

  test('GET de um arquivo inexistente retorna 404', async () => {
    const res = await get(port, '/js/nao-existe.js');
    assert.equal(res.status, 404);
  });

  test('GET /api/online-count retorna JSON com a contagem de conexões', async () => {
    const res = await get(port, '/api/online-count');
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/json');
    const json = JSON.parse(res.body);
    assert.equal(typeof json.count, 'number');
  });

  // O perfil público de outra conta é identificado pelo nome exibido (o que
  // aparece no ranking), então sem `name` não há o que consultar — precisa
  // falhar antes de qualquer ida ao banco.
  test('GET /api/player/matches sem name retorna 400', async () => {
    const res = await get(port, '/api/player/matches');
    assert.equal(res.status, 400);
    assert.equal(res.headers['content-type'], 'application/json');
  });

  test('GET /api/player/matches com name vazio retorna 400', async () => {
    const res = await get(port, '/api/player/matches?name=%20');
    assert.equal(res.status, 400);
  });

  test('POST /api/player/matches retorna 405', async () => {
    const res = await request(port, 'POST', '/api/player/matches?name=alguem');
    assert.equal(res.status, 405);
  });

  // O link de redefinição de senha do e-mail chega como
  // /reset-password.html?token=..., então a query string não pode virar parte
  // do nome do arquivo procurado em disco.
  test('serve arquivo estático ignorando a query string', async () => {
    const res = await get(port, '/reset-password.html?token=abc123');
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'text/html');
    assert.match(res.body, /<html/i);
  });

  test('serve / ignorando a query string', async () => {
    const res = await get(port, '/?utm_source=x');
    assert.equal(res.status, 200);
    assert.match(res.body, /<html/i);
  });

  test('bloqueia path traversal com caminho percent-encoded', async () => {
    const res = await get(port, '/%2e%2e/package.json');
    assert.equal(res.status, 403);
  });

  test('bloqueia path traversal para fora do diretório public', async () => {
    const res = await get(port, '/../package.json');
    assert.equal(res.status, 403);
  });

  test('bloqueia path traversal para fora do diretório shared', async () => {
    const res = await get(port, '/shared/../../package.json');
    assert.equal(res.status, 403);
  });
});
