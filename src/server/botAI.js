// IA do bot usado em partidas online quando não há oponente humano disponível
// (ver matchmaking.js). Espelha a lógica do modo treino local
// (public/js/bot.js), adaptada à estrutura de uma partida no servidor — aqui
// o bot ocupa sempre o slot de índice 1 (o segundo jogador da partida).
import {
  ARENA, PLAYER_SIZE, PROJECTILE_SPEED, PROJECTILE_SIZE, SHIELD_RADIUS,
} from '../../shared/constants.js';
import { getClass } from '../../shared/classes.js';
import { createShotProjectiles } from '../../shared/entities.js';
import { getBotDifficulty } from '../../shared/botDifficulty.js';

export function createBotState(difficultyId) {
  return {
    difficulty: getBotDifficulty(difficultyId),
    nextShotAt: Date.now() + 800,
    aimTargetY: null,
    nextAimUpdate: 0,
    dodgeDecisions: new Map(),
    shieldDecisions: new Map(),
    prevPlayerX: null,
    prevPlayerY: null,
  };
}

function botAttack(match, diff, player, bot) {
  const state = match.botState;
  const cx = bot.x + PLAYER_SIZE / 2;
  const cy = bot.y + PLAYER_SIZE / 2;

  let targetX = player.x + PLAYER_SIZE / 2;
  let targetY = player.y + PLAYER_SIZE / 2;

  // Mira preditiva: projeta a posição do jogador com base na velocidade
  // estimada (tick anterior), no tempo que o projétil levaria para chegar.
  if (diff.predictive && state.prevPlayerX !== null) {
    const velX = player.x - state.prevPlayerX;
    const velY = player.y - state.prevPlayerY;
    const travelTicks = Math.hypot(targetX - cx, targetY - cy) / PROJECTILE_SPEED;
    targetX += velX * travelTicks;
    targetY += velY * travelTicks;
  }

  targetX += (Math.random() - 0.5) * diff.aimSpread;
  targetY += (Math.random() - 0.5) * diff.aimSpread;

  const { projectiles, nextId } = createShotProjectiles(
    match.nextProjectileId, cx, cy, targetX, targetY, 1, bot.classId
  );
  match.nextProjectileId = nextId;
  match.projectiles.push(...projectiles);
}

// Atualiza o input/mira/escudo do bot e dispara quando necessário. Deve ser
// chamado a cada tick, antes de stepPlayers/stepProjectiles.
export function tickBot(match) {
  const state = match.botState;
  const player = match.players[0];
  const bot = match.players[1];
  if (!bot.alive) return;

  const now = Date.now();
  const botCls = getClass(bot.classId);
  const diff = state.difficulty;

  if (Number.isFinite(botCls.range)) {
    // Alcance curto (tank): aproxima-se até ficar dentro do alcance do tiro.
    const dxToPlayer = (player.x + PLAYER_SIZE / 2) - (bot.x + PLAYER_SIZE / 2);
    const preferredRange = botCls.range - 30;
    bot.input.left = dxToPlayer < preferredRange - 10;
    bot.input.right = dxToPlayer > preferredRange + 10;
  } else {
    const desiredX = ARENA.w - 100 - PLAYER_SIZE;
    const dx = desiredX - bot.x;
    bot.input.left = dx < -2;
    bot.input.right = dx > 2;
  }

  if (state.aimTargetY === null || now >= state.nextAimUpdate) {
    state.aimTargetY = player.y + (Math.random() - 0.5) * diff.trackingErrorPx;
    state.nextAimUpdate = now + diff.reactionDelayMs;
  }
  const dy = state.aimTargetY - bot.y;
  bot.input.up = dy < -4;
  bot.input.down = dy > 4;

  // Desvia de tiros próximos (decisão travada por projétil, não por tick).
  const incoming = match.projectiles.find((p) => p.ownerIndex === 0 &&
    Math.abs(p.y - (bot.y + PLAYER_SIZE / 2)) < 60 && p.x < bot.x && p.x > bot.x - 250);
  if (incoming) {
    if (!state.dodgeDecisions.has(incoming.id)) {
      state.dodgeDecisions.set(incoming.id, Math.random() < diff.dodgeChance);
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
      state.shieldDecisions.set(incoming.id, Math.random() < diff.shieldChance);
    }
    willShield = state.shieldDecisions.get(incoming.id);
  }
  bot.shielding = willShield && bot.shieldHits < bot.shieldMaxHits;

  if (!bot.shielding && now >= state.nextShotAt && player.alive) {
    botAttack(match, diff, player, bot);
    state.nextShotAt = now + botCls.shotCooldownMs + diff.cooldownExtraMs + Math.random() * diff.shotJitterMs;
  }

  // Descarta decisões de desvio/escudo de projéteis que já sumiram, para os
  // mapas não crescerem sem limite ao longo da partida.
  const activeIds = new Set(match.projectiles.map((p) => p.id));
  for (const id of state.dodgeDecisions.keys()) if (!activeIds.has(id)) state.dodgeDecisions.delete(id);
  for (const id of state.shieldDecisions.keys()) if (!activeIds.has(id)) state.shieldDecisions.delete(id);

  state.prevPlayerX = player.x;
  state.prevPlayerY = player.y;
}
