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
const countdownOverlayEl = document.getElementById('countdownOverlay');
const countdownNumberEl = document.getElementById('countdownNumber');
const btnLeaveQueue = document.getElementById('btnLeaveQueue');
const btnHowToPlay = document.getElementById('btnHowToPlay');
const howToPlayOverlayEl = document.getElementById('howToPlayOverlay');
const tutCanvas = document.getElementById('tutCanvas');
const tutCtx = tutCanvas.getContext('2d');
const tutTitleEl = document.getElementById('tutTitle');
const tutTextEl = document.getElementById('tutText');
const tutDotsEl = document.getElementById('tutDots');
const tutStepCountEl = document.getElementById('tutStepCount');
const btnTutPrev = document.getElementById('btnTutPrev');
const btnTutNext = document.getElementById('btnTutNext');
const btnTutClose = document.getElementById('btnTutClose');
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
const SHIELD_RADIUS = 34;
const SHIELD_MAX_HITS = 3;
const TICK_MS = 1000 / 60;
const COLORS = ['#e63946', '#457b9d'];
const BOT_COUNTDOWN_MS = 3000;

let mode = null; // 'online' | 'bot'
let ws = null;
let playerIndex = null;
let matchId = null;
let arena = ARENA;
let playerSize = PLAYER_SIZE;
let projectileSize = PROJECTILE_SIZE;
let colors = COLORS;
let shieldRadius = SHIELD_RADIUS;
let shieldMaxHits = SHIELD_MAX_HITS;

let latestState = { players: [], projectiles: [] };
let gameOver = false;
let matchStarted = false;
let countdownTimer = null;

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

function showCountdown(ms, onDone) {
  hideWaitingOverlay();
  hideCountdown();
  countdownOverlayEl.style.display = 'flex';
  const endAt = Date.now() + ms;
  const tick = () => {
    const remaining = endAt - Date.now();
    const secs = Math.ceil(remaining / 1000);
    if (remaining <= 0) {
      countdownOverlayEl.style.display = 'none';
      countdownTimer = null;
      if (onDone) onDone();
      return;
    }
    countdownNumberEl.textContent = secs;
    countdownTimer = setTimeout(tick, 100);
  };
  tick();
}

function hideCountdown() {
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
  countdownOverlayEl.style.display = 'none';
}

function playStartSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.45);
    osc.onended = () => audioCtx.close();
  } catch {
    // Audio unavailable (e.g. no user interaction yet) — fail silently.
  }
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

// ---------- Tutorial "Como jogar" ----------
// Cada etapa da lista tem sua própria animação demonstrando a ação, desenhada
// com as mesmas formas do jogo (quadrado, tiro, escudo, corações, explosão).

const TUT = { w: 340, h: 190, player: 22, proj: 7, shieldR: 26, shieldMax: 3 };

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Progresso 0..1 de um trecho da animação (fora do trecho fica preso em 0 ou 1).
function seg(t, from, to) {
  return clamp((t - from) / (to - from), 0, 1);
}

function tutPlayer(x, y, color, isMe, flicker) {
  tutCtx.fillStyle = flicker ? '#ffffff' : color;
  tutCtx.fillRect(x, y, TUT.player, TUT.player);
  if (isMe) {
    tutCtx.strokeStyle = '#fff';
    tutCtx.lineWidth = 2;
    tutCtx.strokeRect(x, y, TUT.player, TUT.player);
  }
}

function tutProjectile(x, y, color) {
  tutCtx.fillStyle = color;
  tutCtx.beginPath();
  tutCtx.arc(x, y, TUT.proj / 2, 0, Math.PI * 2);
  tutCtx.fill();
}

function tutRoundRect(x, y, w, h, r) {
  tutCtx.beginPath();
  tutCtx.moveTo(x + r, y);
  tutCtx.arcTo(x + w, y, x + w, y + h, r);
  tutCtx.arcTo(x + w, y + h, x, y + h, r);
  tutCtx.arcTo(x, y + h, x, y, r);
  tutCtx.arcTo(x, y, x + w, y, r);
  tutCtx.closePath();
}

function tutKeycap(x, y, label, active, w = 24) {
  tutRoundRect(x, y, w, 24, 4);
  tutCtx.fillStyle = active ? '#7dd3fc' : '#3a3a4d';
  tutCtx.fill();
  tutCtx.strokeStyle = active ? '#bae6fd' : '#55556b';
  tutCtx.lineWidth = 1.5;
  tutCtx.stroke();
  tutCtx.fillStyle = active ? '#12222c' : '#9a9ab0';
  tutCtx.font = 'bold 11px sans-serif';
  tutCtx.textAlign = 'center';
  tutCtx.textBaseline = 'middle';
  tutCtx.fillText(label, x + w / 2, y + 13);
}

// Ponteiro de mouse clássico; (x, y) é a ponta da seta.
const CURSOR_SHAPE = [
  [0, 0], [0, 17], [4.4, 12.8], [7.3, 18.6], [10, 17.4], [7.1, 11.7], [12, 11.7],
];
const CURSOR_SCALE = 1.3;

function tutCursor(x, y, clicking) {
  if (clicking) {
    tutCtx.save();
    tutCtx.strokeStyle = '#fde68a';
    tutCtx.lineWidth = 2;
    tutCtx.beginPath();
    tutCtx.arc(x + 8, y + 12, 17, 0, Math.PI * 2);
    tutCtx.stroke();
    tutCtx.restore();
  }
  tutCtx.save();
  tutCtx.translate(x, y);
  tutCtx.scale(CURSOR_SCALE, CURSOR_SCALE);
  tutCtx.beginPath();
  for (const [dx, dy] of CURSOR_SHAPE) {
    tutCtx.lineTo(dx, dy);
  }
  tutCtx.closePath();
  // O contorno vai ANTES do preenchimento: a seta é pequena e a cauda tem
  // poucos pixels de largura, então traçar por cima comeria o branco.
  tutCtx.strokeStyle = '#1a1a22';
  tutCtx.lineWidth = 2;
  tutCtx.lineJoin = 'round';
  tutCtx.stroke();
  tutCtx.fillStyle = '#fff';
  tutCtx.fill();
  tutCtx.restore();
}

function tutHeart(x, y, lost, dim) {
  tutCtx.globalAlpha = dim ? 0.25 : 1;
  tutCtx.fillStyle = lost ? '#555' : '#e63946';
  for (const [row, col] of HEART_PIXELS) {
    tutCtx.fillRect(x + col * 2, y + row * 2, 2, 2);
  }
  tutCtx.globalAlpha = 1;
}

function tutHearts(x, y, lives, blinkLost) {
  for (let i = 0; i < MAX_LIVES; i++) {
    tutHeart(x + i * 16, y, i >= lives, blinkLost && i === lives);
  }
}

function tutLabel(text, x, y, color, size = 12, align = 'center') {
  tutCtx.fillStyle = color;
  tutCtx.font = `${size}px sans-serif`;
  tutCtx.textAlign = align;
  tutCtx.textBaseline = 'middle';
  tutCtx.fillText(text, x, y);
}

function tutShield(cx, cy, charges, t) {
  if (charges <= 0) return;
  const r = TUT.shieldR * (1 + Math.sin(t / 120) * 0.04);
  tutCtx.save();
  tutCtx.globalAlpha = 0.18;
  tutCtx.fillStyle = '#7dd3fc';
  tutCtx.beginPath();
  tutCtx.arc(cx, cy, r, 0, Math.PI * 2);
  tutCtx.fill();
  tutCtx.globalAlpha = 0.9;
  tutCtx.strokeStyle = '#7dd3fc';
  tutCtx.lineWidth = 3;
  const gap = 0.18;
  const step = (Math.PI * 2) / TUT.shieldMax;
  for (let i = 0; i < charges; i++) {
    const start = -Math.PI / 2 + i * step + gap / 2;
    tutCtx.beginPath();
    tutCtx.arc(cx, cy, r, start, start + step - gap);
    tutCtx.stroke();
  }
  tutCtx.restore();
}

// Faísca no ponto em que o tiro é absorvido pelo escudo.
function tutSpark(cx, cy, progress) {
  if (progress <= 0 || progress >= 1) return;
  tutCtx.save();
  tutCtx.globalAlpha = 1 - progress;
  tutCtx.strokeStyle = '#bae6fd';
  tutCtx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r0 = 4 + progress * 8;
    const r1 = r0 + 6;
    tutCtx.beginPath();
    tutCtx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    tutCtx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    tutCtx.stroke();
  }
  tutCtx.restore();
}

// Partículas fixas (não aleatórias) para a explosão do passo de vitória ficar
// idêntica em cada repetição do loop.
const TUT_EXPLOSION = Array.from({ length: 24 }, (_, i) => {
  const angle = (i / 24) * Math.PI * 2 + (i % 3) * 0.25;
  const speed = 0.5 + ((i * 7) % 10) / 10 * 1.6;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: 2 + ((i * 5) % 7) / 2,
  };
});

function tutExplosion(cx, cy, elapsed, duration, color) {
  if (elapsed <= 0) return;
  const t = clamp(elapsed / duration, 0, 1);
  if (t >= 1) return;
  tutCtx.save();
  tutCtx.globalAlpha = 1 - t;
  for (const p of TUT_EXPLOSION) {
    const d = elapsed * 0.06;
    tutCtx.fillStyle = t < 0.4 ? '#ffffff' : color;
    tutCtx.fillRect(cx + p.vx * d - p.size / 2, cy + p.vy * d - p.size / 2, p.size, p.size);
  }
  tutCtx.restore();
}

const TUTORIAL_STEPS = [
  {
    title: '1. Mover o boneco',
    text: 'Use <strong>W A S D</strong> ou as <strong>setas</strong> do teclado. As teclas podem ser combinadas para andar na diagonal.',
    loop: 4400,
    draw(t) {
      const path = [[52, 70], [130, 70], [130, 122], [52, 122]];
      const legMs = 1100;
      const leg = Math.min(3, Math.floor(t / legMs));
      const k = seg(t, leg * legMs, (leg + 1) * legMs);
      const from = path[leg];
      const to = path[(leg + 1) % 4];
      const x = lerp(from[0], to[0], k);
      const y = lerp(from[1], to[1], k);
      const active = ['right', 'down', 'left', 'up'][leg];

      tutPlayer(x, y, colors[0], true, false);
      tutKeycap(248, 52, 'W', active === 'up');
      tutKeycap(220, 80, 'A', active === 'left');
      tutKeycap(248, 80, 'S', active === 'down');
      tutKeycap(276, 80, 'D', active === 'right');
      tutLabel('ou as setas ↑ ↓ ← →', 262, 124, '#8a8aa0', 11);
    },
  },
  {
    title: '2. Atirar no oponente',
    text: 'Clique em qualquer ponto da arena: o tiro sai do seu quadrado na direção do cursor. Há um pequeno intervalo entre um tiro e outro.',
    loop: 2600,
    draw(t) {
      const target = { x: 268, y: 46 };
      const start = { x: 46, y: 118 };
      const cx = start.x + TUT.player / 2;
      const cy = start.y + TUT.player / 2;
      const tcx = target.x + TUT.player / 2;
      const tcy = target.y + TUT.player / 2;

      const move = seg(t, 0, 900);
      // O cursor para na borda do alvo para não cobrir o quadrado do oponente.
      const curX = lerp(120, tcx - 20, move);
      const curY = lerp(150, tcy - 16, move);

      tutPlayer(start.x, start.y, colors[0], true, false);
      tutPlayer(target.x, target.y, colors[1], false, false);

      if (t >= 1000) {
        const k = seg(t, 1000, 1900);
        tutProjectile(lerp(cx, tcx, k), lerp(cy, tcy, k), colors[0]);
      }
      tutCursor(curX, curY, t >= 900 && t < 1150);
      tutLabel('clique', curX - 12, curY + 2, '#fde68a', 11, 'right');
    },
  },
  {
    title: '3. Três vidas por jogador',
    text: 'Cada jogador começa com <strong>3 vidas</strong>. Todo tiro que acerta tira uma vida do adversário — os corações no topo da tela mostram quanto resta.',
    loop: 3400,
    draw(t) {
      const me = { x: 40, y: 96 };
      const foe = { x: 272, y: 96 };
      const hit = t >= 1400;
      const k = seg(t, 400, 1400);

      tutLabel('Você', 24, 32, '#9a9ab0', 11, 'left');
      tutHearts(24, 44, MAX_LIVES, false);
      tutLabel('Oponente', 316, 32, '#9a9ab0', 11, 'right');
      const blink = hit && t < 2100 && Math.floor((t - 1400) / 180) % 2 === 0;
      tutHearts(268, 44, hit ? 2 : 3, blink);

      tutPlayer(me.x, me.y, colors[0], true, false);
      const foeFlicker = hit && t < 1800 && Math.floor((t - 1400) / 90) % 2 === 0;
      tutPlayer(foe.x, foe.y, colors[1], false, foeFlicker);

      if (!hit) {
        tutProjectile(lerp(me.x + TUT.player, foe.x, k), me.y + TUT.player / 2, colors[0]);
      } else if (t < 2100) {
        tutLabel('-1 vida', foe.x + TUT.player / 2, foe.y - 18, '#e63946', 12);
      }
    },
  },
  {
    title: '4. Campo de força',
    text: 'Segure <strong>Espaço</strong> para erguer o campo de força e absorver os tiros. Enquanto defende você fica <strong>imóvel e sem atirar</strong>.',
    loop: 3400,
    draw(t) {
      const me = { x: 60, y: 82 };
      const foe = { x: 262, y: 82 };
      const cx = me.x + TUT.player / 2;
      const cy = me.y + TUT.player / 2;
      const absorbAt = 1500;
      const k = seg(t, 500, absorbAt);
      const impactX = cx + TUT.shieldR + TUT.proj / 2;

      tutPlayer(foe.x, foe.y, colors[1], false, false);
      tutPlayer(me.x, me.y, colors[0], true, false);
      tutShield(cx, cy, 3, t);

      if (t >= 500 && t < absorbAt) {
        tutProjectile(lerp(foe.x, impactX, k), cy, colors[1]);
      }
      tutSpark(impactX, cy, seg(t, absorbAt, absorbAt + 400));

      tutKeycap(28, 152, 'ESPAÇO', true, 74);
      tutLabel('✕ não move    ✕ não atira', 226, 164, '#e6a3a8', 11);
    },
  },
  {
    title: '5. O escudo tem 3 cargas',
    text: 'O campo de força aguenta <strong>3 tiros na partida inteira</strong> — cada arco do círculo é uma carga. Sem cargas ele não pode mais ser usado.',
    loop: 5800,
    draw(t) {
      const me = { x: 60, y: 82 };
      const foe = { x: 262, y: 82 };
      const cx = me.x + TUT.player / 2;
      const cy = me.y + TUT.player / 2;
      const impactX = cx + TUT.shieldR + TUT.proj / 2;
      const shots = [400, 1400, 2400];
      const travel = 800;

      let charges = 3;
      for (const s of shots) if (t >= s + travel) charges -= 1;
      const broken = charges <= 0;

      tutPlayer(foe.x, foe.y, colors[1], false, false);

      // Sem cargas o quarto tiro passa pelo escudo e acerta o jogador.
      const lastShot = 4100;
      const lastHit = lastShot + 900;
      const hitMe = t >= lastHit;
      const meFlicker = hitMe && t < lastHit + 400 && Math.floor((t - lastHit) / 90) % 2 === 0;
      tutPlayer(me.x, me.y, colors[0], true, meFlicker);

      if (!broken) {
        tutShield(cx, cy, charges, t);
        for (const s of shots) {
          if (t >= s && t < s + travel) {
            tutProjectile(lerp(foe.x, impactX, seg(t, s, s + travel)), cy, colors[1]);
          }
          tutSpark(impactX, cy, seg(t, s + travel, s + travel + 350));
        }
      } else {
        tutLabel('escudo esgotado', cx, me.y - 26, '#e63946', 12);
        if (t >= lastShot && t < lastHit) {
          const k = seg(t, lastShot, lastHit);
          tutProjectile(lerp(foe.x, me.x + TUT.player, k), cy, colors[1]);
        }
        if (hitMe) tutLabel('-1 vida', cx, cy + 34, '#e63946', 12);
      }

      tutLabel(`cargas restantes: ${Math.max(0, charges)}`, 170, 168, '#8a8aa0', 11);
    },
  },
  {
    title: '6. Vence quem zerar o oponente',
    text: 'A partida termina quando um dos jogadores perde as <strong>3 vidas</strong>. Quem sobrar em pé ganha.',
    loop: 4200,
    draw(t) {
      const me = { x: 40, y: 96 };
      const foe = { x: 272, y: 96 };
      const hitAt = 1300;
      const dead = t >= hitAt;

      tutLabel('Você', 24, 32, '#9a9ab0', 11, 'left');
      tutHearts(24, 44, 2, false);
      tutLabel('Oponente', 316, 32, '#9a9ab0', 11, 'right');
      const blink = dead && t < 2000 && Math.floor((t - hitAt) / 180) % 2 === 0;
      tutHearts(268, 44, dead ? 0 : 1, blink);

      tutPlayer(me.x, me.y, colors[0], true, false);

      if (!dead) {
        tutPlayer(foe.x, foe.y, colors[1], false, false);
        tutProjectile(
          lerp(me.x + TUT.player, foe.x, seg(t, 300, hitAt)),
          me.y + TUT.player / 2,
          colors[0]
        );
      } else {
        tutExplosion(foe.x + TUT.player / 2, foe.y + TUT.player / 2, t - hitAt, 900, colors[1]);
      }

      if (t >= 2000) {
        tutCtx.save();
        tutCtx.globalAlpha = seg(t, 2000, 2300);
        tutLabel('Você ganhou', TUT.w / 2, 160, '#4ade80', 20);
        tutCtx.restore();
      }
    },
  },
  {
    title: '7. Escolha o modo de jogo',
    text: '<strong>Jogar Online</strong> te coloca na fila para um 1x1 contra outra pessoa. <strong>Jogar contra Bot</strong> é treino offline, começa na hora.',
    loop: 3800,
    draw(t) {
      const btnW = 190;
      const btnX = (TUT.w - btnW) / 2;
      const onlineY = 46;
      const botY = 104;
      const overBot = t >= 1900;

      const drawBtn = (y, label, base, hover, active) => {
        tutRoundRect(btnX, y, btnW, 38, 8);
        tutCtx.fillStyle = active ? hover : base;
        tutCtx.fill();
        tutLabel(label, TUT.w / 2, y + 19, '#fff', 14);
      };

      drawBtn(onlineY, 'Jogar Online', '#457b9d', '#5b96bb', !overBot);
      drawBtn(botY, 'Jogar contra Bot', '#e63946', '#f0525e', overBot);

      const curY = lerp(onlineY + 26, botY + 26, seg(t, 1600, 1900));
      tutCursor(TUT.w / 2 + 40, curY, false);

      tutLabel(
        overBot ? 'treino offline, sem espera' : '1x1 contra outro jogador',
        TUT.w / 2,
        168,
        '#8a8aa0',
        11
      );
    },
  },
];

let tutStep = 0;
let tutRaf = null;
let tutStepStart = 0;

function buildTutorialDots() {
  tutDotsEl.innerHTML = '';
  TUTORIAL_STEPS.forEach((step, i) => {
    const dot = document.createElement('button');
    dot.className = 'tut-dot';
    dot.title = step.title;
    dot.addEventListener('click', () => setTutorialStep(i));
    tutDotsEl.appendChild(dot);
  });
}

function setTutorialStep(index) {
  tutStep = clamp(index, 0, TUTORIAL_STEPS.length - 1);
  const step = TUTORIAL_STEPS[tutStep];
  tutTitleEl.textContent = step.title;
  tutTextEl.innerHTML = step.text;
  tutStepCountEl.textContent = `${tutStep + 1} / ${TUTORIAL_STEPS.length}`;
  btnTutPrev.disabled = tutStep === 0;
  btnTutNext.textContent = tutStep === TUTORIAL_STEPS.length - 1 ? 'Entendi' : 'Próximo';
  for (let i = 0; i < tutDotsEl.children.length; i++) {
    tutDotsEl.children[i].classList.toggle('active', i === tutStep);
  }
  tutStepStart = performance.now();
}

function tutorialFrame() {
  const step = TUTORIAL_STEPS[tutStep];
  const t = (performance.now() - tutStepStart) % step.loop;
  tutCtx.clearRect(0, 0, TUT.w, TUT.h);
  step.draw(t);
  tutRaf = requestAnimationFrame(tutorialFrame);
}

function openTutorial() {
  howToPlayOverlayEl.style.display = 'flex';
  setTutorialStep(0);
  if (tutRaf === null) tutRaf = requestAnimationFrame(tutorialFrame);
}

function closeTutorial() {
  howToPlayOverlayEl.style.display = 'none';
  if (tutRaf !== null) {
    cancelAnimationFrame(tutRaf);
    tutRaf = null;
  }
}

function isTutorialOpen() {
  return howToPlayOverlayEl.style.display === 'flex';
}

buildTutorialDots();

btnTutClose.addEventListener('click', () => closeTutorial());
btnTutPrev.addEventListener('click', () => setTutorialStep(tutStep - 1));
btnTutNext.addEventListener('click', () => {
  if (tutStep === TUTORIAL_STEPS.length - 1) closeTutorial();
  else setTutorialStep(tutStep + 1);
});
howToPlayOverlayEl.addEventListener('click', (e) => {
  if (e.target === howToPlayOverlayEl) closeTutorial();
});
window.addEventListener('keydown', (e) => {
  if (!isTutorialOpen()) return;
  if (e.key === 'Escape') closeTutorial();
  else if (e.key === 'ArrowRight') setTutorialStep(tutStep + 1);
  else if (e.key === 'ArrowLeft') setTutorialStep(tutStep - 1);
});

const input = { up: false, down: false, left: false, right: false, shield: false };
const keyMap = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

// ---------- Menu ----------

btnOnline.addEventListener('click', () => startOnline());
btnBot.addEventListener('click', () => startBot());
btnHowToPlay.addEventListener('click', () => openTutorial());
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
  shieldRadius = SHIELD_RADIUS;
  shieldMaxHits = SHIELD_MAX_HITS;
  latestState = { players: [], projectiles: [] };
  stateBuffer = [];
  predicted = { x: 0, y: 0, initialized: false };
  lastFrameTime = null;
  gameOver = false;
  matchStarted = false;
  input.up = input.down = input.left = input.right = input.shield = false;
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
  hideCountdown();
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
      shieldRadius = msg.shieldRadius ?? SHIELD_RADIUS;
      shieldMaxHits = msg.shieldMaxHits ?? SHIELD_MAX_HITS;
      canvas.width = arena.w;
      canvas.height = arena.h;
      gameOver = false;
      matchStarted = false;
      latestState = { players: msg.players, projectiles: [] };
      updateHud();
      showCountdown(msg.countdownMs);
      break;
    case 'start':
      matchStarted = true;
      hideCountdown();
      playStartSound();
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
    shielding: false,
    shieldHits: 0,
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
    botNextShot: 0,
    botDodgeUntil: 0,
  };

  latestState = {
    players: bot.players.map((p) => ({
      x: p.x, y: p.y, lives: p.lives, alive: p.alive,
      shielding: p.shielding, shieldHits: p.shieldHits,
    })),
    projectiles: [],
  };
  updateHud();

  showCountdown(BOT_COUNTDOWN_MS, () => {
    matchStarted = true;
    playStartSound();
    bot.botNextShot = Date.now() + 800;
    botInterval = setInterval(botTick, TICK_MS);
  });
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

  // Defende quando o tiro está muito perto e ainda restam cargas de escudo.
  const veryClose = incoming && Math.abs(incoming.x - (enemy.x + PLAYER_SIZE / 2)) < 90;
  enemy.shielding = !!veryClose && enemy.shieldHits < SHIELD_MAX_HITS;
  if (enemy.shielding) return;

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
  bot.players[0].shielding = input.shield && bot.players[0].shieldHits < SHIELD_MAX_HITS;
  updateBotAI();

  for (const p of bot.players) {
    if (!p.alive) continue;
    if (p.shielding && p.shieldHits >= SHIELD_MAX_HITS) p.shielding = false;
    // Em modo de defesa o jogador fica imóvel.
    if (p.shielding) continue;
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
    if (target.alive && target.shielding && target.shieldHits < SHIELD_MAX_HITS &&
      circleHitsProjectile(target, proj)) {
      target.shieldHits += 1;
      if (target.shieldHits >= SHIELD_MAX_HITS) target.shielding = false;
      return false;
    }

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
    players: bot.players.map((p) => ({
      x: p.x, y: p.y, lives: p.lives, alive: p.alive,
      shielding: p.shielding, shieldHits: p.shieldHits,
    })),
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

function circleHitsProjectile(player, proj) {
  const cx = player.x + PLAYER_SIZE / 2;
  const cy = player.y + PLAYER_SIZE / 2;
  return Math.hypot(proj.x - cx, proj.y - cy) <= SHIELD_RADIUS + PROJECTILE_SIZE / 2;
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
  // Em modo de defesa o jogador não se move.
  if (input.shield && me.shieldHits < shieldMaxHits) return;

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
  // Escudo esgotado: solta a defesa mesmo com espaço pressionado.
  if (input.shield && !isShieldAvailable()) {
    input.shield = false;
    sendInput();
  }
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

function shieldCharges(index) {
  const p = latestState.players[index];
  if (!p) return shieldMaxHits;
  return shieldMaxHits - (p.shieldHits || 0);
}

function isShieldAvailable() {
  return playerIndex !== null && shieldCharges(playerIndex) > 0;
}

window.addEventListener('keydown', (e) => {
  if (!mode) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!input.shield && matchStarted && !gameOver && isShieldAvailable()) {
      input.shield = true;
      // Ao defender, o movimento acumulado é descartado.
      input.up = input.down = input.left = input.right = false;
      sendInput();
    }
    return;
  }
  const dir = keyMap[e.code];
  if (dir && !input[dir] && !input.shield) {
    input[dir] = true;
    sendInput();
  }
});

window.addEventListener('keyup', (e) => {
  if (!mode) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (input.shield) {
      input.shield = false;
      sendInput();
    }
    return;
  }
  const dir = keyMap[e.code];
  if (dir && input[dir]) {
    input[dir] = false;
    sendInput();
  }
});

canvas.addEventListener('click', (e) => {
  if (!mode || gameOver || !matchStarted) return;
  // Em modo de defesa o jogador não atira.
  if (input.shield && isShieldAvailable()) return;
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

// Campo de força: círculo pulsante com um arco por carga restante.
function drawShield(cx, cy, charges, now) {
  if (charges <= 0) return;
  const pulse = 1 + Math.sin(now / 120) * 0.03;
  const r = shieldRadius * pulse;

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#7dd3fc';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 3;
  const gap = 0.18;
  const step = (Math.PI * 2) / shieldMaxHits;
  for (let i = 0; i < charges; i++) {
    const start = -Math.PI / 2 + i * step + gap / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + step - gap);
    ctx.stroke();
  }
  ctx.restore();
}

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

        const shieldingNow = i === playerIndex
          ? (input.shield && isShieldAvailable())
          : !!p.shielding;
        if (shieldingNow) {
          drawShield(p.x + ox + playerSize / 2, p.y + oy + playerSize / 2,
            shieldMaxHits - (p.shieldHits || 0), now);
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
