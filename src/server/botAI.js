// IA do bot usado em partidas online quando não há oponente humano disponível
// (ver matchmaking.js). Espelha a lógica do modo treino local
// (public/js/bot.js), adaptada à estrutura de uma partida no servidor — aqui
// o bot ocupa sempre o slot de índice 1 (o segundo jogador da partida). A
// estratégia de posicionamento/ataque por classe vive em
// `shared/botStrategy.js`, fonte única para servidor e cliente.
import {
  PLAYER_SIZE, PROJECTILE_SIZE, SHIELD_RADIUS, PROJECTILE_SPEED,
} from '../../shared/constants.js';
import { getClass } from '../../shared/classes.js';
import { createShotProjectiles } from '../../shared/entities.js';
import { getBotDifficulty } from '../../shared/botDifficulty.js';
import {
  createBotAiState, computeBotMovement, computeAimTarget, markAttack,
  classDodgeChance, classShieldChance, findIncomingThreat, computeBotFacing,
  escolherPowerupAlvo, movimentoParaPowerup,
} from '../../shared/botStrategy.js';
import { cooldownDeTiro } from '../../shared/powerups.js';

export function createBotState(difficultyId) {
  return {
    difficulty: getBotDifficulty(difficultyId),
    nextShotAt: Date.now() + 800,
    ...createBotAiState(),
  };
}

function botAttack(match, diff, player, bot) {
  const state = match.botState;
  const { cx, cy, targetX, targetY } = computeAimTarget(diff, bot, player, state);

  const { projectiles, nextId } = createShotProjectiles(
    match.nextProjectileId, cx, cy, targetX, targetY, 1, bot.classId
  );
  match.nextProjectileId = nextId;
  match.projectiles.push(...projectiles);
  markAttack(bot.classId, state, Date.now());
}

// Atualiza o input/mira/escudo do bot e dispara quando necessário. Deve ser
// chamado a cada tick, antes de stepPlayers/stepProjectiles.
export function tickBot(match) {
  const state = match.botState;
  const player = match.players[0];
  const bot = match.players[1];
  if (!bot.alive) return;

  bot.facing = computeBotFacing(bot, player);

  const now = Date.now();
  const botCls = getClass(bot.classId);
  const diff = state.difficulty;

  const movement = computeBotMovement(bot.classId, botCls, bot, player, state, now);
  bot.input.left = movement.left;
  bot.input.right = movement.right;

  if (state.aimTargetY === null || now >= state.nextAimUpdate) {
    state.aimTargetY = player.y + (Math.random() - 0.5) * diff.trackingErrorPx;
    state.nextAimUpdate = now + diff.reactionDelayMs;
  }
  const dy = state.aimTargetY - bot.y;
  bot.input.up = dy < -4;
  bot.input.down = dy > 4;

  // Bolha de power-up ao alcance: buscar o item passa na frente do
  // posicionamento da classe (mas não do desvio de tiro, logo abaixo).
  const alvoPowerup = escolherPowerupAlvo(bot, player, match.powerups?.ativos);
  if (alvoPowerup) {
    const rumo = movimentoParaPowerup(bot, alvoPowerup);
    bot.input.left = rumo.left;
    bot.input.right = rumo.right;
    bot.input.up = rumo.up;
    bot.input.down = rumo.down;
  }

  // Desvia de tiros próximos (decisão travada por projétil, não por tick).
  const incoming = findIncomingThreat(bot, match.projectiles);
  if (incoming) {
    if (!state.dodgeDecisions.has(incoming.id)) {
      state.dodgeDecisions.set(incoming.id, Math.random() < classDodgeChance(botCls, diff));
    }
    if (state.dodgeDecisions.get(incoming.id)) {
      bot.input.up = bot.y > 40;
      bot.input.down = !bot.input.up;
    }
  }

  const shieldHitDist = SHIELD_RADIUS + (incoming?.size ?? PROJECTILE_SIZE) / 2 + PROJECTILE_SPEED * 2;
  const veryClose = incoming && Math.hypot(
    incoming.x - (bot.x + PLAYER_SIZE / 2),
    incoming.y - (bot.y + PLAYER_SIZE / 2)
  ) < shieldHitDist;
  let willShield = false;
  if (veryClose) {
    if (!state.shieldDecisions.has(incoming.id)) {
      state.shieldDecisions.set(incoming.id, Math.random() < classShieldChance(botCls, diff));
    }
    willShield = state.shieldDecisions.get(incoming.id);
  }
  bot.shielding = willShield && bot.shieldHits < bot.shieldMaxHits;

  if (!bot.shielding && now >= state.nextShotAt && player.alive) {
    botAttack(match, diff, player, bot);
    state.nextShotAt = now + cooldownDeTiro(bot, botCls, now)
      + diff.cooldownExtraMs + Math.random() * diff.shotJitterMs;
  }

  // Descarta decisões de desvio/escudo de projéteis que já sumiram, para os
  // mapas não crescerem sem limite ao longo da partida.
  const activeIds = new Set(match.projectiles.map((p) => p.id));
  for (const id of state.dodgeDecisions.keys()) if (!activeIds.has(id)) state.dodgeDecisions.delete(id);
  for (const id of state.shieldDecisions.keys()) if (!activeIds.has(id)) state.shieldDecisions.delete(id);

  state.prevPlayerX = player.x;
  state.prevPlayerY = player.y;
}
