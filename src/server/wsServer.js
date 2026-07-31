import { WebSocketServer } from 'ws';
import { PROJECTILE_COOLDOWN_MS, PLAYER_SIZE, SHIELD_MAX_HITS } from '../../shared/constants.js';
import { createProjectile } from '../../shared/entities.js';
import { handleConnection, handleLeaveQueue, handleDisconnect } from './matchmaking.js';

let wss = null;

export function createWsServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, perMessageDeflate: false });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => handleMessage(ws, raw));
    ws.on('close', () => handleDisconnect(ws));
    handleConnection(ws);
  });

  return wss;
}

export function getOnlineCount() {
  return wss ? wss.clients.size : 0;
}

function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === 'input' && ws.player) {
    handleInput(ws, msg);
  } else if (msg.type === 'shoot' && ws.player && ws.match) {
    handleShoot(ws, msg);
  } else if (msg.type === 'leaveQueue') {
    handleLeaveQueue(ws);
  }
}

function handleInput(ws, { up, down, left, right, shield }) {
  const player = ws.player;
  player.input = { up: !!up, down: !!down, left: !!left, right: !!right };
  player.shielding = !!shield && player.shieldHits < SHIELD_MAX_HITS;
}

function handleShoot(ws, msg) {
  const player = ws.player;
  const match = ws.match;
  if (!player.alive || !match.interval) return;
  // Em modo de defesa o jogador não atira.
  if (player.shielding) return;

  const now = Date.now();
  if (now - player.lastShot < PROJECTILE_COOLDOWN_MS) return;
  player.lastShot = now;

  const cx = player.x + PLAYER_SIZE / 2;
  const cy = player.y + PLAYER_SIZE / 2;
  match.projectiles.push(
    createProjectile(match.nextProjectileId++, cx, cy, msg.targetX ?? 0, msg.targetY ?? 0, player.index)
  );
}
