import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, screenXToWorld, computeInitialViewFlip, getWorldInput, resetMatchState } from '../public/js/state.js';

beforeEach(() => {
  resetMatchState();
  state.playerIndex = null;
});

describe('computeInitialViewFlip', () => {
  test('não inverte quando o jogador local começa à esquerda do oponente', () => {
    const players = [{ x: 100 }, { x: 700 }];
    assert.equal(computeInitialViewFlip(players, 0), false);
  });

  test('inverte quando o jogador local começa à direita do oponente', () => {
    const players = [{ x: 100 }, { x: 700 }];
    assert.equal(computeInitialViewFlip(players, 1), true);
  });

  test('retorna false quando playerIndex é null', () => {
    const players = [{ x: 100 }, { x: 700 }];
    assert.equal(computeInitialViewFlip(players, null), false);
  });

  test('retorna false quando falta o jogador ou o oponente no array', () => {
    assert.equal(computeInitialViewFlip([{ x: 100 }], 0), false);
    assert.equal(computeInitialViewFlip([undefined, { x: 700 }], 0), false);
  });
});

describe('screenXToWorld', () => {
  test('sem espelhamento, retorna a coordenada de tela inalterada', () => {
    state.viewFlipped = false;
    assert.equal(screenXToWorld(250), 250);
  });

  test('com espelhamento, reflete em torno da largura da arena', () => {
    state.viewFlipped = true;
    state.arena = { w: 800, h: 600 };
    assert.equal(screenXToWorld(250), 550);
    assert.equal(screenXToWorld(0), 800);
    assert.equal(screenXToWorld(800), 0);
  });
});

describe('getWorldInput', () => {
  test('sem espelhamento, retorna o input tal como está', () => {
    state.viewFlipped = false;
    state.input = { up: false, down: false, left: true, right: false, shield: false };
    assert.deepEqual(getWorldInput(), state.input);
  });

  test('com espelhamento, troca left e right', () => {
    state.viewFlipped = true;
    state.input = { up: true, down: false, left: true, right: false, shield: false };
    assert.deepEqual(getWorldInput(), { up: true, down: false, left: false, right: true, shield: false });
  });

  test('com espelhamento, up/down/shield não são afetados', () => {
    state.viewFlipped = true;
    state.input = { up: true, down: true, left: false, right: true, shield: true };
    assert.deepEqual(getWorldInput(), { up: true, down: true, left: true, right: false, shield: true });
  });
});
