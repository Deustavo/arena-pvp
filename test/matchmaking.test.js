import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// createMatch abre um setTimeout/setInterval real; usamos mock.timers para
// controlar o tempo e evitar handles pendurados entre os testes.
function makeFakeWs() {
  return {
    readyState: 1, // WebSocket.OPEN
    sent: [],
    send(payload) {
      this.sent.push(JSON.parse(payload));
    },
  };
}

describe('matchmaking', () => {
  let matchmaking;

  beforeEach(async () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    // módulo mantém estado de módulo (waitingPlayer/activeMatches); reimporta
    // com cache-busting para isolar cada teste.
    matchmaking = await import(`../src/server/matchmaking.js?t=${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    mock.timers.reset();
  });

  test('primeiro jogador entra na fila de espera', () => {
    const ws = makeFakeWs();
    matchmaking.handleConnection(ws);
    assert.equal(ws.sent.length, 1);
    assert.equal(ws.sent[0].type, 'waiting');
    assert.equal(matchmaking.activeMatchCount(), 0);
  });

  test('segundo jogador forma uma partida com o primeiro', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    matchmaking.handleConnection(wsA);
    matchmaking.handleConnection(wsB);

    assert.equal(matchmaking.activeMatchCount(), 1);
    const initA = wsA.sent.find((m) => m.type === 'init');
    const initB = wsB.sent.find((m) => m.type === 'init');
    assert.ok(initA);
    assert.ok(initB);
    assert.equal(initA.playerIndex, 0);
    assert.equal(initB.playerIndex, 1);
  });

  test('nicknames dos jogadores são propagados para os dois lados da partida', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    matchmaking.handleConnection(wsA, 'Alice');
    matchmaking.handleConnection(wsB, 'Bob');

    const initA = wsA.sent.find((m) => m.type === 'init');
    const initB = wsB.sent.find((m) => m.type === 'init');
    assert.equal(initA.players[0].name, 'Alice');
    assert.equal(initA.players[1].name, 'Bob');
    assert.equal(initB.players[0].name, 'Alice');
    assert.equal(initB.players[1].name, 'Bob');
  });

  test('conexão sem nickname usa um nome padrão', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    matchmaking.handleConnection(wsA);
    matchmaking.handleConnection(wsB);

    const initA = wsA.sent.find((m) => m.type === 'init');
    assert.equal(initA.players[0].name, 'Jogador');
    assert.equal(initA.players[1].name, 'Jogador');
  });

  test('terceiro jogador fica esperando enquanto a primeira partida está ativa', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    const wsC = makeFakeWs();
    matchmaking.handleConnection(wsA);
    matchmaking.handleConnection(wsB);
    matchmaking.handleConnection(wsC);

    assert.equal(matchmaking.activeMatchCount(), 1);
    assert.equal(wsC.sent.length, 1);
    assert.equal(wsC.sent[0].type, 'waiting');
  });

  test('handleLeaveQueue remove o jogador em espera', () => {
    const ws = makeFakeWs();
    matchmaking.handleConnection(ws);
    matchmaking.handleLeaveQueue(ws);
    assert.equal(ws.sent[ws.sent.length - 1].type, 'left');

    // Uma nova conexão deve voltar a ficar em espera (fila estava vazia).
    const wsNext = makeFakeWs();
    matchmaking.handleConnection(wsNext);
    assert.equal(wsNext.sent[0].type, 'waiting');
  });

  test('handleLeaveQueue não afeta jogador que não está na fila', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    matchmaking.handleConnection(wsA);
    matchmaking.handleConnection(wsB); // forma partida, ninguém na fila agora

    const wsBystander = makeFakeWs();
    matchmaking.handleLeaveQueue(wsBystander);
    assert.equal(wsBystander.sent.length, 0);
  });

  test('handleDisconnect remove jogador em espera sem afetar partidas', () => {
    const ws = makeFakeWs();
    matchmaking.handleConnection(ws);
    matchmaking.handleDisconnect(ws);

    const wsNext = makeFakeWs();
    matchmaking.handleConnection(wsNext);
    assert.equal(wsNext.sent[0].type, 'waiting');
  });

  test('jogador sem oponente após 5s recebe aviso de poucos jogadores, sem partida contra bot', () => {
    const ws = makeFakeWs();
    matchmaking.handleConnection(ws, 'Alice');

    mock.timers.tick(5000);

    assert.equal(matchmaking.activeMatchCount(), 0);
    const noOpponents = ws.sent.find((m) => m.type === 'noOpponents');
    assert.ok(noOpponents);
  });

  test('jogador real que entra antes dos 5s cancela o aviso de poucos jogadores', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    matchmaking.handleConnection(wsA);

    mock.timers.tick(4000);
    matchmaking.handleConnection(wsB);
    mock.timers.tick(5000);

    assert.equal(matchmaking.activeMatchCount(), 1);
    const initA = wsA.sent.find((m) => m.type === 'init');
    assert.equal(initA.players[1].name, 'Jogador');
    assert.ok(!wsA.sent.find((m) => m.type === 'noOpponents'));
  });

  test('handleLeaveQueue cancela o timer de aviso de poucos jogadores', () => {
    const ws = makeFakeWs();
    matchmaking.handleConnection(ws);
    matchmaking.handleLeaveQueue(ws);

    mock.timers.tick(5000);

    assert.equal(matchmaking.activeMatchCount(), 0);
    assert.ok(!ws.sent.find((m) => m.type === 'noOpponents'));
  });

  test('handleDisconnect durante partida ativa encerra a partida e declara o oponente vencedor', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    matchmaking.handleConnection(wsA);
    matchmaking.handleConnection(wsB);
    assert.equal(matchmaking.activeMatchCount(), 1);

    matchmaking.handleDisconnect(wsA);

    assert.equal(matchmaking.activeMatchCount(), 0);
    const gameover = wsB.sent.find((m) => m.type === 'gameover');
    assert.ok(gameover);
    assert.equal(gameover.winnerIndex, 1);
  });
});
