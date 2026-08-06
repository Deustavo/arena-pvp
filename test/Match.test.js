import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, endMatch, attachSpectator, detachSpectator, MAX_SPECTATORS_PER_MATCH } from '../src/server/Match.js';
import { COUNTDOWN_MS, TICK_MS, PLAYER_SIZE } from '../shared/constants.js';
import { CLASSES } from '../shared/classes.js';
import { JANELAS_SPAWN_MS, POWERUP_TIPOS, POWERUP_ZONE } from '../shared/powerups.js';
import { MATCH_DURATION_MS, DESEMPATE_DELAY_MS, DESEMPATE_PASSO_MS } from '../shared/matchTimer.js';

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

describe('cronômetro da partida', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  function ultimoState(ws) {
    return ws.sent.filter((m) => m.type === 'state').at(-1);
  }

  // Leva a partida até o fim do tempo regulamentar (o cronômetro só começa
  // depois da contagem regressiva).
  function avancarAteFimDoTempo() {
    mock.timers.tick(COUNTDOWN_MS);
    mock.timers.tick(MATCH_DURATION_MS);
  }

  // Um passo de dreno por chamada: com os timers mockados, todos os ticks de
  // um mesmo `mock.timers.tick()` enxergam o mesmo Date.now() (o do fim do
  // avanço), então um único avanço longo drenaria só um coração.
  function avancarDrenos(quantidade) {
    mock.timers.tick(DESEMPATE_DELAY_MS);
    for (let i = 1; i < quantidade; i++) mock.timers.tick(DESEMPATE_PASSO_MS);
  }

  test('cada "state" leva o tempo restante, contando para trás', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    createMatch(wsA, wsB);

    mock.timers.tick(COUNTDOWN_MS);
    mock.timers.tick(TICK_MS);
    const primeiro = ultimoState(wsA);
    assert.equal(primeiro.desempate, false);
    assert.ok(primeiro.remainingMs <= MATCH_DURATION_MS);

    mock.timers.tick(10_000);
    assert.ok(ultimoState(wsA).remainingMs < primeiro.remainingMs - 9000);
  });

  test('a partida não acaba sozinha quando o tempo zera: congela em desempate', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    const match = createMatch(wsA, wsB);
    match.players[0].input = { up: false, down: false, left: false, right: true };
    const xInicial = match.players[0].x;

    avancarAteFimDoTempo();

    assert.equal(match.running, true);
    assert.equal(ultimoState(wsA).desempate, true);
    assert.equal(ultimoState(wsA).remainingMs, 0);
    // Congelado: o input que estava valendo não move mais ninguém.
    mock.timers.tick(TICK_MS * 10);
    assert.equal(match.players[0].x, xInicial);
  });

  test('no desempate os dois perdem um coração por vez até alguém zerar', () => {
    const wsA = makeFakeWs({ classId: 'atirador' }); // 9 vidas
    const wsB = makeFakeWs({ classId: 'mago' }); // 8 vidas
    const match = createMatch(wsA, wsB);

    avancarAteFimDoTempo();
    const vidasAntes = match.players.map((p) => p.lives);

    mock.timers.tick(DESEMPATE_DELAY_MS);
    assert.deepEqual(match.players.map((p) => p.lives), vidasAntes.map((v) => v - 1));

    mock.timers.tick(DESEMPATE_PASSO_MS);
    assert.deepEqual(match.players.map((p) => p.lives), vidasAntes.map((v) => v - 2));
  });

  test('quem zera primeiro perde, e o último "state" mostra a morte antes do gameover', () => {
    const wsA = makeFakeWs({ classId: 'atirador' }); // 9 vidas
    const wsB = makeFakeWs({ classId: 'mago' }); // 8 vidas
    const match = createMatch(wsA, wsB);

    avancarAteFimDoTempo();
    avancarDrenos(8);

    const gameover = wsA.sent.find((m) => m.type === 'gameover');
    assert.ok(gameover);
    assert.equal(gameover.winnerIndex, 0);
    assert.equal(match.running, false);
    const ultimo = ultimoState(wsA);
    assert.equal(ultimo.players[1].alive, false);
    assert.equal(ultimo.players[1].lives, 0);
  });

  test('vidas iguais zeram no mesmo passo e o gameover é empate (winnerIndex null)', () => {
    const wsA = makeFakeWs({ classId: 'mago' });
    const wsB = makeFakeWs({ classId: 'mago' });
    const match = createMatch(wsA, wsB);

    avancarAteFimDoTempo();
    avancarDrenos(8);

    const gameover = wsA.sent.find((m) => m.type === 'gameover');
    assert.equal(gameover.winnerIndex, null);
    assert.deepEqual(match.players.map((p) => p.alive), [false, false]);
  });

  test('vitória antes do tempo para o cronômetro junto com a partida', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    const match = createMatch(wsA, wsB);
    mock.timers.tick(COUNTDOWN_MS);
    mock.timers.tick(TICK_MS);

    endMatch(match, 0);
    const restanteNoFim = ultimoState(wsA).remainingMs;

    mock.timers.tick(MATCH_DURATION_MS * 2);
    assert.equal(ultimoState(wsA).remainingMs, restanteNoFim);
    assert.equal(wsA.sent.filter((m) => m.type === 'gameover').length, 1);
  });
});

describe('power-ups na partida', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  function ultimoState(ws) {
    return ws.sent.filter((m) => m.type === 'state').at(-1);
  }

  test('a primeira bolha aparece no snapshot dentro da janela de 0:55-0:45', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    createMatch(wsA, wsB);

    mock.timers.tick(COUNTDOWN_MS);
    mock.timers.tick(TICK_MS);
    assert.deepEqual(ultimoState(wsA).powerups, [], 'nenhuma bolha no começo');

    // Fim da primeira janela: a bolha tem de ter aparecido, onde quer que o
    // sorteio a tenha colocado.
    mock.timers.tick(MATCH_DURATION_MS - JANELAS_SPAWN_MS[0].ate);
    const state = ultimoState(wsA);
    assert.equal(state.powerups.length, 1);
    const bolha = state.powerups[0];
    assert.ok(POWERUP_TIPOS.includes(bolha.tipo));
    assert.ok(
      Math.hypot(bolha.x - POWERUP_ZONE.x, bolha.y - POWERUP_ZONE.y) <= POWERUP_ZONE.r,
      'bolha fora do círculo central',
    );
  });

  test('jogador que anda até a bolha coleta, e ela sai do snapshot', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    const match = createMatch(wsA, wsB);

    mock.timers.tick(COUNTDOWN_MS);
    mock.timers.tick(MATCH_DURATION_MS - JANELAS_SPAWN_MS[0].ate);
    const bolha = ultimoState(wsA).powerups[0];

    // Teleporta o jogador para cima da bolha (andar até lá levaria centenas de
    // ticks e o que se testa aqui é a coleta, não o movimento).
    match.players[0].x = bolha.x - PLAYER_SIZE / 2;
    match.players[0].y = bolha.y - PLAYER_SIZE / 2;
    mock.timers.tick(TICK_MS);

    assert.deepEqual(ultimoState(wsA).powerups, []);
    // Só o efeito genérico: qual foi o power-up sorteado é aleatório, e o que
    // cada tipo faz já está coberto em test/powerups.test.js.
    const p = ultimoState(wsA).players[0];
    const mudou = p.lives > CLASSES.atirador.maxLives
      || p.shieldMaxHits > CLASSES.atirador.shieldMaxHits
      || p.buffs.cadenciaMs > 0
      || p.buffs.velocidadeMs > 0;
    assert.ok(mudou, 'a coleta não teve efeito nenhum no jogador');
  });

  test('o desempate limpa as bolhas da arena', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    createMatch(wsA, wsB);

    mock.timers.tick(COUNTDOWN_MS);
    mock.timers.tick(MATCH_DURATION_MS - JANELAS_SPAWN_MS[1].ate);
    assert.ok(ultimoState(wsA).powerups.length > 0, 'deveria haver bolha antes do desempate');

    mock.timers.tick(JANELAS_SPAWN_MS[1].ate);
    const state = ultimoState(wsA);
    assert.equal(state.desempate, true);
    assert.deepEqual(state.powerups, []);
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

describe('espectadores', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  test('recusa novos espectadores acima do teto, sem afetar os já conectados', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    const match = createMatch(wsA, wsB);

    for (let i = 0; i < MAX_SPECTATORS_PER_MATCH; i += 1) {
      assert.equal(attachSpectator(match, makeFakeWs()), true);
    }
    assert.equal(match.spectators.size, MAX_SPECTATORS_PER_MATCH);

    const overflowWs = makeFakeWs();
    assert.equal(attachSpectator(match, overflowWs), false);
    assert.equal(match.spectators.size, MAX_SPECTATORS_PER_MATCH);
    assert.equal(overflowWs.sent.length, 0);
  });

  test('desconectar um espectador libera vaga para outro', () => {
    const wsA = makeFakeWs();
    const wsB = makeFakeWs();
    const match = createMatch(wsA, wsB);

    const spectators = [];
    for (let i = 0; i < MAX_SPECTATORS_PER_MATCH; i += 1) {
      const spectatorWs = makeFakeWs();
      attachSpectator(match, spectatorWs);
      spectators.push(spectatorWs);
    }

    detachSpectator(match, spectators[0]);
    const newSpectatorWs = makeFakeWs();
    assert.equal(attachSpectator(match, newSpectatorWs), true);
    assert.equal(match.spectators.size, MAX_SPECTATORS_PER_MATCH);
  });
});
