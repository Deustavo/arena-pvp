import {
  livesP0El, livesP1El, nameP0El, nameP1El,
} from './dom.js';
import { state } from './state.js';
import { checkDeathExplosion } from './explosions.js';

export const HEART_PIXELS = [
  [0, 1], [0, 2], [0, 4], [0, 5],
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
  [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
  [4, 2], [4, 3], [4, 4],
  [5, 3],
];
const HEART_PIXEL_SIZE = 3;
const HIT_FLASH_DURATION = 400;

let heartsEls = [[], []];
let prevLives = [0, 0];
export let hitFlashUntil = [0, 0];

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

// `maxLives` são as vidas máximas de cada jogador, dependentes da classe
// escolhida (ex.: atirador 10, mago 8, tank 12) — vêm do snapshot inicial da
// partida, já que ambos os lados começam com vida cheia.
export function initHearts(maxLives = [10, 10]) {
  heartsEls[0] = createHeartsRow(livesP0El, maxLives[0]);
  heartsEls[1] = createHeartsRow(livesP1El, maxLives[1]);
  prevLives = [maxLives[0], maxLives[1]];
  hitFlashUntil = [0, 0];
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

export function shieldCharges(index) {
  const p = state.latestState.players[index];
  const maxHits = p?.shieldMaxHits ?? state.shieldMaxHits[index];
  if (!p) return maxHits;
  return maxHits - (p.shieldHits || 0);
}

export function isShieldAvailable() {
  return state.playerIndex !== null && shieldCharges(state.playerIndex) > 0;
}

export function updateHud() {
  const oppIndex = state.playerIndex === 0 ? 1 : 0;
  const me = state.latestState.players[state.playerIndex];
  const opp = state.latestState.players[oppIndex];
  if (me) {
    nameP0El.textContent = me.name || 'Você';
    updateHeartsRow(0, me.lives, state.playerIndex);
    checkDeathExplosion(state.playerIndex, me);
  }
  if (opp) {
    nameP1El.textContent = opp.name || 'Oponente';
    updateHeartsRow(1, opp.lives, oppIndex);
    checkDeathExplosion(oppIndex, opp);
  }
}
