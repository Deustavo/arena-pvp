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
  classDodgeChance, classShieldChance, findIncomingThreat, computeBotFacing,
  escolherPowerupAlvo, movimentoParaPowerup,
} from '../../shared/botStrategy.js';
import {
  criarPowerups, criarPowerupTutorial, tickPowerups, buffsRestantes, velocidadeAtual,
  cooldownDeTiro,
} from '../../shared/powerups.js';
import { sortearArena, criarErupcoes, tickErupcoes } from '../../shared/arenaEvents.js';
import { updateGameScale } from './gameScale.js';
import {
  shouldStartMatchTutorial, startMatchTutorial, isMatchTutorialActive,
  isMatchTutorialDummyInvulnerable, isMatchTutorialWaitingPowerup, notifyMatchTutorial,
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

function snapshotPlayers(players, agora = Date.now()) {
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
    facing: p.facing,
    // Mesmos campos derivados do snapshot do servidor (ver playerSnapshot em
    // src/server/Match.js), pro HUD e a prévia de mira não precisarem saber em
    // que modo estão.
    speed: velocidadeAtual(p, agora),
    shotCooldownMs: cooldownDeTiro(p, getClass(p.classId), agora),
    buffs: buffsRestantes(p, agora),
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
    // Agenda das bolhas de power-up desta partida (ver shared/powerups.js).
    powerups: criarPowerups(),
  };

  // Arena escolhida no modal do modo treino (`state.botArenaTipo`), ou
  // sorteada localmente quando a escolha é "aleatória" (`null`) — o modo
  // treino não tem servidor para decidir por ele, ver shared/arenaEvents.js.
  state.arenaTipo = state.botArenaTipo || sortearArena();
  state.bot.erupcoes = criarErupcoes();

  state.latestState = { players: snapshotPlayers(state.bot.players), projectiles: [], powerups: [], erupcoes: [] };
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

  enemy.facing = computeBotFacing(enemy, me);

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

  // Bolha de power-up ao alcance: buscar o item passa na frente do
  // posicionamento da classe (mas não do desvio de tiro, logo abaixo) — mesma
  // regra do bot do servidor, ver tickBot em src/server/botAI.js.
  const alvoPowerup = escolherPowerupAlvo(enemy, me, bot.powerups.ativos);
  if (alvoPowerup) {
    const rumo = movimentoParaPowerup(enemy, alvoPowerup);
    enemy.input.left = rumo.left;
    enemy.input.right = rumo.right;
    enemy.input.up = rumo.up;
    enemy.input.down = rumo.down;
  }

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
    bot.botNextShot = now + cooldownDeTiro(enemy, enemyCls, now)
      + diff.cooldownExtraMs + Math.random() * diff.shotJitterMs;
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
  // Mesma regra do servidor: no desempate ninguém anda, uma bolha na arena
  // ficaria lá impossível de pegar (e uma erupção em aviso não terminaria de
  // explodir).
  bot.powerups.ativos = [];
  bot.erupcoes.ativas = [];
  for (const p of bot.players) {
    p.input = { up: false, down: false, left: false, right: false };
    p.shielding = false;
  }
}

function publicarEstadoBot(bot) {
  state.latestState = {
    players: snapshotPlayers(bot.players),
    projectiles: bot.projectiles.map((p) => ({ x: p.x, y: p.y, ownerIndex: p.ownerIndex, size: p.size })),
    powerups: bot.powerups.ativos,
    erupcoes: bot.erupcoes.ativas,
  };
  updateHud();
}

function botTick() {
  if (state.gameOver || !state.bot) return;
  const bot = state.bot;

  // Durante o tutorial o relógio não corre: o jogador está aprendendo os
  // controles, não disputando a partida.
  if (isMatchTutorialActive()) adiarFim(bot.cronometro, TICK_MS);

  const agora = Date.now();
  const evento = tickCronometro(bot.cronometro, bot.players, agora);
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
  bot.players[0].facing = state.facing;
  bot.players[0].shielding = state.input.shield && bot.players[0].shieldHits < bot.players[0].shieldMaxHits;
  updateBotAI();

  const meXBeforeStep = bot.players[0].x;
  const meYBeforeStep = bot.players[0].y;

  // Enquanto o boneco de treino é invulnerável a partida não pode acabar: o
  // tutorial só termina completando os passos, nunca matando o oponente.
  const bonecoInvulneravel = isMatchTutorialDummyInvulnerable();
  const vidasBoneco = bot.players[1].lives;

  // Passo de power-up do tutorial: a bolha é colocada na mão, porque a agenda
  // normal é em tempo restante e o relógio não corre durante o tutorial. Uma
  // por vez — a lista vazia é o sinal de que ainda não há bolha na arena.
  if (isMatchTutorialWaitingPowerup() && !bot.powerups.ativos.length) {
    bot.powerups.ativos.push(criarPowerupTutorial(bot.powerups.proximoId++));
  }

  // Durante o tutorial os mapas não têm efeito nenhum (vento, gelo, fogo,
  // terremoto) — quem está aprendendo os controles não deveria lidar com
  // isso ainda. `state.arenaTipo` continua valendo pro visual (fundo da
  // arena), só a física/eventos são desligados aqui.
  const arenaEfeitos = isMatchTutorialActive() ? null : state.arenaTipo;

  const restanteMs = tempoRestanteMs(bot.cronometro, agora);
  stepPlayers(bot.players, ARENA, agora, arenaEfeitos, restanteMs);
  // Depois de mover: quem entrou na bolha neste tick já leva o power-up.
  const eventosPowerup = tickPowerups(bot.powerups, bot.players, restanteMs, agora);
  // Coleta é a única ação do tutorial que não sai do input: quem detecta é o
  // dono do loop, olhando o evento da simulação.
  if (eventosPowerup.coletados.some((c) => c.playerIndex === 0)) notifyMatchTutorial('powerup');

  // Erupções (arena de fogo) podem matar um ou os dois jogadores no mesmo
  // tick — sem projétil e sem callback, então o fim de partida é checado
  // aqui, olhando quem ainda está vivo depois do dano. Mesma regra do boneco
  // de treino: enquanto ele é invulnerável, uma "morte" dele não conta (as
  // vidas são restauradas mais abaixo).
  tickErupcoes(arenaEfeitos, bot.erupcoes, bot.players, restanteMs, agora);
  const [p0, p1] = bot.players;
  if (!bonecoInvulneravel && (!p0.alive || !p1.alive)) {
    recordGameOver(resultadoDoVencedor(!p0.alive && !p1.alive ? null : (p0.alive ? 0 : 1)));
    stopBot();
  }

  if (!state.gameOver) {
    bot.projectiles = stepProjectiles(bot.projectiles, bot.players, ARENA, (winnerIndex) => {
      if (bonecoInvulneravel && winnerIndex === 0) return;
      recordGameOver(resultadoDoVencedor(winnerIndex));
      stopBot();
    });
  }

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
  atualizarCronometro(restanteMs, false);
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
  // Cooldown da classe, ou metade dele com o power-up de cadência ativo.
  if (now - me.lastShot < cooldownDeTiro(me, cls, now)) return;
  me.lastShot = now;

  const cx = me.x + PLAYER_SIZE / 2;
  const cy = me.y + PLAYER_SIZE / 2;

  const { projectiles, nextId } = createShotProjectiles(
    bot.nextProjectileId, cx, cy, targetX, targetY, 0, me.classId
  );
  bot.nextProjectileId = nextId;
  bot.projectiles.push(...projectiles);
}
