import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { WebSocket } from 'ws';
import { createWsServer, getOnlineCount } from '../src/server/wsServer.js';
import { createPlayerState } from '../shared/entities.js';

// Testes de integração: sobem um servidor HTTP+WS real na loopback e usam um
// cliente `ws` de verdade, já que a lógica de parsing/roteamento de mensagens
// (handleMessage/handleInput/handleShoot) não é exportada — só reagir a
// eventos reais exercita esse caminho. O jogador/partida são atribuídos "à
// mão" no ws do servidor para não depender do matchmaking (fila, bot, timers).
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer();
    const wss = createWsServer(server);
    server.listen(0, () => resolve({ server, wss, port: server.address().port }));
  });
}

function connectClient(port, query = '') {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://localhost:${port}${query}`);
    client.on('open', () => resolve(client));
    client.on('error', reject);
  });
}

function nextServerConnection(wss) {
  return new Promise((resolve) => wss.once('connection', resolve));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('wsServer', () => {
  let server;
  let wss;
  let port;

  before(async () => {
    ({ server, wss, port } = await startServer());
  });

  after(() => {
    server.close();
  });

  test('getOnlineCount reflete o número de clientes conectados', async () => {
    assert.equal(getOnlineCount(), 0);
    const client = await connectClient(port);
    await wait(20);
    assert.equal(getOnlineCount(), 1);
    client.close();
    await wait(20);
    assert.equal(getOnlineCount(), 0);
  });

  test('nickname e classId são extraídos da query string da conexão', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port, '?nickname=%20%20Foo%20%20&classId=mago');
    const serverWs = await serverWsPromise;
    await wait(20);

    assert.equal(serverWs.nickname, 'Foo');
    assert.equal(serverWs.classId, 'mago');

    client.close();
    await wait(20);
  });

  test('classId inválido cai para a classe padrão', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port, '?classId=inexistente');
    const serverWs = await serverWsPromise;
    await wait(20);

    assert.equal(serverWs.classId, 'atirador');

    client.close();
    await wait(20);
  });

  test('handleInput atualiza o input e o estado de escudo do jogador', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port);
    const serverWs = await serverWsPromise;
    serverWs.player = createPlayerState(0, 'atirador');

    client.send(JSON.stringify({ type: 'input', up: true, left: true, shield: false }));
    await wait(30);

    assert.deepEqual(serverWs.player.input, { up: true, down: false, left: true, right: false });
    assert.equal(serverWs.player.shielding, false);

    client.close();
    await wait(20);
  });

  test('handleInput ignora shield=true quando shieldHits já está no máximo', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port);
    const serverWs = await serverWsPromise;
    serverWs.player = createPlayerState(0, 'atirador');
    serverWs.player.shieldHits = serverWs.player.shieldMaxHits;

    client.send(JSON.stringify({ type: 'input', shield: true }));
    await wait(30);

    assert.equal(serverWs.player.shielding, false);

    client.close();
    await wait(20);
  });

  test('handleShoot cria projéteis e respeita o cooldown da classe', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port);
    const serverWs = await serverWsPromise;
    serverWs.player = createPlayerState(0, 'atirador');
    serverWs.player.lastShot = 0;
    serverWs.match = { nextProjectileId: 1, projectiles: [], interval: 123 };

    client.send(JSON.stringify({ type: 'shoot', targetX: 500, targetY: 300 }));
    await wait(30);
    assert.equal(serverWs.match.projectiles.length, 1);
    assert.equal(serverWs.match.nextProjectileId, 2);

    // Segundo disparo imediato deve ser ignorado por causa do cooldown.
    client.send(JSON.stringify({ type: 'shoot', targetX: 500, targetY: 300 }));
    await wait(30);
    assert.equal(serverWs.match.projectiles.length, 1);

    client.close();
    await wait(20);
  });

  test('handleShoot ignora disparo se o jogador não está vivo', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port);
    const serverWs = await serverWsPromise;
    serverWs.player = createPlayerState(0, 'atirador');
    serverWs.player.alive = false;
    serverWs.match = { nextProjectileId: 1, projectiles: [], interval: 123 };

    client.send(JSON.stringify({ type: 'shoot', targetX: 500, targetY: 300 }));
    await wait(30);
    assert.equal(serverWs.match.projectiles.length, 0);

    client.close();
    await wait(20);
  });

  test('handleShoot ignora disparo se o jogador está em modo escudo', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port);
    const serverWs = await serverWsPromise;
    serverWs.player = createPlayerState(0, 'atirador');
    serverWs.player.shielding = true;
    serverWs.match = { nextProjectileId: 1, projectiles: [], interval: 123 };

    client.send(JSON.stringify({ type: 'shoot', targetX: 500, targetY: 300 }));
    await wait(30);
    assert.equal(serverWs.match.projectiles.length, 0);

    client.close();
    await wait(20);
  });

  // Escudo esgotado não protege mais, então também não pode impedir o tiro.
  test('handleShoot permite disparo com escudo esgotado', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port);
    const serverWs = await serverWsPromise;
    serverWs.player = createPlayerState(0, 'atirador');
    serverWs.player.shielding = true;
    serverWs.player.shieldHits = serverWs.player.shieldMaxHits;
    serverWs.match = { nextProjectileId: 1, projectiles: [], interval: 123 };

    client.send(JSON.stringify({ type: 'shoot', targetX: 500, targetY: 300 }));
    await wait(30);
    assert.equal(serverWs.match.projectiles.length, 1);

    client.close();
    await wait(20);
  });

  test('handleShoot ignora disparo sem partida em andamento (match.interval ausente)', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port);
    const serverWs = await serverWsPromise;
    serverWs.player = createPlayerState(0, 'atirador');
    serverWs.match = { nextProjectileId: 1, projectiles: [], interval: null };

    client.send(JSON.stringify({ type: 'shoot', targetX: 500, targetY: 300 }));
    await wait(30);
    assert.equal(serverWs.match.projectiles.length, 0);

    client.close();
    await wait(20);
  });

  // No desempate (tempo esgotado) a partida fica congelada: nada que o
  // cliente mandar pode mover ou fazer alguém atirar.
  test('input e disparo são ignorados durante o desempate', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port);
    const serverWs = await serverWsPromise;
    serverWs.player = createPlayerState(0, 'atirador');
    serverWs.player.lastShot = 0;
    serverWs.match = {
      nextProjectileId: 1,
      projectiles: [],
      interval: 123,
      cronometro: { fimEm: 0, desempateEm: 1, proximoDreno: 0 },
    };

    client.send(JSON.stringify({ type: 'input', right: true }));
    client.send(JSON.stringify({ type: 'shoot', targetX: 500, targetY: 300 }));
    await wait(30);

    assert.equal(serverWs.player.input.right, false);
    assert.equal(serverWs.match.projectiles.length, 0);

    client.close();
    await wait(20);
  });

  test('mensagens JSON inválidas são ignoradas sem derrubar a conexão', async () => {
    const serverWsPromise = nextServerConnection(wss);
    const client = await connectClient(port);
    await serverWsPromise;

    client.send('isto não é json');
    await wait(30);
    assert.equal(client.readyState, WebSocket.OPEN);

    client.close();
    await wait(20);
  });
});
