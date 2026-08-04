import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBotAiState, computeBotMovement, markAttack, classDodgeChance, classShieldChance,
  findIncomingThreat,
} from '../shared/botStrategy.js';
import { getClass } from '../shared/classes.js';
import { ARENA, PLAYER_SIZE } from '../shared/constants.js';

function makePlayer(x, y = 300) {
  return { x, y };
}

describe('computeBotMovement', () => {
  test('tank aproxima-se do jogador para pressionar de perto', () => {
    const tank = getClass('tank');
    const bot = makePlayer(ARENA.w - 100 - PLAYER_SIZE);
    const player = makePlayer(100);
    const aiState = createBotAiState();
    const movement = computeBotMovement('tank', tank, bot, player, aiState, Date.now());
    assert.equal(movement.left, true);
    assert.equal(movement.right, false);
  });

  test('sniper recua quando o jogador está mais perto que o alcance de bônus', () => {
    const sniper = getClass('sniper');
    const bot = makePlayer(500);
    const player = makePlayer(480); // 20px de distância, bem abaixo de longRangeDistance
    const aiState = createBotAiState();
    const movement = computeBotMovement('sniper', sniper, bot, player, aiState, Date.now());
    // Jogador está à esquerda (menor x) do bot: recuar significa ir mais para a direita.
    assert.equal(movement.right, true);
    assert.equal(movement.left, false);
  });

  test('sniper para de se mover quando já está a uma distância segura', () => {
    const sniper = getClass('sniper');
    const bot = makePlayer(900);
    const player = makePlayer(100); // bem além de longRangeDistance
    const aiState = createBotAiState();
    const movement = computeBotMovement('sniper', sniper, bot, player, aiState, Date.now());
    assert.equal(movement.left, false);
    assert.equal(movement.right, false);
  });

  test('assassino foge por um instante depois de atirar (hit-and-run)', () => {
    const assassino = getClass('assassino');
    const bot = makePlayer(500);
    const player = makePlayer(480); // jogador à esquerda do bot
    const aiState = createBotAiState();
    const now = Date.now();
    markAttack('assassino', aiState, now);
    const movement = computeBotMovement('assassino', assassino, bot, player, aiState, now);
    // Em retirada: foge do jogador (que está à esquerda), então se move para a direita.
    assert.equal(movement.right, true);
    assert.equal(movement.left, false);
  });

  test('assassino volta a se aproximar depois que a janela de fuga expira', () => {
    const assassino = getClass('assassino');
    const bot = makePlayer(ARENA.w - 100 - PLAYER_SIZE);
    const player = makePlayer(100);
    const aiState = createBotAiState();
    const now = Date.now();
    markAttack('assassino', aiState, now - 10000); // fuga já expirou
    const movement = computeBotMovement('assassino', assassino, bot, player, aiState, now);
    assert.equal(movement.left, true);
    assert.equal(movement.right, false);
  });
});

describe('findIncomingThreat', () => {
  test('detecta ameaça vindo da esquerda (atirador à esquerda do bot)', () => {
    const bot = makePlayer(500, 300);
    const projectiles = [
      { id: 'p1', ownerIndex: 0, x: 400, y: bot.y + PLAYER_SIZE / 2, vx: 5, vy: 0 },
    ];
    assert.equal(findIncomingThreat(bot, projectiles)?.id, 'p1');
  });

  test('detecta ameaça vindo da direita (bot cruzou para o outro lado do adversário)', () => {
    // Bug corrigido: a detecção antiga assumia que o atirador estava sempre
    // à esquerda do bot e nunca via um projétil se aproximando pela direita.
    const bot = makePlayer(500, 300);
    const projectiles = [
      { id: 'p1', ownerIndex: 0, x: 600, y: bot.y + PLAYER_SIZE / 2, vx: -5, vy: 0 },
    ];
    assert.equal(findIncomingThreat(bot, projectiles)?.id, 'p1');
  });

  test('ignora projétil que já passou e está se afastando', () => {
    const bot = makePlayer(500, 300);
    const projectiles = [
      { id: 'p1', ownerIndex: 0, x: 400, y: bot.y + PLAYER_SIZE / 2, vx: -5, vy: 0 },
    ];
    assert.equal(findIncomingThreat(bot, projectiles), undefined);
  });

  test('ignora projétil fora da faixa vertical', () => {
    const bot = makePlayer(500, 300);
    const projectiles = [
      { id: 'p1', ownerIndex: 0, x: 400, y: bot.y + 500, vx: 5, vy: 0 },
    ];
    assert.equal(findIncomingThreat(bot, projectiles), undefined);
  });

  test('ignora os próprios projéteis do bot', () => {
    const bot = makePlayer(500, 300);
    const projectiles = [
      { id: 'p1', ownerIndex: 1, x: 400, y: bot.y + PLAYER_SIZE / 2, vx: 5, vy: 0 },
    ];
    assert.equal(findIncomingThreat(bot, projectiles), undefined);
  });
});

describe('classDodgeChance / classShieldChance', () => {
  test('classes com só 1 carga de escudo preferem desviar a arriscar o escudo', () => {
    const assassino = getClass('assassino'); // shieldMaxHits: 1
    const diff = { dodgeChance: 0.5, shieldChance: 0.5 };
    assert.ok(classShieldChance(assassino, diff) < diff.shieldChance);
    assert.ok(classDodgeChance(assassino, diff) > diff.dodgeChance);
  });

  test('classes com escudo robusto usam os valores de dificuldade sem ajuste', () => {
    const tank = getClass('tank'); // shieldMaxHits: 5
    const diff = { dodgeChance: 0.5, shieldChance: 0.5 };
    assert.equal(classShieldChance(tank, diff), diff.shieldChance);
    assert.equal(classDodgeChance(tank, diff), diff.dodgeChance);
  });

  test('classDodgeChance nunca ultrapassa 1', () => {
    const assassino = getClass('assassino');
    const diff = { dodgeChance: 1 };
    assert.equal(classDodgeChance(assassino, diff), 1);
  });
});
