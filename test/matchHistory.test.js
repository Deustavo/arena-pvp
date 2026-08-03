import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchHistoryRows, shouldRecordMatch } from '../src/server/matchHistory.js';

function jogadores({ userIdA = 'uA', userIdB = 'uB' } = {}) {
  return [
    { index: 0, name: 'Ana', classId: 'mago', userId: userIdA },
    { index: 1, name: 'Bia', classId: 'tank', userId: userIdB },
  ];
}

describe('buildMatchHistoryRows', () => {
  test('gera uma linha por jogador logado, com a perspectiva de cada um', () => {
    const linhas = buildMatchHistoryRows(jogadores(), 0);
    assert.equal(linhas.length, 2);

    assert.deepEqual(linhas[0], {
      userId: 'uA',
      opponentName: 'Bia',
      opponentUserId: 'uB',
      playerClass: 'mago',
      opponentClass: 'tank',
      result: 'win',
    });
    assert.deepEqual(linhas[1], {
      userId: 'uB',
      opponentName: 'Ana',
      opponentUserId: 'uA',
      playerClass: 'tank',
      opponentClass: 'mago',
      result: 'loss',
    });
  });

  test('empate (winnerIndex null) vira draw para os dois', () => {
    const linhas = buildMatchHistoryRows(jogadores(), null);
    assert.deepEqual(linhas.map((l) => l.result), ['draw', 'draw']);
  });

  test('convidado não gera linha, mas aparece como oponente do logado', () => {
    const linhas = buildMatchHistoryRows(jogadores({ userIdB: null }), 1);
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].userId, 'uA');
    assert.equal(linhas[0].result, 'loss');
    assert.equal(linhas[0].opponentName, 'Bia');
    assert.equal(linhas[0].opponentUserId, null);
  });

  test('partida entre dois convidados não gera nada', () => {
    const linhas = buildMatchHistoryRows(jogadores({ userIdA: null, userIdB: null }), 0);
    assert.deepEqual(linhas, []);
  });

  test('winnerIndex indefinido é tratado como empate', () => {
    const linhas = buildMatchHistoryRows(jogadores(), undefined);
    assert.deepEqual(linhas.map((l) => l.result), ['draw', 'draw']);
  });
});

describe('shouldRecordMatch', () => {
  test('partida entre humanos é gravada', () => {
    assert.equal(shouldRecordMatch({ bot: false }), true);
  });

  test('partida contra bot não é gravada', () => {
    assert.equal(shouldRecordMatch({ bot: true }), false);
  });

  test('partida sem a flag bot é tratada como entre humanos', () => {
    assert.equal(shouldRecordMatch({}), true);
  });
});
