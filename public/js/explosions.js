import { ctx } from './dom.js';
import { state } from './state.js';
import { playExplosionSound } from './audio.js';

const EXPLOSION_PARTICLE_COUNT = 26;
const EXPLOSION_LIFE_MS = 800;
const EXPLOSION_COLOR = '#ff4d4d';

// `color`/`count`/`spread` existem para a explosão da erupção de lava (arena de
// fogo), que é laranja, maior e mais numerosa que a de um jogador morrendo —
// as partículas precisam cobrir o raio da erupção, não o de um personagem.
export function spawnExplosion(cx, cy, { color = EXPLOSION_COLOR, count = EXPLOSION_PARTICLE_COUNT, spread = 1 } = {}) {
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 4) * spread;
    state.explosionParticles.push({
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

export function updateAndDrawExplosions(now) {
  if (!state.explosionParticles.length) return;
  state.explosionParticles = state.explosionParticles.filter((p) => now - p.startTime < p.life);
  for (const p of state.explosionParticles) {
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

// Dispara a explosão no instante em que um jogador passa de vivo para morto.
export function checkDeathExplosion(rawIndex, playerState) {
  if (state.prevAlive[rawIndex] && !playerState.alive) {
    spawnExplosion(playerState.x + state.playerSize / 2, playerState.y + state.playerSize / 2);
    playExplosionSound();
  }
  state.prevAlive[rawIndex] = playerState.alive;
}
