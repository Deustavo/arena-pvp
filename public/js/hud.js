import {
  livesP0El, livesP1El, shieldsP0El, shieldsP1El, nameP0El, nameP1El, cooldownP0El, cooldownP1El,
  classIconP0El, classIconP1El, classNameP0El, classNameP1El,
} from './dom.js';
import { state } from './state.js';
import { checkDeathExplosion } from './explosions.js';
import { spawnFloatingHeartLoss, spawnFloatingShieldBreak } from './floatingIcons.js';
import { playHitSound, playShieldBlockSound, playShieldBreakSound, playShotSound } from './audio.js';
import { getClass } from '../../shared/classes.js';

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

export const SHIELD_PIXELS = [
  [0, 2], [0, 3], [0, 4],
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
  [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6],
  [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6],
  [5, 1], [5, 2], [5, 3], [5, 4], [5, 5],
  [6, 2], [6, 3], [6, 4],
  [7, 3],
];
const SHIELD_PIXEL_SIZE = 3;

let heartsEls = [[], []];
let prevLives = [0, 0];
export let hitFlashUntil = [0, 0];
let prevClassIds = [null, null];
let shieldsEls = [[], []];
// Cargas de escudo do tick anterior, por slot visual. É a comparação com elas
// que revela um bloqueio: nem o servidor nem a simulação avisam "bloqueou", só
// mandam o estado novo. `null` = ainda não há partida para comparar.
let prevShieldCharges = [null, null];
// `lastShot` do tick anterior, por slot visual — mesma lógica do escudo acima:
// nem servidor nem simulação avisam "atirou", só mandam o timestamp do último
// disparo. Cobre os dois jogadores, então o som de tiro do oponente também
// toca no modo online. `null` = ainda não há partida para comparar.
let prevLastShot = [null, null];

function updateClassIcon(el, nameEl, row, classId) {
  if (!el || classId === prevClassIds[row]) return;
  prevClassIds[row] = classId;
  const cls = getClass(classId);
  el.innerHTML = cls.icon || '';
  if (nameEl) nameEl.textContent = cls.name || '';
}

// `pixelSize` é opcional (padrão = tamanho do HUD real) para permitir reusar
// os mesmos corações/escudos pixel-art em miniatura, como no preview de
// classe da modal de seleção online.
export function createHeartEl(pixelSize = HEART_PIXEL_SIZE) {
  const heart = document.createElement('div');
  heart.className = 'heart';
  heart.style.width = `${7 * pixelSize}px`;
  heart.style.height = `${6 * pixelSize}px`;
  for (const [row, col] of HEART_PIXELS) {
    const px = document.createElement('div');
    // Metade esquerda/direita separadas para permitir colorir só a metade
    // direita em cinza quando o jogador perde meio coração (dano fracionário).
    px.className = col <= 3 ? 'heart-pixel heart-pixel-left' : 'heart-pixel heart-pixel-right';
    px.style.width = `${pixelSize}px`;
    px.style.height = `${pixelSize}px`;
    px.style.left = `${col * pixelSize}px`;
    px.style.top = `${row * pixelSize}px`;
    heart.appendChild(px);
  }
  return heart;
}

export function createHeartsRow(container, count, pixelSize = HEART_PIXEL_SIZE) {
  container.innerHTML = '';
  const hearts = [];
  for (let i = 0; i < count; i++) {
    const heart = createHeartEl(pixelSize);
    container.appendChild(heart);
    hearts.push(heart);
  }
  return hearts;
}

export function createShieldEl(pixelSize = SHIELD_PIXEL_SIZE) {
  const shield = document.createElement('div');
  shield.className = 'shield';
  shield.style.width = `${7 * pixelSize}px`;
  shield.style.height = `${8 * pixelSize}px`;
  for (const [row, col] of SHIELD_PIXELS) {
    const px = document.createElement('div');
    px.className = 'shield-pixel';
    px.style.width = `${pixelSize}px`;
    px.style.height = `${pixelSize}px`;
    px.style.left = `${col * pixelSize}px`;
    px.style.top = `${row * pixelSize}px`;
    shield.appendChild(px);
  }
  return shield;
}

export function createShieldsRow(container, count, pixelSize = SHIELD_PIXEL_SIZE) {
  container.innerHTML = '';
  const shields = [];
  for (let i = 0; i < count; i++) {
    const shield = createShieldEl(pixelSize);
    container.appendChild(shield);
    shields.push(shield);
  }
  return shields;
}

// `maxLives` são as vidas máximas de cada jogador, dependentes da classe
// escolhida (ex.: atirador 10, mago 8, tank 12) — vêm do snapshot inicial da
// partida, já na ordem visual [você, oponente] (não a ordem bruta do
// servidor), já que ambos os lados começam com vida cheia.
export function initHearts(maxLives = [10, 10]) {
  heartsEls[0] = createHeartsRow(livesP0El, maxLives[0]);
  heartsEls[1] = createHeartsRow(livesP1El, maxLives[1]);
  prevLives = [maxLives[0], maxLives[1]];
  hitFlashUntil = [0, 0];
  // `state.shieldMaxHits` fica indexado pela posição real do jogador no
  // servidor (é isso que `shieldCharges` espera), então precisa ser
  // reordenado para [você, oponente] aqui, senão a fileira de escudos do
  // slot 0 é montada com a contagem do jogador errado quando você não é
  // `players[0]` no servidor.
  const oppIndex = state.playerIndex === 0 ? 1 : 0;
  const maxShields = [state.shieldMaxHits[state.playerIndex], state.shieldMaxHits[oppIndex]];
  shieldsEls[0] = createShieldsRow(shieldsP0El, maxShields[0]);
  shieldsEls[1] = createShieldsRow(shieldsP1El, maxShields[1]);
  prevShieldCharges = [maxShields[0], maxShields[1]];
  prevLastShot = [null, null];
}

// Limpa tudo que o HUD acumulou da partida anterior (corações, escudos, nomes,
// ícones de classe e barras de cooldown). Sem isso, ao clicar em "jogar
// novamente" o HUD continua mostrando as vidas/nome do jogo que acabou até a
// nova partida enviar o primeiro estado — no modo online isso pode demorar
// vários segundos, enquanto o jogador espera na fila.
export function resetHud() {
  heartsEls = [[], []];
  shieldsEls = [[], []];
  prevLives = [0, 0];
  prevShieldCharges = [null, null];
  prevLastShot = [null, null];
  prevClassIds = [null, null];
  hitFlashUntil = [0, 0];
  livesP0El.innerHTML = '';
  livesP1El.innerHTML = '';
  shieldsP0El.innerHTML = '';
  shieldsP1El.innerHTML = '';
  nameP0El.textContent = 'Você';
  nameP1El.textContent = 'Oponente';
  classIconP0El.innerHTML = '';
  classIconP1El.innerHTML = '';
  classNameP0El.textContent = '';
  classNameP1El.textContent = '';
  for (const el of [cooldownP0El, cooldownP1El]) {
    el.style.width = '0%';
    el.classList.remove('ready');
  }
}

function triggerHeartBlink(heartEl) {
  heartEl.classList.remove('blink');
  void heartEl.offsetWidth; // force reflow to restart the animation
  heartEl.classList.add('blink');
}

// Centro horizontal e topo da cabeça de um jogador, em coordenadas de mundo —
// é onde os ícones flutuantes de vida/escudo perdidos nascem (floatingIcons.js).
function headPosition(player) {
  if (!player) return null;
  return { x: player.x + state.playerSize / 2, topY: player.y };
}

function updateHeartsRow(row, lives, rawIndex, player) {
  const hearts = heartsEls[row];
  if (!hearts.length) return;
  const prev = prevLives[row];
  const wholeLives = Math.floor(lives);
  // Dano fracionário (ex.: duelista tira meio coração por tiro) deixa `lives`
  // com resto 0.5 — nesse caso o coração no índice `wholeLives` fica "half"
  // em vez de cheio ou totalmente perdido.
  const hasHalf = lives - wholeLives >= 0.5;
  for (let i = 0; i < hearts.length; i++) {
    const lost = i >= wholeLives + (hasHalf ? 1 : 0);
    const half = hasHalf && i === wholeLives;
    hearts[i].classList.toggle('lost', lost);
    hearts[i].classList.toggle('half', half);
  }
  if (lives < prev) {
    for (let i = wholeLives; i < Math.ceil(prev); i++) {
      if (hearts[i]) triggerHeartBlink(hearts[i]);
    }
    hitFlashUntil[rawIndex] = Date.now() + HIT_FLASH_DURATION;
    // No hit que zera as vidas quem toca é a explosão (explosions.js) — os dois
    // sons juntos só embolam. Vale para os dois jogadores e também para o
    // último coração drenado no desempate.
    if (lives > 0) playHitSound();
    const head = headPosition(player);
    // Quantos corações inteiros saíram nesse hit (dano fracionário conta como 1,
    // já que não faz sentido mostrar "meio coração" voando).
    const heartsLost = Math.max(1, Math.round(prev - lives));
    if (head) spawnFloatingHeartLoss(head.x, head.topY, heartsLost);
  }
  prevLives[row] = lives;
}

function updateShieldsRow(row, charges, player) {
  const shields = shieldsEls[row];
  if (!shields.length) return;
  for (let i = 0; i < shields.length; i++) {
    shields[i].classList.toggle('lost', i >= charges);
  }
  // Perdeu carga = bloqueou um tiro. Quando foi a última, o som é o de escudo
  // quebrando em vez do de bloqueio: avisa que não há mais proteção. O ícone
  // flutuante de escudo rachado aparece nos dois casos — perder uma carga já é
  // "perder um escudo", não só zerar todas.
  const prev = prevShieldCharges[row];
  if (prev !== null && charges < prev) {
    if (charges <= 0) playShieldBreakSound();
    else playShieldBlockSound();
    const head = headPosition(player);
    if (head) spawnFloatingShieldBreak(head.x, head.topY);
  }
  prevShieldCharges[row] = charges;
}

// Disparo: `lastShot` mudou desde o tick anterior. Cobre os dois jogadores
// (ambos passam pelo mesmo `updateHud`), então também dá o som do tiro do
// oponente no modo online — sem isso o jogador só ouviria os próprios tiros.
function checkShot(row, lastShot) {
  const prev = prevLastShot[row];
  if (prev !== null && lastShot && lastShot !== prev) playShotSound();
  prevLastShot[row] = lastShot ?? prev;
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

function updateCooldownBar(el, player, now) {
  if (!player) return;
  const cooldownMs = getClass(player.classId).shotCooldownMs;
  const ratio = Math.min(1, (now - (player.lastShot || 0)) / cooldownMs);
  el.style.width = `${ratio * 100}%`;
  el.classList.toggle('ready', ratio >= 1);
}

export function updateCooldownBars(now = Date.now()) {
  const oppIndex = state.playerIndex === 0 ? 1 : 0;
  const me = state.latestState.players[state.playerIndex];
  const opp = state.latestState.players[oppIndex];
  updateCooldownBar(cooldownP0El, me, now);
  updateCooldownBar(cooldownP1El, opp, now);
}

export function updateHud() {
  const oppIndex = state.playerIndex === 0 ? 1 : 0;
  const me = state.latestState.players[state.playerIndex];
  const opp = state.latestState.players[oppIndex];
  if (me) {
    nameP0El.textContent = me.name || 'Você';
    updateClassIcon(classIconP0El, classNameP0El, 0, me.classId);
    updateHeartsRow(0, me.lives, state.playerIndex, me);
    updateShieldsRow(0, shieldCharges(state.playerIndex), me);
    checkShot(0, me.lastShot);
    checkDeathExplosion(state.playerIndex, me);
  }
  if (opp) {
    nameP1El.textContent = opp.name || 'Oponente';
    updateClassIcon(classIconP1El, classNameP1El, 1, opp.classId);
    updateHeartsRow(1, opp.lives, oppIndex, opp);
    checkShot(1, opp.lastShot);
    updateShieldsRow(1, shieldCharges(oppIndex), opp);
    checkDeathExplosion(oppIndex, opp);
  }
}
