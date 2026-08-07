// Simulador headless de balanceamento entre classes: coloca cada par das 6
// classes jogáveis para lutar N vezes usando a mesma IA de bot do jogo
// (shared/botStrategy.js + shared/botDifficulty.js, dificuldade `intermediário`
// nos dois lados) e a mesma simulação (shared/simulation.js) usada pelo
// servidor. Não faz parte do jogo em si — ferramenta de análise para medir o
// efeito de qualquer ajuste em shared/classes.js antes de publicá-lo.
//
// Uso:
//   node scripts/balance-sim.mjs [partidasPorConfronto]
//   npm run balance:sim -- [partidasPorConfronto]
//
// partidasPorConfronto (padrão 500): cada um dos C(6,2)=15 confrontos roda
// esse número de partidas, alternando qual classe ocupa o índice 0/1 para não
// introduzir viés de lado. Imprime o placar geral por classe e a matriz de
// confronto (winrate da linha contra a coluna) no terminal; passe --json para
// só imprimir o relatório em JSON (útil para comparar rodadas programaticamente).
//
// Ver balanceamento/ para o histórico de rodadas e ajustes feitos com esta
// ferramenta.
import {
  ARENA, PLAYER_SIZE, PROJECTILE_SIZE, PROJECTILE_SPEED, SHIELD_RADIUS, TICK_MS,
} from '../shared/constants.js';
import { CLASSES, getClass } from '../shared/classes.js';
import { createPlayerState, createShotProjectiles } from '../shared/entities.js';
import { stepPlayers, stepProjectiles } from '../shared/simulation.js';
import { criarPowerups, tickPowerups, cooldownDeTiro } from '../shared/powerups.js';
import {
  criarCronometro, tickCronometro, emDesempate, tempoRestanteMs,
} from '../shared/matchTimer.js';
import { sortearArena, criarErupcoes, tickErupcoes } from '../shared/arenaEvents.js';
import { getBotDifficulty } from '../shared/botDifficulty.js';
import {
  createBotAiState, computeBotMovement, computeAimTarget, markAttack,
  classDodgeChance, classShieldChance, computeBotFacing,
  escolherPowerupAlvo, movimentoParaPowerup,
} from '../shared/botStrategy.js';

// Mesma janela de detecção de ameaça de shared/botStrategy.js#findIncomingThreat
// (não exportada de lá), generalizada abaixo para funcionar com o bot em
// qualquer um dos dois índices — o original de src/server/botAI.js assume que
// o bot é sempre o índice 1.
const THREAT_Y_TOLERANCE_PX = 60;
const THREAT_LOOKAHEAD_PX = 250;

function findIncomingThreatGeneric(bot, projectiles, botIndex) {
  const cx = bot.x + PLAYER_SIZE / 2;
  const cy = bot.y + PLAYER_SIZE / 2;
  return projectiles.find((p) => {
    if (p.ownerIndex === botIndex) return false;
    if (Math.abs(p.y - cy) >= THREAT_Y_TOLERANCE_PX) return false;
    const dx = cx - p.x;
    if (dx !== 0 && Math.sign(dx) !== Math.sign(p.vx)) return false;
    return Math.abs(dx) < THREAT_LOOKAHEAD_PX;
  });
}

function createBotState(difficultyId) {
  return {
    difficulty: getBotDifficulty(difficultyId),
    nextShotAt: 800,
    ...createBotAiState(),
  };
}

function botAttack(match, player, bot, botIndex, state, now) {
  const { cx, cy, targetX, targetY } = computeAimTarget(state.difficulty, bot, player, state);
  const { projectiles, nextId } = createShotProjectiles(
    match.nextProjectileId, cx, cy, targetX, targetY, botIndex, bot.classId
  );
  match.nextProjectileId = nextId;
  match.projectiles.push(...projectiles);
  markAttack(bot.classId, state, now);
}

// Espelha src/server/botAI.js#tickBot, mas para um botIndex qualquer (0 ou 1)
// em vez de assumir que o bot é sempre o índice 1 — permite os dois lados da
// simulação serem controlados por IA idêntica.
function tickBotGeneric(match, botIndex, now) {
  const opponentIndex = botIndex === 0 ? 1 : 0;
  const state = match.botStates[botIndex];
  const bot = match.players[botIndex];
  const player = match.players[opponentIndex];
  if (!bot.alive) return;

  bot.facing = computeBotFacing(bot, player);
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

  const alvoPowerup = escolherPowerupAlvo(bot, player, match.powerups?.ativos);
  if (alvoPowerup) {
    const rumo = movimentoParaPowerup(bot, alvoPowerup);
    bot.input.left = rumo.left;
    bot.input.right = rumo.right;
    bot.input.up = rumo.up;
    bot.input.down = rumo.down;
  }

  const incoming = findIncomingThreatGeneric(bot, match.projectiles, botIndex);
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
    botAttack(match, player, bot, botIndex, state, now);
    state.nextShotAt = now + cooldownDeTiro(bot, botCls, now)
      + diff.cooldownExtraMs + Math.random() * diff.shotJitterMs;
  }

  const activeIds = new Set(match.projectiles.map((p) => p.id));
  for (const id of state.dodgeDecisions.keys()) if (!activeIds.has(id)) state.dodgeDecisions.delete(id);
  for (const id of state.shieldDecisions.keys()) if (!activeIds.has(id)) state.shieldDecisions.delete(id);

  state.prevPlayerX = player.x;
  state.prevPlayerY = player.y;
}

// Watchdog: 20 minutos de partida a 60hz — nunca deveria ser atingido, já que
// o cronômetro + desempate de shared/matchTimer.js sempre terminam a partida.
const MAX_TICKS = 60 * 60 * 20;

// Simula uma partida completa entre classId0 (índice 0) e classId1 (índice 1).
// Devolve 0, 1 (índice vencedor) ou null (empate no desempate).
function simulateMatch(classId0, classId1, difficulty = 'intermediario') {
  const players = [createPlayerState(0, classId0), createPlayerState(1, classId1)];
  const match = {
    players,
    projectiles: [],
    nextProjectileId: 1,
    powerups: criarPowerups(),
    arenaTipo: sortearArena(),
    erupcoes: criarErupcoes(),
    botStates: [createBotState(difficulty), createBotState(difficulty)],
  };
  const cronometro = criarCronometro(0);

  let agora = 0;
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    agora += TICK_MS;

    const evento = tickCronometro(cronometro, players, agora);
    if (emDesempate(cronometro)) {
      if (evento.fim) return evento.winnerIndex;
      continue;
    }

    tickBotGeneric(match, 0, agora);
    tickBotGeneric(match, 1, agora);

    const restanteMs = tempoRestanteMs(cronometro, agora);
    stepPlayers(match.players, ARENA, agora, match.arenaTipo, restanteMs);
    tickPowerups(match.powerups, match.players, restanteMs, agora);
    tickErupcoes(match.arenaTipo, match.erupcoes, match.players, restanteMs, agora);

    const [p0, p1] = match.players;
    if (!p0.alive || !p1.alive) {
      return !p0.alive && !p1.alive ? null : (p0.alive ? 0 : 1);
    }

    let winner;
    match.projectiles = stepProjectiles(match.projectiles, match.players, ARENA, (winnerIndex) => {
      winner = winnerIndex;
    });
    if (winner !== undefined) return winner;
  }
  throw new Error('Partida não terminou dentro do watchdog de ticks');
}

function runTournament(nPerMatchup) {
  const classIds = Object.keys(CLASSES);
  const wins = Object.fromEntries(classIds.map((id) => [id, 0]));
  const matches = Object.fromEntries(classIds.map((id) => [id, 0]));
  const draws = Object.fromEntries(classIds.map((id) => [id, 0]));
  const matrixWins = {};
  const matrixTotal = {};
  for (const a of classIds) {
    matrixWins[a] = {};
    matrixTotal[a] = {};
    for (const b of classIds) {
      matrixWins[a][b] = 0;
      matrixTotal[a][b] = 0;
    }
  }

  const startTime = Date.now();
  let totalDraws = 0;
  let totalMatches = 0;

  for (let i = 0; i < classIds.length; i++) {
    for (let j = i + 1; j < classIds.length; j++) {
      const a = classIds[i];
      const b = classIds[j];
      for (let k = 0; k < nPerMatchup; k++) {
        // Alterna o lado (índice 0/1) pra não introduzir viés de posição.
        const aIsIndex0 = k % 2 === 0;
        const classId0 = aIsIndex0 ? a : b;
        const classId1 = aIsIndex0 ? b : a;
        const winnerIndex = simulateMatch(classId0, classId1);

        matrixTotal[a][b] += 1;
        matrixTotal[b][a] += 1;
        matches[a] += 1;
        matches[b] += 1;
        totalMatches += 1;

        if (winnerIndex === null) {
          draws[a] += 1;
          draws[b] += 1;
          totalDraws += 1;
          continue;
        }
        const winnerClass = winnerIndex === 0 ? classId0 : classId1;
        const loserClass = winnerClass === a ? b : a;
        wins[winnerClass] += 1;
        matrixWins[winnerClass][loserClass] += 1;
      }
    }
  }

  const elapsedS = ((Date.now() - startTime) / 1000).toFixed(1);
  return {
    nPerMatchup, totalMatches, totalDraws, elapsedS, classIds, wins, matches, draws, matrixWins, matrixTotal,
  };
}

function printReport(report) {
  const { classIds } = report;
  console.log(`Total de partidas: ${report.totalMatches} (${report.nPerMatchup} por confronto) | Empates: ${report.totalDraws} | Tempo: ${report.elapsedS}s`);
  console.log();
  console.log('Winrate geral por classe:');
  const rows = classIds.map((c) => ({ c, wr: (report.wins[c] / report.matches[c]) * 100 }));
  rows.sort((a, b) => b.wr - a.wr);
  for (const r of rows) console.log(' ', r.c.padEnd(12), r.wr.toFixed(1) + '%');
  console.log();
  console.log('Matriz de confronto (winrate da linha contra a coluna, %):');
  console.log(''.padEnd(12), classIds.map((i) => i.slice(0, 6).padStart(8)).join(''));
  for (const a of classIds) {
    const row = classIds.map((b) => (a === b ? '--' : (report.matrixWins[a][b] / report.matrixTotal[a][b] * 100).toFixed(0) + '%'));
    console.log(a.padEnd(12), row.map((x) => x.padStart(8)).join(''));
  }
  const spread = Math.max(...rows.map((r) => r.wr)) - Math.min(...rows.map((r) => r.wr));
  console.log();
  console.log(`Spread (maior - menor winrate): ${spread.toFixed(1)}pp`);
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const nArg = args.find((a) => /^\d+$/.test(a));
const nPerMatchup = nArg ? Number(nArg) : 500;

const report = runTournament(nPerMatchup);
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}
