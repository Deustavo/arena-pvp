import { state } from './state.js';
import { ARENA, PLAYER_SIZE, TICK_MS } from '../../shared/constants.js';
import { createPlayerState, createShotProjectiles } from '../../shared/entities.js';
import { CLASSES, getClass } from '../../shared/classes.js';
import { stepPlayers, stepProjectiles } from '../../shared/simulation.js';
import { showCountdown } from './overlays.js';
import { updateHud, isShieldAvailable, initHearts } from './hud.js';
import { recordGameOver } from './gameOver.js';
import { playStartSound } from './audio.js';

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
  const botClassId = pickRandomClassId();

  state.bot = {
    players: [createPlayerState(0, myClassId), createPlayerState(1, botClassId)],
    projectiles: [],
    nextProjectileId: 1,
    botNextShot: 0,
  };

  state.latestState = { players: snapshotPlayers(state.bot.players), projectiles: [] };
  state.shieldMaxHits = state.bot.players.map((p) => p.shieldMaxHits);
  initHearts(state.bot.players.map((p) => p.lives));
  updateHud();

  showCountdown(BOT_COUNTDOWN_MS, () => {
    state.matchStarted = true;
    playStartSound();
    state.bot.botNextShot = Date.now() + 800;
    state.botInterval = setInterval(botTick, TICK_MS);
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

  const targetX = me.x + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 30;
  const targetY = me.y + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 30;
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

  const dy = me.y - enemy.y;
  enemy.input.up = dy < -4;
  enemy.input.down = dy > 4;

  // Dodge nearby incoming projectiles occasionally.
  const incoming = bot.projectiles.find((p) => p.ownerIndex === 0 &&
    Math.abs(p.y - (enemy.y + PLAYER_SIZE / 2)) < 60 && p.x < enemy.x && p.x > enemy.x - 250);
  if (incoming) {
    enemy.input.up = enemy.y > 40;
    enemy.input.down = !enemy.input.up;
  }

  // Defende quando o tiro está muito perto e ainda restam cargas de escudo.
  const veryClose = incoming && Math.abs(incoming.x - (enemy.x + PLAYER_SIZE / 2)) < 90;
  enemy.shielding = !!veryClose && enemy.shieldHits < enemy.shieldMaxHits;
  if (enemy.shielding) return;

  if (now >= bot.botNextShot && me.alive) {
    botAttack(bot, me, enemy);
    bot.botNextShot = now + enemyCls.shotCooldownMs + Math.random() * 400;
  }
}

function botTick() {
  if (state.gameOver || !state.bot) return;
  const bot = state.bot;

  bot.players[0].input = { ...state.input };
  bot.players[0].shielding = state.input.shield && bot.players[0].shieldHits < bot.players[0].shieldMaxHits;
  updateBotAI();

  stepPlayers(bot.players, ARENA);
  bot.projectiles = stepProjectiles(bot.projectiles, bot.players, ARENA, (winnerIndex) => {
    recordGameOver(winnerIndex === 0 ? 'win' : 'lose');
    stopBot();
  });

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
