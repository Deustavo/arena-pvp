import crypto from 'crypto';
import WebSocket from 'ws';
import {
  ARENA, PLAYER_SIZE, PROJECTILE_SIZE, COLORS, TICK_MS, COUNTDOWN_MS,
  SHIELD_RADIUS,
} from '../../shared/constants.js';
import { createPlayerState } from '../../shared/entities.js';
import { DEFAULT_CLASS_ID } from '../../shared/classes.js';
import { stepPlayers, stepProjectiles } from '../../shared/simulation.js';
import {
  MATCH_DURATION_MS, criarCronometro, tickCronometro, emDesempate, tempoRestanteMs,
} from '../../shared/matchTimer.js';
import { createBotState, tickBot } from './botAI.js';
import { saveMatchResult } from './matchHistory.js';

function makePlayer(ws, index) {
  return {
    ...createPlayerState(index, ws.classId || DEFAULT_CLASS_ID),
    ws,
    index,
    color: COLORS[index],
    name: ws.nickname || 'Jogador',
    // null para convidados; só quem tem conta gera histórico.
    userId: ws.userId ?? null,
  };
}

function playerSnapshot(p) {
  return {
    x: p.x,
    y: p.y,
    lives: p.lives,
    alive: p.alive,
    shielding: p.shielding,
    shieldHits: p.shieldHits,
    shieldMaxHits: p.shieldMaxHits,
    classId: p.classId,
    name: p.name,
    lastShot: p.lastShot,
    facing: p.facing,
  };
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

export function createMatch(wsA, wsB, { onEnd, bot = false, botDifficulty = 'intermediario' } = {}) {
  const players = [makePlayer(wsA, 0), makePlayer(wsB, 1)];
  const match = {
    id: crypto.randomUUID(),
    players,
    projectiles: [],
    nextProjectileId: 1,
    running: true,
    interval: null,
    // Só existe depois da contagem regressiva: o tempo regulamentar começa a
    // correr quando a partida de fato começa.
    cronometro: null,
    onEnd,
    bot,
    botState: bot ? createBotState(botDifficulty) : null,
  };

  players.forEach((p, i) => {
    p.ws.match = match;
    p.ws.player = p;
    send(p.ws, {
      type: 'init',
      matchId: match.id,
      playerIndex: i,
      arena: ARENA,
      playerSize: PLAYER_SIZE,
      projectileSize: PROJECTILE_SIZE,
      colors: COLORS,
      countdownMs: COUNTDOWN_MS,
      matchDurationMs: MATCH_DURATION_MS,
      shieldRadius: SHIELD_RADIUS,
      players: players.map(playerSnapshot),
    });
  });

  setTimeout(() => {
    if (!match.running) return;
    for (const p of match.players) send(p.ws, { type: 'start' });
    match.cronometro = criarCronometro(Date.now());
    match.interval = setInterval(() => tick(match), TICK_MS);
  }, COUNTDOWN_MS);

  return match;
}

function tick(match) {
  if (!match.running) return;

  const evento = tickCronometro(match.cronometro, match.players, Date.now());
  if (evento.iniciouDesempate) congelarPartida(match);
  if (emDesempate(match.cronometro)) {
    // Partida congelada: ninguém se move nem atira, só os corações caem. O
    // último estado é enviado antes do gameover para o cliente ver a
    // explosão de quem zerou (nos dois, em caso de empate).
    broadcastState(match);
    if (evento.fim) endMatch(match, evento.winnerIndex);
    return;
  }

  if (match.bot) tickBot(match);
  stepPlayers(match.players, ARENA);
  match.projectiles = stepProjectiles(match.projectiles, match.players, ARENA, (winnerIndex) => {
    endMatch(match, winnerIndex);
  });

  broadcastState(match);
}

// Fim do tempo regulamentar: a partida para no lugar. Os tiros que estavam no
// ar são descartados para ninguém morrer por um projétil disparado antes do
// congelamento — a partir daqui só o desempate decide.
function congelarPartida(match) {
  match.projectiles = [];
  for (const p of match.players) {
    p.input = { up: false, down: false, left: false, right: false };
    p.shielding = false;
  }
}

function broadcastState(match) {
  const state = {
    type: 'state',
    players: match.players.map(playerSnapshot),
    projectiles: match.projectiles.map((proj) => ({ x: proj.x, y: proj.y, ownerIndex: proj.ownerIndex, size: proj.size })),
    remainingMs: tempoRestanteMs(match.cronometro, Date.now()),
    desempate: emDesempate(match.cronometro),
  };
  const payload = JSON.stringify(state);
  for (const p of match.players) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
  }
}

export function endMatch(match, winnerIndex) {
  if (!match.running) return;
  match.running = false;
  clearInterval(match.interval);
  for (const p of match.players) send(p.ws, { type: 'gameover', winnerIndex });
  // Gravação em segundo plano: o fim da partida não espera o banco.
  saveMatchResult(match, winnerIndex);
  if (match.onEnd) match.onEnd(match, winnerIndex);
}

// Quando um jogador some (fecha a aba, cai a conexão), fazemos o personagem
// dele "morrer" (broadcast de um último state com alive: false) antes do
// gameover, para que o adversário veja a explosão em vez do jogo simplesmente
// parar.
export function disconnectPlayer(match, ws) {
  if (!match.running) return;
  const disconnected = match.players.find((p) => p.ws === ws);
  const remaining = match.players.find((p) => p.ws !== ws);
  if (disconnected && disconnected.alive) {
    disconnected.alive = false;
    disconnected.lives = 0;
    broadcastState(match);
  }
  endMatch(match, remaining ? remaining.index : null);
}
