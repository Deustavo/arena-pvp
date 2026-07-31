// Primitivas de desenho do canvas de tutorial — reaproveitam as mesmas
// formas do jogo (quadrado, tiro, escudo, corações, explosão) em miniatura.

import { tutCtx } from '../dom.js';
import { HEART_PIXELS } from '../hud.js';

export { tutCtx };

export const TUT = { w: 340, h: 190, player: 22, proj: 7, shieldR: 26, shieldMax: 3 };

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Progresso 0..1 de um trecho da animação (fora do trecho fica preso em 0 ou 1).
export function seg(t, from, to) {
  return clamp((t - from) / (to - from), 0, 1);
}

export function tutPlayer(x, y, color, isMe, flicker) {
  tutCtx.fillStyle = flicker ? '#ffffff' : color;
  tutCtx.fillRect(x, y, TUT.player, TUT.player);
  if (isMe) {
    tutCtx.strokeStyle = '#fff';
    tutCtx.lineWidth = 2;
    tutCtx.strokeRect(x, y, TUT.player, TUT.player);
  }
}

export function tutProjectile(x, y, color) {
  tutCtx.fillStyle = color;
  tutCtx.beginPath();
  tutCtx.arc(x, y, TUT.proj / 2, 0, Math.PI * 2);
  tutCtx.fill();
}

export function tutRoundRect(x, y, w, h, r) {
  tutCtx.beginPath();
  tutCtx.moveTo(x + r, y);
  tutCtx.arcTo(x + w, y, x + w, y + h, r);
  tutCtx.arcTo(x + w, y + h, x, y + h, r);
  tutCtx.arcTo(x, y + h, x, y, r);
  tutCtx.arcTo(x, y, x + w, y, r);
  tutCtx.closePath();
}

export function tutKeycap(x, y, label, active, w = 24) {
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

export function tutCursor(x, y, clicking) {
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

export function tutHeart(x, y, lost, dim) {
  tutCtx.globalAlpha = dim ? 0.25 : 1;
  tutCtx.fillStyle = lost ? '#555' : '#e63946';
  for (const [row, col] of HEART_PIXELS) {
    tutCtx.fillRect(x + col * 2, y + row * 2, 2, 2);
  }
  tutCtx.globalAlpha = 1;
}

export function tutHearts(x, y, lives, blinkLost, maxLives) {
  for (let i = 0; i < maxLives; i++) {
    tutHeart(x + i * 16, y, i >= lives, blinkLost && i === lives);
  }
}

export function tutLabel(text, x, y, color, size = 12, align = 'center') {
  tutCtx.fillStyle = color;
  tutCtx.font = `${size}px sans-serif`;
  tutCtx.textAlign = align;
  tutCtx.textBaseline = 'middle';
  tutCtx.fillText(text, x, y);
}

export function tutShield(cx, cy, charges, t) {
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
export function tutSpark(cx, cy, progress) {
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

export function tutExplosion(cx, cy, elapsed, duration, color) {
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
