import { WebSocketServer } from 'ws';
import { PLAYER_SIZE } from '../../shared/constants.js';
import { createShotProjectiles, escudoAtivo } from '../../shared/entities.js';
import { CLASSES, DEFAULT_CLASS_ID, getClass } from '../../shared/classes.js';
import { emDesempate } from '../../shared/matchTimer.js';
import { handleConnection, handleLeaveQueue, handleDisconnect } from './matchmaking.js';
import { parseConnectionParams, resolvePlayerIdentity } from './wsIdentity.js';
import { auth } from './auth.js';

let wss = null;

function classIdFromRequest(req) {
  const { classId } = parseConnectionParams(req.url);
  return CLASSES[classId] ? classId : DEFAULT_CLASS_ID;
}

function getSessionByToken(token) {
  return auth.api.getSession({
    headers: new Headers({ authorization: `Bearer ${token}` }),
  });
}

export function createWsServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, perMessageDeflate: false });

  wss.on('connection', async (ws, req) => {
    ws.on('message', (raw) => handleMessage(ws, raw));
    ws.on('close', () => handleDisconnect(ws));

    // Validar a sessão é assíncrono (bate no banco). As mensagens que chegarem
    // nesse meio-tempo são ignoradas com segurança, porque handleMessage exige
    // `ws.player`, que só existe depois que a partida começa.
    const { nickname, userId } = await resolvePlayerIdentity(req.url, getSessionByToken);

    // O jogador pode ter desistido enquanto a sessão era resolvida — entrar na
    // fila com um socket já fechado deixaria lixo no matchmaking.
    if (ws.readyState !== ws.OPEN) return;

    ws.userId = userId;
    handleConnection(ws, nickname, classIdFromRequest(req));
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

  // No desempate a partida está congelada: input e tiro são ignorados até o
  // fim (ver tickCronometro em shared/matchTimer.js).
  if (msg.type === 'input' && ws.player && !emDesempate(ws.match?.cronometro)) {
    handleInput(ws, msg);
  } else if (msg.type === 'shoot' && ws.player && ws.match && !emDesempate(ws.match.cronometro)) {
    handleShoot(ws, msg);
  } else if (msg.type === 'leaveQueue') {
    handleLeaveQueue(ws);
  }
}

function handleInput(ws, { up, down, left, right, shield, facing }) {
  const player = ws.player;
  player.input = { up: !!up, down: !!down, left: !!left, right: !!right };
  player.shielding = !!shield && player.shieldHits < player.shieldMaxHits;
  // O cliente já decide a direção olhando pro mouse (espaço de mundo); aqui
  // só sanitiza pra não aceitar qualquer valor arbitrário do socket.
  if (facing === 1 || facing === -1) player.facing = facing;
}

function handleShoot(ws, msg) {
  const player = ws.player;
  const match = ws.match;
  if (!player.alive || !match.interval) return;
  // Em modo de defesa o jogador não atira (mas continua podendo se mover).
  if (escudoAtivo(player)) return;

  const cls = getClass(player.classId);
  const now = Date.now();
  if (now - player.lastShot < cls.shotCooldownMs) return;
  player.lastShot = now;

  const cx = player.x + PLAYER_SIZE / 2;
  const cy = player.y + PLAYER_SIZE / 2;

  const { projectiles, nextId } = createShotProjectiles(
    match.nextProjectileId, cx, cy, msg.targetX ?? 0, msg.targetY ?? 0, player.index, player.classId
  );
  match.nextProjectileId = nextId;
  match.projectiles.push(...projectiles);
}
