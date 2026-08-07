import {
  livesP0El, livesP1El, shieldsP0El, shieldsP1El, nameP0El, nameP1El, cooldownP0El, cooldownP1El,
  classIconP0El, classIconP1El, classNameP0El, classNameP1El, spectatorBannerEl,
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
// Barras de vida e de escudo por slot visual (`null` = ainda não há partida).
let barrasVida = [null, null];
let barrasEscudo = [null, null];
let prevLives = [0, 0];
export let hitFlashUntil = [0, 0];
let prevClassIds = [null, null];
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

// ===== Barras segmentadas de vida e escudo =====
// Vida e escudo são a mesma peça: uma barra de largura fixa dividida em um
// segmento por coração/carga, com um contador (ícone + número) do lado. O que
// muda com a classe e com os power-ups é o *número de divisões*, nunca a
// largura — antes eram fileiras de um ícone por unidade, que cresciam até
// quebrar em outra linha no meio da partida (o tank abre com 14 vidas e 5
// cargas, e os dois power-ups passam do máximo da classe).
//
// Quem diferencia os dois recursos é a caixa que os contém (`.hearts` e
// `.shields` no CSS): cor, espessura da barra e tamanho do número saem de lá,
// não de uma classe por tipo aqui.
const RECURSOS = {
  vida: { pixels: HEART_PIXELS, altura: 6 },
  escudo: { pixels: SHIELD_PIXELS, altura: 8 },
};
// Pixel do ícone do contador. É parâmetro porque o preview de classe da modal
// de seleção reusa a mesma barra em miniatura.
const CONTADOR_PIXEL = 2;

// Ícone pixel-art de vida/escudo em DOM: um div por pixel da grade, igual ao
// resto da arte do jogo.
export function createResourceIcon(tipo, pixelSize = CONTADOR_PIXEL) {
  const { pixels, altura } = RECURSOS[tipo];
  const icone = document.createElement('div');
  icone.className = 'resource-icon';
  icone.style.width = `${7 * pixelSize}px`;
  icone.style.height = `${altura * pixelSize}px`;
  for (const [row, col] of pixels) {
    const px = document.createElement('div');
    px.className = 'resource-icon-pixel';
    px.style.width = `${pixelSize}px`;
    px.style.height = `${pixelSize}px`;
    px.style.left = `${col * pixelSize}px`;
    px.style.top = `${row * pixelSize}px`;
    icone.appendChild(px);
  }
  return icone;
}

// Monta a barra de um recurso dentro de `container` (as caixas #livesP0/
// #shieldsP0… do HUD, ou as do preview de classe) e devolve o objeto que
// `updateResourceBar` pinta. Os segmentos nascem em `updateResourceBar`, que é
// quem sabe quantos são.
export function createResourceBar(container, tipo, pixelSize = CONTADOR_PIXEL) {
  container.innerHTML = '';
  const barra = { tipo, segs: [], max: 0 };

  const bar = document.createElement('div');
  bar.className = 'resource-bar';

  barra.segsEl = document.createElement('div');
  barra.segsEl.className = 'resource-segments';

  const contador = document.createElement('div');
  contador.className = 'resource-count';
  contador.appendChild(createResourceIcon(tipo, pixelSize));
  // O valor é dois elementos, e não um texto só, porque a largura do contador
  // não pode mudar com o valor: a barra fica ao lado e andaria a cada hit. A
  // parte inteira é alinhada à direita numa largura fixa (dígitos do teto) e a
  // decimal ("meio coração") existe sempre, só fica invisível quando o valor é
  // inteiro — reservar por texto (tabular-nums) não bastaria, porque a vírgula
  // não tem a largura de um dígito.
  barra.valorEl = document.createElement('span');
  barra.valorEl.className = 'resource-int';
  // Só vida tem valor fracionário; não existe meia carga de escudo.
  if (tipo === 'vida') {
    barra.fracEl = document.createElement('span');
    barra.fracEl.className = 'resource-frac';
    barra.fracEl.textContent = ',5';
  }
  barra.maxEl = document.createElement('span');
  barra.maxEl.className = 'resource-max';
  contador.appendChild(barra.valorEl);
  if (barra.fracEl) contador.appendChild(barra.fracEl);
  contador.appendChild(barra.maxEl);

  bar.appendChild(barra.segsEl);
  bar.appendChild(contador);
  container.appendChild(bar);
  return barra;
}

// Dano fracionário (o duelista tira meio coração por tiro) vira "8,5" no
// contador; valor inteiro não mostra decimal. A parte decimal só some da vista
// (`hidden`), nunca do fluxo: sumindo, o contador encolheria e a barra andaria.
function escreverValor(barra, valor) {
  const inteiro = Math.floor(valor);
  barra.valorEl.textContent = String(inteiro);
  if (barra.fracEl) barra.fracEl.classList.toggle('oculta', valor === inteiro);
}

// Pinta a barra: `valor` é o atual, `max` o teto de agora e `base` o máximo da
// classe — o que passa de `base` é excedente de power-up e vai em dourado, para
// não ler como vida/carga normal.
export function updateResourceBar(barra, valor, max, base = max) {
  while (barra.segs.length < max) {
    const seg = document.createElement('i');
    seg.className = 'segment';
    barra.segsEl.appendChild(seg);
    barra.segs.push(seg);
  }
  while (barra.segs.length > max) barra.segs.pop().remove();
  barra.max = max;

  const inteiros = Math.floor(valor);
  // Meio segmento em vez de cheio ou vazio, no índice onde o valor quebra.
  const temMeio = valor - inteiros >= 0.5;
  for (let i = 0; i < barra.segs.length; i++) {
    barra.segs[i].classList.toggle('filled', i < inteiros);
    barra.segs[i].classList.toggle('half', temMeio && i === inteiros);
    barra.segs[i].classList.toggle('bonus', i >= base);
  }
  escreverValor(barra, valor);
  barra.maxEl.textContent = `/${max}`;
  // Largura reservada para o maior valor possível (o teto): sem ela, cair de
  // 10 para 9 corações encolheria o contador e empurraria a barra.
  barra.valorEl.style.minWidth = `${String(max).length}ch`;
}

// `maxLives` são as vidas máximas de cada jogador, dependentes da classe
// escolhida (ex.: atirador 10, mago 8, tank 12) — vêm do snapshot inicial da
// partida, já na ordem visual [você, oponente] (não a ordem bruta do
// servidor), já que ambos os lados começam com vida cheia.
export function initHearts(maxLives = [10, 10]) {
  barrasVida[0] = createResourceBar(livesP0El, 'vida');
  barrasVida[1] = createResourceBar(livesP1El, 'vida');
  updateResourceBar(barrasVida[0], maxLives[0], maxLives[0]);
  updateResourceBar(barrasVida[1], maxLives[1], maxLives[1]);
  prevLives = [maxLives[0], maxLives[1]];
  hitFlashUntil = [0, 0];
  // `state.shieldMaxHits` fica indexado pela posição real do jogador no
  // servidor (é isso que `shieldCharges` espera), então precisa ser
  // reordenado para [você, oponente] aqui, senão a fileira de escudos do
  // slot 0 é montada com a contagem do jogador errado quando você não é
  // `players[0]` no servidor.
  // `?? 0`: no modo espectador `state.playerIndex` é null (não há "você") —
  // trata o slot 0 do servidor como o slot 0 do HUD, igual às duas outras
  // funções abaixo que leem esse índice.
  const meIndex = state.playerIndex ?? 0;
  const oppIndex = meIndex === 0 ? 1 : 0;
  const maxShields = [state.shieldMaxHits[meIndex], state.shieldMaxHits[oppIndex]];
  barrasEscudo[0] = createResourceBar(shieldsP0El, 'escudo');
  barrasEscudo[1] = createResourceBar(shieldsP1El, 'escudo');
  updateResourceBar(barrasEscudo[0], maxShields[0], maxShields[0]);
  updateResourceBar(barrasEscudo[1], maxShields[1], maxShields[1]);
  prevShieldCharges = [maxShields[0], maxShields[1]];
  prevLastShot = [null, null];
}

// Limpa tudo que o HUD acumulou da partida anterior (corações, escudos, nomes,
// ícones de classe e barras de cooldown). Sem isso, ao clicar em "jogar
// novamente" o HUD continua mostrando as vidas/nome do jogo que acabou até a
// nova partida enviar o primeiro estado — no modo online isso pode demorar
// vários segundos, enquanto o jogador espera na fila.
export function resetHud() {
  barrasVida = [null, null];
  barrasEscudo = [null, null];
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
  hideSpectatorBanner();
}

// Indício de que o HUD é de uma partida assistida, não jogada: o resto
// (corações, escudos, nomes, cronômetro) é idêntico ao de quem está jogando.
// `body.spectating` também tira o destaque dourado de `#nameP0` (style.css) —
// esse dourado marca "seu nome" nos outros modos, mas o slot 0 aqui não é
// "você", é só o primeiro jogador da partida.
export function showSpectatorBanner() {
  spectatorBannerEl.textContent = 'Assistindo';
  spectatorBannerEl.classList.add('visible');
  document.body.classList.add('spectating');
}

export function hideSpectatorBanner() {
  spectatorBannerEl.textContent = '';
  spectatorBannerEl.classList.remove('visible');
  document.body.classList.remove('spectating');
}

// Preenche o lado do HUD do jogador local (nome, ícone de classe, corações e
// escudos cheios) com o que ele já escolheu no menu, antes de qualquer
// snapshot da partida chegar — senão o HUD fica com o placeholder genérico
// ("Você", sem ícone nem vidas) durante toda a espera por oponente no modo
// online. `initHearts` substitui essas fileiras pelas de verdade assim que a
// partida é encontrada (mensagem `init`).
export function fillLocalPlayerHud() {
  nameP0El.textContent = state.user?.name || state.nickname || 'Você';
  updateClassIcon(classIconP0El, classNameP0El, 0, state.classId);
  const cls = getClass(state.classId);
  barrasVida[0] = createResourceBar(livesP0El, 'vida');
  updateResourceBar(barrasVida[0], cls.maxLives, cls.maxLives);
  prevLives[0] = cls.maxLives;
  barrasEscudo[0] = createResourceBar(shieldsP0El, 'escudo');
  updateResourceBar(barrasEscudo[0], cls.shieldMaxHits, cls.shieldMaxHits);
  prevShieldCharges[0] = cls.shieldMaxHits;
}

// Pisca o segmento que acabou de apagar (era o piscar do coração/escudo
// perdido). `seg` pode não existir quando o teto encolheu entre dois ticks.
function triggerSegmentBlink(seg) {
  if (!seg) return;
  seg.classList.remove('blink');
  void seg.offsetWidth; // force reflow to restart the animation
  seg.classList.add('blink');
}

// Centro horizontal e topo da cabeça de um jogador, em coordenadas de mundo —
// é onde os ícones flutuantes de vida/escudo perdidos nascem (floatingIcons.js).
function headPosition(player) {
  if (!player) return null;
  return { x: player.x + state.playerSize / 2, topY: player.y };
}

function updateHeartsRow(row, lives, rawIndex, player) {
  const barra = barrasVida[row];
  if (!barra) return;
  const base = getClass(player?.classId).maxLives;
  // O power-up de vida passa do máximo da classe de propósito: a barra ganha
  // divisões (e o excedente vai em dourado) em vez de engolir a vida que não
  // caberia. O teto nunca cai no meio da partida — gastar a vida extra deixa o
  // segmento vazio, não some com ele, senão a barra se redividiria a cada hit.
  const max = Math.max(base, Math.ceil(lives), barra.max);
  updateResourceBar(barra, lives, max, base);
  const prev = prevLives[row];
  const wholeLives = Math.floor(lives);
  if (lives < prev) {
    for (let i = wholeLives; i < Math.ceil(prev); i++) {
      triggerSegmentBlink(barra.segs[i]);
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
  const barra = barrasEscudo[row];
  if (!barra) return;
  const base = getClass(player?.classId).shieldMaxHits;
  // `player.shieldMaxHits` já vem do snapshot com o power-up de escudo somado,
  // então é ele que manda no teto; `base` é só onde começa o excedente dourado.
  const max = Math.max(base, player?.shieldMaxHits ?? base, charges, barra.max);
  updateResourceBar(barra, charges, max, base);
  // Perdeu carga = bloqueou um tiro. Quando foi a última, o som é o de escudo
  // quebrando em vez do de bloqueio: avisa que não há mais proteção. O ícone
  // flutuante de escudo rachado aparece nos dois casos — perder uma carga já é
  // "perder um escudo", não só zerar todas.
  const prev = prevShieldCharges[row];
  if (prev !== null && charges < prev) {
    for (let i = charges; i < prev; i++) triggerSegmentBlink(barra.segs[i]);
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
  // `shotCooldownMs` vem do snapshot já com o power-up de cadência aplicado —
  // a barra recarrega no dobro da velocidade enquanto o buff durar.
  const cooldownMs = player.shotCooldownMs ?? getClass(player.classId).shotCooldownMs;
  const ratio = Math.min(1, (now - (player.lastShot || 0)) / cooldownMs);
  el.style.width = `${ratio * 100}%`;
  el.classList.toggle('ready', ratio >= 1);
}

export function updateCooldownBars(now = Date.now()) {
  const meIndex = state.playerIndex ?? 0;
  const oppIndex = meIndex === 0 ? 1 : 0;
  const me = state.latestState.players[meIndex];
  const opp = state.latestState.players[oppIndex];
  updateCooldownBar(cooldownP0El, me, now);
  updateCooldownBar(cooldownP1El, opp, now);
}

export function updateHud() {
  const meIndex = state.playerIndex ?? 0;
  const oppIndex = meIndex === 0 ? 1 : 0;
  const me = state.latestState.players[meIndex];
  const opp = state.latestState.players[oppIndex];
  if (me) {
    nameP0El.textContent = me.name || 'Você';
    updateClassIcon(classIconP0El, classNameP0El, 0, me.classId);
    updateHeartsRow(0, me.lives, meIndex, me);
    updateShieldsRow(0, shieldCharges(meIndex), me);
    checkShot(0, me.lastShot);
    checkDeathExplosion(meIndex, me);
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
