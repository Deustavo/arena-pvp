import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerState, createProjectile } from '../shared/entities.js';
import { ARENA, PLAYER_SIZE, MAX_LIVES, PROJECTILE_SPEED } from '../shared/constants.js';

describe('createPlayerState', () => {
  test('jogador 0 começa do lado esquerdo da arena', () => {
    const p = createPlayerState(0);
    assert.equal(p.x, 100);
    assert.equal(p.y, ARENA.h / 2 - PLAYER_SIZE / 2);
  });

  test('jogador 1 começa do lado direito da arena', () => {
    const p = createPlayerState(1);
    assert.equal(p.x, ARENA.w - 100 - PLAYER_SIZE);
    assert.equal(p.y, ARENA.h / 2 - PLAYER_SIZE / 2);
  });

  test('estado inicial tem vidas cheias e está vivo', () => {
    const p = createPlayerState(0);
    assert.equal(p.lives, MAX_LIVES);
    assert.equal(p.alive, true);
    assert.equal(p.shielding, false);
    assert.equal(p.shieldHits, 0);
    assert.equal(p.lastShot, 0);
  });

  test('input inicial não tem direções pressionadas', () => {
    const p = createPlayerState(0);
    assert.deepEqual(p.input, { up: false, down: false, left: false, right: false });
  });

  test('cada chamada retorna um novo objeto independente', () => {
    const p1 = createPlayerState(0);
    const p2 = createPlayerState(0);
    p1.lives = 0;
    assert.equal(p2.lives, MAX_LIVES);
  });
});

describe('createProjectile', () => {
  test('aponta na direção do alvo à direita', () => {
    const proj = createProjectile(1, 0, 0, 10, 0, 0);
    assert.ok(proj.vx > 0);
    assert.ok(Math.abs(proj.vy) < 1e-9);
    assert.ok(Math.abs(Math.hypot(proj.vx, proj.vy) - PROJECTILE_SPEED) < 1e-9);
  });

  test('aponta na direção do alvo em diagonal', () => {
    const proj = createProjectile(1, 0, 0, 10, 10, 0);
    assert.ok(proj.vx > 0 && proj.vy > 0);
    assert.ok(Math.abs(proj.vx - proj.vy) < 1e-9);
    assert.ok(Math.abs(Math.hypot(proj.vx, proj.vy) - PROJECTILE_SPEED) < 1e-9);
  });

  test('usa velocidade customizada quando fornecida', () => {
    const proj = createProjectile(1, 0, 0, 10, 0, 0, 20);
    assert.ok(Math.abs(Math.hypot(proj.vx, proj.vy) - 20) < 1e-9);
  });

  test('não quebra quando origem e alvo coincidem (evita divisão por zero)', () => {
    const proj = createProjectile(1, 5, 5, 5, 5, 0);
    assert.equal(Number.isFinite(proj.vx), true);
    assert.equal(Number.isFinite(proj.vy), true);
  });

  test('preserva id, posição inicial e dono', () => {
    const proj = createProjectile(42, 3, 4, 100, 4, 1);
    assert.equal(proj.id, 42);
    assert.equal(proj.x, 3);
    assert.equal(proj.y, 4);
    assert.equal(proj.ownerIndex, 1);
  });
});
