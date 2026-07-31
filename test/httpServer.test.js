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
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port, path: requestPath, method: 'GET' }, (res) => {
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

  test('bloqueia path traversal para fora do diretório public', async () => {
    const res = await get(port, '/../package.json');
    assert.equal(res.status, 403);
  });

  test('bloqueia path traversal para fora do diretório shared', async () => {
    const res = await get(port, '/shared/../../package.json');
    assert.equal(res.status, 403);
  });
});
