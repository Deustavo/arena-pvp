import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { stepPlayers, stepProjectiles } from '../shared/simulation.js';
import { createPlayerState, createProjectile } from '../shared/entities.js';
import { ARENA, PLAYER_SIZE, PLAYER_SPEED } from '../shared/constants.js';
import { CLASSES } from '../shared/classes.js';

describe('stepPlayers', () => {
  test('move o jogador de acordo com o input', () => {
    const p = createPlayerState(0);
    const startX = p.x;
    p.input.right = true;
    stepPlayers([p], ARENA);
    assert.equal(p.x, startX + PLAYER_SPEED);
  });

  test('jogador morto não se move', () => {
    const p = createPlayerState(0);
    const startX = p.x;
    p.alive = false;
    p.input.right = true;
    stepPlayers([p], ARENA);
    assert.equal(p.x, startX);
  });

  // O escudo protege sem imobilizar: dá para se defender andando.
  test('jogador em modo escudo continua se movendo', () => {
    const p = createPlayerState(0);
    const startX = p.x;
    p.shielding = true;
    p.input.right = true;
    stepPlayers([p], ARENA);
    assert.equal(p.x, startX + PLAYER_SPEED);
  });

  test('não ultrapassa os limites da arena', () => {
    const p = createPlayerState(0);
    p.x = 0;
    p.y = 0;
    p.input.left = true;
    p.input.up = true;
    stepPlayers([p], ARENA);
    assert.equal(p.x, 0);
    assert.equal(p.y, 0);
  });

  test('não ultrapassa os limites máximos da arena', () => {
    const p = createPlayerState(0);
    p.x = ARENA.w - PLAYER_SIZE;
    p.y = ARENA.h - PLAYER_SIZE;
    p.input.right = true;
    p.input.down = true;
    stepPlayers([p], ARENA);
    assert.equal(p.x, ARENA.w - PLAYER_SIZE);
    assert.equal(p.y, ARENA.h - PLAYER_SIZE);
  });

  test('escudo esgotado (shieldHits no máximo) é desativado automaticamente', () => {
    const p = createPlayerState(0);
    p.shielding = true;
    p.shieldHits = p.shieldMaxHits;
    stepPlayers([p], ARENA);
    assert.equal(p.shielding, false);
  });
});

describe('stepProjectiles', () => {
  function makeMatch() {
    const players = [createPlayerState(0), createPlayerState(1)];
    return players;
  }

  test('projétil avança de acordo com sua velocidade', () => {
    const players = makeMatch();
    const proj = createProjectile(1, 400, 300, 500, 300, 0);
    const result = stepProjectiles([proj], players, ARENA, () => {});
    assert.equal(result.length, 1);
    assert.notEqual(result[0].x, 400);
  });

  test('projétil é removido ao sair da arena', () => {
    const players = makeMatch();
    const proj = createProjectile(1, -10, 300, -100, 300, 0);
    proj.x = -100;
    const result = stepProjectiles([proj], players, ARENA, () => {});
    assert.equal(result.length, 0);
  });

  test('projétil atinge o alvo e reduz uma vida', () => {
    const players = makeMatch();
    const target = players[1];
    const proj = createProjectile(1, target.x + PLAYER_SIZE / 2, target.y + PLAYER_SIZE / 2,
      target.x + PLAYER_SIZE / 2 + 1, target.y + PLAYER_SIZE / 2, 0);
    proj.x = target.x + PLAYER_SIZE / 2;
    proj.y = target.y + PLAYER_SIZE / 2;
    proj.vx = 0;
    proj.vy = 0;

    const result = stepProjectiles([proj], players, ARENA, () => {});
    assert.equal(target.lives, CLASSES.atirador.maxLives - 1);
    assert.equal(target.alive, true);
    assert.equal(result.length, 0);
  });

  test('jogador morre e callback onPlayerDown é chamado ao perder a última vida', () => {
    const players = makeMatch();
    const target = players[1];
    target.lives = 1;
    const proj = createProjectile(1, target.x + PLAYER_SIZE / 2, target.y + PLAYER_SIZE / 2, 0, 0, 0);
    proj.vx = 0;
    proj.vy = 0;

    let callbackArgs = null;
    stepProjectiles([proj], players, ARENA, (ownerIndex, deadPlayer) => {
      callbackArgs = { ownerIndex, deadPlayer };
    });

    assert.equal(target.lives, 0);
    assert.equal(target.alive, false);
    assert.ok(callbackArgs);
    assert.equal(callbackArgs.ownerIndex, 0);
    assert.equal(callbackArgs.deadPlayer, target);
  });

  test('escudo ativo bloqueia o projétil sem perder vida', () => {
    const players = makeMatch();
    const target = players[1];
    target.shielding = true;
    target.shieldHits = 0;
    const proj = createProjectile(1, target.x + PLAYER_SIZE / 2, target.y + PLAYER_SIZE / 2, 0, 0, 0);
    proj.vx = 0;
    proj.vy = 0;

    const result = stepProjectiles([proj], players, ARENA, () => {});
    assert.equal(target.lives, CLASSES.atirador.maxLives);
    assert.equal(target.shieldHits, 1);
    assert.equal(result.length, 0);
  });

  test('escudo se desativa automaticamente após atingir o máximo de hits', () => {
    const players = makeMatch();
    const target = players[1];
    target.classId = 'tank';
    target.shieldMaxHits = CLASSES.tank.shieldMaxHits;
    target.shielding = true;
    target.shieldHits = target.shieldMaxHits - 1;
    const proj = createProjectile(1, target.x + PLAYER_SIZE / 2, target.y + PLAYER_SIZE / 2, 0, 0, 0);
    proj.vx = 0;
    proj.vy = 0;

    stepProjectiles([proj], players, ARENA, () => {});
    assert.equal(target.shieldHits, target.shieldMaxHits);
    assert.equal(target.shielding, false);
  });

  test('projétil não atinge jogador já morto', () => {
    const players = makeMatch();
    const target = players[1];
    target.alive = false;
    target.lives = 0;
    const proj = createProjectile(1, target.x + PLAYER_SIZE / 2, target.y + PLAYER_SIZE / 2, 0, 0, 0);
    proj.vx = 0;
    proj.vy = 0;

    let called = false;
    const result = stepProjectiles([proj], players, ARENA, () => { called = true; });
    assert.equal(called, false);
    assert.equal(result.length, 1);
  });

  test('projétil do jogador 1 tem como alvo o jogador 0', () => {
    const players = makeMatch();
    const target = players[0];
    const proj = createProjectile(1, target.x + PLAYER_SIZE / 2, target.y + PLAYER_SIZE / 2, 0, 0, 1);
    proj.vx = 0;
    proj.vy = 0;

    stepProjectiles([proj], players, ARENA, () => {});
    assert.equal(target.lives, CLASSES.atirador.maxLives - 1);
    assert.equal(players[1].lives, CLASSES.atirador.maxLives);
  });

  test('projétil de alcance limitado some ao ultrapassar a distância percorrida', () => {
    const players = makeMatch();
    const proj = createProjectile(1, 400, 300, 1000, 300, 0, 9, 1, undefined, 50);
    proj.vx = 60;
    proj.vy = 0;

    const result = stepProjectiles([proj], players, ARENA, () => {});
    assert.equal(result.length, 0);
  });

  test('projétil de alcance limitado permanece dentro da distância permitida', () => {
    const players = makeMatch();
    const proj = createProjectile(1, 400, 300, 1000, 300, 0, 9, 1, undefined, 50);
    proj.vx = 10;
    proj.vy = 0;

    const result = stepProjectiles([proj], players, ARENA, () => {});
    assert.equal(result.length, 1);
  });

  test('projétil com alcance infinito não some ao percorrer longas distâncias', () => {
    const players = makeMatch();
    const proj = createProjectile(1, 400, 300, 1000, 300, 0);
    proj.vx = 350;
    proj.vy = 0;

    const result = stepProjectiles([proj], players, ARENA, () => {});
    assert.equal(result.length, 1);
  });
});
