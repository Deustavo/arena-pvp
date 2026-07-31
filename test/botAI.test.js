import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createBotState, tickBot } from '../src/server/botAI.js';
import { createPlayerState } from '../shared/entities.js';
import { ARENA, PLAYER_SIZE } from '../shared/constants.js';
import { BOT_DIFFICULTIES } from '../shared/botDifficulty.js';

function makeMatch({ playerClassId = 'atirador', botClassId = 'atirador', difficulty = 'noob' } = {}) {
  const players = [createPlayerState(0, playerClassId), createPlayerState(1, botClassId)];
  return {
    players,
    projectiles: [],
    nextProjectileId: 1,
    botState: createBotState(difficulty),
  };
}

describe('createBotState', () => {
  test('resolve o perfil de dificuldade e inicializa o estado', () => {
    const state = createBotState('noob');
    assert.equal(state.difficulty, BOT_DIFFICULTIES.noob);
    assert.equal(state.aimTargetY, null);
    assert.equal(state.prevPlayerX, null);
    assert.equal(state.prevPlayerY, null);
    assert.ok(state.dodgeDecisions instanceof Map);
    assert.ok(state.shieldDecisions instanceof Map);
    assert.equal(state.dodgeDecisions.size, 0);
  });

  test('usa a dificuldade padrão quando o id é inválido', () => {
    const state = createBotState('nao-existe');
    assert.equal(state.difficulty, BOT_DIFFICULTIES.intermediario);
  });
});

describe('tickBot', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'] });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.reset();
  });

  test('bot morto não recebe nenhuma atualização de input', () => {
    const match = makeMatch();
    const bot = match.players[1];
    bot.alive = false;
    const inputBefore = { ...bot.input };
    tickBot(match);
    assert.deepEqual(bot.input, inputBefore);
  });

  test('bot de classe com alcance infinito se posiciona perto da borda direita', () => {
    const match = makeMatch({ botClassId: 'atirador' });
    const bot = match.players[1];
    const desiredX = ARENA.w - 100 - PLAYER_SIZE;
    bot.x = desiredX - 50;
    tickBot(match);
    assert.equal(bot.input.right, true);
    assert.equal(bot.input.left, false);
  });

  test('bot de classe com alcance limitado se aproxima até a distância preferida', () => {
    const match = makeMatch({ botClassId: 'tank' });
    const player = match.players[0];
    const bot = match.players[1];
    // Bot muito longe do jogador: deve se mover para a esquerda (na direção do jogador).
    player.x = 100;
    bot.x = ARENA.w - 100 - PLAYER_SIZE;
    tickBot(match);
    assert.equal(bot.input.left, true);
    assert.equal(bot.input.right, false);
  });

  test('mira verticalmente em direção ao jogador (dificuldade demoníaca, sem erro de mira)', () => {
    const match = makeMatch({ difficulty: 'demoniaco' });
    const player = match.players[0];
    const bot = match.players[1];
    player.y = 50;
    bot.y = 400;
    tickBot(match);
    assert.equal(bot.input.up, true);
    assert.equal(bot.input.down, false);
  });

  test('atira quando o cooldown expira e o jogador está vivo', () => {
    const match = makeMatch({ difficulty: 'demoniaco' });
    match.botState.nextShotAt = Date.now();
    const nextIdBefore = match.nextProjectileId;
    tickBot(match);
    assert.ok(match.projectiles.length > 0);
    assert.ok(match.nextProjectileId > nextIdBefore);
    assert.ok(match.botState.nextShotAt > Date.now());
  });

  test('não atira antes do cooldown expirar', () => {
    const match = makeMatch({ difficulty: 'demoniaco' });
    match.botState.nextShotAt = Date.now() + 5000;
    tickBot(match);
    assert.equal(match.projectiles.length, 0);
  });

  test('não atira quando o jogador está morto', () => {
    const match = makeMatch({ difficulty: 'demoniaco' });
    match.players[0].alive = false;
    match.botState.nextShotAt = Date.now();
    tickBot(match);
    assert.equal(match.projectiles.length, 0);
  });

  test('desvia de um projétil próximo quando a decisão de esquiva é favorável', () => {
    const match = makeMatch({ difficulty: 'demoniaco' });
    const bot = match.players[1];
    bot.x = 400;
    bot.y = 300;
    match.projectiles.push({
      id: 'p1', ownerIndex: 0, x: bot.x - 100, y: bot.y + PLAYER_SIZE / 2, size: 8,
    });
    mock.method(Math, 'random', () => 0); // < dodgeChance (1 no demoníaco) => desvia
    tickBot(match);
    assert.ok(match.botState.dodgeDecisions.has('p1'));
    assert.equal(match.botState.dodgeDecisions.get('p1'), true);
  });

  test('não desvia quando a decisão de esquiva é desfavorável', () => {
    const match = makeMatch({ difficulty: 'noob' });
    const bot = match.players[1];
    bot.x = 400;
    bot.y = 300;
    match.projectiles.push({
      id: 'p1', ownerIndex: 0, x: bot.x - 100, y: bot.y + PLAYER_SIZE / 2, size: 8,
    });
    mock.method(Math, 'random', () => 0.99); // > dodgeChance (0.2 no noob) => não desvia
    tickBot(match);
    assert.equal(match.botState.dodgeDecisions.get('p1'), false);
  });

  test('ativa o escudo quando o projétil está muito perto e a decisão é favorável', () => {
    const match = makeMatch({ difficulty: 'demoniaco' });
    const bot = match.players[1];
    bot.x = 400;
    bot.y = 300;
    match.projectiles.push({
      id: 'p1', ownerIndex: 0, x: bot.x + PLAYER_SIZE / 2 - 25, y: bot.y + PLAYER_SIZE / 2, size: 8,
    });
    mock.method(Math, 'random', () => 0); // shieldChance do demoníaco é 1 => sempre escuda
    tickBot(match);
    assert.equal(bot.shielding, true);
  });

  test('não ativa o escudo quando shieldHits já atingiu o máximo', () => {
    const match = makeMatch({ difficulty: 'demoniaco' });
    const bot = match.players[1];
    bot.x = 400;
    bot.y = 300;
    bot.shieldHits = bot.shieldMaxHits;
    match.projectiles.push({
      id: 'p1', ownerIndex: 0, x: bot.x + PLAYER_SIZE / 2 - 5, y: bot.y + PLAYER_SIZE / 2, size: 8,
    });
    mock.method(Math, 'random', () => 0);
    tickBot(match);
    assert.equal(bot.shielding, false);
  });

  test('descarta decisões de projéteis que já não existem mais', () => {
    const match = makeMatch();
    match.botState.dodgeDecisions.set('velho', true);
    match.botState.shieldDecisions.set('velho', false);
    match.projectiles = []; // projétil "velho" já não está mais ativo
    tickBot(match);
    assert.equal(match.botState.dodgeDecisions.has('velho'), false);
    assert.equal(match.botState.shieldDecisions.has('velho'), false);
  });

  test('atualiza prevPlayerX/prevPlayerY para uso da mira preditiva', () => {
    const match = makeMatch();
    const player = match.players[0];
    player.x = 123;
    player.y = 456;
    tickBot(match);
    assert.equal(match.botState.prevPlayerX, 123);
    assert.equal(match.botState.prevPlayerY, 456);
  });
});
