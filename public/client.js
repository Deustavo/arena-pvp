const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const livesP0El = document.getElementById('livesP0');
const livesP1El = document.getElementById('livesP1');
const menuEl = document.getElementById('menu');
const gameWrapEl = document.getElementById('game-wrap');
const btnOnline = document.getElementById('btnOnline');
const btnBot = document.getElementById('btnBot');
const btnMenu = document.getElementById('btnMenu');

// Shared constants (must match server.js physics for online mode;
// bot mode simulates the same values locally).
const ARENA = { w: 800, h: 600 };
const PLAYER_SIZE = 30;
const PLAYER_SPEED = 4;
const PROJECTILE_SIZE = 8;
const PROJECTILE_SPEED = 9;
const PROJECTILE_COOLDOWN_MS = 300;
const MAX_LIVES = 3;
const TICK_MS = 1000 / 60;
const COLORS = ['#e63946', '#457b9d'];

let mode = null; // 'online' | 'bot'
let ws = null;
let playerIndex = null;
let matchId = null;
let arena = ARENA;
let playerSize = PLAYER_SIZE;
let projectileSize = PROJECTILE_SIZE;
let colors = COLORS;

let latestState = { players: [], projectiles: [] };
let gameOver = false;

const input = { up: false, down: false, left: false, right: false };
const keyMap = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

// ---------- Menu ----------

btnOnline.addEventListener('click', () => startOnline());
btnBot.addEventListener('click', () => startBot());
btnMenu.addEventListener('click', () => {
  if (mode === 'online' && playerIndex === null && !gameOver) {
    leaveQueue();
  } else {
    backToMenu();
  }
});

function showMenu() {
  menuEl.style.display = 'flex';
  gameWrapEl.style.display = 'none';
  btnMenu.style.display = 'none';
}

function showGame() {
  menuEl.style.display = 'none';
  gameWrapEl.style.display = 'flex';
}

function resetSharedState() {
  playerIndex = null;
  matchId = null;
  arena = ARENA;
  playerSize = PLAYER_SIZE;
  projectileSize = PROJECTILE_SIZE;
  colors = COLORS;
  latestState = { players: [], projectiles: [] };
  gameOver = false;
  input.up = input.down = input.left = input.right = false;
  canvas.width = arena.w;
  canvas.height = arena.h;
}

function backToMenu() {
  stopBot();
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  mode = null;
  resetSharedState();
  showMenu();
}

// ---------- Online mode ----------

function startOnline() {
  mode = 'online';
  resetSharedState();
  showGame();
  statusEl.textContent = 'Conectando...';

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    statusEl.textContent = 'Conectado. Aguardando oponente...';
  };

  ws.onmessage = (event) => {
    handleOnlineMessage(JSON.parse(event.data));
  };

  ws.onclose = () => {
    if (mode === 'online') statusEl.textContent = 'Conexão encerrada.';
  };
}

function handleOnlineMessage(msg) {
  switch (msg.type) {
    case 'waiting':
      statusEl.textContent = 'Aguardando oponente...';
      btnMenu.textContent = 'Sair da fila';
      btnMenu.style.display = 'inline-block';
      break;
    case 'left':
      backToMenu();
      break;
    case 'init':
      playerIndex = msg.playerIndex;
      matchId = msg.matchId;
      arena = msg.arena;
      playerSize = msg.playerSize;
      projectileSize = msg.projectileSize;
      colors = msg.colors;
      canvas.width = arena.w;
      canvas.height = arena.h;
      gameOver = false;
      btnMenu.style.display = 'none';
      statusEl.textContent = `Partida #${matchId.slice(0, 8)} iniciada! Mova com WASD/setas, clique para atirar.`;
      break;
    case 'state':
      latestState = msg;
      updateHud();
      break;
    case 'gameover':
      gameOver = true;
      btnMenu.textContent = 'Voltar ao Menu';
      btnMenu.style.display = 'inline-block';
      if (msg.winnerIndex === playerIndex) {
        statusEl.textContent = 'Você venceu!';
      } else if (msg.winnerIndex === null) {
        statusEl.textContent = 'Partida encerrada.';
      } else {
        statusEl.textContent = 'Você perdeu!';
      }
      break;
  }
}

function leaveQueue() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'leaveQueue' }));
  } else {
    backToMenu();
  }
}

function sendInput() {
  if (mode === 'online' && ws && ws.readyState === WebSocket.OPEN && playerIndex !== null) {
    ws.send(JSON.stringify({ type: 'input', ...input }));
  }
}

// ---------- Bot mode ----------

let bot = null; // local match state
let botInterval = null;

function makeBotPlayer(index) {
  return {
    x: index === 0 ? 100 : ARENA.w - 100 - PLAYER_SIZE,
    y: ARENA.h / 2 - PLAYER_SIZE / 2,
    lives: MAX_LIVES,
    input: { up: false, down: false, left: false, right: false },
    lastShot: 0,
    alive: true,
  };
}

function startBot() {
  mode = 'bot';
  resetSharedState();
  playerIndex = 0;
  showGame();
  btnMenu.style.display = 'none';
  statusEl.textContent = 'Contra o bot! Mova com WASD/setas, clique para atirar.';

  bot = {
    players: [makeBotPlayer(0), makeBotPlayer(1)],
    projectiles: [],
    nextProjectileId: 1,
    botNextShot: Date.now() + 800,
    botDodgeUntil: 0,
  };

  botInterval = setInterval(botTick, TICK_MS);
}

function stopBot() {
  if (botInterval) {
    clearInterval(botInterval);
    botInterval = null;
  }
  bot = null;
}

function updateBotAI() {
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

  if (now >= bot.botNextShot && me.alive) {
    const cx = enemy.x + PLAYER_SIZE / 2;
    const cy = enemy.y + PLAYER_SIZE / 2;
    const targetX = me.x + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 30;
    const targetY = me.y + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 30;
    fireProjectile(bot, enemy, 1, cx, cy, targetX, targetY);
    bot.botNextShot = now + 700 + Math.random() * 600;
  }
}

function fireProjectile(state, player, ownerIndex, cx, cy, targetX, targetY) {
  let dx = targetX - cx;
  let dy = targetY - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  state.projectiles.push({
    id: state.nextProjectileId++,
    x: cx,
    y: cy,
    vx: dx * PROJECTILE_SPEED,
    vy: dy * PROJECTILE_SPEED,
    ownerIndex,
  });
}

function botTick() {
  if (gameOver || !bot) return;

  bot.players[0].input = { ...input };
  updateBotAI();

  for (const p of bot.players) {
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
    p.x = clamp(p.x + dx * PLAYER_SPEED, 0, ARENA.w - PLAYER_SIZE);
    p.y = clamp(p.y + dy * PLAYER_SPEED, 0, ARENA.h - PLAYER_SIZE);
  }

  bot.projectiles = bot.projectiles.filter((proj) => {
    proj.x += proj.vx;
    proj.y += proj.vy;

    if (proj.x < -PROJECTILE_SIZE || proj.x > ARENA.w + PROJECTILE_SIZE ||
        proj.y < -PROJECTILE_SIZE || proj.y > ARENA.h + PROJECTILE_SIZE) {
      return false;
    }

    const target = bot.players[proj.ownerIndex === 0 ? 1 : 0];
    if (target.alive && rectsIntersect(
      proj.x - PROJECTILE_SIZE / 2, proj.y - PROJECTILE_SIZE / 2, PROJECTILE_SIZE, PROJECTILE_SIZE,
      target.x, target.y, PLAYER_SIZE, PLAYER_SIZE
    )) {
      target.lives -= 1;
      if (target.lives <= 0) {
        target.lives = 0;
        target.alive = false;
        const winnerIndex = proj.ownerIndex;
        gameOver = true;
        btnMenu.style.display = 'inline-block';
        statusEl.textContent = winnerIndex === 0 ? 'Você venceu!' : 'Você perdeu!';
        stopBot();
      }
      return false;
    }

    return true;
  });

  latestState = {
    players: bot.players.map((p) => ({ x: p.x, y: p.y, lives: p.lives, alive: p.alive })),
    projectiles: bot.projectiles.map((p) => ({ x: p.x, y: p.y, ownerIndex: p.ownerIndex })),
  };
  updateHud();
}

function botShoot(targetX, targetY) {
  const me = bot.players[0];
  if (!me.alive) return;
  const now = Date.now();
  if (now - me.lastShot < PROJECTILE_COOLDOWN_MS) return;
  me.lastShot = now;
  const cx = me.x + PLAYER_SIZE / 2;
  const cy = me.y + PLAYER_SIZE / 2;
  fireProjectile(bot, me, 0, cx, cy, targetX, targetY);
}

// ---------- Shared physics helpers ----------

function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ---------- Input / HUD / rendering (shared) ----------

function updateHud() {
  const me = latestState.players[playerIndex];
  const opp = latestState.players[playerIndex === 0 ? 1 : 0];
  livesP0El.textContent = `Você: ${me ? me.lives : '-'}`;
  livesP1El.textContent = `Oponente: ${opp ? opp.lives : '-'}`;
}

window.addEventListener('keydown', (e) => {
  if (!mode) return;
  const dir = keyMap[e.code];
  if (dir && !input[dir]) {
    input[dir] = true;
    sendInput();
  }
});

window.addEventListener('keyup', (e) => {
  if (!mode) return;
  const dir = keyMap[e.code];
  if (dir && input[dir]) {
    input[dir] = false;
    sendInput();
  }
});

canvas.addEventListener('click', (e) => {
  if (!mode || gameOver) return;
  const rect = canvas.getBoundingClientRect();
  const targetX = e.clientX - rect.left;
  const targetY = e.clientY - rect.top;

  if (mode === 'online') {
    if (ws && ws.readyState === WebSocket.OPEN && playerIndex !== null) {
      ws.send(JSON.stringify({ type: 'shoot', targetX, targetY }));
    }
  } else if (mode === 'bot') {
    botShoot(targetX, targetY);
  }
});

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mode) {
    for (let i = 0; i < latestState.players.length; i++) {
      const p = latestState.players[i];
      if (!p || !p.alive) continue;
      ctx.fillStyle = colors[i];
      ctx.fillRect(p.x, p.y, playerSize, playerSize);
      if (i === playerIndex) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y, playerSize, playerSize);
      }
    }

    ctx.fillStyle = '#f1c40f';
    for (const proj of latestState.projectiles) {
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, projectileSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(render);
}

showMenu();
requestAnimationFrame(render);
