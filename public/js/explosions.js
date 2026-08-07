import { ctx } from './dom.js';
import { state } from './state.js';
import { playExplosionSound } from './audio.js';
import { PX, snap, pxCirculo, alphaEmDegraus } from './pixel.js';

const EXPLOSION_PARTICLE_COUNT = 26;
const EXPLOSION_LIFE_MS = 800;
const EXPLOSION_COLOR = '#ff4d4d';

// Uma partícula não desvanece: ela esfria. Percorre a rampa do mais quente
// (o clarão branco do impacto) até a brasa, e some quando acaba a vida. A
// última cor da rampa vem do `color` de quem chamou (vermelho de jogador
// morrendo, laranja da lava), então as duas explosões continuam distintas.
const RAMPA_QUENTE = ['#ffffff', '#ffe066', '#ff8a1f'];

// Clarão do primeiro instante: um disco branco que encolhe em degraus, no
// lugar do "tudo branco por 40% da animação" que a versão anterior fazia com
// alpha. É o que dá o baque do impacto.
const CLARAO_ATE = 0.18;
const CLARAO_BLOCOS = 7;

// `color`/`count`/`spread` existem para a explosão da erupção de lava (arena de
// fogo), que é laranja, maior e mais numerosa que a de um jogador morrendo —
// as partículas precisam cobrir o raio da erupção, não o de um personagem.
export function spawnExplosion(cx, cy, { color = EXPLOSION_COLOR, count = EXPLOSION_PARTICLE_COUNT, spread = 1 } = {}) {
  const now = Date.now();
  // O clarão é uma "partícula" parada e sem velocidade, só para viver na
  // mesma lista (mesmo filtro por tempo, mesma limpeza entre partidas).
  state.explosionParticles.push({
    clarao: true,
    x: cx,
    y: cy,
    raio: CLARAO_BLOCOS * PX * spread,
    startTime: now,
    life: EXPLOSION_LIFE_MS * CLARAO_ATE,
  });
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 4) * spread;
    state.explosionParticles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      // Tamanho em blocos da grade (1 a 3), não em pixels de tela.
      blocos: 1 + Math.floor(Math.random() * 3),
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
    const t = (now - p.startTime) / p.life;

    if (p.clarao) {
      // Encolhe um bloco por etapa, sem transparência nenhuma.
      pxCirculo(ctx, p.x, p.y, p.raio * (1 - t), '#ffffff');
      continue;
    }

    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.95;
    p.vy *= 0.95;
    // Posição e tamanho travados na grade: era o que faltava para a explosão
    // (que já era feita de fillRect) ler como pixel art em vez de borrão.
    // A partícula também encolhe um bloco por vez enquanto esfria.
    const rampa = [...RAMPA_QUENTE, p.color];
    const blocos = Math.max(1, p.blocos - Math.floor(t * 2));
    ctx.globalAlpha = alphaEmDegraus(1 - t);
    ctx.fillStyle = rampa[Math.min(rampa.length - 1, Math.floor(t * rampa.length))];
    ctx.fillRect(snap(p.x), snap(p.y), blocos * PX, blocos * PX);
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
