import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, endMatch } from '../src/server/Match.js';
import { COUNTDOWN_MS, TICK_MS } from '../shared/constants.js';

function makeFakeWs({ classId, nickname } = {}) {
  return {
    readyState: 1, // WebSocket.OPEN
    classId,
    nickname,
    sent: [],
    send(payload) {
      this.sent.push(JSON.parse(payload));
    },
  };
}

describe('createMatch', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  test('envia "init" para os dois jogadores imediatamente, com playerIndex correto', () => {
    const wsA = makeFakeWs({ nickname: 'Alice', classId: 'mago' });
    const wsB = makeFakeWs({ nickname: 'Bob', classId: 'tank' });
    createMatch(wsA, wsB);

    assert.equal(wsA.sent.length, 1);
    assert.equal(wsA.sent[0].type, 'init');
    assert.equal(wsA.sent[0].playerIndex, 0);
    assert.equal(wsB.sent[0].playerIndex, 1);
    assert.equal(wsA.sent[0].players[0].name, 'Alice');
    assert.equal(wsA.sent[0].players[0].classId, 'mago');
    assert.equal(wsA.sent[0].players[1].name, 'Bob');
    assert.equal(wsA.sent[0].players[1].classId, 'tank');
  });

  test('associa ws.match e ws.player a cada jogador', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    const match = createMatch(wsA, wsB);

    assert.equal(wsA.match, match);
    assert.equal(wsA.player, match.players[0]);
    assert.equal(wsB.player, match.players[1]);
  });

  test('usa nome e classe padrão quando o ws não informa nickname/classId', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    createMatch(wsA, wsB);

    assert.equal(wsA.sent[0].players[0].name, 'Jogador');
    assert.equal(wsA.sent[0].players[0].classId, 'atirador');
  });

  test('após o countdown, envia "start" e começa a tickar o estado', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    createMatch(wsA, wsB);

    mock.timers.tick(COUNTDOWN_MS);
    assert.ok(wsA.sent.some((m) => m.type === 'start'));

    mock.timers.tick(TICK_MS);
    const state = wsA.sent.find((m) => m.type === 'state');
    assert.ok(state);
    assert.equal(state.players.length, 2);
    assert.ok(Array.isArray(state.projectiles));
  });

  test('não ticka antes do countdown terminar', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    createMatch(wsA, wsB);

    mock.timers.tick(COUNTDOWN_MS - 1);
    assert.ok(!wsA.sent.some((m) => m.type === 'start'));
    assert.ok(!wsA.sent.some((m) => m.type === 'state'));
  });

  test('com bot=true, a IA do bot roda a cada tick e chega a atirar', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    const match = createMatch(wsA, wsB, { bot: true, botDifficulty: 'demoniaco' });

    assert.equal(match.botState.prevPlayerX, null);

    mock.timers.tick(COUNTDOWN_MS);
    mock.timers.tick(TICK_MS * 5);

    // tickBot roda a cada tick e sempre atualiza prevPlayerX/Y ao final.
    assert.notEqual(match.botState.prevPlayerX, null);
    assert.ok(match.projectiles.length > 0);
  });
});

describe('endMatch', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  test('envia "gameover" com o índice do vencedor e chama onEnd', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    let endArgs = null;
    const match = createMatch(wsA, wsB, { onEnd: (m, winnerIndex) => { endArgs = { m, winnerIndex }; } });

    endMatch(match, 0);

    assert.equal(match.running, false);
    const gameoverA = wsA.sent.find((m) => m.type === 'gameover');
    const gameoverB = wsB.sent.find((m) => m.type === 'gameover');
    assert.equal(gameoverA.winnerIndex, 0);
    assert.equal(gameoverB.winnerIndex, 0);
    assert.ok(endArgs);
    assert.equal(endArgs.winnerIndex, 0);
  });

  test('é idempotente: chamar novamente não reenvia "gameover" nem chama onEnd de novo', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    let endCallCount = 0;
    const match = createMatch(wsA, wsB, { onEnd: () => { endCallCount += 1; } });

    endMatch(match, 0);
    const countAfterFirst = wsA.sent.filter((m) => m.type === 'gameover').length;
    endMatch(match, 1);
    const countAfterSecond = wsA.sent.filter((m) => m.type === 'gameover').length;

    assert.equal(countAfterFirst, 1);
    assert.equal(countAfterSecond, 1);
    assert.equal(endCallCount, 1);
  });

  test('para os ticks de estado após o fim da partida', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    const match = createMatch(wsA, wsB);
    mock.timers.tick(COUNTDOWN_MS);

    endMatch(match, 0);
    const sentCountAfterEnd = wsA.sent.length;
    mock.timers.tick(TICK_MS * 10);

    assert.equal(wsA.sent.length, sentCountAfterEnd);
  });
});
