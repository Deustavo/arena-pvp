// Rastro de fogo em pixel art que segue o cursor do mouse na tela inicial
// (menu, seleção de classe, ranking, etc). Roda num canvas próprio, fixo por
// cima de tudo, independente do canvas do jogo — não precisa saber nada de
// `state.mode`: segue o mesmo sinal que o paralaxe do fundo (parallax.js) já
// usa, `body.game-active`, que só existe durante uma partida (ver
// `body:not(.game-active)` em style.css). Assim o efeito desliga sozinho
// quando a partida começa e volta ao normal ao voltar pro menu.

import { alphaEmDegraus } from './pixel.js';

// Este canvas é do tamanho da tela (não os 800x600 do jogo escalados por
// CSS), então tem grade própria: PIXEL = 3 em pixels de tela é o que
// equivale, na prática, ao PX = 4 do canvas da arena.
const PIXEL = 3;
const SPAWN_PER_FRAME = 2;
const PARTICLE_LIFE_MS = 450;
const FIRE_COLORS = ['#fff3b0', '#ffd23f', '#ff8c1a', '#e8491d', '#7a1f0d'];

let canvas = null;
let ctx = null;
let particles = [];
const mouse = { x: -9999, y: -9999 };

function isGameActive() {
  return document.body.classList.contains('game-active');
}

function snap(v) {
  return Math.round(v / PIXEL) * PIXEL;
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function createCanvas() {
  const el = document.createElement('canvas');
  el.id = 'fireCursorCanvas';
  document.body.appendChild(el);
  return el;
}

function spawnParticles(now) {
  for (let i = 0; i < SPAWN_PER_FRAME; i++) {
    particles.push({
      x: mouse.x + (Math.random() - 0.5) * 6,
      y: mouse.y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -0.6 - Math.random() * 0.9,
      size: PIXEL * (1 + Math.floor(Math.random() * 2)),
      startTime: now,
      life: PARTICLE_LIFE_MS * (0.6 + Math.random() * 0.6),
    });
  }
}

// Usado por titleFire.js para soltar chamas em pontos específicos da tela
// (letras do título em hover), reaproveitando o mesmo canvas/loop de
// partículas do rastro do mouse em vez de duplicar a lógica de fogo.
export function spawnFireBurst(x, y, count = 2) {
  if (!particles) return;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -0.7 - Math.random() * 1,
      size: PIXEL * (1 + Math.floor(Math.random() * 2)),
      startTime: now,
      life: PARTICLE_LIFE_MS * (0.6 + Math.random() * 0.6),
    });
  }
}

function drawParticles(now) {
  particles = particles.filter((p) => now - p.startTime < p.life);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    const t = (now - p.startTime) / p.life;
    const colorIndex = Math.min(FIRE_COLORS.length - 1, Math.floor(t * FIRE_COLORS.length));
    // A chama encolhe em blocos inteiros e some em degraus: com um tamanho
    // fracionário o quadrado cai entre dois pixels de tela e o rastro, que é
    // justamente o efeito mais pixelado do menu, volta a ficar liso.
    const size = Math.max(PIXEL, snap(p.size * (1 - t * 0.5)));

    ctx.globalAlpha = alphaEmDegraus(1 - t);
    ctx.fillStyle = FIRE_COLORS[colorIndex];
    ctx.fillRect(snap(p.x - size / 2), snap(p.y - size / 2), size, size);
  }
  ctx.globalAlpha = 1;
}

function tick() {
  requestAnimationFrame(tick);

  if (isGameActive()) {
    // Corta o efeito na hora ao entrar em partida, sem deixar partículas
    // penduradas esmaecendo por cima do jogo.
    if (particles.length) particles = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const now = Date.now();
  spawnParticles(now);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawParticles(now);
}

export function initFireCursor() {
  canvas = createCanvas();
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  requestAnimationFrame(tick);
}
