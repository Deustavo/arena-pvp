// Luta decorativa de fundo da tela inicial: um lutador de cada classe,
// todos contra todos, sem HUD e sem morte real (apenas flash ao tomar
// dano). Não é lógica de partida — é puramente cosmético, então não usa
// shared/simulation.js (feito só para 1x1 com fim de partida). Reaproveita
// de shared/ apenas os dados de classe e as primitivas geométricas, para a
// luta de fundo ficar visualmente fiel ao jogo real.
import { CLASSES, getClass } from '../../shared/classes.js';
import { PLAYER_SIZE, PROJECTILE_SPEED, TICK_MS } from '../../shared/constants.js';
import { clamp, rectsIntersect } from '../../shared/physics.js';

const bgCanvas = document.getElementById('menuBg');
const bgCtx = bgCanvas.getContext('2d');

const TURN_MIN_MS = 1500;
const TURN_MAX_MS = 3500;
const TURN_SMOOTHING = 0.04;
const HIT_FLASH_MS = 250;
const AIM_SPREAD_PX = 50;
const MARGIN = 40;
const FIGHTER_ALPHA = 0.35;

const arena = { w: 0, h: 0 };
let fighters = [];
let projectiles = [];
let nextProjectileId = 1;
let rafId = null;
let lastTs = null;

function randPoint() {
  const w = Math.max(arena.w - PLAYER_SIZE - MARGIN * 2, 1);
  const h = Math.max(arena.h - PLAYER_SIZE - MARGIN * 2, 1);
  return { x: MARGIN + Math.random() * w, y: MARGIN + Math.random() * h };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  arena.w = window.innerWidth;
  arena.h = window.innerHeight;
  bgCanvas.width = arena.w * dpr;
  bgCanvas.height = arena.h * dpr;
  bgCanvas.style.width = `${arena.w}px`;
  bgCanvas.style.height = `${arena.h}px`;
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const f of fighters) {
    f.x = clamp(f.x, 0, arena.w - PLAYER_SIZE);
    f.y = clamp(f.y, 0, arena.h - PLAYER_SIZE);
  }
}

function spawnFighters() {
  fighters = Object.keys(CLASSES).map((classId) => {
    const cls = getClass(classId);
    const spot = randPoint();
    return {
      classId,
      x: spot.x,
      y: spot.y,
      speed: cls.speed,
      angle: Math.random() * Math.PI * 2,
      targetAngle: Math.random() * Math.PI * 2,
      lastShot: Date.now() + Math.random() * cls.shotCooldownMs,
      nextTurnChange: 0,
      hitFlashUntil: 0,
    };
  });
}

function pickTargetAngle(f, now) {
  f.targetAngle = Math.random() * Math.PI * 2;
  f.nextTurnChange = now + TURN_MIN_MS + Math.random() * (TURN_MAX_MS - TURN_MIN_MS);
}

// Menor diferença angular entre dois ângulos, no intervalo [-PI, PI] — evita
// que a suavização gire pelo caminho mais longo do círculo.
function angleDiff(a, b) {
  return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

function nearestEnemy(f) {
  let best = null;
  let bestDist = Infinity;
  for (const other of fighters) {
    if (other === f) continue;
    const d = Math.hypot(other.x - f.x, other.y - f.y);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

function shoot(f, enemy, cls) {
  const cx = f.x + PLAYER_SIZE / 2;
  const cy = f.y + PLAYER_SIZE / 2;
  const tx = enemy.x + PLAYER_SIZE / 2 + (Math.random() - 0.5) * AIM_SPREAD_PX;
  const ty = enemy.y + PLAYER_SIZE / 2 + (Math.random() - 0.5) * AIM_SPREAD_PX;

  const count = Math.max(1, cls.projectileCount);
  const baseAngle = Math.atan2(ty - cy, tx - cx);
  const spreadRad = (cls.coneSpreadDeg * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = baseAngle + t * spreadRad;
    projectiles.push({
      id: nextProjectileId++,
      x: cx,
      y: cy,
      startX: cx,
      startY: cy,
      vx: Math.cos(angle),
      vy: Math.sin(angle),
      size: cls.projectileSize,
      range: cls.range,
      color: cls.color,
      owner: f,
    });
  }
}

function updateFighter(f, now, dtMs) {
  const cls = getClass(f.classId);
  if (now >= f.nextTurnChange) pickTargetAngle(f, now);

  // Gira suavemente rumo ao ângulo-alvo em vez de "pular" de direção — dá o
  // aspecto de passeio livre, sem o movimento travado de perseguir/fugir do
  // inimigo a cada tick.
  f.angle += angleDiff(f.angle, f.targetAngle) * Math.min(TURN_SMOOTHING * (dtMs / 16.7), 1);

  const speedPxMs = f.speed / TICK_MS;
  let nx = f.x + Math.cos(f.angle) * speedPxMs * dtMs;
  let ny = f.y + Math.sin(f.angle) * speedPxMs * dtMs;

  // Quica nas paredes: reflete o componente do ângulo em vez de só travar na
  // borda, então o passeio continua fluido depois de bater.
  if (nx < 0 || nx > arena.w - PLAYER_SIZE) {
    f.angle = Math.PI - f.angle;
    f.targetAngle = f.angle;
    nx = clamp(nx, 0, arena.w - PLAYER_SIZE);
  }
  if (ny < 0 || ny > arena.h - PLAYER_SIZE) {
    f.angle = -f.angle;
    f.targetAngle = f.angle;
    ny = clamp(ny, 0, arena.h - PLAYER_SIZE);
  }
  f.x = nx;
  f.y = ny;

  const enemy = nearestEnemy(f);
  if (enemy && now - f.lastShot >= cls.shotCooldownMs) {
    f.lastShot = now;
    shoot(f, enemy, cls);
  }
}

function updateProjectiles(dtMs) {
  const speedPxMs = PROJECTILE_SPEED / TICK_MS;
  projectiles = projectiles.filter((proj) => {
    proj.x += proj.vx * speedPxMs * dtMs;
    proj.y += proj.vy * speedPxMs * dtMs;

    if (proj.x < -proj.size || proj.x > arena.w + proj.size ||
        proj.y < -proj.size || proj.y > arena.h + proj.size) return false;

    if (Number.isFinite(proj.range) &&
      Math.hypot(proj.x - proj.startX, proj.y - proj.startY) > proj.range) return false;

    for (const f of fighters) {
      if (f === proj.owner) continue;
      if (rectsIntersect(
        proj.x - proj.size / 2, proj.y - proj.size / 2, proj.size, proj.size,
        f.x, f.y, PLAYER_SIZE, PLAYER_SIZE
      )) {
        f.hitFlashUntil = Date.now() + HIT_FLASH_MS;
        return false;
      }
    }
    return true;
  });
}

function draw(now) {
  bgCtx.clearRect(0, 0, arena.w, arena.h);

  bgCtx.globalAlpha = FIGHTER_ALPHA * 0.7;
  for (const proj of projectiles) {
    bgCtx.beginPath();
    bgCtx.fillStyle = proj.color;
    bgCtx.arc(proj.x, proj.y, proj.size / 2, 0, Math.PI * 2);
    bgCtx.fill();
  }

  bgCtx.globalAlpha = FIGHTER_ALPHA;
  for (const f of fighters) {
    const cls = getClass(f.classId);
    bgCtx.fillStyle = now < f.hitFlashUntil ? '#ffffff' : cls.color;
    bgCtx.fillRect(f.x, f.y, PLAYER_SIZE, PLAYER_SIZE);
  }
  bgCtx.globalAlpha = 1;
}

function loop(ts) {
  if (lastTs === null) lastTs = ts;
  const dtMs = Math.min(ts - lastTs, 50);
  lastTs = ts;
  const now = Date.now();

  for (const f of fighters) updateFighter(f, now, dtMs);
  updateProjectiles(dtMs);
  draw(now);

  rafId = requestAnimationFrame(loop);
}

export function startMenuBackground() {
  if (rafId !== null) return;
  resize();
  if (fighters.length === 0) spawnFighters();
  lastTs = null;
  rafId = requestAnimationFrame(loop);
}

export function stopMenuBackground() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

window.addEventListener('resize', () => {
  if (rafId !== null) resize();
});
