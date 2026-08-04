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
import {
  createBotAiState, computeBotMovement, computeAimTarget, markAttack,
  classDodgeChance, classShieldChance, findIncomingThreat,
} from '../../shared/botStrategy.js';
import { updateGameScale } from './gameScale.js';
import {
  shouldStartMatchTutorial, startMatchTutorial, isMatchTutorialActive,
  isMatchTutorialDummyInvulnerable,
} from './tutorial/matchTutorial.js';
import { atualizarCronometro, resetMatchTimer } from './matchTimer.js';
import {
  criarCronometro, tickCronometro, emDesempate, tempoRestanteMs, adiarFim,
} from '../../shared/matchTimer.js';

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
    ...createBotAiState(),
    // Igual ao servidor: o tempo regulamentar só começa quando a contagem
    // regressiva termina.
    cronometro: null,
  };

  state.latestState = { players: snapshotPlayers(state.bot.players), projectiles: [] };
  state.viewFlipped = computeInitialViewFlip(state.bot.players, state.playerIndex);
  state.shieldMaxHits = state.bot.players.map((p) => p.shieldMaxHits);
  initHearts(state.bot.players.map((p) => p.lives));
  updateHud();
  resetMatchTimer();
  updateGameScale();

  showCountdown(BOT_COUNTDOWN_MS, [state.nickname || 'Você', BOT_NAME], () => {
    state.matchStarted = true;
    playStartSound();
    state.bot.botNextShot = Date.now() + 800;
    state.bot.cronometro = criarCronometro(Date.now());
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
  const diff = bot.difficulty;
  const { cx, cy, targetX, targetY } = computeAimTarget(diff, enemy, me, bot);

  const { projectiles, nextId } = createShotProjectiles(
    bot.nextProjectileId, cx, cy, targetX, targetY, 1, enemy.classId
  );
  bot.nextProjectileId = nextId;
  bot.projectiles.push(...projectiles);
  enemy.lastShot = Date.now();
  markAttack(enemy.classId, bot, Date.now());
}

function updateBotAI() {
  const bot = state.bot;
  const me = bot.players[0];
  const enemy = bot.players[1];
  if (!enemy.alive) return;

  const now = Date.now();
  const enemyCls = getClass(enemy.classId);
  const diff = bot.difficulty;

  // Durante o tutorial o oponente é um boneco de treino: fica parado (um alvo
  // em movimento atrapalha quem ainda está aprendendo a mirar), não atira e
  // mantém o escudo erguido enquanto o tutorial não terminar — ver
  // isMatchTutorialDummyInvulnerable e o refill de shieldHits em botTick.
  if (isMatchTutorialActive()) {
    enemy.input = { up: false, down: false, left: false, right: false };
    enemy.shielding = isMatchTutorialDummyInvulnerable();
    return;
  }

  // Posicionamento (aproximar, manter distância ou recuar) segue a
  // estratégia própria da classe do bot — ver shared/botStrategy.js.
  const movement = computeBotMovement(enemy.classId, enemyCls, enemy, me, bot, now);
  enemy.input.left = movement.left;
  enemy.input.right = movement.right;

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
  const incoming = findIncomingThreat(enemy, bot.projectiles);
  if (incoming) {
    if (!bot.dodgeDecisions.has(incoming.id)) {
      bot.dodgeDecisions.set(incoming.id, Math.random() < classDodgeChance(enemyCls, diff));
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
      bot.shieldDecisions.set(incoming.id, Math.random() < classShieldChance(enemyCls, diff));
    }
    willShield = bot.shieldDecisions.get(incoming.id);
  }
  enemy.shielding = willShield && enemy.shieldHits < enemy.shieldMaxHits;
  if (enemy.shielding) return;

  if (now >= bot.botNextShot && me.alive) {
    botAttack(bot, me, enemy);
    bot.botNextShot = now + enemyCls.shotCooldownMs + diff.cooldownExtraMs + Math.random() * diff.shotJitterMs;
  }
}

// winnerIndex vem da simulação (0 = você, 1 = bot) ou do desempate, que usa
// null para empate.
function resultadoDoVencedor(winnerIndex) {
  if (winnerIndex === null) return 'draw';
  return winnerIndex === 0 ? 'win' : 'lose';
}

// Fim do tempo regulamentar: a partida congela e os tiros que estavam no ar
// somem (mesma regra do servidor, ver congelarPartida em Match.js).
function congelarPartida(bot) {
  bot.projectiles = [];
  for (const p of bot.players) {
    p.input = { up: false, down: false, left: false, right: false };
    p.shielding = false;
  }
}

function publicarEstadoBot(bot) {
  state.latestState = {
    players: snapshotPlayers(bot.players),
    projectiles: bot.projectiles.map((p) => ({ x: p.x, y: p.y, ownerIndex: p.ownerIndex, size: p.size })),
  };
  updateHud();
}

function botTick() {
  if (state.gameOver || !state.bot) return;
  const bot = state.bot;

  // Durante o tutorial o relógio não corre: o jogador está aprendendo os
  // controles, não disputando a partida.
  if (isMatchTutorialActive()) adiarFim(bot.cronometro, TICK_MS);

  const evento = tickCronometro(bot.cronometro, bot.players, Date.now());
  if (evento.iniciouDesempate) congelarPartida(bot);
  if (emDesempate(bot.cronometro)) {
    publicarEstadoBot(bot);
    atualizarCronometro(0, true);
    if (evento.fim) {
      recordGameOver(resultadoDoVencedor(evento.winnerIndex));
      stopBot();
    }
    return;
  }

  bot.players[0].input = getWorldInput();
  bot.players[0].shielding = state.input.shield && bot.players[0].shieldHits < bot.players[0].shieldMaxHits;
  updateBotAI();

  const meXBeforeStep = bot.players[0].x;
  const meYBeforeStep = bot.players[0].y;

  // Enquanto o boneco de treino é invulnerável a partida não pode acabar: o
  // tutorial só termina completando os passos, nunca matando o oponente.
  const bonecoInvulneravel = isMatchTutorialDummyInvulnerable();
  const vidasBoneco = bot.players[1].lives;

  stepPlayers(bot.players, ARENA);
  bot.projectiles = stepProjectiles(bot.projectiles, bot.players, ARENA, (winnerIndex) => {
    if (bonecoInvulneravel && winnerIndex === 0) return;
    recordGameOver(resultadoDoVencedor(winnerIndex));
    stopBot();
  });

  // Escudo infinito do boneco de treino: as cargas gastas neste tick são
  // devolvidas antes de publicar o estado — assim o jogador nunca fura a
  // defesa. As vidas são restauradas junto porque o escudo tem um limite de
  // cargas *por tick*: vários projéteis no mesmo tick (o leque do mago, ou uma
  // classe com uma única carga) chegariam a passar. Feito depois da simulação
  // para o HUD não registrar perda de carga/coração e tocar som de escudo
  // quebrado ou de dano em algo que não acontece.
  if (bonecoInvulneravel) {
    bot.players[1].shieldHits = 0;
    bot.players[1].lives = vidasBoneco;
    bot.players[1].alive = true;
  }

  bot.prevPlayerX = meXBeforeStep;
  bot.prevPlayerY = meYBeforeStep;

  // Descarta decisões de desvio/escudo de projéteis que já sumiram, para
  // os mapas não crescerem sem limite ao longo da partida.
  const activeIds = new Set(bot.projectiles.map((p) => p.id));
  for (const id of bot.dodgeDecisions.keys()) if (!activeIds.has(id)) bot.dodgeDecisions.delete(id);
  for (const id of bot.shieldDecisions.keys()) if (!activeIds.has(id)) bot.shieldDecisions.delete(id);

  publicarEstadoBot(bot);
  if (state.input.shield && !isShieldAvailable()) state.input.shield = false;
  atualizarCronometro(tempoRestanteMs(bot.cronometro, Date.now()), false);
}

export function botShoot(targetX, targetY) {
  const bot = state.bot;
  if (!bot) return;
  // Partida congelada no desempate: ninguém atira.
  if (emDesempate(bot.cronometro)) return;
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
