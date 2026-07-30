const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const livesP0El = document.getElementById('livesP0');
const livesP1El = document.getElementById('livesP1');
const menuEl = document.getElementById('menu');
const gameWrapEl = document.getElementById('game-wrap');
const btnOnline = document.getElementById('btnOnline');
const btnBot = document.getElementById('btnBot');
const gameOverOverlayEl = document.getElementById('gameOverOverlay');
const gameOverMessageEl = document.getElementById('gameOverMessage');
const btnPlayAgain = document.getElementById('btnPlayAgain');
const btnBackToMenu = document.getElementById('btnBackToMenu');
const waitingOverlayEl = document.getElementById('waitingOverlay');
const btnLeaveQueue = document.getElementById('btnLeaveQueue');
const btnHowToPlay = document.getElementById('btnHowToPlay');
const btnCloseHowToPlay = document.getElementById('btnCloseHowToPlay');
const howToPlayOverlayEl = document.getElementById('howToPlayOverlay');
const onlineCountValueEl = document.getElementById('onlineCountValue');

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

// Entity interpolation buffer: render slightly in the past so movement stays
// smooth between server ticks even when network delivery is jittery.
const INTERP_DELAY_MS = 100;
let stateBuffer = [];

// Client-side prediction for the local player: move it immediately on
// input instead of waiting for the round trip, then reconcile against the
// authoritative server position as it arrives.
const RECONCILE_LERP = 0.2;
const RECONCILE_SNAP_DIST = 40;
let predicted = { x: 0, y: 0, initialized: false };
let lastFrameTime = null;

// ---------- Game over overlay / explosion ----------

const GAMEOVER_OVERLAY_DELAY = 2000;
let gameOverAt = 0;
let overlayShown = false;
let lastResult = null; // 'win' | 'lose' | 'draw'
let prevAlive = [true, true];

const EXPLOSION_PARTICLE_COUNT = 26;
const EXPLOSION_LIFE_MS = 800;
let explosionParticles = [];

function spawnExplosion(ownerIndex, cx, cy) {
  const color = colors[ownerIndex] || '#ffffff';
  const now = Date.now();
  for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4;
    explosionParticles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 4,
      color,
      startTime: now,
      life: EXPLOSION_LIFE_MS * (0.7 + Math.random() * 0.4),
    });
  }
}

function updateAndDrawExplosions(now) {
  if (!explosionParticles.length) return;
  explosionParticles = explosionParticles.filter((p) => now - p.startTime < p.life);
  for (const p of explosionParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.95;
    p.vy *= 0.95;
    const t = (now - p.startTime) / p.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = t < 0.4 ? '#ffffff' : p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function checkDeathExplosion(rawIndex, playerState) {
  if (prevAlive[rawIndex] && !playerState.alive) {
    spawnExplosion(rawIndex, playerState.x + playerSize / 2, playerState.y + playerSize / 2);
  }
  prevAlive[rawIndex] = playerState.alive;
}

function recordGameOver(result) {
  gameOver = true;
  gameOverAt = Date.now();
  overlayShown = false;
  lastResult = result;
}

function showGameOverOverlay() {
  overlayShown = true;
  gameOverOverlayEl.classList.remove('win', 'lose');
  let text;
  if (lastResult === 'win') {
    text = 'Você ganhou';
    gameOverOverlayEl.classList.add('win');
  } else if (lastResult === 'lose') {
    text = 'Você perdeu';
    gameOverOverlayEl.classList.add('lose');
  } else {
    text = 'Partida encerrada';
  }
  gameOverMessageEl.textContent = text;
  gameOverOverlayEl.style.display = 'flex';
}

function showWaitingOverlay() {
  waitingOverlayEl.style.display = 'flex';
}

function hideWaitingOverlay() {
  waitingOverlayEl.style.display = 'none';
}

// ---------- Pixel-art hearts ----------

const HEART_PIXELS = [
  [0, 1], [0, 2], [0, 4], [0, 5],
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
  [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
  [4, 2], [4, 3], [4, 4],
  [5, 3],
];
const HEART_PIXEL_SIZE = 3;

let heartsEls = [[], []];
let prevLives = [MAX_LIVES, MAX_LIVES];
const HIT_FLASH_DURATION = 400;
let hitFlashUntil = [0, 0];

function createHeartEl() {
  const heart = document.createElement('div');
  heart.className = 'heart';
  for (const [row, col] of HEART_PIXELS) {
    const px = document.createElement('div');
    px.className = 'heart-pixel';
    px.style.left = `${col * HEART_PIXEL_SIZE}px`;
    px.style.top = `${row * HEART_PIXEL_SIZE}px`;
    heart.appendChild(px);
  }
  return heart;
}

function createHeartsRow(container, count) {
  container.innerHTML = '';
  const hearts = [];
  for (let i = 0; i < count; i++) {
    const heart = createHeartEl();
    container.appendChild(heart);
    hearts.push(heart);
  }
  return hearts;
}

function initHearts() {
  heartsEls[0] = createHeartsRow(livesP0El, MAX_LIVES);
  heartsEls[1] = createHeartsRow(livesP1El, MAX_LIVES);
  prevLives = [MAX_LIVES, MAX_LIVES];
  hitFlashUntil = [0, 0];
  prevAlive = [true, true];
}

function triggerHeartBlink(heartEl) {
  heartEl.classList.remove('blink');
  void heartEl.offsetWidth; // force reflow to restart the animation
  heartEl.classList.add('blink');
}

function updateHeartsRow(row, lives, rawIndex) {
  const hearts = heartsEls[row];
  if (!hearts.length) return;
  const prev = prevLives[row];
  for (let i = 0; i < hearts.length; i++) {
    hearts[i].classList.toggle('lost', i >= lives);
  }
  if (lives < prev) {
    for (let i = lives; i < prev; i++) {
      if (hearts[i]) triggerHeartBlink(hearts[i]);
    }
    hitFlashUntil[rawIndex] = Date.now() + HIT_FLASH_DURATION;
  }
  prevLives[row] = lives;
}

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
btnHowToPlay.addEventListener('click', () => {
  howToPlayOverlayEl.style.display = 'flex';
});
btnCloseHowToPlay.addEventListener('click', () => {
  howToPlayOverlayEl.style.display = 'none';
});
btnLeaveQueue.addEventListener('click', () => leaveQueue());
btnPlayAgain.addEventListener('click', () => {
  if (mode === 'online') startOnline();
  else if (mode === 'bot') startBot();
});
btnBackToMenu.addEventListener('click', () => backToMenu());

function showMenu() {
  menuEl.style.display = 'flex';
  gameWrapEl.style.display = 'none';
  hideWaitingOverlay();
  startOnlineCountPolling();
}

function showGame() {
  menuEl.style.display = 'none';
  gameWrapEl.style.display = 'flex';
  stopOnlineCountPolling();
}

// ---------- Online player count ----------

const ONLINE_COUNT_POLL_MS = 5000;
let onlineCountInterval = null;

async function fetchOnlineCount() {
  try {
    const res = await fetch('/api/online-count');
    const data = await res.json();
    onlineCountValueEl.textContent = data.count;
  } catch {
    onlineCountValueEl.textContent = '--';
  }
}

function startOnlineCountPolling() {
  fetchOnlineCount();
  if (!onlineCountInterval) {
    onlineCountInterval = setInterval(fetchOnlineCount, ONLINE_COUNT_POLL_MS);
  }
}

function stopOnlineCountPolling() {
  if (onlineCountInterval) {
    clearInterval(onlineCountInterval);
    onlineCountInterval = null;
  }
}

function resetSharedState() {
  playerIndex = null;
  matchId = null;
  arena = ARENA;
  playerSize = PLAYER_SIZE;
  projectileSize = PROJECTILE_SIZE;
  colors = COLORS;
  latestState = { players: [], projectiles: [] };
  stateBuffer = [];
  predicted = { x: 0, y: 0, initialized: false };
  lastFrameTime = null;
  gameOver = false;
  input.up = input.down = input.left = input.right = false;
  canvas.width = arena.w;
  canvas.height = arena.h;
  initHearts();
  gameOverAt = 0;
  overlayShown = false;
  lastResult = null;
  explosionParticles = [];
  gameOverOverlayEl.style.display = 'none';
  gameOverOverlayEl.classList.remove('win', 'lose');
  hideWaitingOverlay();
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

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    showWaitingOverlay();
  };

  ws.onmessage = (event) => {
    handleOnlineMessage(JSON.parse(event.data));
  };

  ws.onclose = () => {
    if (mode === 'online') {
      hideWaitingOverlay();
    }
  };
}

function handleOnlineMessage(msg) {
  switch (msg.type) {
    case 'waiting':
      showWaitingOverlay();
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
      hideWaitingOverlay();
      break;
    case 'state': {
      latestState = msg;
      const now = Date.now();
      stateBuffer.push({ t: now, players: msg.players, projectiles: msg.projectiles });
      const cutoff = now - 1000;
      while (stateBuffer.length > 2 && stateBuffer[0].t < cutoff) stateBuffer.shift();
      reconcilePrediction(msg.players[playerIndex]);
      updateHud();
      break;
    }
    case 'gameover':
      if (msg.winnerIndex === playerIndex) {
        recordGameOver('win');
      } else if (msg.winnerIndex === null) {
        recordGameOver('draw');
      } else {
        recordGameOver('lose');
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

  bot = {
    players: [makeBotPlayer(0), makeBotPlayer(1)],
    projectiles: [],
    nextProjectileId: 1,
    botNextShot: Date.now() + 800,
    botDodgeUntil: 0,
  };

  botInterval = setInterval(botTick, TICK_MS);
}

function stopBotInterval() {
  if (botInterval) {
    clearInterval(botInterval);
    botInterval = null;
  }
}

function stopBot() {
  stopBotInterval();
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
        recordGameOver(winnerIndex === 0 ? 'win' : 'lose');
        stopBotInterval();
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

function reconcilePrediction(mine) {
  if (!mine) return;
  if (!predicted.initialized || !mine.alive) {
    predicted.x = mine.x;
    predicted.y = mine.y;
    predicted.initialized = true;
    return;
  }
  const dx = mine.x - predicted.x;
  const dy = mine.y - predicted.y;
  if (Math.hypot(dx, dy) > RECONCILE_SNAP_DIST) {
    predicted.x = mine.x;
    predicted.y = mine.y;
  } else {
    predicted.x += dx * RECONCILE_LERP;
    predicted.y += dy * RECONCILE_LERP;
  }
}

function advancePrediction() {
  const now = performance.now();
  if (lastFrameTime === null) {
    lastFrameTime = now;
    return;
  }
  const dt = now - lastFrameTime;
  lastFrameTime = now;

  if (!predicted.initialized) return;
  const me = latestState.players[playerIndex];
  if (!me || !me.alive) return;

  let dx = 0, dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  const speedPerMs = PLAYER_SPEED / TICK_MS;
  predicted.x = clamp(predicted.x + dx * speedPerMs * dt, 0, arena.w - playerSize);
  predicted.y = clamp(predicted.y + dy * speedPerMs * dt, 0, arena.h - playerSize);
}

function getRenderState() {
  if (mode !== 'online' || stateBuffer.length < 2) return latestState;

  const renderTime = Date.now() - INTERP_DELAY_MS;
  let older = stateBuffer[0];
  let newer = stateBuffer[stateBuffer.length - 1];
  for (let i = 0; i < stateBuffer.length - 1; i++) {
    if (stateBuffer[i].t <= renderTime && stateBuffer[i + 1].t >= renderTime) {
      older = stateBuffer[i];
      newer = stateBuffer[i + 1];
      break;
    }
  }

  const span = newer.t - older.t;
  const t = span > 0 ? clamp((renderTime - older.t) / span, 0, 1) : 1;
  const players = newer.players.map((np, i) => {
    const op = older.players[i];
    if (!op || !np.alive || !op.alive) return np;
    return { ...np, x: op.x + (np.x - op.x) * t, y: op.y + (np.y - op.y) * t };
  });

  return { players, projectiles: newer.projectiles };
}

function updateHud() {
  const oppIndex = playerIndex === 0 ? 1 : 0;
  const me = latestState.players[playerIndex];
  const opp = latestState.players[oppIndex];
  if (me) {
    updateHeartsRow(0, me.lives, playerIndex);
    checkDeathExplosion(playerIndex, me);
  }
  if (opp) {
    updateHeartsRow(1, opp.lives, oppIndex);
    checkDeathExplosion(oppIndex, opp);
  }
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
    const now = Date.now();

    if (gameOver && gameOverAt && now - gameOverAt >= GAMEOVER_OVERLAY_DELAY) {
      if (!overlayShown) showGameOverOverlay();
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      if (mode === 'online') advancePrediction();
      const renderState = getRenderState();
      for (let i = 0; i < renderState.players.length; i++) {
        let p = renderState.players[i];
        if (!p || !p.alive) continue;
        if (mode === 'online' && i === playerIndex && predicted.initialized) {
          p = { ...p, x: predicted.x, y: predicted.y };
        }

        const flashRemaining = hitFlashUntil[i] - now;
        let ox = 0, oy = 0;
        if (flashRemaining > 0) {
          const t = 1 - flashRemaining / HIT_FLASH_DURATION;
          const flicker = Math.floor(t * 12) % 2 === 0;
          ctx.fillStyle = flicker ? '#ffffff' : colors[i];
          const shake = (1 - t) * 4;
          ox = (Math.random() - 0.5) * shake;
          oy = (Math.random() - 0.5) * shake;
        } else {
          ctx.fillStyle = colors[i];
        }
        ctx.fillRect(p.x + ox, p.y + oy, playerSize, playerSize);
        if (i === playerIndex) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x + ox, p.y + oy, playerSize, playerSize);
        }
      }

      for (const proj of renderState.projectiles) {
        ctx.fillStyle = colors[proj.ownerIndex];
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, projectileSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      updateAndDrawExplosions(now);
    }
  }

  requestAnimationFrame(render);
}

showMenu();
requestAnimationFrame(render);
