import crypto from 'crypto';
import WebSocket from 'ws';
import {
  ARENA, PLAYER_SIZE, PROJECTILE_SIZE, COLORS, TICK_MS, COUNTDOWN_MS,
  SHIELD_RADIUS, SHIELD_MAX_HITS,
} from '../../shared/constants.js';
import { createPlayerState } from '../../shared/entities.js';
import { stepPlayers, stepProjectiles } from '../../shared/simulation.js';

function makePlayer(ws, index) {
  return {
    ...createPlayerState(index),
    ws,
    index,
    color: COLORS[index],
  };
}

function playerSnapshot(p) {
  return { x: p.x, y: p.y, lives: p.lives, alive: p.alive, shielding: p.shielding, shieldHits: p.shieldHits };
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

export function createMatch(wsA, wsB, { onEnd } = {}) {
  const players = [makePlayer(wsA, 0), makePlayer(wsB, 1)];
  const match = {
    id: crypto.randomUUID(),
    players,
    projectiles: [],
    nextProjectileId: 1,
    running: true,
    interval: null,
    onEnd,
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
      shieldRadius: SHIELD_RADIUS,
      shieldMaxHits: SHIELD_MAX_HITS,
      players: players.map(playerSnapshot),
    });
  });

  setTimeout(() => {
    if (!match.running) return;
    for (const p of match.players) send(p.ws, { type: 'start' });
    match.interval = setInterval(() => tick(match), TICK_MS);
  }, COUNTDOWN_MS);

  return match;
}

function tick(match) {
  if (!match.running) return;

  stepPlayers(match.players, ARENA);
  match.projectiles = stepProjectiles(match.projectiles, match.players, ARENA, (winnerIndex) => {
    endMatch(match, winnerIndex);
  });

  broadcastState(match);
}

function broadcastState(match) {
  const state = {
    type: 'state',
    players: match.players.map(playerSnapshot),
    projectiles: match.projectiles.map((proj) => ({ x: proj.x, y: proj.y, ownerIndex: proj.ownerIndex })),
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
  if (match.onEnd) match.onEnd(match, winnerIndex);
}
