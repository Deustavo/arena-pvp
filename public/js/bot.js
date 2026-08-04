import { state, computeInitialViewFlip, getWorldInput } from './state.js';
import {
  ARENA, PLAYER_SIZE, TICK_MS, PROJECTILE_SPEED, SHIELD_RADIUS, PROJECTILE_SIZE,
} from '../../shared/constants.js';
import { createPlayerState, createShotProjectiles, escudoAtivo } from '../../shared/entities.js';
import { CLASSES, getClass } from '../../shared/classes.js';
import { stepPlayers, stepProjectiles } from '../../shared/simulation.js';
import { showCountdown } from './overlays.js';
import { updateHud, isShieldAvailable, initHearts } from './hud.js';
import { recordGameOver } from './gameOver.js';
import { playStartSound } from './audio.js';
import { getBotDifficulty } from '../../shared/botDifficulty.js';
import { updateGameScale } from './gameScale.js';
import { shouldStartMatchTutorial, startMatchTutorial, isMatchTutorialActive } from './tutorial/matchTutorial.js';

const BOT_COUNTDOWN_MS = 3000;

const BOT_NAME = 'Bot';

function pickRandomClassId() {
  const ids = Object.keys(CLASSES);
  return ids[Math.floor(Math.random() * ids.length)];
}

function snapshotPlayers(players) {
  return players.map((p, i) => ({
    x: p.x,
    y: p.y,
    lives: p.lives,
    alive: p.alive,
    shielding: p.shielding,
    shieldHits: p.shieldHits,
    shieldMaxHits: p.shieldMaxHits,
    classId: p.classId,
    name: i === 0 ? (state.nickname || 'Você') : BOT_NAME,
    lastShot: p.lastShot,
  }));
}

export function startBot() {
  state.mode = 'bot';
  state.playerIndex = 0;

  const myClassId = state.classId;
  const botClassId = state.botClassId || pickRandomClassId();

  state.bot = {
    players: [createPlayerState(0, myClassId), createPlayerState(1, botClassId)],
    projectiles: [],
    nextProjectileId: 1,
    botNextShot: 0,
    difficulty: getBotDifficulty(state.botDifficulty),
    aimTargetY: null,
    nextAimUpdate: 0,
    dodgeDecisions: new Map(),
    shieldDecisions: new Map(),
    prevMeX: null,
    prevMeY: null,
  };

  state.latestState = { players: snapshotPlayers(state.bot.players), projectiles: [] };
  state.viewFlipped = computeInitialViewFlip(state.bot.players, state.playerIndex);
  state.shieldMaxHits = state.bot.players.map((p) => p.shieldMaxHits);
  initHearts(state.bot.players.map((p) => p.lives));
  updateHud();
  updateGameScale();

  showCountdown(BOT_COUNTDOWN_MS, [state.nickname || 'Você', BOT_NAME], () => {
    state.matchStarted = true;
    playStartSound();
    state.bot.botNextShot = Date.now() + 800;
    state.botInterval = setInterval(botTick, TICK_MS);
    if (shouldStartMatchTutorial()) startMatchTutorial();
  });
}

export function stopBot() {
  if (state.botInterval) {
    clearInterval(state.botInterval);
    state.botInterval = null;
  }
  state.bot = null;
}

function botAttack(bot, me, enemy) {
  const cx = enemy.x + PLAYER_SIZE / 2;
  const cy = enemy.y + PLAYER_SIZE / 2;
  const diff = bot.difficulty;

  let targetX = me.x + PLAYER_SIZE / 2;
  let targetY = me.y + PLAYER_SIZE / 2;

  // Mira preditiva: projeta a posição do jogador com base na velocidade
  // estimada (tick anterior), no tempo que o projétil levaria para chegar.
  if (diff.predictive && bot.prevMeX !== null) {
    const velX = me.x - bot.prevMeX;
    const velY = me.y - bot.prevMeY;
    const travelTicks = Math.hypot(targetX - cx, targetY - cy) / PROJECTILE_SPEED;
    targetX += velX * travelTicks;
    targetY += velY * travelTicks;
  }

  targetX += (Math.random() - 0.5) * diff.aimSpread;
  targetY += (Math.random() - 0.5) * diff.aimSpread;

  const { projectiles, nextId } = createShotProjectiles(
    bot.nextProjectileId, cx, cy, targetX, targetY, 1, enemy.classId
  );
  bot.nextProjectileId = nextId;
  bot.projectiles.push(...projectiles);
}

function updateBotAI() {
  const bot = state.bot;
  const me = bot.players[0];
  const enemy = bot.players[1];
  if (!enemy.alive) return;

  const now = Date.now();
  const enemyCls = getClass(enemy.classId);
  const diff = bot.difficulty;

  // Simple tracking: keep vertical alignment with player, keep desired horizontal distance.
  if (Number.isFinite(enemyCls.range)) {
    // Alcance curto (tank): aproxima-se até ficar dentro do alcance do tiro.
    const dxToPlayer = (me.x + PLAYER_SIZE / 2) - (enemy.x + PLAYER_SIZE / 2);
    const preferredRange = enemyCls.range - 30;
    enemy.input.left = dxToPlayer < preferredRange - 10;
    enemy.input.right = dxToPlayer > preferredRange + 10;
  } else {
    const desiredX = ARENA.w - 100 - PLAYER_SIZE;
    const dx = desiredX - enemy.x;
    enemy.input.left = dx < -2;
    enemy.input.right = dx > 2;
  }

  // Alinhamento vertical: bots fracos só "reparam" na posição do jogador de
  // tempos em tempos (reactionDelayMs) e miram com erro (trackingErrorPx);
  // o demoníaco reage a cada tick com precisão total.
  if (bot.aimTargetY === null || now >= bot.nextAimUpdate) {
    bot.aimTargetY = me.y + (Math.random() - 0.5) * diff.trackingErrorPx;
    bot.nextAimUpdate = now + diff.reactionDelayMs;
  }
  const dy = bot.aimTargetY - enemy.y;
  enemy.input.up = dy < -4;
  enemy.input.down = dy > 4;

  // Desvia de tiros próximos. A decisão de desviar é tomada uma única vez
  // por projétil (não a cada tick), senão até uma chance baixa acaba quase
  // sempre acertando ao longo dos vários ticks em que o tiro fica "próximo".
  const incoming = bot.projectiles.find((p) => p.ownerIndex === 0 &&
    Math.abs(p.y - (enemy.y + PLAYER_SIZE / 2)) < 60 && p.x < enemy.x && p.x > enemy.x - 250);
  if (incoming) {
    if (!bot.dodgeDecisions.has(incoming.id)) {
      bot.dodgeDecisions.set(incoming.id, Math.random() < diff.dodgeChance);
    }
    if (bot.dodgeDecisions.get(incoming.id)) {
      enemy.input.up = enemy.y > 40;
      enemy.input.down = !enemy.input.up;
    }
  }

  // Defende quando o tiro está muito perto e ainda restam cargas de escudo
  // (decisão também travada por projétil, pelo mesmo motivo acima). O raio
  // usado aqui precisa refletir o alcance real do bloqueio (SHIELD_RADIUS em
  // physics.js): um raio maior só faz o bot travar em modo escudo cedo
  // demais, sem conseguir desviar, e ainda assim tomar o tiro porque ele
  // nunca entrou de fato no alcance do escudo.
  const shieldHitDist = SHIELD_RADIUS + (incoming?.size ?? PROJECTILE_SIZE) / 2 + PROJECTILE_SPEED * 2;
  const veryClose = incoming && Math.hypot(
    incoming.x - (enemy.x + PLAYER_SIZE / 2),
    incoming.y - (enemy.y + PLAYER_SIZE / 2)
  ) < shieldHitDist;
  let willShield = false;
  if (veryClose) {
    if (!bot.shieldDecisions.has(incoming.id)) {
      bot.shieldDecisions.set(incoming.id, Math.random() < diff.shieldChance);
    }
    willShield = bot.shieldDecisions.get(incoming.id);
  }
  enemy.shielding = willShield && enemy.shieldHits < enemy.shieldMaxHits;
  if (enemy.shielding) return;

  // Na primeira partida (tutorial interativo), o bot não atira, para o
  // jogador poder praticar mover/atirar/escudo sem risco de perder vidas.
  if (now >= bot.botNextShot && me.alive && !isMatchTutorialActive()) {
    botAttack(bot, me, enemy);
    bot.botNextShot = now + enemyCls.shotCooldownMs + diff.cooldownExtraMs + Math.random() * diff.shotJitterMs;
  }
}

function botTick() {
  if (state.gameOver || !state.bot) return;
  const bot = state.bot;

  bot.players[0].input = getWorldInput();
  bot.players[0].shielding = state.input.shield && bot.players[0].shieldHits < bot.players[0].shieldMaxHits;
  updateBotAI();

  const meXBeforeStep = bot.players[0].x;
  const meYBeforeStep = bot.players[0].y;

  stepPlayers(bot.players, ARENA);
  bot.projectiles = stepProjectiles(bot.projectiles, bot.players, ARENA, (winnerIndex) => {
    recordGameOver(winnerIndex === 0 ? 'win' : 'lose');
    stopBot();
  });

  bot.prevMeX = meXBeforeStep;
  bot.prevMeY = meYBeforeStep;

  // Descarta decisões de desvio/escudo de projéteis que já sumiram, para
  // os mapas não crescerem sem limite ao longo da partida.
  const activeIds = new Set(bot.projectiles.map((p) => p.id));
  for (const id of bot.dodgeDecisions.keys()) if (!activeIds.has(id)) bot.dodgeDecisions.delete(id);
  for (const id of bot.shieldDecisions.keys()) if (!activeIds.has(id)) bot.shieldDecisions.delete(id);

  state.latestState = {
    players: snapshotPlayers(bot.players),
    projectiles: bot.projectiles.map((p) => ({ x: p.x, y: p.y, ownerIndex: p.ownerIndex, size: p.size })),
  };
  if (state.input.shield && !isShieldAvailable()) state.input.shield = false;
  updateHud();
}

export function botShoot(targetX, targetY) {
  const bot = state.bot;
  if (!bot) return;
  const me = bot.players[0];
  if (!me.alive) return;
  // Em modo de defesa o jogador não atira (mas continua podendo se mover).
  if (escudoAtivo(me)) return;
  const cls = getClass(me.classId);
  const now = Date.now();
  if (now - me.lastShot < cls.shotCooldownMs) return;
  me.lastShot = now;

  const cx = me.x + PLAYER_SIZE / 2;
  const cy = me.y + PLAYER_SIZE / 2;

  const { projectiles, nextId } = createShotProjectiles(
    bot.nextProjectileId, cx, cy, targetX, targetY, 0, me.classId
  );
  bot.nextProjectileId = nextId;
  bot.projectiles.push(...projectiles);
}
