import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchRow, shouldRecordMatch, parsePaginacao } from '../src/server/matchHistory.js';

function jogadores({ userIdA = 'uA', userIdB = 'uB' } = {}) {
  return [
    { index: 0, name: 'Ana', classId: 'mago', userId: userIdA },
    { index: 1, name: 'Bia', classId: 'tank', userId: userIdB },
  ];
}

describe('buildMatchRow', () => {
  test('gera uma linha só, com os dois lados da partida', () => {
    const linha = buildMatchRow(jogadores(), 0);
    assert.deepEqual(linha, {
      player1Id: 'uA',
      player1Name: 'Ana',
      player1Class: 'mago',
      player2Id: 'uB',
      player2Name: 'Bia',
      player2Class: 'tank',
      winnerIndex: 0,
    });
  });

  test('empate (winnerIndex null) grava winnerIndex null', () => {
    const linha = buildMatchRow(jogadores(), null);
    assert.equal(linha.winnerIndex, null);
  });

  test('convidado gera linha com o lado dele nulo', () => {
    const linha = buildMatchRow(jogadores({ userIdB: null }), 1);
    assert.equal(linha.player1Id, 'uA');
    assert.equal(linha.player2Id, null);
    assert.equal(linha.player2Name, 'Bia');
    assert.equal(linha.winnerIndex, 1);
  });

  test('partida entre dois convidados não gera nada', () => {
    const linha = buildMatchRow(jogadores({ userIdA: null, userIdB: null }), 0);
    assert.equal(linha, null);
  });

  test('winnerIndex indefinido é tratado como empate (null)', () => {
    const linha = buildMatchRow(jogadores(), undefined);
    assert.equal(linha.winnerIndex, null);
  });
});

describe('parsePaginacao', () => {
  test('sem parâmetros usa a primeira página de 20 partidas', () => {
    assert.deepEqual(parsePaginacao(), { limite: 20, offset: 0 });
    assert.deepEqual(parsePaginacao({}), { limite: 20, offset: 0 });
  });

  test('lê limit/offset da query string (strings)', () => {
    assert.deepEqual(parsePaginacao({ limit: '10', offset: '40' }), { limite: 10, offset: 40 });
  });

  test('limite acima do teto é preso em 50', () => {
    assert.deepEqual(parsePaginacao({ limit: '5000' }), { limite: 50, offset: 0 });
  });

  test('valores negativos ou zerados não viram consulta inválida', () => {
    assert.deepEqual(parsePaginacao({ limit: '0', offset: '-5' }), { limite: 1, offset: 0 });
  });

  test('valor não numérico ou vazio cai no padrão', () => {
    assert.deepEqual(parsePaginacao({ limit: 'abc', offset: '' }), { limite: 20, offset: 0 });
    assert.deepEqual(parsePaginacao({ limit: null, offset: undefined }), { limite: 20, offset: 0 });
  });

  test('valor fracionário é truncado', () => {
    assert.deepEqual(parsePaginacao({ limit: '7.9', offset: '20.5' }), { limite: 7, offset: 20 });
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
