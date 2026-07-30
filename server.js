const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const ARENA_W = 800;
const ARENA_H = 600;
const PLAYER_SIZE = 30;
const PLAYER_SPEED = 4;
const PROJECTILE_SIZE = 8;
const PROJECTILE_SPEED = 9;
const PROJECTILE_COOLDOWN_MS = 300;
const MAX_LIVES = 3;
const TICK_MS = 1000 / 60;
const COUNTDOWN_MS = 3000;

const COLORS = ['#e63946', '#457b9d'];

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

const server = http.createServer((req, res) => {
  if (req.url === '/api/online-count') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: wss.clients.size }));
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server, perMessageDeflate: false });

// Waiting room: at most one match forms at a time for simplicity.
let waitingPlayer = null;
const matches = new Set();

function makePlayer(ws, index) {
  return {
    ws,
    index,
    x: index === 0 ? 100 : ARENA_W - 100 - PLAYER_SIZE,
    y: ARENA_H / 2 - PLAYER_SIZE / 2,
    color: COLORS[index],
    lives: MAX_LIVES,
    input: { up: false, down: false, left: false, right: false },
    lastShot: 0,
    alive: true,
  };
}

function createMatch(wsA, wsB) {
  const players = [makePlayer(wsA, 0), makePlayer(wsB, 1)];
  const match = {
    id: crypto.randomUUID(),
    players,
    projectiles: [],
    nextProjectileId: 1,
    running: true,
    interval: null,
  };

  players.forEach((p, i) => {
    p.ws.match = match;
    p.ws.player = p;
    p.ws.send(JSON.stringify({
      type: 'init',
      matchId: match.id,
      playerIndex: i,
      arena: { w: ARENA_W, h: ARENA_H },
      playerSize: PLAYER_SIZE,
      projectileSize: PROJECTILE_SIZE,
      colors: COLORS,
      countdownMs: COUNTDOWN_MS,
      players: players.map((pl) => ({
        x: pl.x, y: pl.y, lives: pl.lives, alive: pl.alive,
      })),
    }));
  });

  matches.add(match);
  setTimeout(() => {
    if (!match.running) return;
    const payload = JSON.stringify({ type: 'start' });
    for (const p of match.players) {
      if (p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
    }
    match.interval = setInterval(() => tick(match), TICK_MS);
  }, COUNTDOWN_MS);

  console.log(`Partida ${match.id} iniciada. Partidas ativas: ${matches.size}`);
  return match;
}

function tick(match) {
  if (!match.running) return;
  const [p0, p1] = match.players;

  for (const p of match.players) {
    if (!p.alive) continue;
    let dx = 0, dy = 0;
    if (p.input.up) dy -= 1;
    if (p.input.down) dy += 1;
    if (p.input.left) dx -= 1;
    if (p.input.right) dx += 1;
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    p.x = clamp(p.x + dx * PLAYER_SPEED, 0, ARENA_W - PLAYER_SIZE);
    p.y = clamp(p.y + dy * PLAYER_SPEED, 0, ARENA_H - PLAYER_SIZE);
  }

  match.projectiles = match.projectiles.filter((proj) => {
    proj.x += proj.vx;
    proj.y += proj.vy;

    if (proj.x < -PROJECTILE_SIZE || proj.x > ARENA_W + PROJECTILE_SIZE ||
        proj.y < -PROJECTILE_SIZE || proj.y > ARENA_H + PROJECTILE_SIZE) {
      return false;
    }

    const target = match.players[proj.ownerIndex === 0 ? 1 : 0];
    if (target.alive && rectsIntersect(
      proj.x - PROJECTILE_SIZE / 2, proj.y - PROJECTILE_SIZE / 2, PROJECTILE_SIZE, PROJECTILE_SIZE,
      target.x, target.y, PLAYER_SIZE, PLAYER_SIZE
    )) {
      target.lives -= 1;
      if (target.lives <= 0) {
        target.lives = 0;
        target.alive = false;
        endMatch(match, proj.ownerIndex);
      }
      return false;
    }

    return true;
  });

  broadcastState(match);
}

function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function broadcastState(match) {
  const state = {
    type: 'state',
    players: match.players.map((p) => ({
      x: p.x, y: p.y, lives: p.lives, alive: p.alive,
    })),
    projectiles: match.projectiles.map((proj) => ({
      x: proj.x, y: proj.y, ownerIndex: proj.ownerIndex,
    })),
  };
  const payload = JSON.stringify(state);
  for (const p of match.players) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
  }
}

function endMatch(match, winnerIndex) {
  match.running = false;
  clearInterval(match.interval);
  const payload = JSON.stringify({ type: 'gameover', winnerIndex });
  for (const p of match.players) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
  }
  matches.delete(match);
  console.log(`Partida ${match.id} encerrada. Partidas ativas: ${matches.size}`);
}

function handleDisconnect(ws) {
  if (waitingPlayer === ws) {
    waitingPlayer = null;
    return;
  }
  const match = ws.match;
  if (match && match.running) {
    const remaining = match.players.find((p) => p.ws !== ws);
    endMatch(match, remaining ? remaining.index : null);
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'input' && ws.player) {
      const { up, down, left, right } = msg;
      ws.player.input = {
        up: !!up, down: !!down, left: !!left, right: !!right,
      };
    } else if (msg.type === 'shoot' && ws.player && ws.match) {
      const player = ws.player;
      const match = ws.match;
      if (!player.alive || !match.interval) return;
      const now = Date.now();
      if (now - player.lastShot < PROJECTILE_COOLDOWN_MS) return;
      player.lastShot = now;

      const cx = player.x + PLAYER_SIZE / 2;
      const cy = player.y + PLAYER_SIZE / 2;
      let dx = (msg.targetX ?? 0) - cx;
      let dy = (msg.targetY ?? 0) - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;

      match.projectiles.push({
        id: match.nextProjectileId++,
        x: cx,
        y: cy,
        vx: dx * PROJECTILE_SPEED,
        vy: dy * PROJECTILE_SPEED,
        ownerIndex: player.index,
      });
    } else if (msg.type === 'leaveQueue') {
      if (waitingPlayer === ws) {
        waitingPlayer = null;
        ws.send(JSON.stringify({ type: 'left' }));
      }
    }
  });

  ws.on('close', () => handleDisconnect(ws));

  if (waitingPlayer === null) {
    waitingPlayer = ws;
    ws.send(JSON.stringify({ type: 'waiting' }));
  } else {
    const opponent = waitingPlayer;
    waitingPlayer = null;
    createMatch(opponent, ws);
  }
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
