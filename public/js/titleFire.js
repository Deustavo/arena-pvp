// Efeito de hover nas letras do título do menu: cada letra gira e solta
// chamas em pixel enquanto o mouse passa por cima, uma a uma (a rotação e a
// chama são por letra, não no título inteiro). As partículas reaproveitam o
// mesmo canvas/loop de desenho do rastro do cursor (fireCursor.js) — aqui só
// decidimos onde e quando soltar cada rajada.

import { spawnFireBurst } from './fireCursor.js';
import { playTitleFireSound } from './audio.js';

const HOVER_CLASS = 'title-letter-hover';
const BURST_PER_FRAME = 3;
const BURN_AFTER_LEAVE_MS = 600;

// el -> timestamp (Date.now()) até quando a letra ainda deve pegar fogo,
// mesmo depois do mouse já ter saído dela.
const burning = new Map();
let rafId = null;

function spawnForBurning() {
  const now = Date.now();
  for (const [el, burnUntil] of burning) {
    if (now > burnUntil) {
      burning.delete(el);
      continue;
    }
    const rect = el.getBoundingClientRect();
    for (let i = 0; i < BURST_PER_FRAME; i++) {
      // Espalha as chamas pela letra inteira, não só no centro.
      const x = rect.left + Math.random() * rect.width;
      const y = rect.top + Math.random() * rect.height * 0.75;
      spawnFireBurst(x, y, 1);
    }
  }
  rafId = burning.size ? requestAnimationFrame(spawnForBurning) : null;
}

export function initTitleFire() {
  const letters = document.querySelectorAll('#menuTitle .title-letter');
  letters.forEach((el) => {
    el.addEventListener('mouseenter', () => {
      el.classList.remove(HOVER_CLASS);
      // eslint-disable-next-line no-void
      void el.offsetWidth; // reinicia a animação de giro se o mouse voltar antes dela terminar
      el.classList.add(HOVER_CLASS);
      playTitleFireSound();
      burning.set(el, Infinity);
      if (!rafId) rafId = requestAnimationFrame(spawnForBurning);
    });
    el.addEventListener('mouseleave', () => {
      burning.set(el, Date.now() + BURN_AFTER_LEAVE_MS);
    });
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'tituloGirar' || e.animationName === 'tituloGirarInvertido') {
        el.classList.remove(HOVER_CLASS);
      }
    });
  });
}
