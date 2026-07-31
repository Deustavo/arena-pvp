import { state } from './state.js';
import {
  ARENA, PLAYER_SIZE, PROJECTILE_COOLDOWN_MS, PROJECTILE_SPEED, SHIELD_MAX_HITS, TICK_MS,
} from '../../shared/constants.js';
import { createPlayerState, createProjectile } from '../../shared/entities.js';
import { stepPlayers, stepProjectiles } from '../../shared/simulation.js';
import { showCountdown } from './overlays.js';
import { updateHud, isShieldAvailable } from './hud.js';
import { recordGameOver } from './gameOver.js';
import { playStartSound } from './audio.js';

const BOT_COUNTDOWN_MS = 3000;

const BOT_NAME = 'Bot';

function snapshotPlayers(players) {
  return players.map((p, i) => ({
    x: p.x,
    y: p.y,
    lives: p.lives,
    alive: p.alive,
    shielding: p.shielding,
    shieldHits: p.shieldHits,
    name: i === 0 ? (state.nickname || 'Você') : BOT_NAME,
  }));
}

export function startBot() {
  state.mode = 'bot';
  state.playerIndex = 0;

  state.bot = {
    players: [createPlayerState(0), createPlayerState(1)],
    projectiles: [],
    nextProjectileId: 1,
    botNextShot: 0,
  };

  state.latestState = { players: snapshotPlayers(state.bot.players), projectiles: [] };
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

function updateBotAI() {
  const bot = state.bot;
  const me = bot.players[0];
  const enemy = bot.players[1];
  if (!enemy.alive) return;

  const now = Date.now();

  // Simple tracking: keep vertical alignment with player, keep horizontal distance.
  const desiredX = ARENA.w - 100 - PLAYER_SIZE;
  const dx = desiredX - enemy.x;
  enemy.input.left = dx < -2;
  enemy.input.right = dx > 2;

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
  enemy.shielding = !!veryClose && enemy.shieldHits < SHIELD_MAX_HITS;
  if (enemy.shielding) return;

  if (now >= bot.botNextShot && me.alive) {
    const cx = enemy.x + PLAYER_SIZE / 2;
    const cy = enemy.y + PLAYER_SIZE / 2;
    const targetX = me.x + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 30;
    const targetY = me.y + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 30;
    bot.projectiles.push(createProjectile(bot.nextProjectileId++, cx, cy, targetX, targetY, 1));
    bot.botNextShot = now + 700 + Math.random() * 600;
  }
}

function botTick() {
  if (state.gameOver || !state.bot) return;
  const bot = state.bot;

  bot.players[0].input = { ...state.input };
  bot.players[0].shielding = state.input.shield && bot.players[0].shieldHits < SHIELD_MAX_HITS;
  updateBotAI();

  stepPlayers(bot.players, ARENA);
  bot.projectiles = stepProjectiles(bot.projectiles, bot.players, ARENA, (winnerIndex) => {
    recordGameOver(winnerIndex === 0 ? 'win' : 'lose');
    stopBot();
  });

  state.latestState = {
    players: snapshotPlayers(bot.players),
    projectiles: bot.projectiles.map((p) => ({ x: p.x, y: p.y, ownerIndex: p.ownerIndex })),
  };
  if (state.input.shield && !isShieldAvailable()) state.input.shield = false;
  updateHud();
}

export function botShoot(targetX, targetY) {
  const bot = state.bot;
  if (!bot) return;
  const me = bot.players[0];
  if (!me.alive) return;
  const now = Date.now();
  if (now - me.lastShot < PROJECTILE_COOLDOWN_MS) return;
  me.lastShot = now;
  const cx = me.x + PLAYER_SIZE / 2;
  const cy = me.y + PLAYER_SIZE / 2;
  bot.projectiles.push(createProjectile(bot.nextProjectileId++, cx, cy, targetX, targetY, 0, PROJECTILE_SPEED));
}
